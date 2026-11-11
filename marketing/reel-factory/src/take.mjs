// ONE REQUEST, ONE TAKE.
//
// Seven separate requests gave seven separate performances: each line reset its intonation, so a
// list read like a set of announcements. A single request keeps one breath and one contour across
// the whole script — which is the entire point, and the reason nothing here re-synthesises a line
// on its own afterwards.
//
// The take is CACHED on disk with its alignment and request id. Re-running the edit costs nothing;
// only deleting the cache spends credits again.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const TTS = (voiceId) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`;

/** The script as one string, with the breaks that put each line near its scene. */
export function buildScript(lines, breaks) {
  return lines.map((l, i) => l.text + (i < breaks.length ? ` <break time="${breaks[i].toFixed(2)}s" />` : "")).join(" ");
}

/**
 * Break lengths, from each line's expected duration and where the next scene starts. Capped at the
 * 3s the API allows per break, and never below 0.2s — a break the model rounds away is a break
 * that leaves two lines glued together.
 */
export function planBreaks(lines, estimates, lead) {
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const gap = (lines[i + 1].at + lead) - (lines[i].at + lead) - estimates[i];
    out.push(Math.min(3, Math.max(0.2, Math.round(gap * 100) / 100)));
  }
  return out;
}

export async function fetchTake({ text, spec, cacheDir, env }) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const signature = JSON.stringify({ text, voiceId: spec.voice.voiceId, model: spec.voice.model,
                                     seed: spec.voice.seed, settings: spec.voice.settings });
  // The file NAME carries the signature. One fixed name per voice meant a take that needed a
  // speed-up overwrote its own 1.0 version on every run — and paid for the 1.05 one again.
  const stamp = createHash("sha1").update(signature).digest("hex").slice(0, 10);
  const mp3 = path.join(cacheDir, `take-${stamp}.mp3`);
  const meta = path.join(cacheDir, `take-${stamp}.json`);
  if (fs.existsSync(mp3) && fs.existsSync(meta)) {
    const m = JSON.parse(fs.readFileSync(meta, "utf8"));
    if (m.signature === signature) return { ...m, file: mp3, cached: true };
  }
  const key = (env.ELEVENLABS_API_KEY || "").trim();
  if (!key) throw new Error("No ELEVENLABS_API_KEY in marketing/reel-factory/.env");

  const res = await fetch(TTS(spec.voice.voiceId), {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },     // never logged
    body: JSON.stringify({
      text,
      model_id: spec.voice.model,
      seed: spec.voice.seed,                      // fixed, so the take is reproducible
      voice_settings: spec.voice.settings,
    }),
  });
  const requestId = res.headers.get("request-id") || res.headers.get("x-request-id") || null;
  if (!res.ok) throw new Error(`ElevenLabs refused the take (HTTP ${res.status}). request-id ${requestId || "none"}`);
  const body = await res.json();
  fs.writeFileSync(mp3, Buffer.from(body.audio_base64, "base64"));
  const record = {
    text, signature, requestId, credits: text.length,
    model: spec.voice.model, voiceId: spec.voice.voiceId, seed: spec.voice.seed,
    settings: spec.voice.settings,
    alignment: body.alignment || body.normalized_alignment || null,
  };
  fs.writeFileSync(meta, JSON.stringify(record));
  return { ...record, file: mp3, cached: false };
}

/**
 * Where each line sits inside the take, from the character timestamps.
 *
 * The alignment covers the spoken characters; the break tags are markup and never reach it. So the
 * lines are located by walking the spoken characters and matching each line's own letters in order
 * — punctuation and spacing are ignored on both sides, which makes this robust to the model
 * normalising a comma or a number.
 */
export function locateLines(alignment, lines) {
  const chars = alignment.characters || [];
  const starts = alignment.character_start_times_seconds || [];
  const ends = alignment.character_end_times_seconds || [];
  if (!chars.length || chars.length !== starts.length) throw new Error("The take came back without usable character timings.");

  // The break tags DO appear in the alignment — they are part of the text that was sent — but they
  // carry no audio, so they must be skipped rather than matched. Their spans are found on the
  // reconstructed string and the characters inside them are ignored.
  const full = chars.join("");
  const skip = new Set();
  for (const m of full.matchAll(/<break\s+time="[\d.]+s"\s*\/>/g)) {
    for (let i = m.index; i < m.index + m[0].length; i++) skip.add(i);
  }

  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  let cursor = 0;
  return lines.map((line) => {
    const want = norm(line.text);
    let got = "", first = -1, last = -1;
    for (let i = cursor; i < chars.length && got.length < want.length; i++) {
      if (skip.has(i)) continue;
      const c = norm(chars[i]);
      if (!c) continue;
      if (got.length === 0) first = i;
      got += c;
      last = i;
    }
    if (got !== want) {
      throw new Error(`Could not find "${line.text}" in the take's timings (matched "${got.slice(0, 40)}…"). The model may have renormalised the text.`);
    }
    cursor = last + 1;
    return { ...line, audioStart: starts[first], audioEnd: ends[last] };
  });
}
