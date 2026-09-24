// VOICE, AND WHERE EVERY WORD LANDS.
//
// ElevenLabs when a key is present, the macOS "say" voice when it is not, so the pipeline runs end
// to end on a machine with no key and no account. The two differ in ONE way that matters:
//
//   ElevenLabs returns character-level timestamps, so word timings are measured.
//   `say` returns none, so word timings are ESTIMATED — each word gets a share of the clip
//   proportional to its length, then the whole thing is scaled to the real measured duration.
//
// Estimated timings are good enough to cut captions to, and not good enough to ship a paid ad on.
// Every result says which it is, and the caption file records it.
//
// THE KEY IS NEVER PRINTED. It is read from .env, used as a header, and never logged, never
// written into any output file, and never included in an error message.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
// output_format is a QUERY parameter on this endpoint, not a body field.
const TTS_URL = (voiceId, fmt) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${encodeURIComponent(fmt)}`;

export async function audioDurationSeconds(file) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
  ]);
  const seconds = parseFloat(String(stdout).trim());
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe could not read a duration from ${path.basename(file)}`);
  return seconds;
}

// Split on whitespace but keep the punctuation attached, which is what a caption shows.
const wordsOf = (text) => String(text).trim().split(/\s+/).filter(Boolean);

/** Proportional-share fallback timings, scaled to the clip's real duration. */
function estimateWordTimings(text, duration) {
  const words = wordsOf(text);
  // A word's share is its length plus a constant, so "a" is not given the same time as "handled".
  const weights = words.map((w) => w.replace(/[^A-Za-z0-9']/g, "").length + 2);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  return words.map((word, i) => {
    const start = t;
    t += (weights[i] / total) * duration;
    return { word, start, end: t };
  });
}

/** ElevenLabs gives per-character start/end; fold them into words. */
function wordsFromCharacterAlignment(text, alignment) {
  const chars = alignment?.characters || [];
  const starts = alignment?.character_start_times_seconds || [];
  const ends = alignment?.character_end_times_seconds || [];
  if (!chars.length || chars.length !== starts.length) return null;
  const out = [];
  let current = null;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/\s/.test(ch)) { if (current) { out.push(current); current = null; } continue; }
    if (!current) current = { word: "", start: starts[i], end: ends[i] };
    current.word += ch;
    current.end = ends[i];
  }
  if (current) out.push(current);
  return out.length ? out : null;
}

/**
 * Speak one line to `outFile` (mp3 or wav). Returns { file, duration, words, source, measured }.
 * `words` is always populated; `measured` says whether the timings were measured or estimated.
 */
export async function speak(text, outFile, env = process.env) {
  const key = (env.ELEVENLABS_API_KEY || "").trim();
  const voiceId = (env.ELEVENLABS_VOICE_ID || "").trim();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  if (key && voiceId) {
    const model = env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
    const res = await fetch(TTS_URL(voiceId, "mp3_44100_128"), {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },   // never logged
      body: JSON.stringify({
        text,
        model_id: model,
        // Stability high and style at zero: a brand read, not a performance. The same settings on
        // every line, so the seven clips sound like one person in one sitting.
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
      }),
    });
    if (!res.ok) {
      // The body can echo request details; the status alone is enough to act on, and cannot leak a key.
      throw new Error(`ElevenLabs refused the request (HTTP ${res.status}). Check ELEVENLABS_VOICE_ID and the key's quota.`);
    }
    const body = await res.json();
    const mp3 = path.join(path.dirname(outFile), path.basename(outFile, path.extname(outFile)) + ".mp3");
    fs.writeFileSync(mp3, Buffer.from(body.audio_base64, "base64"));
    const duration = await audioDurationSeconds(mp3);
    const words = wordsFromCharacterAlignment(text, body.alignment || body.normalized_alignment)
      || estimateWordTimings(text, duration);
    const measured = !!wordsFromCharacterAlignment(text, body.alignment || body.normalized_alignment);
    // One credit per character on this model. Reported so the 20,000 cap stays visible.
    return { file: mp3, duration, words, source: "elevenlabs", measured, credits: text.length, model, voiceId };
  }

  // ── fallback: the macOS voice ──────────────────────────────────────────────────────────────
  const aiff = outFile.replace(/\.\w+$/, "") + ".aiff";
  const mp3 = outFile.replace(/\.\w+$/, "") + ".mp3";
  await run("say", ["-v", env.SAY_VOICE || "Samantha", "-o", aiff, text]);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-codec:a", "libmp3lame", "-q:a", "4", mp3]);
  fs.rmSync(aiff, { force: true });
  const duration = await audioDurationSeconds(mp3);
  return { file: mp3, duration, words: estimateWordTimings(text, duration), source: "macos-say", measured: false, credits: 0, model: null, voiceId: null };
}

export const _test = { estimateWordTimings, wordsFromCharacterAlignment, wordsOf };
