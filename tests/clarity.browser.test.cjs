// tests/clarity.browser.test.cjs
// -----------------------------------------------------------------------------
// MICROSOFT CLARITY IN THE BUILT SITE, IN A REAL BROWSER (src/lib/webClarity.js, public/clarity/loader.js, 2026-11-06).
//
// www.clarity.ms is answered by a stand-in for the tag that records each call made to window.clarity, and the edge
// (/api/clarity-gate) by a stand-in giving the answer each case needs. Nothing reaches Microsoft.
//   1  the landing, signed out: the edge, then the tag, once, after the page's load event
//   2  opening the sign-in form: clarity("stop")
//   3  a signed-in household (Today, then privacy): neither the edge nor the tag is ever asked
//   4  the edge says no (Quebec, the EEA, the UK, Switzerland are decided there): no tag
//   5  an address with a checkout id in it: nothing asked
//   6  /privacy from the policy's new date: Clarity loads, and the policy's bullet links Microsoft's privacy statement
//   7  the static pages: /get and the guides load it; the newsletter page does not
// (The rules themselves, the edge and the store build: tests/clarity.)
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
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain" };
const POLICY_LINE = "Microsoft Clarity: on our public website pages only, we use Microsoft Clarity heatmaps and session recordings to understand how visitors use a page, such as where they tap and how far they scroll, so we can improve those pages. Clarity is not used in the flourish app, on sign-in or sign-up pages, at checkout, or on any page shown while you are signed in, and it does not load for visitors in Quebec, the European Economic Area, the United Kingdom or Switzerland. We use Clarity's Strict masking setting, which masks all text on the page, and we have turned off Clarity cookies, so Clarity does not use those cookies to link page views into multi-page sessions. Clarity receives interaction and technical information, including information used for IP-based location and information about the visitor's browser and device. Microsoft's privacy statement applies to Microsoft's handling of that information.";
const STUB = `(function(){var w=window,q=(w.clarity&&w.clarity.q)||[];w.__clarity={at:performance.now(),calls:[]};
q.forEach(function(a){w.__clarity.calls.push([].slice.call(a))});w.clarity=function(){w.__clarity.calls.push([].slice.call(arguments))};})();`;

function household() {
  const blob = MOCK.emptyBlob();
  blob.savedAt = "2026-11-06T09:00:00.000Z";
  blob.core.appData = {
    profile: { name: "", country: "CA", province: "ON" },
    accounts: [{ id: "m1", name: "Chequing", type: "checking", balance: 3000, institution: "Manual" }],
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-13", type: "employment" }],
    bills: [], transactions: [], debts: [], goals: [], bankConnected: false,
  };
  return blob;
}

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("CLARITY (browser)"); return; }
  let dist = null;
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    if (p === "/rest/v1/user_data" && req.method === "GET") {
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
      const row = { data: household(), updated_at: "2026-11-06T09:00:00.000Z" };
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(wantsObject ? row : [row])); return;
    }
    if (MOCK.handle(req, res)) return;
    let f = path.join(dist, decodeURIComponent(p));
    if (f.startsWith(dist) && fs.existsSync(f) && fs.statSync(f).isDirectory() && fs.existsSync(path.join(f, "index.html"))) f = path.join(f, "index.html");
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = tempDir("clarity-browser");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  const { buildGuides } = await import(path.join(ROOT, "scripts", "build-guides.mjs"));
  buildGuides(dist, { contentDir: path.join(ROOT, "content", "guides"), env: {} });
  const guide = fs.readdirSync(path.join(dist, "guides")).find((d) => fs.statSync(path.join(dist, "guides", d)).isDirectory());

  const browser = await playwright.chromium.launch();
  const open = async ({ signedIn = false, gate = true, policyDate = null } = {}) => {
    const tag = [], edge = [];
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Toronto" });
    // Playwright tries the route added last first: anything else at clarity.ms answers empty, the tag answers the stand-in.
    await ctx.route(/clarity\.ms/, (r) => { tag.push(r.request().url()); r.fulfill({ status: 204, body: "" }); });
    await ctx.route("https://www.clarity.ms/**", (r) => { tag.push(r.request().url()); r.fulfill({ status: 200, contentType: "text/javascript", body: STUB }); });
    await ctx.route("**/api/clarity-gate", (r) => { edge.push(r.request().url()); r.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "private, no-store" }, body: JSON.stringify({ load: gate }) }); });
    await ctx.route("https://plausible.io/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
    if (policyDate) await ctx.route("**/api/newsletter", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ policyDate }) }));
    if (signedIn) {
      await ctx.addInitScript(([key, session]) => { try {
        localStorage.setItem(key, session); localStorage.setItem("flourish_first_visit_done", "1");
        localStorage.setItem("flourish_tour_done", "1"); localStorage.setItem("flourish_ai_disclosure_seen", "1");
      } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession(Math.floor(Date.now() / 1000)))]);
    }
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    return { ctx, page, tag, edge };
  };
  const recorded = (page) => page.evaluate(() => window.__clarity ? { at: window.__clarity.at, calls: window.__clarity.calls, loadEnd: performance.getEntriesByType("navigation")[0].loadEventEnd } : null);
  const waitTag = (page) => page.waitForFunction(() => !!window.__clarity, null, { timeout: 15000 }).catch(() => {});
  try {
    // ── 1 and 2. The landing, signed out, then the sign-in form ───────────────────────────────────
    {
      const { ctx, page, tag, edge } = await open();
      await page.goto(base + "/", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Log in" }).first().waitFor({ timeout: 40000 });
      await waitTag(page);
      const r = await recorded(page);
      t.eq([edge.length, tag.length], [1, 1], "1a the landing: the edge is asked once, then the tag once");
      t.ok(!!r && r.loadEnd > 0 && r.at > r.loadEnd, `1b …after the page's load event (tag ran at ${r ? Math.round(r.at) : "?"} ms, load ended at ${r ? Math.round(r.loadEnd) : "?"} ms)`);
      t.ok(!!r && !r.calls.some((c) => c[0] === "stop"), "1c …and it is running (not stopped)");
      await page.getByRole("button", { name: "Log in" }).first().click();
      await page.waitForTimeout(500);
      const r2 = await recorded(page);
      t.eq(r2 && r2.calls.filter((c) => c[0] === "stop").length, 1, "2a opening the sign-in form: clarity(\"stop\"), once");
      t.eq(tag.length, 1, "2b …and nothing more is loaded");
      await ctx.close();
    }
    // ── 3. Signed in ──────────────────────────────────────────────────────────────────────────────
    {
      const { ctx, page, tag, edge } = await open({ signedIn: true });
      await page.goto(base + "/", { waitUntil: "domcontentloaded" });
      await page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 });
      await page.waitForTimeout(2500);
      await page.goto(base + "/privacy", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      t.eq([edge, tag], [[], []], "3a a signed-in household (Today, then privacy): neither the edge nor clarity.ms is ever asked");
      await ctx.close();
    }
    // ── 4. The edge says no ───────────────────────────────────────────────────────────────────────
    {
      const { ctx, page, tag, edge } = await open({ gate: false });
      await page.goto(base + "/", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Log in" }).first().waitFor({ timeout: 40000 });
      await page.waitForTimeout(3000);
      t.eq([edge.length, tag.length], [1, 0], "4a the edge says no (Quebec, the EEA, the UK, Switzerland): no tag");
      await ctx.close();
    }
    // ── 5. A checkout id in the address ──────────────────────────────────────────────────────────
    {
      const { ctx, page, tag, edge } = await open();
      await page.goto(base + "/?session_id=cs_live_123", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Log in" }).first().waitFor({ timeout: 40000 });
      await page.waitForTimeout(3000);
      t.eq([edge.length, tag.length], [0, 0], "5a an address with a query string: nothing asked, nothing loaded");
      await ctx.close();
    }
    // ── 6. /privacy from the policy's new date ────────────────────────────────────────────────────
    {
      const { ctx, page, tag } = await open({ policyDate: "2026-11-12" });
      await page.goto(base + "/privacy", { waitUntil: "domcontentloaded" });
      await page.getByText("Microsoft Clarity", { exact: false }).first().waitFor({ timeout: 40000 });
      await waitTag(page);
      t.eq(tag.length, 1, "6a /privacy, signed out: Clarity loads");
      const link = page.getByRole("link", { name: "Microsoft's privacy statement" });
      const words = await page.evaluate(() => { const el = [...document.querySelectorAll("strong")].find((s) => s.textContent === "Microsoft Clarity"); return el ? el.parentElement.textContent : ""; });
      t.eq(words, "• " + POLICY_LINE, "6b the policy's Clarity bullet, on the page, word for word");
      t.eq([await link.count(), await link.getAttribute("href")], [1, "https://privacy.microsoft.com/privacystatement"], "6b2 …and \"Microsoft's privacy statement\" links to it");
      const order = await page.evaluate(() => { const s = [...document.querySelectorAll("strong")].map((x) => x.textContent); return [s.indexOf("Website analytics"), s.indexOf("Microsoft Clarity")]; });
      t.ok(order[0] >= 0 && order[1] === order[0] + 1, "6c …directly after the Website analytics bullet");
      await ctx.close();
    }
    {
      const { ctx, page } = await open();
      await page.goto(base + "/privacy", { waitUntil: "domcontentloaded" });
      await page.getByText("Website analytics", { exact: false }).first().waitFor({ timeout: 40000 });
      await page.waitForTimeout(1000);
      t.eq(await page.getByText("Microsoft Clarity", { exact: false }).count(), 0, "6d before the policy's new date, the policy is as it was: no Clarity bullet");
      await ctx.close();
    }
    // ── 7. The static pages ───────────────────────────────────────────────────────────────────────
    for (const [p, want] of [["/get/", 1], [`/guides/${guide}/`, 1], ["/guides/", 1], ["/newsletter/", 0]]) {
      const { ctx, page, tag, edge } = await open();
      await page.goto(base + p, { waitUntil: "load" });
      if (want) await waitTag(page); else await page.waitForTimeout(3000);
      const r = await recorded(page);
      t.eq([edge.length, tag.length], [want, want], `7 ${p}: ${want ? "the edge, then the tag, after the load event" : "nothing asked, nothing loaded"}`);
      if (want) t.ok(!!r && r.at > r.loadEnd, `7 ${p}: …after the load event`);
      await ctx.close();
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.message) || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("CLARITY (browser)");
})();
