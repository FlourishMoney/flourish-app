// THE MUSIC BED.
//
// force_instrumental is not a setting here, it is a rule. The v8 bed came back with sung vocals
// over the narration, which is unusable at any level — a bed with a voice in it is a second
// narrator. Every request made by this module carries force_instrumental: true, the prompt is
// prefixed to say so in words as well, and the exact request body is cached beside the audio so
// the gate can prove it after the fact rather than trust that it happened.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const COMPOSE = (fmt) => `https://api.elevenlabs.io/v1/music/compose?output_format=${encodeURIComponent(fmt)}`;

// Said in the prompt as well as in the flag. The flag is what guarantees it; the words cost
// nothing and steer the arrangement away from anything voice-shaped.
export const INSTRUMENTAL_PREFIX =
  "Instrumental only. No vocals, no singing, no humming, no choir, no vocal chops.";

// Best first. A key that cannot use one falls through to the next rather than failing the run.
export const MUSIC_MODELS = ["music_v2_5", "music_v1"];

export async function generateBed({ prompt, ms, seed, cacheDir, env, format = "mp3_48000_192" }) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const fullPrompt = `${INSTRUMENTAL_PREFIX} ${prompt}`.trim();
  const signature = JSON.stringify({ fullPrompt, ms, seed, format, forceInstrumental: true });
  const stamp = createHash("sha1").update(signature).digest("hex").slice(0, 10);
  const mp3 = path.join(cacheDir, `bed-${stamp}.mp3`);
  const meta = path.join(cacheDir, `bed-${stamp}.json`);
  if (fs.existsSync(mp3) && fs.existsSync(meta)) {
    const m = JSON.parse(fs.readFileSync(meta, "utf8"));
    if (m.signature === signature) return { ...m, file: mp3, cached: true };
  }

  const key = (env.ELEVENLABS_API_KEY || "").trim();
  if (!key) throw new Error("No ELEVENLABS_API_KEY in marketing/reel-factory/.env");

  let lastStatus = null, lastWhy = "", seedNote = null;
  for (const model_id of MUSIC_MODELS) {
    // The body is built here and recorded verbatim. force_instrumental is set unconditionally —
    // there is no argument that can turn it off.
    //
    // The seed is attempted and may be refused: the API rejects `seed` alongside `prompt` (it is
    // for composition plans), and a prompt is what carries the brief's own words. So the seed is
    // dropped rather than the prompt, and the refusal is recorded instead of hidden — the bed's
    // reproducibility then comes from the cache, which is what actually reuses it.
    let requestBody = { prompt: fullPrompt, music_length_ms: ms, force_instrumental: true, model_id, ...(seed != null ? { seed } : {}) };
    let res = await fetch(COMPOSE(format), {
      method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },   // never logged
      body: JSON.stringify(requestBody),
    });
    if (res.status === 422 && seed != null) {
      let why = ""; try { why = (((await res.json()) || {}).detail || {}).message || ""; } catch { /* not json */ }
      if (/seed/i.test(why)) {
        seedNote = `seed dropped: the API refused it with a prompt ("${why.replace(/\s+/g, " ").slice(0, 60)}")`;
        requestBody = { prompt: fullPrompt, music_length_ms: ms, force_instrumental: true, model_id };
        res = await fetch(COMPOSE(format), {
          method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
      } else { lastStatus = 422; lastWhy = why; continue; }
    }
    if (!res.ok) {
      lastStatus = res.status;
      try { lastWhy = (((await res.json()) || {}).detail || {}).message || ""; } catch { lastWhy = ""; }
      continue;                                   // try the next model
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(mp3, buf);
    const record = {
      signature, requestBody, model: model_id, format, ms, seed, seedNote,
      requestId: res.headers.get("request-id") || res.headers.get("x-request-id") || null,
      bytes: buf.length,
    };
    fs.writeFileSync(meta, JSON.stringify(record, null, 2));
    return { ...record, file: mp3, cached: false };
  }
  throw new Error(`No music model would generate the bed (last HTTP ${lastStatus}${lastWhy ? `: ${lastWhy.slice(0, 90)}` : ""}). The final cut does not ship without music.`);
}

/** Every cached bed must record that it was asked for instrumentally. */
export function beds(cacheDir) {
  if (!fs.existsSync(cacheDir)) return [];
  return fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, ...JSON.parse(fs.readFileSync(path.join(cacheDir, f), "utf8")) }));
}
