// tests/landingStoreBadges.test.cjs
// -----------------------------------------------------------------------------
// THE WEBSITE'S STORE BADGES (2026-10-21: Flourish is on the App Store and Google Play; "Coming soon" is gone).
//
//   1  the two links, the alt text and the order, exactly as decided (Apple first, as Apple asks);
//   2  the artwork is the stores' own, unaltered (pinned by SHA-256) and plain (no script, handler, link or image);
//   3  the size and clear space both guidelines ask for: 40px tall (Apple's 40px minimum, over Google's 28px), and a
//      quarter of that height clear on every side;
//   4  where they show: right under the hero form, and nowhere else on the page (Apple: one App Store badge per
//      layout); each opens in a new tab;
//   5  the website no longer says the apps are coming;
//   6  never in a store app: the badges render nothing there, and a store app never shows the landing.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const OFFICIAL = {
  "download-on-the-app-store.svg": "a26fc5b38380272c92e9019a2eb8b45542a66814b3e2b203772db8904b9fb99f",
  "GetItOnGooglePlay_Badge_Web_color_English.svg": "4ffa4c7edd2f10b297ca4de2131eddaa00d03b2278d1e178fe512920d824ca34",
};

(async () => {
  const t = create();
  const L = await import("../src/lib/storeLinks.js");
  const APP = read("src", "App.jsx");

  // ── 1. The links and the words ────────────────────────────────────────────────────────────────
  t.eq([L.APP_STORE_URL, L.PLAY_STORE_URL], ["https://apps.apple.com/ca/app/flourish-money-handled/id6792967778", "https://play.google.com/store/apps/details?id=com.flourishmoney.app"], "1a the two store links");
  t.eq(L.STORE_BADGES.map((b) => [b.store, b.href, b.alt]), [["app_store", L.APP_STORE_URL, "Download on the App Store"], ["play_store", L.PLAY_STORE_URL, "Get it on Google Play"]],
    "1b the alt text exactly, and the App Store badge first");

  // ── 2. The artwork ────────────────────────────────────────────────────────────────────────────
  for (const b of L.STORE_BADGES) {
    const file = path.join(REPO, "public", b.src.replace(/^\//, ""));
    const svg = fs.readFileSync(file);
    const name = path.basename(file);
    t.eq(crypto.createHash("sha256").update(svg).digest("hex"), OFFICIAL[name], `2a ${name} is the store's own file, byte for byte`);
    const s = svg.toString("utf8");
    t.ok(!/<script|\son[a-z]+\s*=|<foreignObject|javascript:|<image|(xlink:)?href\s*=\s*["'](?!#)|url\(\s*["']?https?:/i.test(s), `2b ${name} is plain artwork: no script, handler, external link or image`);
  }

  // ── 3. Size and clear space ───────────────────────────────────────────────────────────────────
  const px = (re) => Number((APP.match(re) || [])[1]);
  const height = px(/\.fll-store img\{ display:block; height:(\d+)px; width:auto; \}/), pad = px(/\.fll-store\{ display:block; padding:(\d+)px; line-height:0; \}/);
  t.ok(height >= 40 && height >= 28 && L.STORE_BADGES.every((b) => b.height === height), `3a both badges are ${height}px tall: at least Apple's 40px and Google's 28px, and the same size`);
  t.ok(pad >= height / 4, `3b ${pad}px clear on every side: at least a quarter of the badge's height (${height / 4}px)`);

  // ── 4. Where they show ────────────────────────────────────────────────────────────────────────
  const comp = APP.slice(APP.indexOf("function StoreBadges("), APP.indexOf("function AuthScreen("));
  t.ok(/<a key=\{b\.store\} className="fll-store" href=\{b\.href\} target="_blank" rel="noopener noreferrer"\s*onClick=\{\(\) => track\(EVENT\.storeBadge, \{ store: b\.store === "app_store" \? "App Store" : "Google Play" \}\)\}>\s*<img src=\{b\.src\} alt=\{b\.alt\} width=\{b\.width\} height=\{b\.height\} \/>/.test(comp),
    "4a each badge is a link to its store that opens in a new tab");
  const auth = APP.slice(APP.indexOf("function AuthScreen("), APP.indexOf("\n}\n", APP.indexOf("function AuthScreen(")));
  t.eq((auth.match(/<StoreBadges\/>/g) || []).length, 1, "4b one place on the landing: one App Store badge per layout, as Apple asks");
  // The trial-first landing (approved Oct 22): the main button, its line "Every feature free for 14 days. Also on iPhone
  // and Android.", then the badges, then the read-only line, all before the price box.
  t.ok(/<TrialButton onClick=\{goSignup\}\/>\}\s*\{trialFirst && <p className="fll-trial-line">Every feature free for 14 days\. Also on iPhone and Android\.<\/p>\}\s*\{waitlistArea === "waitlist" && <WaitlistForm source="hero"\/>\}[\s\S]{0,900}?Create your account<\/button>[\s\S]{0,400}?<\/div>\s*\)\}\s*<StoreBadges\/>\s*<div className="fll-trust-row">/.test(auth)
    && auth.indexOf("<StoreBadges/>") > auth.indexOf('<div className="fll-hero-form">') && auth.indexOf("<StoreBadges/>") < auth.indexOf("<FoundingOffer"),
    "4c the one placement: in the hero, right after the main button and its line, before the price box");
  const foot = auth.slice(auth.indexOf('<div className="fll-foot">'));
  t.ok(foot.length > 200 && !/StoreBadges|fll-stores/.test(foot) && !/\.fll-foot \.fll-stores/.test(APP), "4d none in the footer (the footer pair was removed for Apple's one-badge rule)");
  t.ok(/<button className="fll-login" onClick=\{goLogin\}>Log in<\/button>/.test(auth), "4e Log in is unchanged, a quiet text button in the nav");

  // ── 5. Nothing says the apps are coming ───────────────────────────────────────────────────────
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === "node_modules" ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  const files = [...walk(path.join(REPO, "src")), ...walk(path.join(REPO, "netlify", "functions")), path.join(REPO, "index.html")].filter((f) => /\.(jsx?|cjs|mjs|html|json)$/.test(f));
  const hits = files.filter((f) => /coming soon to (iphone|android|the app store|google play)|coming to (iphone|android)|soon (on|to) the (app store|stores)/i.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(REPO, f));
  t.eq(hits, [], `5a no page, email or meta tag says the apps are coming (${files.length} files)`);
  t.ok(!/className="fll-badge"/.test(APP) && !/\.fll-badge\{/.test(APP), "5b the old pill and its style are gone");

  // ── 6. Never in a store app ───────────────────────────────────────────────────────────────────
  t.ok(/function StoreBadges\(\)\{\n  if \(isNativeApp\(\)\) return null;/.test(comp), "6a StoreBadges renders nothing in a store app");
  t.ok(/const \[showAuth, setShowAuth\] = useState\(isNativeApp\(\) \|\| !!foundingNote\);/.test(auth), "6b …and a store app never shows the landing: it opens on the sign-in card");
  let A = null;
  try { A = loadApp(["StoreBadges"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  if (A) {
    const web = A.render(A.h(A.StoreBadges, {}));
    t.ok(web.includes(L.APP_STORE_URL) && web.includes(L.PLAY_STORE_URL) && web.includes('alt="Download on the App Store"') && web.includes('alt="Get it on Google Play"') && (web.match(/target="_blank"/g) || []).length === 2,
      "6c on the website: both badges, both links, both alt texts, both in a new tab");
    for (const platform of ["ios", "android"]) {
      globalThis.window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform };
      let html = "x";
      try { html = A.render(A.h(A.StoreBadges, {})); } finally { delete globalThis.window.Capacitor; }
      t.eq([html, textOf(html)], ["", ""], `6d in the ${platform} app: no badge at all`);
    }
  }
  t.summary("landingStoreBadges.test");
})();
