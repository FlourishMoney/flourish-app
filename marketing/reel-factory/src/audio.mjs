// THE SOUND. One narration track, measured and normalised, plus generated UI tones.
//
// STYLE.md §7. Three decisions worth keeping:
//
// ONE TRACK, NOT FIVE. Each line is spoken separately, then laid into a single narration track at
// its real offset. Loudness is a property of a whole track: normalising five short clips
// individually would push a one-second line to the same integrated loudness as a four-second one
// and make the read lurch.
//
// TWO-PASS loudnorm. The single-pass filter guesses at the input and lands a decibel or two out,
// which the quality gate would then fail. The first pass measures, the second corrects.
//
// NO MUSIC UNLESS IT IS LICENSED. A bed is added only from ElevenLabs music with a key whose plan
// permits commercial use. There is no fallback to "something royalty-free" — no music at all is
// the correct output when the licence is not certain.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
export const TARGET_LUFS = -14;
const MUSIC_LUFS = -24;

const ff = (args) => run("ffmpeg", ["-y", "-loglevel", "error", ...args], { maxBuffer: 1 << 26 });

/** Lay each spoken line into one track at its own start time. Returns the assembled wav. */
export async function assembleNarration(lines, outWav, totalSeconds) {
  const inputs = [];
  const filters = [];
  lines.forEach((line, i) => {
    inputs.push("-i", line.file);
    // adelay wants milliseconds, per channel.
    const ms = Math.round(line.start * 1000);
    filters.push(`[${i}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`);
  });
  const mix = lines.map((_, i) => `[a${i}]`).join("");
  // amix would attenuate each input by 1/n; the lines do not overlap, so sum them and keep the level.
  const graph = `${filters.join(";")};${mix}amix=inputs=${lines.length}:normalize=0:duration=longest[mixed];[mixed]apad=whole_dur=${totalSeconds}[out]`;
  await ff([...inputs, "-filter_complex", graph, "-map", "[out]", "-ac", "2", "-ar", "48000", outWav]);
  return outWav;
}

/** A soft, synthesised tone. Generated, so nothing here is anyone else's recording. */
export async function uiTone(outWav, { freq = 880, seconds = 0.18 } = {}) {
  await ff([
    "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${seconds}:sample_rate=48000`,
    "-af", `afade=t=in:st=0:d=0.012,afade=t=out:st=${(seconds * 0.35).toFixed(3)}:d=${(seconds * 0.65).toFixed(3)},volume=0.22`,
    "-ac", "2", outWav,
  ]);
  return outWav;
}

/** Measure integrated loudness of any media file. */
export async function measureLufs(file) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"],
    { maxBuffer: 1 << 26 }).catch((e) => ({ stderr: e.stderr || "" }));
  const m = /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g;
  let last = null, hit;
  while ((hit = m.exec(stderr)) !== null) last = parseFloat(hit[1]);
  return last;
}

/** Two-pass loudnorm to TARGET_LUFS. Returns the normalised file. */
export async function normaliseTo(file, outFile, target = TARGET_LUFS) {
  const { stderr } = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", file,
    "-af", `loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-",
  ], { maxBuffer: 1 << 26 }).catch((e) => ({ stderr: e.stderr || "" }));
  const json = stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1);
  let measured = null;
  try { measured = JSON.parse(json); } catch { /* fall through to single pass */ }
  const second = measured
    ? `loudnorm=I=${target}:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
    : `loudnorm=I=${target}:TP=-1.5:LRA=11`;
  await ff(["-i", file, "-af", second, "-ar", "48000", "-ac", "2", outFile]);
  return { file: outFile, twoPass: !!measured };
}

/**
 * A music bed, ONLY from ElevenLabs and ONLY when a key is present. Returns null otherwise, and
 * null is a perfectly good answer: STYLE.md §7 would rather have silence than an unlicensed track.
 */
export async function maybeMusicBed(seconds, outFile, env = process.env) {
  const key = (env.ELEVENLABS_API_KEY || "").trim();
  if (!key || env.ELEVENLABS_MUSIC !== "true") return null;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },   // never logged
      body: JSON.stringify({
        prompt: "calm, sparse, warm fintech product film underscore, soft synth pad, no drums, no vocals",
        music_length_ms: Math.round(seconds * 1000),
      }),
    });
    if (!res.ok) return null;                       // no music is a valid outcome; never a fallback track
    fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
    const bed = outFile.replace(/\.\w+$/, "") + "-bed.mp3";
    await normaliseTo(outFile, bed, MUSIC_LUFS);
    return bed;
  } catch {
    return null;
  }
}

export const _audio = { MUSIC_LUFS };
