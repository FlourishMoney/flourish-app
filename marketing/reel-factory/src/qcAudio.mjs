// THE GATE FOR A DUB. Every check fails the run; none of them warns.
//
// The picture is approved, so the first duty is proving it was not touched: the video stream's
// checksum has to come out of the mux byte-identical to the one that went in. The rest is the
// mix — loudness, true peak, and whether every line actually fits the scene it belongs to.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const ff = (args) => run("ffmpeg", ["-y", "-loglevel", "error", ...args], { maxBuffer: 1 << 28 });

const probe = async (file, entries, stream) => {
  const a = ["-v", "error", ...(stream ? ["-select_streams", stream] : []), "-show_entries", entries, "-of", "default=nw=1", file];
  return Object.fromEntries((await run("ffprobe", a)).stdout.trim().split("\n").map((l) => l.split("=")));
};

/** The video stream's own checksum, independent of the container it is wrapped in. */
async function videoStreamMd5(file) {
  const { stdout } = await run("ffmpeg", ["-v", "error", "-i", file, "-map", "0:v:0", "-c", "copy", "-f", "md5", "-"],
    { maxBuffer: 1 << 26 });
  return stdout.trim();
}

/** Integrated loudness and true peak, measured on the finished file. */
async function loudness(file) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true:framelog=verbose", "-f", "null", "-"],
    { maxBuffer: 1 << 28 }).catch((e) => ({ stderr: e.stderr || "" }));
  const tail = stderr.slice(stderr.lastIndexOf("Integrated loudness"));
  const I = /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(tail);
  const TP = /Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/.exec(stderr.slice(stderr.lastIndexOf("True peak")));
  return { I: I ? parseFloat(I[1]) : null, TP: TP ? parseFloat(TP[1]) : null };
}

async function contactSheet(mp4, outJpg, seconds) {
  const tmp = fs.mkdtempSync("/tmp/dub-contact-");
  for (let i = 0; i < 9; i++) {
    await ff(["-ss", ((seconds * (i + 0.5)) / 9).toFixed(3), "-i", mp4, "-frames:v", "1", "-vf", "scale=360:-1", path.join(tmp, `f${i}.png`)]);
  }
  await ff(["-i", path.join(tmp, "f%d.png"), "-filter_complex", "tile=3x3:margin=12:padding=12:color=#050810", "-frames:v", "1", "-q:v", "3", outJpg]);
  fs.rmSync(tmp, { recursive: true, force: true });
}

const waveform = (mp4, outPng) =>
  ff(["-i", mp4, "-filter_complex", "[0:a]showwavespic=s=1600x420:colors=#00E89A|#EDE9E2:split_channels=1", "-frames:v", "1", outPng]);

export async function runAudioGate({ inFile, outFile, spec, lines, reviewDir, music, musicNote, credits, ticks, take = null, suffix = "v6", briefed = null, maxSpeed = 1.0, duckedStem = null, musicStem = null, requireMusic = false, musicMeta = null }) {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok, detail }); return ok; };

  // ── the picture is untouched ────────────────────────────────────────────────────────────────
  const [vi, vo] = [await probe(inFile, "stream=nb_frames,r_frame_rate,width,height", "v:0"),
                    await probe(outFile, "stream=nb_frames,r_frame_rate,width,height", "v:0")];
  const [di, dof] = [await probe(inFile, "format=duration"), await probe(outFile, "format=duration")];
  const [mi, mo] = [await videoStreamMd5(inFile), await videoStreamMd5(outFile)];
  check("video stream byte-identical", mi === mo && mi.length > 0, mi === mo ? mi.replace("MD5=", "").slice(0, 16) + "…" : "the picture was re-encoded");
  check("same frame count", vi.nb_frames === vo.nb_frames, `${vi.nb_frames} → ${vo.nb_frames}`);
  check("duration within 0.05s", Math.abs(parseFloat(di.duration) - parseFloat(dof.duration)) <= 0.05,
    `${parseFloat(di.duration).toFixed(3)}s → ${parseFloat(dof.duration).toFixed(3)}s`);

  // ── the mix ─────────────────────────────────────────────────────────────────────────────────
  const { I, TP } = await loudness(outFile);
  check(`integrated ${spec.master.lufs} LUFS ±0.5`, I !== null && Math.abs(I - spec.master.lufs) <= 0.5,
    I === null ? "could not measure" : `${I.toFixed(1)} LUFS`);
  check(`true peak ≤ ${spec.master.truePeak} dBTP`, TP !== null && TP <= spec.master.truePeak + 0.05,
    TP === null ? "could not measure" : `${TP.toFixed(1)} dBTP`);
  const astream = await probe(outFile, "stream=codec_name,sample_rate,channels,bit_rate", "a:0");
  check("AAC 48k stereo ~192k", astream.codec_name === "aac" && astream.sample_rate === "48000" && astream.channels === "2",
    `${astream.codec_name} ${astream.sample_rate}Hz ${astream.channels}ch ${Math.round((+astream.bit_rate || 0) / 1000)}k`);

  // ── every line inside its scene ─────────────────────────────────────────────────────────────
  const late = lines.filter((l) => l.end > l.sceneEnd + 0.001);
  const early = lines.filter((l) => l.start < l.at - 0.001);
  check("every line fits its scene", late.length === 0 && early.length === 0,
    late.length ? late.map((l) => `"${l.line.slice(0, 22)}…" ends ${l.end.toFixed(2)} > ${l.sceneEnd.toFixed(2)}`).join("; ")
      : `${lines.length} lines, tightest margin ${Math.min(...lines.map((l) => l.sceneEnd - l.end)).toFixed(2)}s`);

  // ── the narrator never says "I" ─────────────────────────────────────────────────────────────
  const firstPerson = lines.filter((l) => /\bI\b/.test(l.line));
  check('no line says "I"', firstPerson.length === 0,
    firstPerson.length ? firstPerson.map((l) => `"${l.line}"`).join("; ") : `${lines.length} lines checked`);

  // ── one take, not seven ─────────────────────────────────────────────────────────────────────
  // Separately generated lines each reset the performance, which is what made v6 sound like seven
  // announcements. Every line must trace back to the same request.
  if (take) {
    const ids = new Set(lines.map((l) => l.requestId || null));
    check("one take for all lines", ids.size === 1 && take.requestId && !ids.has(null),
      take.requestId ? `request-id ${take.requestId} for all ${lines.length} lines` : "the API returned no request id");
    const want = briefed || {};
    const t = take.settings || {};
    const sameExceptSpeed = ["stability", "similarity_boost", "style", "use_speaker_boost"]
      .every((k) => want[k] === undefined || t[k] === want[k]);
    const speedOk = typeof t.speed === "number" && t.speed >= 1.0 && t.speed <= maxSpeed + 1e-9;
    check("voice settings as briefed", sameExceptSpeed && speedOk && Number.isInteger(take.seed),
      `stability ${t.stability}, similarity ${t.similarity_boost}, style ${t.style}, boost ${t.use_speaker_boost}, `
      + `speed ${t.speed}${t.speed > 1 ? ` (allowed up to ${maxSpeed})` : ""}, seed ${take.seed}`);
  }

  // ── the bed is there, and it gets out of the way of every line ──────────────────────────────
  if (requireMusic) {
    check("music present", !!music && !!duckedStem && fs.existsSync(duckedStem),
      music ? `${musicNote}` : "the final cut does not ship without music");

    // Measured on the ducked stem: each line's own level against the quiet either side of it.
    const level = async (file, from, to) => {
      const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-ss", from.toFixed(3), "-t", Math.max(0.12, to - from).toFixed(3),
        "-i", file, "-af", "volumedetect", "-f", "null", "-"], { maxBuffer: 1 << 24 }).catch((e) => ({ stderr: e.stderr || "" }));
      const m = /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(stderr);
      return m ? parseFloat(m[1]) : null;
    };
    const dips = [];
    for (const l of lines) {
      const from = l.start + 0.2, to = Math.max(from + 0.15, l.end - 0.05);
      const before = await level(musicStem, from, to);
      const after = await level(duckedStem, from, to);
      dips.push({ line: l.line, dip: before !== null && after !== null ? before - after : null });
    }
    const notDucked = dips.filter((d) => d.dip === null || d.dip < 1.0);
    check("music ducked under every line", notDucked.length === 0,
      notDucked.length ? notDucked.map((d) => `"${d.line.slice(0, 20)}…" only ${d.dip === null ? "?" : d.dip.toFixed(1)} dB`).join("; ")
        : `dips ${dips.map((d) => d.dip.toFixed(1)).join("/")} dB across ${dips.length} lines`);
  }

  // ── nothing secret can reach the repo ───────────────────────────────────────────────────────
  const envPath = path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), ".env");
  const key = fs.existsSync(envPath) ? ((/^ELEVENLABS_API_KEY=(.*)$/m.exec(fs.readFileSync(envPath, "utf8")) || [])[1] || "").trim() : "";
  const staged = (await run("git", ["-C", path.dirname(envPath), "diff", "--cached"], { maxBuffer: 1 << 26 }).catch(() => ({ stdout: "" }))).stdout;
  const stagedNames = (await run("git", ["-C", path.dirname(envPath), "diff", "--cached", "--name-only"], { maxBuffer: 1 << 24 }).catch(() => ({ stdout: "" }))).stdout;
  const leaks = [];
  if (key && staged.includes(key)) leaks.push("the key value appears in the staged diff");
  if (/(^|\/)\.env$/m.test(stagedNames)) leaks.push(".env is staged");
  if (/\.(mp4|wav|mp3|m4a)$/m.test(stagedNames)) leaks.push("media is staged");
  check("no secrets or media staged", leaks.length === 0, leaks.length ? leaks.join("; ") : "clean");

  // ── review artefacts ────────────────────────────────────────────────────────────────────────
  const sheet = path.join(reviewDir, `${spec.id}-${suffix}-contact.jpg`);
  const wave = path.join(reviewDir, `${spec.id}-${suffix}-waveform.png`);
  await contactSheet(outFile, sheet, parseFloat(dof.duration));
  await waveform(outFile, wave);
  check("contact sheet + waveform", fs.existsSync(sheet) && fs.existsSync(wave), `${path.basename(sheet)}, ${path.basename(wave)}`);

  console.log("\n  Timing");
  for (const l of lines) {
    console.log(`   ${l.start.toFixed(2)}-${l.end.toFixed(2)}s  (scene ${l.at.toFixed(1)}→${l.sceneEnd.toFixed(1)}, ${(l.sceneEnd - l.end).toFixed(2)}s spare)`
      + `${l.speed !== 1 ? ` · speed ${l.speed}` : ""}  "${l.line}"`);
  }
  console.log(`\n  Sound: voice ElevenLabs ${spec.voice.name} · ${credits} credits · music ${musicNote} · ${ticks} synthesised ticks`);
  console.log("\n  Dub gate");
  for (const r of results) console.log(`   ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(30)} ${r.detail}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) throw new Error(`Dub gate failed: ${failed.map((f) => f.name).join(", ")}.`);
  return { sheet, wave, I, TP };
}
