// tests/webAnalytics.browser.test.cjs
// -----------------------------------------------------------------------------
// WEBSITE ANALYTICS IN THE BUILT APP, IN A REAL BROWSER (src/lib/webAnalytics.js, 2026-10-26).
//
// plausible.io is answered by a stand-in for its script that records what the real one would send: each call, as
// the request payload, passed through the transformRequest the app gave plausible.init (as the real script does).
//   1  the landing, opened from a link carrying an email, a checkout id and a token: one pageview, its URL clean
//   2  "Try free" and "Store badge" fire once per click, store the only property; "Demo open" once, then /demo
//   3  a signed-in household: plausible.io is never asked for anything
// (Which pages, the native build and the CSP: tests/webAnalytics.)
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
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
const STUB = `(function(){var w=window,o=(w.plausible&&w.plausible.o)||{},q=(w.plausible&&w.plausible.q)||[];w.__sent=w.__sent||[];
function send(n,a){var p={n:n,u:location.href,r:document.referrer||null};if(a&&a.props)p.p=a.props;var out=o.transformRequest?o.transformRequest(p):p;if(out)w.__sent.push(out);}
w.plausible=function(n,a){send(n,a)};w.plausible.o=o;w.plausible.init=function(){};q.forEach(function(a){send(a[0],a[1])});})();`;

function household() {
  const blob = MOCK.emptyBlob();
  blob.savedAt = "2026-10-26T09:00:00.000Z";
  blob.core.appData = {
    profile: { name: "", country: "CA", province: "ON" },
    accounts: [{ id: "m1", name: "Chequing", type: "checking", balance: 3000, institution: "Manual" }],
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-06", type: "employment" }],
    bills: [], transactions: [], debts: [], goals: [], bankConnected: false,
  };
  return blob;
}

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("WEB ANALYTICS (browser)"); return; }
  let dist = null;
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    if (p === "/rest/v1/user_data" && req.method === "GET") {
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
      const row = { data: household(), updated_at: "2026-10-26T09:00:00.000Z" };
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(wantsObject ? row : [row])); return;
    }
    if (MOCK.handle(req, res)) return;
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = tempDir("webanalytics");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  const browser = await playwright.chromium.launch();
  const open = async (signedIn) => {
    const asked = [];
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Toronto" });
    await ctx.route("https://plausible.io/**", (r) => { asked.push(r.request().url()); r.fulfill({ status: 200, contentType: "text/javascript", body: STUB }); });
    await ctx.route(/apps\.apple\.com|play\.google\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>store</p>" }));
    if (signedIn) {
      await ctx.addInitScript(([key, session]) => { try {
        localStorage.setItem(key, session); localStorage.setItem("flourish_first_visit_done", "1");
        localStorage.setItem("flourish_tour_done", "1"); localStorage.setItem("flourish_ai_disclosure_seen", "1");
      } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession(Math.floor(Date.now() / 1000)))]);
    }
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    return { ctx, page, asked };
  };
  const sent = (page) => page.evaluate(() => (window.__sent || []).map((x) => ({ n: x.n, u: x.u, r: x.r, p: x.p || null })));
  try {
    // ── 1 and 2. The landing, signed out ──────────────────────────────────────────────────────────
    {
      const { ctx, page, asked } = await open(false);
      await page.goto(base + "/?email=someone%40example.invalid&session_id=cs_live_123#access_token=abc", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Try flourish free for 14 days" }).first().waitFor({ timeout: 40000 });
      await page.waitForFunction(() => (window.__sent || []).length > 0, null, { timeout: 15000 }).catch(() => {});
      let s = await sent(page);
      t.eq([asked.length, s.map((x) => [x.n, x.u])], [1, [["pageview", base + "/"]]], "1a the script is asked for once, and one pageview is sent for the landing");
      t.ok(s.every((x) => !/[?#]|email|session_id|access_token/.test(x.u + (x.r || ""))), "1b its URL has no query string or hash: no email, no checkout id, no token");
      await page.getByRole("link", { name: "Download on the App Store" }).first().click();
      await page.waitForTimeout(400);
      s = await sent(page);
      t.eq(s.filter((x) => x.n === "Store badge").map((x) => x.p), [{ store: "App Store" }], "2a one Store badge event per click, store the only property");
      await page.getByRole("button", { name: "Try flourish free for 14 days" }).first().click();
      await page.waitForTimeout(400);
      s = await sent(page);
      t.eq(s.filter((x) => x.n === "Try free").length, 1, "2b one Try free event per click");
      await ctx.close();
    }
    {
      const { ctx, page } = await open(false);
      await page.goto(base + "/", { waitUntil: "domcontentloaded" });
      const demo = page.getByRole("button", { name: /Try the demo with/ }).first();
      await demo.waitFor({ timeout: 40000 });
      await demo.click();
      await page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 });
      await page.waitForTimeout(800);
      const s = await sent(page);
      t.eq([s.filter((x) => x.n === "Demo open").length, s.filter((x) => x.n === "pageview").map((x) => x.u)], [1, [base + "/", base + "/demo"]], "2c one Demo open event, then the demo's own pageview (/demo)");
      await ctx.close();
    }
    // ── 3. Signed in ──────────────────────────────────────────────────────────────────────────────
    {
      const { ctx, page, asked } = await open(true);
      await page.goto(base + "/?billing=success&session_id=cs_live_9", { waitUntil: "domcontentloaded" });
      await page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 });
      await page.goto(base + "/privacy", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      t.eq(asked, [], "3a a signed-in household (Today, then privacy): plausible.io is never asked for anything");
      await ctx.close();
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.message) || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("WEB ANALYTICS (browser)");
})();
