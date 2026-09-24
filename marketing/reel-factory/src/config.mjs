// Paths, canvas and brand. Everything the other stages agree on lives here.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const APP_ROOT = path.resolve(ROOT, "..", "..");
export const dir = {
  scripts:   path.join(ROOT, "scripts"),
  out:       path.join(ROOT, "out"),
  recordings:path.join(ROOT, "recordings"),
  publicDir: path.join(ROOT, "remotion", "public"),
  remotion:  path.join(ROOT, "remotion"),
};

// STYLE.md §1. 60 fps, 20-28 seconds, high bitrate.
export const CANVAS = { width: 1080, height: 1920, fps: 60, minSeconds: 20, maxSeconds: 28, crf: 16 };
// The phone Playwright records at. 390x844 is an iPhone 14/15 logical viewport; scale 3 so the
// app's type is crisp when the frame is blown up to 1080 wide (STYLE.md §4).
export const DEVICE = { width: 390, height: 844, scale: 3 };
// Instagram draws its own interface over these bands. Nothing readable goes in them (STYLE.md §1).
export const SAFE = { top: 250, bottom: 400 };
// STYLE.md §6: a cut every 1.5-2.5s, and the hook is on screen before the voice starts.
export const PACE = { minBeat: 1.5, maxBeat: 2.5, hookLead: 1.0, endCard: 2.5, transition: 0.4 };

/**
 * Brand colours, READ FROM THE APP'S OWN THEME rather than re-typed here — src/App.jsx holds the
 * dark palette as a plain object literal. If the app renames a colour this throws instead of
 * quietly rendering last year's brand.
 */
export function brandColours() {
  const src = fs.readFileSync(path.join(APP_ROOT, "src", "App.jsx"), "utf8");
  const want = ["bg", "card", "cream", "green", "greenBright", "gold"];
  const found = {};
  for (const name of want) {
    // First hex match wins: the DARK theme is declared first in App.jsx.
    const m = new RegExp(`\\b${name}\\s*:\\s*"(#[0-9A-Fa-f]{3,8})"`).exec(src);
    if (m) found[name] = m[1];
  }
  const missing = want.filter((k) => !found[k]);
  if (missing.length) {
    throw new Error(
      `Could not read these colours from the app's theme in src/App.jsx: ${missing.join(", ")}. ` +
      `The palette moved or was renamed — update brandColours() rather than hard-coding a colour here.`
    );
  }
  return found;
}

export const ensure = (p) => { fs.mkdirSync(p, { recursive: true }); return p; };
