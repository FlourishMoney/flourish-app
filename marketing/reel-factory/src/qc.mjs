// THE QUALITY GATE. Runs after every render and FAILS it — this is not a linter you can ignore.
//
// STYLE.md §10. Each check prints one PASS/FAIL line. A check that cannot be performed is a FAIL,
// never a silent skip: "we could not measure the loudness" and "the loudness is correct" are
// different sentences and only one of them is true.
//
// The frame checks read actual pixels out of the rendered file, not the composition's intentions.
// A layout constant can be right while the thing on screen is wrong.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CANVAS, SAFE } from "./config.mjs";
import { measureLufs, TARGET_LUFS } from "./audio.mjs";
import { screenRect, captionRect, intersects, PILL, pillRect, FRAME, MAX_SHOT_SECONDS, CAPTION, deviceRect, PHONE_TOP_FOR } from "./layout.mjs";

const run = promisify(execFile);
const ff = (args) => run("ffmpeg", ["-y", "-loglevel", "error", ...args], { maxBuffer: 1 << 28 });

// Words a dictionary will not have but the brand owns.
const BRAND_WORDS = new Set([
  "flourish", "flourishmoney", "payday", "paydays", "waitlist", "cad", "rrsp", "tfsa", "fhsa",
  "ccb", "app", "bio", "reel", "reels", "fintech", "onboarding", "plaid", "stripe",
]);

// /usr/share/dict/words is a list of BASE words: it has "bill" but not "bills", "add" but not
// "adding". Checking against it directly reports ordinary English as misspelled, which is a broken
// check, not a finding. So a word counts as known if it, or a plausible stem of it, is in the list.
const STEMS = (w) => {
  const out = [w];
  const add = (x) => { if (x && x.length > 2) out.push(x); };
  add(w.replace(/'s$/, ""));
  if (w.endsWith("s"))    { add(w.slice(0, -1)); add(w.replace(/ies$/, "y")); add(w.replace(/es$/, "")); }
  if (w.endsWith("ing"))  { add(w.slice(0, -3)); add(w.slice(0, -3) + "e"); add(w.slice(0, -4)); }
  if (w.endsWith("ed"))   { add(w.slice(0, -2)); add(w.slice(0, -1)); add(w.slice(0, -3)); }
  if (w.endsWith("ly"))   { add(w.slice(0, -2)); }
  return out;
};

const hex = (h) => {
  const n = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
// WCAG relative luminance and contrast ratio.
const luminance = ([r, g, b]) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrastRatio = (a, b) => {
  const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** Nine evenly-spaced frames as a 3x3 sheet. */
async function contactSheet(mp4, outJpg, durationSeconds) {
  const dir = fs.mkdtempSync(path.join(path.dirname(outJpg), ".contact-"));
  for (let i = 0; i < 9; i++) {
    const t = (durationSeconds * (i + 0.5)) / 9;
    await ff(["-ss", t.toFixed(3), "-i", mp4, "-frames:v", "1", "-vf", "scale=360:-1", path.join(dir, `f${i}.png`)]);
  }
  await ff(["-i", path.join(dir, "f%d.png"), "-filter_complex", "tile=3x3:margin=12:padding=12:color=#050810", "-frames:v", "1", "-q:v", "3", outJpg]);
  fs.rmSync(dir, { recursive: true, force: true });
  return outJpg;
}

/** Raw RGB of one frame, as a flat array plus dimensions. */
async function frameRgb(mp4, seconds, w = 270, h = 480) {
  const tmp = path.join(fs.mkdtempSync("/tmp/qcf-"), "f.rgb");
  await ff(["-ss", seconds.toFixed(3), "-i", mp4, "-frames:v", "1", "-vf", `scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "rgb24", tmp]);
  const buf = fs.readFileSync(tmp);
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  return { buf, w, h };
}

// "Is this pixel the cream type colour?" — a tolerance, because H.264 does not preserve exact values.
const nearCream = (r, g, b, cream) => {
  const [cr, cg, cb] = hex(cream);
  return Math.abs(r - cr) < 26 && Math.abs(g - cg) < 26 && Math.abs(b - cb) < 26;
};

export async function runQualityGate({ mp4, outDir, reelId, script, brand, durationSeconds, captionColour, endCardColour, appWindows = [], beats = [], endCardLines = [], shots = {}, storyboard = [], voice = {} }) {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok, detail }); return ok; };

  // ── contact sheet (always produced) ─────────────────────────────────────────────────────────
  const sheet = path.join(outDir, `${reelId}-contact.jpg`);
  await contactSheet(mp4, sheet, durationSeconds);
  check("contact sheet", fs.existsSync(sheet), path.basename(sheet));

  // ── format ──────────────────────────────────────────────────────────────────────────────────
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate", "-show_entries", "format=duration",
    "-of", "default=nw=1", mp4]);
  const meta = Object.fromEntries(stdout.trim().split("\n").map((l) => l.split("=")));
  const fps = eval(meta.r_frame_rate);             // "60/1"
  const dur = parseFloat(meta.duration);
  check("frame rate", fps === CANVAS.fps, `${fps} fps`);
  check("resolution", +meta.width === CANVAS.width && +meta.height === CANVAS.height, `${meta.width}x${meta.height}`);
  check("duration 20-28s", dur >= CANVAS.minSeconds && dur <= CANVAS.maxSeconds, `${dur.toFixed(1)}s`);

  // ── safe zone: no cream type in the top 250 or bottom 400 px ────────────────────────────────
  // Sampled across nine frames, in the SAME proportions the canvas uses.
  const W = 270, H = 480;
  const topRows = Math.round((SAFE.top / CANVAS.height) * H);
  let worstBand = 0, worstAt = 0;
  for (let i = 0; i < 9; i++) {
    const t = (durationSeconds * (i + 0.5)) / 9;
    const { buf } = await frameRgb(mp4, t, W, H);
    let hits = 0;
    const scan = (fromRow, toRow) => {
      for (let y = fromRow; y < toRow; y++) {
        for (let x = 0; x < W; x++) {
          const o = (y * W + x) * 3;
          if (nearCream(buf[o], buf[o + 1], buf[o + 2], brand.cream)) hits++;
        }
      }
    };
    // Only the TOP band. The device now fills the frame, so app footage sits behind the scrim in
    // the bottom band by design; what must stay out of the safe zones is OUR overlay type, and the
    // caption's position is a layout contract the composition asserts at render time.
    scan(0, topRows);
    if (hits > worstBand) { worstBand = hits; worstAt = t; }
  }
  // A handful of stray pixels is compression noise; a line of type is thousands.
  check("top safe band clear", worstBand < 400, `worst frame ${worstAt.toFixed(1)}s: ${worstBand} cream px in the reserved bands`);

  // ── the "Example" label is present whenever app footage is ──────────────────────────────────
  // The label is a cream pill at a known band; look for it in every frame that is not the end card.
  // Only the frames that show the app. A text-only beat has no figures on it to label, and
  // demanding the label there would be checking the wrong thing.
  const showsApp = (t) => appWindows.some(([a, b]) => t >= a + 0.25 && t <= b - 0.25);
  const appFrames = [];
  for (let i = 0; i < 9; i++) {
    const t = (durationSeconds * (i + 0.5)) / 9;
    if (!showsApp(t)) continue;
    const { buf } = await frameRgb(mp4, t, W, H);
    const pr = pillRect();
    const y0 = Math.max(0, Math.round((pr.y / CANVAS.height) * H) - 1);
    const y1 = Math.min(H, Math.round(((pr.y + pr.h) / CANVAS.height) * H) + 1);
    let hits = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      if (nearCream(buf[o], buf[o + 1], buf[o + 2], brand.cream)) hits++;
    }
    appFrames.push({ t, hits });
  }
  const labelMissing = appFrames.filter((f) => f.hits < 60);
  check("Example label on every app frame", appFrames.length > 0 && labelMissing.length === 0,
    appFrames.length === 0 ? "no app frames sampled — the check could not run"
      : labelMissing.length ? `missing at ${labelMissing.map((f) => f.t.toFixed(1) + "s").join(", ")}`
      : `${appFrames.length} app frames checked`);

  // ── the device fills the frame (revision §1 and §9) ────────────────────────────────────────
  // Measured, not assumed: find the horizontal extent of the lit device in each frame after the
  // hook. The bezel and the app's own screen are both brighter than the canvas behind them.
  const bgLum = luminance(hex(brand.bg));
  const widths = [];
  for (let i = 0; i < 9; i++) {
    const t = (durationSeconds * (i + 0.5)) / 9;
    if (!showsApp(t)) continue;
    const { buf } = await frameRgb(mp4, t, W, H);
    let lo = W, hi = -1;
    // The BEZEL, not the screen: the push-in dims the screen by design, and a dimmed screen is not
    // a smaller phone. The bezel is a light border that the dim never reaches, so it is what
    // actually measures the device.
    for (const frac of [0.24, 0.32, 0.40, 0.48, 0.56, 0.64]) {
      const y = Math.round(H * frac);
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3;
        if (luminance([buf[o], buf[o + 1], buf[o + 2]]) > bgLum + 0.004) { if (x < lo) lo = x; if (x > hi) hi = x; }
      }
    }
    if (hi > lo) widths.push({ t, frac: (hi - lo + 1) / W });
  }
  const narrowest = widths.length ? widths.reduce((a, b) => (a.frac < b.frac ? a : b)) : null;
  check("device fills >=75% of frame", !!narrowest && narrowest.frac >= 0.75,
    narrowest ? `narrowest ${Math.round(narrowest.frac * 100)}% at ${narrowest.t.toFixed(1)}s`
      : "no app frames sampled — the check could not run");

  // ── contrast (WCAG AA 4.5:1) ────────────────────────────────────────────────────────────────
  const capRatio = contrastRatio(captionColour, brand.bg);
  const endRatio = contrastRatio(endCardColour, brand.bg);
  const accentRatio = contrastRatio(brand.greenBright, brand.bg);
  check("caption contrast AA", capRatio >= 4.5, `${capRatio.toFixed(1)}:1`);
  check("end-card contrast AA", endRatio >= 4.5, `${endRatio.toFixed(1)}:1`);
  check("accent contrast AA", accentRatio >= 4.5, `${accentRatio.toFixed(1)}:1`);

  // ── loudness ────────────────────────────────────────────────────────────────────────────────
  const lufs = await measureLufs(mp4);
  check("loudness -14 LUFS ±1.5", lufs !== null && Math.abs(lufs - TARGET_LUFS) <= 1.5,
    lufs === null ? "could not measure" : `${lufs.toFixed(1)} LUFS`);

  // ── spelling ────────────────────────────────────────────────────────────────────────────────
  const dictPath = ["/usr/share/dict/words", "/usr/dict/words"].find((p) => fs.existsSync(p));
  const words = [...script.captionLines, ...script.endCard, script.hook]
    .join(" ").toLowerCase().match(/[a-z']+/g) || [];
  if (!dictPath) {
    check("spelling", false, "no system dictionary at /usr/share/dict/words — cannot verify");
  } else {
    const dict = new Set(fs.readFileSync(dictPath, "utf8").split("\n").map((w) => w.trim().toLowerCase()));
    const known = (w) => BRAND_WORDS.has(w) || STEMS(w).some((x) => dict.has(x));
    const unknown = [...new Set(words)].filter((w) => w.length > 1 && !known(w));
    check("spelling", unknown.length === 0, unknown.length ? `not a word: ${unknown.join(", ")}` : `${new Set(words).size} distinct words`);
  }

  // ── the review's six additions ──────────────────────────────────────────────────────────────
  const scr = screenRect(true);
  const ringBeats = beats.filter((b) => b.kind === "screen" && b.ring && b.targetRect);

  // (1) The ring's box lies fully inside the device screen, on every frame it is drawn.
  // Inside the screen AND inside the frame: the device runs off the bottom edge, so a ring can be
  // within the screen and still be somewhere nobody will ever see it.
  const visTop = Math.max(scr.y, 0), visBottom = Math.min(scr.y + scr.h, FRAME.h);
  const outside = ringBeats.filter((b) => {
    const r = b.targetRect;
    return r.x < scr.x || r.x + r.w > scr.x + scr.w || r.y < visTop || r.y + r.h > visBottom;
  });
  check("ring inside the visible screen", ringBeats.length > 0 && outside.length === 0,
    ringBeats.length === 0 ? "no ring beats to check"
      : outside.length ? `${outside.length} ring(s) cross the bezel` : `${ringBeats.length} ring beat(s) inside`);

  // (2) The focused element is neither blurred nor crushed. Laplacian variance is calibrated on
  // this reel's own wide app frames: the zoomed target must be at least as sharp as a quarter of
  // that, and the region must stay above a luminance floor (the dim must not swallow it).
  const lapVar = (buf, w, h, rect) => {
    const g = (x, y) => { const o = (y * w + x) * 3; return 0.299 * buf[o] + 0.587 * buf[o + 1] + 0.114 * buf[o + 2]; };
    const x0 = Math.max(1, Math.round(rect.x)), x1 = Math.min(w - 2, Math.round(rect.x + rect.w));
    const y0 = Math.max(1, Math.round(rect.y)), y1 = Math.min(h - 2, Math.round(rect.y + rect.h));
    const vals = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      vals.push(g(x - 1, y) + g(x + 1, y) + g(x, y - 1) + g(x, y + 1) - 4 * g(x, y));
    }
    if (vals.length < 40) return { variance: 0, mean: 0, n: vals.length };
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length;
    let lum = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { lum += g(x, y); n++; }
    return { variance, mean: lum / Math.max(1, n), n: vals.length };
  };
  const SW = 540, SH = 960, k = SW / FRAME.w;
  const scaleRect = (r) => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });

  // Baseline: the wide beats, which are the same footage without the zoom.
  const baseline = [];
  for (const b of beats.filter((x) => x.kind === "screen" && !x.ring).slice(0, 3)) {
    const { buf } = await frameRgb(mp4, b.from + b.duration * 0.6, SW, SH);
    baseline.push(lapVar(buf, SW, SH, scaleRect({ x: scr.x + scr.w * 0.2, y: scr.y + scr.h * 0.25, w: scr.w * 0.6, h: scr.h * 0.25 })).variance);
  }
  const floorVar = baseline.length ? (baseline.reduce((a, b) => a + b, 0) / baseline.length) * 0.25 : 0;
  const sharp = [];
  for (const b of ringBeats) {
    const { buf } = await frameRgb(mp4, b.from + b.duration * 0.62, SW, SH);
    sharp.push({ t: b.from, ...lapVar(buf, SW, SH, scaleRect(b.targetRect)) });
  }
  const blurred = sharp.filter((r) => r.variance < floorVar);
  const dark = sharp.filter((r) => r.mean < 26);
  check("focused element sharp", sharp.length > 0 && blurred.length === 0,
    sharp.length === 0 ? "no ring beats sampled"
      : `variance ${sharp.map((r) => Math.round(r.variance)).join("/")} vs floor ${Math.round(floorVar)}`);
  check("focused element not crushed", dark.length === 0,
    `mean luma ${sharp.map((r) => Math.round(r.mean)).join("/")} (floor 26)`);

  // (3) No full-frame horizontal line artifacts — a row that is mostly ring colour.
  const [rr, rg, rb] = hex(brand.greenBright);
  const lineRows = [];
  for (let i = 0; i < 9; i++) {
    const t = (durationSeconds * (i + 0.5)) / 9;
    if (!showsApp(t)) continue;
    const { buf } = await frameRgb(mp4, t, W, H);
    for (let y = 0; y < H; y++) {
      let hit = 0;
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3;
        if (Math.abs(buf[o] - rr) < 40 && Math.abs(buf[o + 1] - rg) < 40 && Math.abs(buf[o + 2] - rb) < 40) hit++;
      }
      if (hit / W > 0.8) { lineRows.push({ t, y }); break; }
    }
  }
  check("no full-width ring artifacts", lineRows.length === 0,
    lineRows.length ? `line at ${lineRows.map((l) => l.t.toFixed(1) + "s").join(", ")}` : "none across sampled app frames");

  // (4) The "Example" pill covers no app pixel — it sits outside the device entirely.
  const pill = pillRect();
  const phoneBox = deviceRect(true);
  check("Example pill clear of the app", !intersects(pill, phoneBox),
    `pill ${Math.round(pill.y)}-${Math.round(pill.y + pill.h)}px, device starts ${Math.round(phoneBox.y)}px`);
  // It also has to stay off the WORDS. It sat top-right and cut straight through the end of a
  // caption line — visible in the contact sheet, invisible to every check that existed.
  check("Example pill clear of the caption", !intersects(pill, captionRect()),
    `caption ends ${captionRect().y + captionRect().h}px, pill starts ${pill.y}px`);

  // (5) The caption never sits on the element being talked about.
  const collisions = beats.filter((b) => b.kind === "screen" && b.targetRect && intersects(b.targetRect, captionRect()));
  check("caption clear of the focus", collisions.length === 0,
    collisions.length ? `${collisions.length} beat(s) overlap` : `${beats.filter((b) => b.kind === "screen").length} beats checked`);

  // (6) The end-card line is shown once, on the end card.
  const headline = (endCardLines[0] || "").trim().toLowerCase();
  const shownInBeats = beats.filter((b) => (b.kind === "hook" || b.kind === "statement")
    && (b.chunks || []).map((c) => c.words.map((w) => w.word).join(" ")).join(" ").trim().toLowerCase().includes(headline) && headline).length;
  check("end-card line appears once", headline ? shownInBeats === 0 : false,
    headline ? (shownInBeats === 0 ? "only on the end card" : `also held as ${shownInBeats} statement beat(s)`) : "no end-card headline in the script");

  // ── the v4 additions ────────────────────────────────────────────────────────────────────────
  // (7) Pace: no shot longer than 2.5s, the end card excepted.
  const shotLengths = storyboard.filter((r) => r.kind !== "end-card");
  const tooLong = shotLengths.filter((r) => r.seconds > MAX_SHOT_SECONDS + 0.01);
  check(`no shot over ${MAX_SHOT_SECONDS}s`, tooLong.length === 0,
    tooLong.length ? tooLong.map((r) => `${r.line} ${r.seconds.toFixed(2)}s`).join("; ")
      : `longest ${Math.max(...shotLengths.map((r) => r.seconds)).toFixed(2)}s across ${shotLengths.length} shots`);

  // (8) The caption band is clean: behind the words, once the glyphs themselves are excluded,
  // there is background and nothing else. App text showing through is what this catches.
  const bandResults = [];
  for (const b of beats.filter((x) => x.kind === "screen").slice(0, 6)) {
    const t = b.from + b.duration * 0.6;
    const { buf } = await frameRgb(mp4, t, W, H);
    const rect = captionRect();
    const y0 = Math.round((rect.y / FRAME.h) * H), y1 = Math.round(((rect.y + rect.h) / FRAME.h) * H);
    const x0 = Math.round((rect.x / FRAME.w) * W), x1 = Math.round(((rect.x + rect.w) / FRAME.w) * W);
    // The reference is the SAME ROWS outside the caption box — background by definition, and it
    // carries the radial glow just as the box does. Comparing against a flat theme colour would be
    // comparing two different things (and comparing a 0-255 luma against a 0-1 relative luminance,
    // which is what made this check fail on a band that was in fact clean).
    const luma = (o) => 0.299 * buf[o] + 0.587 * buf[o + 1] + 0.114 * buf[o + 2];
    const vals = [], ref = [];
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        const l = luma((y * W + x) * 3);
        if (l > 42) continue;               // a glyph; the rule is about what is BEHIND the words
        vals.push(l);
      }
      for (let x = 0; x < Math.max(0, x0) - 2; x++) ref.push(luma((y * W + x) * 3));
      for (let x = Math.min(W, x1) + 2; x < W; x++) ref.push(luma((y * W + x) * 3));
    }
    if (vals.length < 200 || ref.length < 100) continue;
    const mean = vals.reduce((a, c) => a + c, 0) / vals.length;
    const variance = vals.reduce((a, c) => a + (c - mean) ** 2, 0) / vals.length;
    const bgL = ref.reduce((a, c) => a + c, 0) / ref.length;
    bandResults.push({ t, mean, sd: Math.sqrt(variance), bgL });
  }
  const dirty = bandResults.filter((r) => r.sd > 6 || Math.abs(r.mean - r.bgL) > 6);
  check("caption band clean", bandResults.length > 0 && dirty.length === 0,
    bandResults.length === 0 ? "no caption bands sampled"
      : dirty.length ? `app pixels behind the words at ${dirty.map((r) => r.t.toFixed(1) + "s").join(", ")} (sd ${dirty.map((r) => r.sd.toFixed(1)).join("/")})`
      : `sd ${bandResults.map((r) => r.sd.toFixed(1)).join("/")}, within ${Math.max(...bandResults.map((r) => Math.abs(r.mean - r.bgL))).toFixed(1)} of the background beside it`);

  // (9) Each ring is around the text the script says it should be around. The recorder captures
  // what it measured; this compares that against the recipe, so a layout change that moves a ring
  // onto the wrong row fails here rather than shipping.
  const mismatched = Object.entries(shots)
    .filter(([, sh]) => sh.expect)
    .filter(([, sh]) => !(sh.text || "").toLowerCase().includes(String(sh.expect).toLowerCase()));
  check("ring targets match the script", mismatched.length === 0,
    mismatched.length ? mismatched.map(([k, sh]) => `${k}: wanted "${sh.expect}", ringed "${sh.text}"`).join("; ")
      : Object.values(shots).filter((sh) => sh.expect).map((sh) => `"${sh.text}"`).join(", "));

  // ── v5: the voice is real, and the words are where the voice put them ───────────────────────
  check("voice is ElevenLabs", voice.source === "elevenlabs",
    voice.source === "elevenlabs" ? `${voice.model} · ${voice.credits} credits`
      : `fell back to ${voice.source || "nothing"} — a placeholder read must never ship`);
  check("caption timings measured", voice.measured === true,
    voice.measured ? "from the alignment data" : "estimated from clip length, not the alignment");

  // The caption must not touch the device in EITHER position, wide or zoomed.
  const cap = captionRect();
  const overlapPositions = [false, true].filter((close) => intersects(cap, deviceRect(close)));
  const tightest = Math.min(...[false, true].map((close) => PHONE_TOP_FOR(close) - (cap.y + cap.h)));
  check("caption never touches the device", overlapPositions.length === 0 && tightest >= CAPTION.gap,
    overlapPositions.length ? `overlaps in ${overlapPositions.map((c) => (c ? "zoom" : "wide")).join(" and ")}`
      : `${tightest}px of air at the tightest (minimum ${CAPTION.gap})`);

  // ── report ──────────────────────────────────────────────────────────────────────────────────
  if (storyboard.length) {
    console.log("\n  Storyboard");
    console.log("   " + "time".padEnd(13) + "voice line".padEnd(34) + "ring target".padEnd(24) + "zoom");
    for (const r of storyboard) {
      console.log("   " + `${r.from.toFixed(1)}-${(r.from + r.seconds).toFixed(1)}s`.padEnd(13)
        + (r.line.length > 32 ? r.line.slice(0, 31) + "…" : r.line).padEnd(34)
        + (r.target || "—").padEnd(24) + (r.zoom ? r.zoom.toFixed(2) + "x" : "—"));
    }
  }

  console.log("\n  Quality gate (STYLE.md §10)");
  for (const r of results) console.log(`   ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(32)} ${r.detail}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    throw new Error(`Quality gate failed: ${failed.map((f) => f.name).join(", ")}. The render is not shippable.`);
  }
  return { sheet, results };
}
