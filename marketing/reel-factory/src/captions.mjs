// The caption file. THE COPY IS COPIED, never written here: every line comes from the script's
// own `captions` block, so the marketing wording is decided in one place by whoever owns it.
import fs from "node:fs";
import path from "node:path";

const PLATFORMS = [["instagram", "Instagram"], ["tiktok", "TikTok"], ["facebook", "Facebook"]];

export function writeCaptions(script, outFile, meta) {
  const missing = PLATFORMS.filter(([k]) => !String(script.captions?.[k] || "").trim()).map(([, n]) => n);
  if (missing.length) throw new Error(`The script has no caption for: ${missing.join(", ")}. Add it to ${script.id}.json — captions are not written here.`);
  const lines = [
    `# ${script.id} — captions`,
    "",
    `Hook: ${script.hook}`,
    `Runtime: ${meta.durationSeconds.toFixed(1)}s · ${meta.width}x${meta.height} · ${meta.fps} fps`,
    `Voice: ${meta.voiceSource}${meta.timingsMeasured ? " (word timings measured)" : " (word timings estimated from clip length)"}`,
    "",
    "Every caption below is copied verbatim from the script file. Edit it there, not here.",
    "",
  ];
  for (const [key, name] of PLATFORMS) {
    lines.push(`## ${name}`, "", script.captions[key].trim(), "");
  }
  lines.push("## On-screen text", "", ...script.captionLines.map((l) => `- ${l}`), "",
             "## End card", "", ...script.endCard.map((l) => `- ${l}`), "");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, lines.join("\n"));
  return outFile;
}
