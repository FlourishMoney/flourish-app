// tests/nativeLandingMedia.test.cjs
// -----------------------------------------------------------------------------
// THE LANDING PAGE'S MEDIA STAYS ON THE WEBSITE AND OUT OF THE STORE APPS (2026-10-07).
// The how-to videos (~26 MB) were being copied into the iOS and Android apps, which never show the
// landing page. This builds the real site once and checks both sides:
//   1. the web build (npm run build, what Netlify runs) still has every landing file, byte for byte;
//   2. build:native's strip step removes them and nothing else the app needs;
//   3. check-native-build.mjs --artifact refuses a native dist/ that still holds them;
//   4. the wiring: build:native strips, npm run build does not, Netlify and ship-ios use the right one.
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ENV = { ...process.env, VITE_SUPABASE_URL: "https://placeholder.invalid", VITE_SUPABASE_PUBLISHABLE_KEY: "placeholder-key" };
const list = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
const same = (a, b) => fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));

(async () => {
  const t = create();
  const { LANDING_ONLY } = await import("../scripts/strip-landing-media.mjs");
  t.eq(LANDING_ONLY, ["video", "app-screens", "og-image.png", "og-image-ca.png"], "0 the landing-only media: the videos, the screenshots, the link-preview images");

  // ── 1. the web build keeps every landing file ───────────────────────────────────────────────
  const web = tempDir("landing-media-web");
  execFileSync("npx", ["vite", "build", "--outDir", path.join(web, "dist"), "--emptyOutDir", "--logLevel", "error"], { cwd: ROOT, env: ENV, stdio: "inherit" });
  const pubVideo = path.join(ROOT, "public", "video"), webVideo = path.join(web, "dist", "video");
  const videos = list(pubVideo).filter(f => f.endsWith(".mp4"));
  t.ok(videos.length >= 8, `1a public/video has the how-to videos (${videos.length} mp4)`);
  t.eq(list(webVideo), list(pubVideo), "1b the web build serves every file in public/video");
  t.ok(list(pubVideo).every(f => same(path.join(pubVideo, f), path.join(webVideo, f))), "1c …byte for byte");
  const pubShots = path.join(ROOT, "public", "app-screens");
  t.ok(list(pubShots).length > 0 && list(pubShots).every(f => same(path.join(pubShots, f), path.join(web, "dist", "app-screens", f))),
    "1d …and every landing screenshot, and the hero card");
  t.ok(["og-image.png", "og-image-ca.png"].every(f => same(path.join(ROOT, "public", f), path.join(web, "dist", f))), "1e …and both link-preview images");

  // ── 2. the native strip removes them, and only them ─────────────────────────────────────────
  const nat = tempDir("landing-media-native");
  fs.cpSync(path.join(web, "dist"), path.join(nat, "dist"), { recursive: true });
  const before = list(path.join(nat, "dist"));
  const out = execFileSync(process.execPath, [path.join(ROOT, "scripts", "strip-landing-media.mjs"), "--dir", path.join(nat, "dist")], { encoding: "utf8" });
  const after = list(path.join(nat, "dist"));
  t.ok(LANDING_ONLY.every(n => !after.includes(n)), "2a after the strip, no landing media is left in the native dist/");
  t.eq(before.filter(n => !after.includes(n)).sort(), [...LANDING_ONLY].sort(), "2b …and nothing else was removed");
  t.ok(["index.html", "assets", "sw.js", "flourish-adult-app-icon-180.png", "flourish-symbol.png"].every(n => after.includes(n)), "2c the app's own files are all there");
  t.ok(/landing-only media kept out of the native build: video, app-screens, og-image\.png, og-image-ca\.png/.test(out), "2d it says what it removed");
  const mb = (d) => { let s = 0; (function walk(p) { for (const f of fs.readdirSync(p)) { const q = path.join(p, f); const st = fs.statSync(q); if (st.isDirectory()) walk(q); else s += st.size; } })(d); return s / 1048576; };
  const wMB = mb(path.join(web, "dist")), nMB = mb(path.join(nat, "dist"));
  t.ok(wMB - nMB > 25, `2e the native dist/ is ${nMB.toFixed(1)} MB, ${(wMB - nMB).toFixed(1)} MB lighter than the web build (${wMB.toFixed(1)} MB)`);

  // ── 3. the native check refuses landing media ───────────────────────────────────────────────
  const check = (cwd) => spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-native-build.mjs"), "--artifact"], { cwd, env: ENV, encoding: "utf8" });
  const bad = check(web);
  t.ok(bad.status !== 0 && /still holds landing-only media \(video, app-screens, og-image\.png, og-image-ca\.png\)/.test(bad.stderr + bad.stdout),
    "3a check-native-build --artifact refuses a dist/ that still holds the landing media");
  const good = check(nat);
  t.ok(good.status === 0 && /native build check passed \(artifact\)/.test(good.stdout), "3b …and passes the stripped one");

  // ── 4. the wiring ───────────────────────────────────────────────────────────────────────────
  const pkg = require(path.join(ROOT, "package.json")).scripts;
  t.eq(pkg["build:native"], "node scripts/check-native-build.mjs --env && vite build && node scripts/strip-landing-media.mjs && node scripts/check-native-build.mjs --artifact",
    "4a build:native strips the landing media after vite build and before its artifact check");
  t.eq(pkg.build, "vite build", "4b the web build does not strip anything");
  t.ok(/command\s*=\s*"npm run build"/.test(fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8")), "4c Netlify builds the site with npm run build");
  t.ok(/npm run build:native/.test(fs.readFileSync(path.join(ROOT, "scripts", "ship-ios.sh"), "utf8")), "4d ship-ios.sh builds with build:native");

  t.summary("nativeLandingMedia.test");
})();
