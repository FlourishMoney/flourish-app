// tests/seoPrerender.browser.test.cjs
// -----------------------------------------------------------------------------
// THE PRE-RENDERED HOME PAGE AND /support IN A REAL BROWSER (scripts/build-seo.mjs, 2026-11-19).
// The site is built as `npm run build` builds it, with TRIAL_PLAN_FIRST on, and served by the rules Netlify uses: a real
// file, a folder's index.html, /x as x.html, else the SPA fallback (app.html, netlify.toml). The server answers
// /api/founding and /api/trial-plan-first as production does today (50 spots, signup open, the switch on).
//   1  with scripts off, the landing and /support read in full: what a crawler that runs no script gets
//   2  with scripts on, the copy is never shown: the first paint is what it was before (no landing words, no flash)
//   3  once the app has started, the copy is gone and React's landing says exactly what the copy said (plus the live
//      founding count, which only the live answer can give)
//   4  /support the same: React's page says exactly what the copy said
//   5  signed in, the home page never shows the landing's words (the app starts as before)
//   6  /privacy, /app and an unknown address get the plain shell: none of the landing's words in their HTML
//   7  nothing new in the console: no React error about the root it replaced
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { tempDir } = require("./_tmp.cjs");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const MOCK = require("./_mockSupabase.cjs");

const ROOT = path.join(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg", ".txt": "text/plain", ".xml": "application/xml", ".mp4": "video/mp4", ".woff2": "font/woff2" };
const TPF_ON = { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: "2026-11-18T18:55:00Z" };
const HEADLINE = "Know what's safe to spend until payday.";

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("SEO PRERENDER (browser)"); return; }
  const SEO = await import(path.join(ROOT, "scripts", "build-seo.mjs"));
  const G = await import(path.join(ROOT, "scripts", "build-guides.mjs"));
  const { textOf } = SEO;
  let dist = null;
  let holdBundle = false;
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    if (p === "/api/founding") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ spotsLeft: 50, openSignup: true })); return; }
    if (p === "/api/trial-plan-first") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ on: true, since: "2026-11-18T18:55:00.000Z" })); return; }
    if (MOCK.handle(req, res)) return;
    // Netlify's order: the file itself, a folder's index.html, /x as x.html, then the SPA fallback.
    let f = path.join(dist, decodeURIComponent(p));
    if (f.startsWith(dist) && fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    else if (!fs.existsSync(f) && fs.existsSync(`${f}.html`)) f = `${f}.html`;
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "app.html");
    const send = () => { res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res); };
    if (holdBundle && /^\/assets\/index-.*\.js$/.test(p)) setTimeout(send, 2500); else send();
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key", ...TPF_ON };
  dist = tempDir("seo-browser");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"], { cwd: ROOT, stdio: "inherit", env });
  G.buildGuides(dist, { contentDir: path.join(ROOT, "content", "guides"), env: {} });
  SEO.buildSeo(dist, { env, published: G.readGuides(path.join(ROOT, "content", "guides")).filter((g) => g.status === "published") });
  const copyOf = (file) => { const h = fs.readFileSync(path.join(dist, file), "utf8"); return h.slice(h.indexOf("<div data-prerender=\"\">"), h.indexOf("</div></div>\n", h.indexOf("<div data-prerender=\"\">"))); };
  const homeCopy = textOf(copyOf("index.html")), supportCopy = textOf(copyOf("support.html"));

  const browser = await playwright.chromium.launch();
  const open = async ({ js = true, signedIn = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: js, timezoneId: "America/Toronto" });
    await ctx.route(/clarity\.ms|plausible\.io|fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 204, body: "" }));
    if (signedIn) {
      await ctx.addInitScript(([key, session]) => { try { localStorage.setItem(key, session); localStorage.setItem("flourish_first_visit_done", "1"); localStorage.setItem("flourish_tour_done", "1"); localStorage.setItem("flourish_ai_disclosure_seen", "1"); } catch (e) {} },
        [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession(Math.floor(Date.now() / 1000)))]);
    }
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    const consoleErrors = [];
    // The test server answers the app's other /api/ calls 404 (as tests/_mockSupabase does), so a failed load is expected.
    page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/^Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    return { ctx, page, consoleErrors };
  };
  // React's text, once the landing has had its answers (founding, trial-plan-first) and stopped changing.
  const settledRootText = async (page, must) => {
    await page.waitForFunction((w) => { const r = document.getElementById("root"); return r && !r.querySelector("[data-prerender]") && r.innerText.includes(w); }, must, { timeout: 40000 });
    let prev = "", now = "";
    for (let i = 0; i < 20; i++) { await page.waitForTimeout(250); now = await page.evaluate(() => document.getElementById("root").innerHTML); if (now === prev) break; prev = now; }
    return textOf(now);
  };
  try {
    // ── 1. Scripts off ─────────────────────────────────────────────────────────────────────────
    {
      const { ctx, page } = await open({ js: false });
      await page.goto(base + "/", { waitUntil: "load" });
      const shown = await page.evaluate(() => document.body.innerText);
      t.ok(shown.includes(HEADLINE) && shown.includes("Why flourish") && shown.includes("Built in Canada") && shown.length > 1500, `1a scripts off: the landing reads in full (${shown.length} characters shown)`);
      await page.goto(base + "/support", { waitUntil: "load" });
      const sup = await page.evaluate(() => document.body.innerText);
      t.ok(sup.includes("Questions and answers") && sup.includes("What is safe to spend?") && sup.includes("Is my bank login safe?"), "1b scripts off: /support shows its questions");
      await ctx.close();
    }
    // ── 2 and 3. Scripts on, signed out ─────────────────────────────────────────────────────────────
    {
      holdBundle = true;   // the app's bundle arrives 2.5 s late, so the first paint can be read before React starts
      const { ctx, page, consoleErrors } = await open();
      await page.goto(base + "/", { waitUntil: "domcontentloaded" });
      const first = await page.evaluate(() => { const c = document.querySelector("#root > [data-prerender]"); return { has: !!c, display: c ? getComputedStyle(c).display : null, shown: document.body.innerText.trim() }; });
      t.eq([first.has, first.display, first.shown], [true, "none", ""], "2a before the app starts: the copy is in the page but not shown, and nothing is on screen (as before)");
      holdBundle = false;
      const reactText = await settledRootText(page, HEADLINE);
      t.eq(await page.evaluate(() => document.querySelectorAll("[data-prerender]").length), 0, "3a once the app has started, the copy is gone");
      // The one line the copy leaves out: the founding count, which only the live answer can give ("50 spots left"). A
      // count written into the HTML at build time would be wrong by the next sign-up.
      const COUNT = /Founding price: \$79\.99 a year plus tax for the first 50 households who subscribe\. \d+ spots? left, first come, first served\. /;
      t.ok(COUNT.test(reactText) && !COUNT.test(homeCopy), "3b the live founding count is the app's own line, from the live answer, and is not in the copy");
      t.eq(reactText.replace(COUNT, ""), homeCopy, "3c apart from it, React's landing says exactly what the copy said, word for word");
      t.ok(homeCopy.includes("Get started") && homeCopy.includes("Choose a plan to get started."), "3d …with the switch-on words, as production shows today");
      t.eq(consoleErrors, [], "7a the landing: nothing in the console");
      await ctx.close();
    }
    // ── 4. /support, scripts on ────────────────────────────────────────────────────────────────────
    {
      const { ctx, page, consoleErrors } = await open();
      await page.goto(base + "/support", { waitUntil: "domcontentloaded" });
      const reactText = await settledRootText(page, "Questions and answers");
      t.eq(reactText, supportCopy, "4a React's /support says exactly what the copy said");
      t.eq(consoleErrors, [], "7b /support: nothing in the console");
      await ctx.close();
    }
    // ── 5. Signed in ───────────────────────────────────────────────────────────────────────────
    {
      holdBundle = true;
      const { ctx, page } = await open({ signedIn: true });
      await page.goto(base + "/", { waitUntil: "domcontentloaded" });
      const seen = [];
      const look = async () => seen.push(await page.evaluate((h) => document.body.innerText.includes(h), HEADLINE));
      await look();
      holdBundle = false;
      for (let i = 0; i < 12; i++) { await page.waitForTimeout(250); await look(); }
      await page.waitForFunction(() => !document.querySelector("[data-prerender]"), null, { timeout: 30000 });
      await look();
      t.ok(seen.every((s) => s === false), `5a signed in: the landing's words are never on screen (${seen.length} looks)`);
      await ctx.close();
    }
    // ── 6. Every other address: the plain shell ──────────────────────────────────────────────────
    for (const p of ["/privacy", "/app", "/login", "/no-such-page"]) {
      const html = await new Promise((ok, no) => http.get(base + p, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => ok(b)); }).on("error", no));
      t.ok(!html.includes("data-prerender") && !html.includes(HEADLINE.replace("'", "&#x27;")) && !html.includes("application/ld+json") && textOf(html).length < 100, `6 ${p}: the plain app shell`);
    }
    {
      const { ctx, page } = await open();
      await page.goto(base + "/privacy", { waitUntil: "domcontentloaded" });
      await page.getByText("Privacy Policy", { exact: false }).first().waitFor({ timeout: 40000 });
      t.ok(true, "6e /privacy still opens the policy in the app");
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("SEO PRERENDER (browser)");
})().catch((e) => { console.error(e); process.exitCode = 1; });
