// tests/a11y.browser.test.cjs
// -----------------------------------------------------------------------------
// AN AUTOMATED ACCESSIBILITY CHECK (tester suggestions, item 8).
//
// axe-core (a dev dependency) runs in Chromium over the real demo build, at 430px, in the light and the
// dark theme, on Today, Watch,
// Do, Learn, Meet, Settings, Help & Support (the Support page and its FAQ), the feedback sheet and
// the tour. Every WCAG 2.x A and AA rule axe automates must pass, with one exception, named here so
// it cannot widen quietly:
//
//   meta-viewport  index.html sets maximum-scale=1, user-scalable=no on purpose: inside the
//                  Capacitor WebView a pinch-zoomed app cannot zoom back out. Text still scales
//                  with the phone's own text size (lib/textScale.js, applied at startup and checked
//                  below), and iOS Safari ignores the lock on the open web.
//
// What axe cannot see is covered elsewhere: 44px tap targets and spacing on every one of these
// screens by layout.browser.test.cjs, and text at 1.3x by the same sweep.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const WIDTH = 430;
const EXCLUDED_RULES = ["meta-viewport"];

function buildApp() {
  if (process.env.LAYOUT_DIST) return process.env.LAYOUT_DIST;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "flourish-a11y-"));
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://placeholder.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "placeholder" } });
  return out;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };
function serve(dir) {
  const server = http.createServer((req, res) => {
    let f = path.join(dir, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

const TAB = (p, name) => p.getByRole("button").filter({ hasText: new RegExp("^" + name + "(\\s*\\d+)?$") }).last().click();
const ARIA = (p, name) => p.getByRole("button", { name, exact: true }).first().click();
const TXT = (p, s, exact = false) => p.getByText(s, { exact }).first().click();

const VIEWS = [
  { name: "Today",    go: (p) => TAB(p, "Today") },
  { name: "Watch",    go: (p) => TAB(p, "Watch") },
  { name: "Do",       go: (p) => TAB(p, "Do") },
  { name: "Learn",    go: (p) => TAB(p, "Learn") },
  { name: "Meet",     go: (p) => TAB(p, "Meet") },
  { name: "Settings", reload: true, go: (p) => ARIA(p, "Settings") },
  { name: "Settings + What's new", reload: true, go: async (p) => { await ARIA(p, "Settings"); await TXT(p, "What's new", true); } },
  { name: "Help & Support (FAQ)", reload: true, go: async (p) => { await ARIA(p, "Settings"); await TXT(p, "Open Support", true); await TXT(p, "What is safe to spend?", true); } },
  { name: "Send feedback", reload: true, go: async (p) => { await ARIA(p, "Settings"); await TXT(p, "Send feedback", true); } },
  { name: "Tour step 1", tour: true, go: async () => {} },
  { name: "Tour last step", tour: true, go: async (p) => { for (let i = 0; i < 4; i++) { await TXT(p, "Next →"); await p.waitForTimeout(400); } } },
];

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("A11Y (browser)"); return; }
  const axePath = require.resolve("axe-core/axe.min.js");
  const dist = buildApp();
  const { server, port } = await serve(dist);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await playwright.chromium.launch();

  const open = async (skipTour, colorScheme) => {
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme });
    await ctx.addInitScript((skip) => { try { localStorage.setItem("flourish_first_visit_done", "1"); if (skip) localStorage.setItem("flourish_tour_done", "1"); } catch (e) {} }, skipTour);
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.getByText("preview the app with", { exact: false }).first().click({ timeout: 30000 });
    await page.getByText("I Understand & Accept").first().click({ timeout: 30000 });
    await page.getByText("Demo mode", { exact: false }).first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(600);
    return { ctx, page };
  };

  // Both themes: the app follows the phone's light or dark setting.
  const results = [];
  let tsa = "";
  for (const scheme of ["light", "dark"]) {
  const main = await open(true, scheme);
  let tour = null;
  for (const v of VIEWS) {
    if (v.tour && !tour) tour = await open(false, scheme);
    const page = v.tour ? tour.page : main.page;
    try {
      if (v.reload) { await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText("Demo mode", { exact: false }).first().waitFor({ timeout: 40000 }); await page.waitForTimeout(400); }
      await v.go(page);
      await page.waitForTimeout(700);
      await page.addScriptTag({ path: axePath });
      const r = await page.evaluate(async (excluded) => {
        const rules = {}; for (const id of excluded) rules[id] = { enabled: false };
        // The demo-mode banner's own "Exit demo" pill and the page are both in scope: everything rendered.
        const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, rules, resultTypes: ["violations"] });
        return res.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length,
          nodes: x.nodes.slice(0, 4).map((nd) => `${nd.target.join(" ")} :: ${(nd.failureSummary || "").split("\n").slice(1, 2).join(" ").trim().slice(0, 140)} :: ${String(nd.html || "").replace(/style="[^"]*"/g, "").slice(0, 120)} :: ${(document.querySelector(nd.target[0])?.textContent || "").trim().slice(0, 50)}`) }));
      }, EXCLUDED_RULES);
      // axe accepts "✕" or "‹" as a button's name. An icon-only button needs a name in words: an
      // aria-label (or aria-labelledby / title) with at least one letter.
      const icons = await page.evaluate(() => [...document.querySelectorAll("button, [role=button]")]
        .filter((b) => b.getClientRects().length && !/[\p{L}\p{N}]/u.test(b.textContent || ""))
        .filter((b) => !/\p{L}/u.test(b.getAttribute("aria-label") || b.getAttribute("title") || (b.getAttribute("aria-labelledby") ? (document.getElementById(b.getAttribute("aria-labelledby"))?.textContent || "") : "")))
        .map((b) => `${(b.textContent || "").trim() || "(empty)"} :: ${b.outerHTML.replace(/style="[^"]*"/g, "").slice(0, 100)}`));
      results.push({ view: `${v.name} (${scheme})`, violations: r, icons });
    } catch (e) {
      results.push({ view: `${v.name} (${scheme})`, unreachable: String(e.message).split("\n")[0].slice(0, 160) });
    }
  }
  // Text scales with the phone's own text size: initTextScale runs at startup and sets the root's
  // text-size-adjust (100% at the default size).
  if (scheme === "light") tsa = await main.page.evaluate(() => document.documentElement.style.webkitTextSizeAdjust || document.documentElement.style.textSizeAdjust || "");
  await main.ctx.close(); if (tour) await tour.ctx.close();
  }
  await browser.close(); server.close();
  if (process.env.A11Y_JSON) fs.writeFileSync(process.env.A11Y_JSON, JSON.stringify(results, null, 1));

  t.eq(results.filter((r) => r.unreachable).map((r) => `${r.view}: ${r.unreachable}`), [], "1 every screen in the check opened");
  for (const r of results.filter((x) => !x.unreachable)) {
    t.eq(r.violations.map((v) => `${v.id} (${v.impact}, ${v.n}): ${v.nodes.join(" | ")}`), [], `2 ${r.view}: no WCAG 2.x A/AA violation axe can find`);
    t.eq(r.icons, [], `5 ${r.view}: every icon-only button has a name in words`);
  }
  t.ok(/^\d+%$/.test(tsa), `3 text scales with the system text size: the root's text-size-adjust is set at startup (${tsa || "unset"})`);
  t.eq(EXCLUDED_RULES, ["meta-viewport"], "4 one rule is excluded, and only that one (the native pinch-zoom lock, see the header)");
  t.summary("A11Y (browser)");
})();
