#!/usr/bin/env node
// ONE COMMAND PER WEEK:  npm run reels -- week-01
//
// Reads every script in scripts/<week>/, and for each one: speaks the lines, records the screens
// they ask for, composes the reel, and writes the video, the cover and the caption file.
//
// Each stage fails loudly. A reel with a missing screen, a silent line or someone else's marketing
// copy in it is worse than no reel, so nothing here falls back to "near enough".
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { CANVAS, SAFE, PACE, ROOT, APP_ROOT, dir, ensure, brandColours } from "./config.mjs";
import { speak } from "./voice.mjs";
import { recordScreens, SCREENS } from "./record.mjs";
import { writeCaptions } from "./captions.mjs";
import { renderReel } from "./render.mjs";
import { assembleNarration, normaliseTo, uiTone, maybeMusicBed } from "./audio.mjs";
import { runQualityGate } from "./qc.mjs";

dotenv.config({ path: path.join(ROOT, ".env") });

const args = process.argv.slice(2);
const week = args.find((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BASE_URL = flag("url", "http://localhost:5173");
const SKIP_RECORD = args.includes("--no-record");

if (!week) {
  console.error("Usage: npm run reels -- week-01 [--url=http://localhost:5173] [--no-record]");
  process.exit(1);
}

const APP_PUBLIC = path.join(APP_ROOT, "public");
const log = (msg) => console.log(`  ${msg}`);

// A gap after each line so the voice does not run on top of itself.
const GAP = 0.22;
const MAX_CAPTION_WORDS = 6;      // STYLE.md §3

async function buildOne(scriptPath) {
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  const outDir = ensure(path.join(dir.out, week));
  const workDir = ensure(path.join(dir.publicDir, week, script.id));
  console.log(`\n▶ ${script.id} — "${script.hook}"`);

  // ── 1. voice ──────────────────────────────────────────────────────────────────────────────
  const lines = [];
  let voiceSource = null, timingsMeasured = true;
  for (const [i, line] of script.voice.entries()) {
    const spoken = await speak(line.text, path.join(workDir, `line-${String(i + 1).padStart(2, "0")}.mp3`));
    voiceSource = spoken.source;
    timingsMeasured = timingsMeasured && spoken.measured;
    lines.push({ ...line, ...spoken });
    log(`voice ${i + 1}/${script.voice.length} · ${spoken.duration.toFixed(2)}s · ${spoken.source}`);
  }

  // ── 2. screens ────────────────────────────────────────────────────────────────────────────
  const wanted = script.voice.map((l) => l.screen);
  let clips = {};
  if (SKIP_RECORD) {
    log("--no-record: reusing whatever is already in remotion/public");
  } else {
    log(`recording ${new Set(wanted.filter((s) => s !== "end-card")).size} screen(s) from ${BASE_URL}`);
    // Every clip must cover the longest line that uses it, with a little room.
    const tailSeconds = Math.ceil(Math.max(...lines.map((l) => l.duration)) + GAP + 2);
    clips = await recordScreens(wanted, { baseUrl: BASE_URL, week, reelId: script.id, tailSeconds });
    for (const [screen, file] of Object.entries(clips)) {
      const dest = path.join(workDir, `${screen}.mp4`);
      fs.copyFileSync(file, dest);
      clips[screen] = dest;
    }
  }

  // ── 3. the timeline ──────────────────────────────────────────────────────────────────────
  // STYLE.md §6: the hook is on screen before the voice, and there is a cut every 1.5-2.5s. A
  // "shot" is one spoken line; it is split into BEATS so the cut cadence holds even when a line
  // runs long. Beat one sits wide, beat two pushes in on the number being narrated.
  const rel = (abs) => path.relative(dir.publicDir, abs).split(path.sep).join("/");

  // STYLE.md §3 limits what is on screen AT ONCE, not what may be said. The copy is the writer's
  // and is never edited here, so a long line is shown in timed chunks of six words or fewer,
  // each held for exactly as long as those words are spoken.
  const chunk = (words) => {
    const out = [];
    let cur = [];
    for (const w of words) {
      cur.push(w);
      const endsClause = /[.,!?;:]$/.test(w.word);
      if (cur.length >= MAX_CAPTION_WORDS || (endsClause && cur.length >= 3)) { out.push(cur); cur = []; }
    }
    if (cur.length) {
      // A stray one-word tail reads as a mistake; fold it back if there is room.
      if (out.length && cur.length === 1 && out[out.length - 1].length < MAX_CAPTION_WORDS) out[out.length - 1].push(...cur);
      else out.push(cur);
    }
    return out.map((ws) => ({ words: ws, start: ws[0].start, end: ws[ws.length - 1].end }));
  };
  const assertChunks = (chunks, where) => {
    const over = chunks.find((c) => c.words.length > MAX_CAPTION_WORDS);
    if (over) throw new Error(`${where}: "${over.words.map((w) => w.word).join(" ")}" puts ${over.words.length} words on screen at once; STYLE.md §3 allows ${MAX_CAPTION_WORDS}.`);
  };

  // Natural length of each shot, then padded evenly until the reel is at least 20s.
  const natural = lines.map((l) => Math.max(l.duration + GAP, PACE.minBeat * 2));
  const fixed = PACE.hookLead + PACE.endCard;
  let shotSeconds = natural.slice();
  const total0 = fixed + shotSeconds.reduce((a, b) => a + b, 0);
  if (total0 < CANVAS.minSeconds) {
    const pad = (CANVAS.minSeconds + 0.6 - total0) / shotSeconds.length;
    shotSeconds = shotSeconds.map((d) => d + pad);
  }
  const total = fixed + shotSeconds.reduce((a, b) => a + b, 0);
  if (total > CANVAS.maxSeconds) {
    throw new Error(`The reel is ${total.toFixed(1)}s and STYLE.md §1 allows ${CANVAS.minSeconds}-${CANVAS.maxSeconds}s. Cut a line from ${path.basename(scriptPath)}.`);
  }

  const beats = [];
  // The hook card runs under the lead-in and stays until the first line has something to show.
  // The hook is on screen at frame 0, before any voice (STYLE.md §6), in chunks of six.
  const hookWords = script.hook.trim().split(/\s+/);
  const hookChunks = chunk(hookWords.map((word, i) => ({
    word, start: (i / hookWords.length) * PACE.hookLead, end: ((i + 1) / hookWords.length) * PACE.hookLead,
  })));
  assertChunks(hookChunks, "hook");
  beats.push({ kind: "hook", chunks: hookChunks, from: 0, duration: PACE.hookLead });

  let t = PACE.hookLead;
  const narrationLines = [];
  const tones = [];
  lines.forEach((line, i) => {
    const shot = shotSeconds[i];
    narrationLines.push({ file: line.file, start: t });
    const recipe = SCREENS[line.screen] || {};
    const clip = clips[line.screen] || (fs.existsSync(path.join(workDir, `${line.screen}.mp4`)) ? path.join(workDir, `${line.screen}.mp4`) : null);
    if (line.screen !== "end-card" && !clip) {
      throw new Error(`No recording for screen "${line.screen}" — run without --no-record, or add a recipe in src/record.mjs.`);
    }
    // How many cuts this shot needs to keep the 1.5-2.5s cadence.
    let count = Math.max(1, Math.ceil(shot / PACE.maxBeat));
    while (count > 1 && shot / count < PACE.minBeat) count--;
    const each = shot / count;
    // Word timings are relative to the line; beats are absolute, so shift them per beat.
    for (let b = 0; b < count; b++) {
      const beatFrom = t + b * each;
      beats.push({
        // A line with no screen behind it is a statement, held full-bleed — no phone, no figures,
        // so nothing to label.
        kind: line.screen === "end-card" ? "statement" : "screen",
        video: clip ? rel(clip) : null,
        from: beatFrom,
        duration: each,
        // A real push-in, not a drift: the second beat is close enough to read the figure being
        // narrated, which is the whole reason for cutting to it.
        zoom: b === 0 ? 1.0 : 1.0 + 0.17 * b,
        focus: recipe.focus || { x: 0.5, y: 0.45 },
        ring: b > 0 ? (recipe.ring || null) : null,        // the ring arrives with the push-in
        chunks: (() => {
          const shifted = line.words.map((w) => ({ ...w, start: w.start + (t - beatFrom), end: w.end + (t - beatFrom) }));
          const cs = chunk(shifted);
          assertChunks(cs, `line "${line.text}"`);
          return cs;
        })(),
      });
      if (b > 0) tones.push({ at: beatFrom });             // a soft tone on the number reveal
    }
    t += shot;
  });
  beats.push({ kind: "end-card", from: t, duration: PACE.endCard });

  // ── 4. audio ─────────────────────────────────────────────────────────────────────────────
  const narrationRaw = path.join(workDir, "narration.wav");
  await assembleNarration(narrationLines, narrationRaw, total);
  const { file: narrationFile, twoPass } = await normaliseTo(narrationRaw, path.join(workDir, "narration.mp3"));
  log(`narration normalised to -14 LUFS${twoPass ? " (two-pass)" : " (single pass — measurement unavailable)"}`);
  const tonePath = path.join(workDir, "tone.wav");
  if (tones.length) await uiTone(tonePath);
  const music = await maybeMusicBed(total, path.join(workDir, "music.mp3"));
  log(music ? "music bed: ElevenLabs, -24 LUFS" : "music bed: none (no licensed source configured)");

  // The logo is copied in for the end card only.
  const logoSrc = path.join(APP_PUBLIC, "flourish-symbol.png");
  let logoRel = null;
  if (fs.existsSync(logoSrc)) { fs.copyFileSync(logoSrc, path.join(workDir, "logo.png")); logoRel = rel(path.join(workDir, "logo.png")); }

  // ── 5. render ────────────────────────────────────────────────────────────────────────────
  const brand = brandColours();
  const inputProps = {
    beats, endCard: script.endCard, brand, safe: SAFE,
    narration: rel(narrationFile),
    tones: tones.map((x) => ({ ...x, file: rel(tonePath) })),
    music: music ? rel(music) : null,
    logo: logoRel,
  };
  const durationInFrames = Math.ceil(total * CANVAS.fps);
  const mp4Out = path.join(outDir, `${script.id}.mp4`);
  const coverOut = path.join(outDir, `${script.id}-cover.jpg`);
  log(`rendering ${total.toFixed(1)}s (${durationInFrames} frames @ ${CANVAS.fps}fps) at ${CANVAS.width}x${CANVAS.height}`);
  await renderReel({
    inputProps, durationInFrames, mp4Out, coverOut,
    coverFrame: Math.round((PACE.hookLead + 0.8) * CANVAS.fps),
  });

  // ── 5. captions ───────────────────────────────────────────────────────────────────────────
  const capOut = writeCaptions(script, path.join(outDir, `${script.id}-captions.md`), {
    durationSeconds: total, width: CANVAS.width, height: CANVAS.height, fps: CANVAS.fps,
    voiceSource, timingsMeasured,
  });

  // ── 6. the quality gate. It fails the render; it does not warn. ──────────────────────────
  const { sheet } = await runQualityGate({
    mp4: mp4Out, outDir, reelId: script.id, script, brand,
    durationSeconds: total,
    captionColour: brand.cream, endCardColour: brand.cream,
    appWindows: beats.filter((b) => b.kind === "screen").map((b) => [b.from, b.from + b.duration]),
  });

  console.log(`\n✓ ${path.relative(ROOT, mp4Out)}`);
  console.log(`✓ ${path.relative(ROOT, coverOut)}`);
  console.log(`✓ ${path.relative(ROOT, sheet)}`);
  console.log(`✓ ${path.relative(ROOT, capOut)}`);
  return { mp4Out, coverOut, capOut, sheet, total };
}

const weekDir = path.join(dir.scripts, week);
if (!fs.existsSync(weekDir)) {
  console.error(`No scripts at ${path.relative(ROOT, weekDir)}. Create it and add reel-01.json.`);
  process.exit(1);
}
const scripts = fs.readdirSync(weekDir).filter((f) => f.endsWith(".json")).sort();
if (!scripts.length) { console.error(`No .json scripts in ${weekDir}.`); process.exit(1); }

console.log(`Flourish reel factory · ${week} · ${scripts.length} script(s)`);
for (const file of scripts) await buildOne(path.join(weekDir, file));
console.log(`\nDone. Output in ${path.relative(ROOT, path.join(dir.out, week))}/`);
