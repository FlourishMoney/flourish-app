// tests/webAnalytics.test.cjs
// -----------------------------------------------------------------------------
// COOKIELESS WEBSITE ANALYTICS, ON THE PUBLIC PAGES ONLY (src/lib/webAnalytics.js, 2026-10-26).
//   1  which pages are measured: the landing, privacy, terms, support and the demo, signed out, on the web; never a
//      signed-in screen, onboarding, checkout, /confirmed, /delete-account, a reset link, or a store app
//   2  the URLs Plausible sees: origin and path only (no query string, no hash), referrer cut the same way
//   3  after sign-in nothing is sent (requests dropped); events carry no property but store
//   4  each event fires once per call, only the four named, and the script loads once, only on a public page
//   5  a native build carries no Plausible: build:native compiles it out, and the artifact check refuses it
// (The built app in a browser: tests/webAnalytics.browser.)
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");

function loadLib(native = false) {
  const esbuild = require(path.join(REPO, "node_modules", "esbuild"));
  const { outputFiles } = esbuild.buildSync({
    entryPoints: [path.join(REPO, "src", "lib", "webAnalytics.js")], bundle: true, platform: "node", format: "cjs", write: false, logLevel: "error",
    define: { "import.meta.env.VITE_NATIVE_BUILD": JSON.stringify(native ? "true" : "") }, minify: native,
  });
  const m = { exports: {} };
  new Function("module", "exports", "require", outputFiles[0].text)(m, m.exports, require);
  return { mod: m.exports, text: outputFiles[0].text };
}

// A browser stand-in: records the scripts the page adds and what window.plausible is called with.
function fakeWindow(origin = "https://flourishmoney.app", opts = {}) {
  const added = [];
  const win = {
    location: { origin, protocol: opts.protocol || "https:" },
    Capacitor: opts.native ? { getPlatform: () => "ios" } : undefined,
    document: { createElement: (tag) => ({ tag }), head: { appendChild: (el) => added.push(el) } },
  };
  return { win, added };
}

(async () => {
  const t = create();
  const { mod: A } = loadLib();

  // ── 1. Which pages ──────────────────────────────────────────────────────────────────────────────
  {
    const P = (o) => A.analyticsPage({ authLoading: false, ...o });
    t.eq([P({}), P({ screen: "privacy" }), P({ screen: "terms" }), P({ screen: "support" }), P({ demo: true })], ["/", "/privacy", "/terms", "/support", "/demo"],
      "1a signed out on the web: the landing, privacy, terms, support and the demo");
    t.eq([P({ signedIn: true }), P({ signedIn: true, screen: "privacy" }), P({ screen: "confirmed" }), P({ screen: "delete-account" }), P({ recovery: true }), P({ native: true }), A.analyticsPage({ authLoading: true })],
      [null, null, null, null, null, null, null], "1b never signed in (any screen, onboarding and checkout included), /confirmed, /delete-account, a reset link, a store app, or before sign-in is known");
  }

  // ── 2. Clean URLs ───────────────────────────────────────────────────────────────────────────────
  {
    t.eq(A.cleanUrl("https://flourishmoney.app/?email=a%40b.c&session_id=cs_live_1#access_token=x"), "https://flourishmoney.app/", "2a query string and hash are dropped");
    t.eq([A.cleanUrl("https://user:pw@example.com/p?q=1"), A.cleanUrl("javascript:alert(1)"), A.cleanUrl("not a url")], ["https://example.com/p", null, null], "2b credentials go too; non-http is nothing");
    A._resetAnalytics();
    const { win } = fakeWindow();
    A.setAnalyticsPage("/", win);
    const out = A.transformRequest({ n: "pageview", u: "https://flourishmoney.app/?billing=success&session_id=cs_1#token=x", r: "https://mail.example.com/inbox?u=someone%40example.com#m1" }, win);
    t.eq([out.u, out.r], ["https://flourishmoney.app/", "https://mail.example.com/inbox"], "2c every request: the page is this site's origin plus the public page; the referrer is origin and path");
    A.setAnalyticsPage("/demo", win);
    t.eq(A.transformRequest({ n: "pageview", u: "https://flourishmoney.app/" }, win).u, "https://flourishmoney.app/demo", "2d the demo is measured as /demo");
  }

  // ── 3. Signed in: nothing; only the store property ──────────────────────────────────────────────
  {
    A._resetAnalytics();
    const { win } = fakeWindow();
    A.setAnalyticsPage("/", win);
    t.eq(A.transformRequest({ n: "Store badge", u: "x", p: { store: "App Store", email: "a@b.c", plan: "annual" } }, win).p, { store: "App Store" }, "3a an event keeps only store, with one of its two values");
    A.setAnalyticsPage(null, win);   // signed in
    t.eq(A.transformRequest({ n: "pageview", u: "https://flourishmoney.app/" }, win), null, "3b once no public page is showing, every request is dropped");
    t.eq(A.track("Try free", null, win), false, "3c …and no event is sent");
  }

  // ── 4. Once per action; the script once ─────────────────────────────────────────────────────────
  {
    A._resetAnalytics();
    const { win, added } = fakeWindow();
    t.eq(A.track("Try free", null, win), false, "4a nothing before a public page shows");
    A.setAnalyticsPage("/", win);
    A.setAnalyticsPage("/", win);
    A.setAnalyticsPage("/privacy", win);
    t.eq(added.map((s) => [s.tag, s.src, s.async]), [["script", "https://plausible.io/js/pa-greGtasruQXP4d1IGIYrH.js", true]], "4b the site script is added once, async, when a public page shows");
    t.eq(win.plausible.o && win.plausible.o.autoCapturePageviews, false, "4c it sends no pageviews of its own (we send one per public page)");
    const before = (win.plausible.q || []).length;
    t.eq([A.track("Try free", null, win), A.track("Founding list join", null, win), A.track("Store badge", { store: "Google Play" }, win), A.track("Demo open", null, win)], [true, true, true, true], "4d the four events");
    const q = (win.plausible.q || []).slice(before).map((a) => [a[0], JSON.stringify(a[1])]);
    t.eq(q, [["Try free", "{}"], ["Founding list join", "{}"], ["Store badge", JSON.stringify({ props: { store: "Google Play" } })], ["Demo open", "{}"]], "4e each sent exactly once, store the only property");
    t.eq([A.track("Signed up", null, win), A.track("Store badge", { store: "Elsewhere" }, win)], [false, false], "4f no other event, and no other store");
    const pageviews = (win.plausible.q || []).filter((a) => a[0] === "pageview").length;
    t.eq(pageviews, 2, "4g one pageview per public page shown (the landing, then privacy; the repeat sent none)");
    A._resetAnalytics();
    const n = fakeWindow("capacitor://localhost", { native: true, protocol: "capacitor:" });
    A.setAnalyticsPage("/", n.win);
    t.eq([n.added.length, typeof n.win.plausible], [0, "undefined"], "4h inside Capacitor nothing loads, whatever page");
  }

  // ── 5. A native build carries no Plausible ──────────────────────────────────────────────────────
  {
    const { mod: N, text } = loadLib(true);
    t.ok(!/plausible\.io/.test(text) && N.PLAUSIBLE_SRC === "", "5a compiled with VITE_NATIVE_BUILD=true (as build:native does), the module has no Plausible address at all");
    const pkg = require(path.join(REPO, "package.json")).scripts["build:native"];
    t.ok(/VITE_NATIVE_BUILD=true vite build/.test(pkg), "5b build:native compiles it out");
    const chk = fs.readFileSync(path.join(REPO, "scripts", "check-native-build.mjs"), "utf8");
    t.ok(/mentions plausible\.io/.test(chk), "5c and its artifact check refuses a native dist/ that mentions plausible.io (run for real in tests/nativeLandingMedia 3c)");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/analyticsPage\(\{ native: isNativeApp\(\), signedIn: !!user, authLoading, screen, demo: !!appData\?\.demo, recovery: recoveryMode \}\)/.test(app), "5d App: the page passed is the root screen, sign-in state and native flag");
    const toml = fs.readFileSync(path.join(REPO, "netlify.toml"), "utf8");
    const csp = (toml.match(/Content-Security-Policy = "([^"]+)"/) || [])[1] || "";
    const dir = (n) => (csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(n + " ")) || "");
    t.ok(/https:\/\/plausible\.io/.test(dir("script-src")) && /https:\/\/plausible\.io/.test(dir("connect-src")) && (csp.match(/plausible/g) || []).length === 2,
      "5e the CSP allows plausible.io for the script and its requests, nothing more");
  }

  t.summary("webAnalytics");
})();
