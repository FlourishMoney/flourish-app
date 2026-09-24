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

export async function runQualityGate({ mp4, outDir, reelId, script, brand, durationSeconds, captionColour, endCardColour, appWindows = [] }) {
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
  const bottomRows = Math.round((SAFE.bottom / CANVAS.height) * H);
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
    scan(0, topRows);
    scan(H - bottomRows, H);
    if (hits > worstBand) { worstBand = hits; worstAt = t; }
  }
  // A handful of stray pixels is compression noise; a line of type is thousands.
  check("safe zone clear", worstBand < 400, `worst frame ${worstAt.toFixed(1)}s: ${worstBand} cream px in the reserved bands`);

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
    const y0 = Math.round((SAFE.top / CANVAS.height) * H);
    const y1 = y0 + Math.round((90 / CANVAS.height) * H);
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

  // ── report ──────────────────────────────────────────────────────────────────────────────────
  console.log("\n  Quality gate (STYLE.md §10)");
  for (const r of results) console.log(`   ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(32)} ${r.detail}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    throw new Error(`Quality gate failed: ${failed.map((f) => f.name).join(", ")}. The render is not shippable.`);
  }
  return { sheet, results };
}
