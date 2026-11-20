// tests/giftNative.test.cjs
// -----------------------------------------------------------------------------
// THE IPHONE AND ANDROID BUILDS SHOW NO GIFT (Apple 3.1.1: no unlocking with codes or QR codes inside the app; and no
// gift button, gift link, code box or mention of buying on the web). Built the way npm run build:native builds them:
//   1  the store build holds no gift page, no gift path, no gift word and no gift endpoint, in any file
//   2  scripts/check-native-build.mjs --artifact passes it, and refuses a build where the gift pages crept back in
//   3  the website's build keeps every gift page, the QR code, and the way back to the redeem page after signing in
//   4  /api/gift refuses the store apps' origins (tests/gifts.test.cjs 5b), and nothing in the app calls it
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ENV = { ...process.env, VITE_SUPABASE_URL: "https://placeholder.invalid", VITE_SUPABASE_PUBLISHABLE_KEY: "placeholder-key" };
const MARKS = ["/gift/redeem", "/gift/card", "/api/gift", "gift=redeem", "flourish_gift_return_at", "[WORDS: gift-", "gift-redeem-", "redeem-qr.svg", "Redeem your gift"];
function files(dir, out = []) {
  for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) files(p, out); else out.push(p); }
  return out;
}
const textFiles = (dir) => files(dir).filter((f) => /\.(js|mjs|html?|json|css|txt|xml|svg|webmanifest)$/i.test(f));
const hits = (dir) => textFiles(dir).flatMap((f) => { const s = fs.readFileSync(f, "utf8"); return MARKS.filter((m) => s.includes(m)).map((m) => `${path.relative(dir, f)}: ${m}`); });

(async () => {
  const t = create();
  // ── 1. the store build ──────────────────────────────────────────────────────────────────────────
  const nat = tempDir("gift-native");
  execFileSync("npx", ["vite", "build", "--outDir", path.join(nat, "dist"), "--emptyOutDir", "--logLevel", "error"], { cwd: ROOT, env: { ...ENV, VITE_NATIVE_BUILD: "true" }, stdio: ["ignore", "ignore", "inherit"] });
  const before = fs.existsSync(path.join(nat, "dist", "gift"));
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "strip-landing-media.mjs"), "--dir", path.join(nat, "dist")], { stdio: "ignore" });
  t.ok(before && !fs.existsSync(path.join(nat, "dist", "gift")), "1a the gift pages are copied in by the build, and the native strip removes them");
  t.eq(hits(path.join(nat, "dist")), [], "1b no file in the store build names a gift page, path, endpoint or word");
  const bundle = textFiles(path.join(nat, "dist", "assets")).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  // "gift" alone is older than this: a deposit can be categorised as a gift, and the US 529 card cites the gift-tax
  // exclusion. What must never be there is the gift you buy: a code, a card, redeeming, or a year of flourish.
  // (RevenueCat's own SDK has a redeemWebPurchase method; that is the store's, not a gift.)
  t.eq(["gift code", "gift card", "redeem your gift", "redeem a gift", "redeem the code", "year of flourish", "give a year"].filter((w) => bundle.toLowerCase().includes(w)), [],
    "1c the app's JavaScript in the store build never mentions a gift code, a gift card, redeeming or a year of flourish");

  // ── 2. the native build check ───────────────────────────────────────────────────────────────────
  const run = (dist) => spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-native-build.mjs"), "--artifact"], { cwd: dist, env: ENV, encoding: "utf8" });
  const root = tempDir("gift-native-root");
  fs.cpSync(path.join(nat, "dist"), path.join(root, "dist"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "lib"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "src", "lib", "supportContact.js"), path.join(root, "src", "lib", "supportContact.js"));
  const clean = run(root);
  t.eq([clean.status, /no gift pages\s+dist\//.test(clean.stdout)], [0, true], "2a check-native-build --artifact passes the store build, and says it checked for gifts");
  fs.cpSync(path.join(ROOT, "public", "gift"), path.join(root, "dist", "gift"), { recursive: true });
  const dirty = run(root);
  t.eq([dirty.status, /landing-only media \(gift\)|mentions the gift pages/.test(dirty.stderr)], [1, true], "2b …and refuses one where the gift pages crept back in");
  fs.rmSync(path.join(root, "dist", "gift"), { recursive: true, force: true });
  const js = files(path.join(root, "dist", "assets")).find((f) => f.endsWith(".js"));
  fs.appendFileSync(js, '\n;window.__x="/gift/redeem";');
  t.eq(run(root).status, 1, "2c …or where a gift link crept into the app's code");

  // ── 3. the website's build ──────────────────────────────────────────────────────────────────────
  const web = tempDir("gift-web");
  execFileSync("npx", ["vite", "build", "--outDir", path.join(web, "dist"), "--emptyOutDir", "--logLevel", "error"], { cwd: ROOT, env: ENV, stdio: ["ignore", "ignore", "inherit"] });
  const pages = ["index.html", "gift.js", "redeem.html", "redeem.js", "card.html", "card.js", "card.css", "gift.css", "redeem-qr.svg"];
  t.ok(pages.every((f) => fs.readFileSync(path.join(web, "dist", "gift", f)).equals(fs.readFileSync(path.join(ROOT, "public", "gift", f)))), "3a the website serves every gift page and the QR code, byte for byte");
  const webJs = textFiles(path.join(web, "dist", "assets")).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  t.ok(webJs.includes("/gift/redeem") && webJs.includes("flourish_gift_return_at"), "3b the website's app knows the way back to the redeem page after signing in");

  // ── 4. nothing in the app calls the gift endpoint ───────────────────────────────────────────────
  const src = files(path.join(ROOT, "src")).filter((f) => /\.(js|jsx)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  t.ok(!src.includes("/api/gift"), "4a nothing in src/ calls /api/gift: only the website's gift pages do");
  const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  t.ok(/from\s+=\s+"\/api\/gift"\s+to\s+=\s+"\/\.netlify\/functions\/gift"/.test(toml) && /\[functions\."gift-send-sweep"\]\s+schedule = "\*\/5 \* \* \* \*"/.test(toml), "4b the route and the 5-minute email job are declared");
  t.summary("giftNative.test");
})().catch((e) => { console.error(e); process.exitCode = 1; });
