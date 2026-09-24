#!/usr/bin/env node
// v7: sound from ONE continuous take.  npm run dub:take -- week-01
//
// The edit only ever moves silence. Each line is cut at the MIDPOINT of the pause around it, so its
// breath tail and lead-in travel with it, and the segments are then placed where the scenes want
// them. Nothing is time-stretched, no word is trimmed, and the run stops if a pause would have to
// close below the floor rather than quietly squeezing the read.
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT, dir, ensure } from "./config.mjs";
import { buildScript, planBreaks, fetchTake, locateLines } from "./take.mjs";
import { normaliseTo } from "./audio.mjs";
import { audioDurationSeconds } from "./voice.mjs";
import { runAudioGate } from "./qcAudio.mjs";

const run = promisify(execFile);
const ff = (a) => run("ffmpeg", ["-y", "-loglevel", "error", ...a], { maxBuffer: 1 << 28 });
dotenv.config({ path: path.join(ROOT, ".env") });

const argv = process.argv.slice(2);
const week = argv.find((a) => !a.startsWith("--"));
const auditionKey = (argv.find((a) => a.startsWith("--audition=")) || "").split("=")[1] || null;
if (!week) { console.error("Usage: npm run dub:take -- week-01 [--audition=A]"); process.exit(1); }
const REVIEW = process.env.REVIEW_DIR || path.join(process.env.HOME, "Projects", "flourish-app", "marketing", "review", week);
const log = (m) => console.log(`  ${m}`);

// What each line is expected to run to, for sizing the breaks. Measured from the v6 pass on the
// same words; the alignment that comes back is what actually drives the edit.
const ESTIMATES = [1.63, 1.58, 0.93, 1.11, 2.00, 1.86, 3.81];

async function tick(out, { freq, seconds = 0.09, peakDbfs }) {
  const g = Math.pow(10, peakDbfs / 20);
  await ff(["-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${seconds}:sample_rate=48000`,
    "-af", `afade=t=in:st=0:d=0.004,afade=t=out:st=0.012:d=${(seconds - 0.012).toFixed(3)},volume=${g.toFixed(4)}`,
    "-ac", "2", out]);
  return out;
}

(async () => {
  const spec = JSON.parse(fs.readFileSync(path.join(dir.scripts, week, "reel-01.take.json"), "utf8"));

  // An audition swaps ONLY the voice. Script, commas, alignment rules, mix targets, ticks and gate
  // are the v7 pipeline untouched — otherwise the comparison is not about the voice.
  const aud = auditionKey ? spec.auditions[auditionKey] : null;
  if (auditionKey && !aud) throw new Error(`No audition "${auditionKey}" in the spec.`);
  const suffix = aud ? `audition-${auditionKey}` : "v7";
  if (aud) {
    spec.voice = { ...spec.voice, voiceId: aud.voiceId, name: aud.name, settings: aud.settings };
    spec.output = spec.audition.outputPattern.replace("{key}", auditionKey).replace("{label}", aud.label);
  }
  const work = ensure(path.join(dir.out, week, `audio-${suffix}`));
  const inFile = path.join(REVIEW, spec.input);
  const outFile = path.join(REVIEW, spec.output);
  if (!fs.existsSync(inFile)) throw new Error(`The locked picture is not at ${inFile}`);
  console.log(`Flourish reel factory · one-take dub · ${week}`);

  // ── 1. the take ─────────────────────────────────────────────────────────────────────────────
  const breaks = planBreaks(spec.lines, ESTIMATES, spec.align.lead);
  const text = buildScript(spec.lines, breaks);

  // A different voice reads at a different pace. If the take will not fit the scenes at 1.0, ask
  // once at the allowed 1.05 — and if it still will not fit, SKIP the voice rather than cut a word.
  const maxSpeed = (spec.audition && spec.audition.maxSpeed) || 1.0;
  let take = null, placed = null, located = null, takeLen = 0, pauses = [], usedSpeed = 1.0;
  for (const speed of [1.0, ...(maxSpeed > 1.0 ? [maxSpeed] : [])]) {
    spec.voice = { ...spec.voice, settings: { ...spec.voice.settings, speed } };
    take = await fetchTake({ text, spec, cacheDir: work, env: process.env });
    located = locateLines(take.alignment, spec.lines);
    takeLen = await audioDurationSeconds(take.file);
    const cuts2 = [0];
    for (let i = 0; i < located.length - 1; i++) cuts2.push((located[i].audioEnd + located[i + 1].audioStart) / 2);
    cuts2.push(takeLen);
    placed = located.map((l, i) => {
      const segStart = cuts2[i], segEnd = cuts2[i + 1];
      const lead = l.audioStart - segStart;
      const target = l.at + spec.align.lead;
      return { ...l, segStart, segEnd, at0: target - lead, target, dur: l.audioEnd - l.audioStart };
    });
    pauses = placed.slice(1).map((p, i) => p.target - (placed[i].target + placed[i].dur));
    const last = placed[placed.length - 1];
    const fits = pauses.every((p) => p >= spec.align.minPause) && (last.target + last.dur) <= spec.voiceEnd;
    usedSpeed = speed;
    if (fits) break;
    if (speed === maxSpeed) {
      console.error(`  SKIPPED ${spec.voice.name}: does not fit even at speed ${maxSpeed} `
        + `(tightest pause ${Math.min(...pauses).toFixed(2)}s, last line ends ${(last.target + last.dur).toFixed(2)}s vs ${spec.voiceEnd}s). No word is cut to make it fit.`);
      process.exit(3);
    }
  }
  log(`take: ${take.cached ? "cached" : "generated"} · ${spec.voice.name} · request-id ${take.requestId || "(not returned)"} · ${take.credits} credits · speed ${usedSpeed}`);
  log(`breaks: ${breaks.map((b) => b.toFixed(2) + "s").join(", ")}`);

  // Each segment is trimmed out of the one take, faded 20ms at both cuts so no join can click, and
  // delayed to its place. Silence between them is simply the gap left by the delays.
  const xf = spec.align.crossfade;
  const ins = [], filt = [];
  placed.forEach((p, i) => {
    ins.push("-i", take.file);
    const segDur = p.segEnd - p.segStart;
    filt.push(`[${i}:a]atrim=start=${p.segStart.toFixed(4)}:end=${p.segEnd.toFixed(4)},asetpts=PTS-STARTPTS,`
      + `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,`
      + `afade=t=in:st=0:d=${xf},afade=t=out:st=${Math.max(0, segDur - xf).toFixed(4)}:d=${xf},`
      + `adelay=${Math.round(Math.max(0, p.at0) * 1000)}|${Math.round(Math.max(0, p.at0) * 1000)}[s${i}]`);
  });
  const voiceRaw = path.join(work, "voice-raw.wav");
  await ff([...ins, "-filter_complex",
    `${filt.join(";")};${placed.map((_, i) => `[s${i}]`).join("")}amix=inputs=${placed.length}:normalize=0:duration=longest[m];`
    + `[m]apad=whole_dur=${spec.duration},atrim=end=${spec.duration}[out]`,
    "-map", "[out]", "-ac", "2", "-ar", "48000", voiceRaw]);
  const { file: voiceTrack } = await normaliseTo(voiceRaw, path.join(work, "voice.wav"), -16);
  log(`edit: 7 segments, ${(xf * 1000).toFixed(0)}ms fades, pauses ${pauses.map((p) => p.toFixed(2)).join("/")}s`);

  // ── 3. music, asked for properly ────────────────────────────────────────────────────────────
  let music = null, musicNote = "skipped (no key)";
  const key = (process.env.ELEVENLABS_API_KEY || "").trim();
  if (key) {
    const res = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: spec.music.prompt, music_length_ms: Math.round(spec.duration * 1000) }),
    });
    if (res.ok) {
      const raw = path.join(work, "music-raw.mp3");
      fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
      const bed = path.join(work, "music-bed.wav");
      await ff(["-i", raw, "-af",
        `afade=t=in:st=0:d=${spec.music.fadeIn},afade=t=out:st=${(spec.duration - spec.music.fadeOut).toFixed(2)}:d=${spec.music.fadeOut}`,
        "-ar", "48000", "-ac", "2", bed]);
      music = (await normaliseTo(bed, path.join(work, "music.wav"), spec.music.lufs)).file;
      musicNote = `ElevenLabs Music at ${spec.music.lufs} LUFS, ducked under the voice`;
    } else {
      let why = ""; try { why = (((await res.json()) || {}).detail || {}).message || ""; } catch { /* not json */ }
      musicNote = `unavailable (HTTP ${res.status}${why ? `: ${why.replace(/\s+/g, " ").slice(0, 90)}` : ""}) — no music rather than an unlicensed substitute`;
    }
  }
  log(`music: ${musicNote}`);

  // ── 4. ticks ────────────────────────────────────────────────────────────────────────────────
  const card = await tick(path.join(work, "tick-card.wav"), { freq: 760, peakDbfs: spec.ticks.peakDbfs });
  const lift = await tick(path.join(work, "tick-lift.wav"), { freq: 1180, peakDbfs: spec.ticks.peakDbfs });
  const at = [...spec.ticks.cards.map((t) => ({ t, f: card })), ...spec.ticks.lifts.map((t) => ({ t, f: lift }))];
  const ticks = path.join(work, "ticks.wav");
  {
    const i2 = [], f2 = [];
    at.forEach((x, i) => { i2.push("-i", x.f); f2.push(`[${i}:a]adelay=${Math.round(x.t * 1000)}|${Math.round(x.t * 1000)}[t${i}]`); });
    await ff([...i2, "-filter_complex",
      `${f2.join(";")};${at.map((_, i) => `[t${i}]`).join("")}amix=inputs=${at.length}:normalize=0:duration=longest[m];[m]apad=whole_dur=${spec.duration}[out]`,
      "-map", "[out]", "-ac", "2", "-ar", "48000", ticks]);
  }
  log(`ticks: ${at.length} synthesised at ${spec.ticks.peakDbfs} dBFS`);

  // ── 5. mix, master, mux ─────────────────────────────────────────────────────────────────────
  const mixRaw = path.join(work, "mix-raw.wav");
  if (music) {
    await ff(["-i", voiceTrack, "-i", music, "-i", ticks, "-filter_complex",
      "[1:a][0:a]sidechaincompress=threshold=0.05:ratio=8:attack=12:release=320[duck];"
      + "[0:a][duck][2:a]amix=inputs=3:normalize=0:duration=first[out]", "-map", "[out]", "-ar", "48000", "-ac", "2", mixRaw]);
  } else {
    await ff(["-i", voiceTrack, "-i", ticks, "-filter_complex",
      "[0:a][1:a]amix=inputs=2:normalize=0:duration=first[out]", "-map", "[out]", "-ar", "48000", "-ac", "2", mixRaw]);
  }
  const master = path.join(work, "master.wav");
  await normaliseTo(mixRaw, master, spec.master.lufs);
  await ff(["-i", inFile, "-i", master, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", "-shortest", outFile]);
  log(`wrote ${path.relative(process.env.HOME, outFile)}`);

  const lines = placed.map((p) => ({ line: p.text, at: p.at, start: p.target, end: p.target + p.dur,
    sceneEnd: p.at === spec.lines[spec.lines.length - 1].at ? spec.voiceEnd : spec.lines[spec.lines.findIndex((l) => l.at === p.at) + 1].at,
    speed: 1, requestId: take.requestId }));
  await runAudioGate({ inFile, outFile, spec, lines, reviewDir: REVIEW, music: !!music, musicNote,
    credits: take.credits, ticks: at.length, take, suffix,
    briefed: aud ? aud.settings : spec.voice.settings,
    maxSpeed: aud ? (spec.audition.maxSpeed || 1.0) : 1.0 });
})();
