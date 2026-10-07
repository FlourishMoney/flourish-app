// scripts/strip-landing-media.mjs — keep the landing page's media out of the iOS and Android builds.
// -----------------------------------------------------------------------------
// The store apps never show the landing page (AuthScreen opens on sign-in when isNativeApp(), and the
// way back to the landing is hidden there), but everything in public/ is copied into dist/, and cap sync
// copies dist/ into both apps. The landing's how-to videos alone are about 26 MB, which took the Android
// bundle from 7.3 MB to 33.7 MB (2026-10-07). build:native runs this after vite build and before cap sync;
// the web build (npm run build, which Netlify runs) never does, so the site keeps every file.
// check-native-build.mjs --artifact then refuses a native dist/ that still holds any of these.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Everything here is used ONLY by the landing page (or by link previews of it), never by the app.
export const LANDING_ONLY = [
  "video",            // the how-to series and its posters
  "app-screens",      // the landing's screenshots and the hero card crop
  "og-image.png",     // link previews of the site
  "og-image-ca.png",
];

export function stripLandingMedia(distDir) {
  const removed = [];
  for (const name of LANDING_ONLY) {
    const p = path.join(distDir, name);
    if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); removed.push(name); }
  }
  return removed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--dir");
  const dist = path.resolve(i > 0 ? process.argv[i + 1] : "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) { console.error(`\n  ✗ ${dist} is not a built site (no index.html)\n`); process.exit(1); }
  const removed = stripLandingMedia(dist);
  console.log(`  ✓ landing-only media kept out of the native build: ${removed.length ? removed.join(", ") : "none present"}`);
}
