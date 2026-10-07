#!/usr/bin/env node
// SOUND FOR AN APPROVED CUT.  npm run dub -- week-01
//
// The picture is finished and is never re-edited: the video stream is copied through untouched,
// and the gate proves it by comparing the stream's checksum before and after. Everything here is
// audio — voice, an optional music bed, a few quiet ticks, and a master.
//
// The copy lives in scripts/<week>/<id>.dub.json, not in this file.
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT, dir, ensure } from "./config.mjs";
import { speak } from "./voice.mjs";
import { normaliseTo, measureLufs } from "./audio.mjs";
import { runAudioGate } from "./qcAudio.mjs";

const run = promisify(execFile);
const ff = (args) => run("ffmpeg", ["-y", "-loglevel", "error", ...args], { maxBuffer: 1 << 28 });
dotenv.config({ path: path.join(ROOT, ".env") });

const args = process.argv.slice(2);
const week = args.find((a) => !a.startsWith("--"));
if (!week) { console.error("Usage: npm run dub -- week-01"); process.exit(1); }
const REVIEW = process.env.REVIEW_DIR
  || path.join(process.env.HOME, "Projects", "flourish-app", "marketing", "review", week);
const log = (m) => console.log(`  ${m}`);

/**
 * A line, spoken so that it fits its scene.
 *
 * The rule is "never cut a word", so the only lever is speed, and only as far as 1.1 — past that a
 * calm narrator stops sounding calm. A line that still will not fit is reported, not trimmed.
 */
async function speakToFit(text, window, workDir, i, env) {
  const file = path.join(workDir, `line-${String(i + 1).padStart(2, "0")}.mp3`);
  let spoken = await speak(text, file, env);
  let speed = 1.0, attempts = 1;
  if (spoken.duration > window) {
    // Ask for exactly the speed-up the overrun needs, with a little margin, capped at 1.1.
    speed = Math.min(env.__maxSpeed || 1.1, Math.round((spoken.duration / (window * 0.96)) * 100) / 100);
    spoken = await speak(text, file, { ...env, ELEVENLABS_SPEED: String(speed) });
    attempts = 2;
  }
  return { ...spoken, speed, attempts, fits: spoken.duration <= window };
}

/** A soft synthesised tick. No stock audio, nothing downloaded. */
async function tick(out, { freq, seconds = 0.09, peakDbfs = -30 }) {
  const gain = Math.pow(10, peakDbfs / 20);
  await ff(["-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${seconds}:sample_rate=48000`,
    "-af", `afade=t=in:st=0:d=0.004,afade=t=out:st=0.012:d=${(seconds - 0.012).toFixed(3)},volume=${gain.toFixed(4)}`,
    "-ac", "2", out]);
  return out;
}

(async () => {
  const spec = JSON.parse(fs.readFileSync(path.join(dir.scripts, week, "reel-01.dub.json"), "utf8"));
  const workDir = ensure(path.join(dir.out, week, "audio"));
  const inFile = path.join(REVIEW, spec.input);
  const outFile = path.join(REVIEW, spec.output);
  if (!fs.existsSync(inFile)) throw new Error(`The approved cut is not at ${inFile}`);
  console.log(`Flourish reel factory · dub · ${week}`);

  // ── 1. voice ────────────────────────────────────────────────────────────────────────────────
  const env = { ...process.env, ELEVENLABS_VOICE_ID: spec.voice.voiceId, ELEVENLABS_MODEL_ID: spec.voice.model,
                __maxSpeed: spec.voice.maxSpeed };
  const lines = [];
  let credits = 0;
  for (const [i, sc] of spec.scenes.entries()) {
    const start = sc.at + spec.voice.leadIn;
    // The last line has to be done before the end card's own beat, not at the very end of the cut.
    const sceneEnd = i + 1 < spec.scenes.length ? spec.scenes[i + 1].at : (spec.voiceEnd ?? spec.duration);
    const window = sceneEnd - start;
    const spoken = await speakToFit(sc.line, window, workDir, i, env);
    credits += (spoken.credits || 0) * spoken.attempts;
    lines.push({ ...sc, ...spoken, start, end: start + spoken.duration, sceneEnd, window });
    log(`line ${i + 1}/${spec.scenes.length} · ${start.toFixed(2)}-${(start + spoken.duration).toFixed(2)}s `
      + `(window ${window.toFixed(2)}s)${spoken.speed !== 1 ? ` · speed ${spoken.speed}` : ""}`
      + `${spoken.fits ? "" : "  ⚠ DOES NOT FIT"}`);
  }
  if (lines.some((l) => !l.fits)) {
    throw new Error("A line will not fit its scene even at the maximum speed. Shorten the copy or lengthen the scene — words are never cut here.");
  }

  // Lay the lines into one track at their real offsets, then level the read.
  const voiceRaw = path.join(workDir, "voice-raw.wav");
  const ins = [], filt = [];
  lines.forEach((l, i) => {
    ins.push("-i", l.file);
    filt.push(`[${i}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(l.start * 1000)}|${Math.round(l.start * 1000)}[v${i}]`);
  });
  await ff([...ins, "-filter_complex",
    `${filt.join(";")};${lines.map((_, i) => `[v${i}]`).join("")}amix=inputs=${lines.length}:normalize=0:duration=longest[m];[m]apad=whole_dur=${spec.duration}[out]`,
    "-map", "[out]", "-ac", "2", "-ar", "48000", voiceRaw]);
  const { file: voiceTrack } = await normaliseTo(voiceRaw, path.join(workDir, "voice.wav"), -16);

  // ── 2. music, only if the key may generate it ────────────────────────────────────────────────
  let music = null, musicNote = "skipped";
  const key = (process.env.ELEVENLABS_API_KEY || "").trim();
  if (key) {
    const res = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },  // never logged
      body: JSON.stringify({ prompt: spec.music.prompt, music_length_ms: Math.round(spec.duration * 1000) }),
    });
    if (res.ok) {
      const raw = path.join(workDir, "music-raw.mp3");
      fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
      const bed = path.join(workDir, "music-bed.wav");
      const fo = (spec.duration - spec.music.fadeOut).toFixed(2);
      await ff(["-i", raw, "-af", `afade=t=in:st=0:d=${spec.music.fadeIn},afade=t=out:st=${fo}:d=${spec.music.fadeOut}`,
        "-ar", "48000", "-ac", "2", bed]);
      const norm = await normaliseTo(bed, path.join(workDir, "music.wav"), spec.music.lufs);
      music = norm.file;
      musicNote = `ElevenLabs Music, ${spec.music.lufs} LUFS, ducked under the voice`;
    } else {
      let why = "";
      try { why = (((await res.json()) || {}).detail || {}).message || ""; } catch { /* body not JSON */ }
      musicNote = `unavailable (HTTP ${res.status}${why ? `: ${why.replace(/\s+/g, " ").slice(0, 90)}` : ""}) — no music rather than an unlicensed substitute`;
    }
  }
  log(`music: ${musicNote}`);

  // ── 3. ticks ────────────────────────────────────────────────────────────────────────────────
  // The key has no sound_generation permission, so these are synthesised here. Nothing downloaded.
  const cardTick = await tick(path.join(workDir, "tick-card.wav"), { freq: 760, peakDbfs: spec.ticks.peakDbfs });
  const liftTick = await tick(path.join(workDir, "tick-lift.wav"), { freq: 1180, peakDbfs: spec.ticks.peakDbfs });
  const tickAt = [...spec.ticks.cards.map((t) => ({ t, f: cardTick })), ...spec.ticks.lifts.map((t) => ({ t, f: liftTick }))];
  const ticksTrack = path.join(workDir, "ticks.wav");
  {
    const i2 = [], f2 = [];
    tickAt.forEach((x, i) => {
      i2.push("-i", x.f);
      f2.push(`[${i}:a]adelay=${Math.round(x.t * 1000)}|${Math.round(x.t * 1000)}[t${i}]`);
    });
    await ff([...i2, "-filter_complex",
      `${f2.join(";")};${tickAt.map((_, i) => `[t${i}]`).join("")}amix=inputs=${tickAt.length}:normalize=0:duration=longest[m];[m]apad=whole_dur=${spec.duration}[out]`,
      "-map", "[out]", "-ac", "2", "-ar", "48000", ticksTrack]);
  }
  log(`ticks: ${tickAt.length} synthesised at ${spec.ticks.peakDbfs} dBFS`);

  // ── 4. mix and master ───────────────────────────────────────────────────────────────────────
  // The music ducks under the voice by sidechain rather than by a hand-drawn envelope, so the dip
  // follows the read instead of a guess at where the read is.
  const mixRaw = path.join(workDir, "mix-raw.wav");
  if (music) {
    await ff(["-i", voiceTrack, "-i", music, "-i", ticksTrack, "-filter_complex",
      "[1:a][0:a]sidechaincompress=threshold=0.05:ratio=8:attack=12:release=320[duck];"
      + "[0:a][duck][2:a]amix=inputs=3:normalize=0:duration=first[out]",
      "-map", "[out]", "-ar", "48000", "-ac", "2", mixRaw]);
  } else {
    await ff(["-i", voiceTrack, "-i", ticksTrack, "-filter_complex",
      "[0:a][1:a]amix=inputs=2:normalize=0:duration=first[out]", "-map", "[out]", "-ar", "48000", "-ac", "2", mixRaw]);
  }
  const mastered = path.join(workDir, "master.wav");
  await normaliseTo(mixRaw, mastered, spec.master.lufs);   // two-pass, TP -1.5 headroom inside

  // ── 5. mux. The video stream is COPIED; not one frame is re-encoded. ────────────────────────
  await ff(["-i", inFile, "-i", mastered, "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", "-shortest", outFile]);
  log(`wrote ${path.relative(process.env.HOME, outFile)}`);

  await runAudioGate({ inFile, outFile, spec, lines, reviewDir: REVIEW, music: !!music, musicNote, credits, ticks: tickAt.length });
})();
