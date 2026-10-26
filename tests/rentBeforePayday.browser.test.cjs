// tests/rentBeforePayday.browser.test.cjs
// -----------------------------------------------------------------------------
// RENT DUE STRICTLY BEFORE PAYDAY, IN A REAL BROWSER (audit 2026-10-26, B1).
//
// The audit's household, signed in on the built app with the clock pinned to Oct 26, 2026: $3,000 in checking, pay
// every two weeks with the next payday Nov 6, rent of $1,500 due the 1st, and last month's rent paid Oct 1. Before the
// fix, Today showed $2,291 safe and no rent due, while Watch took the rent out on Nov 1. Now:
//   1  Today shows $791, and its breakdown carries Upcoming bills $1,500
//   2  Watch takes the same rent out on Nov 1
// (tests/onboardingFirstNumber.browser.test.cjs puts its bill on or after payday, so it never met this.)
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

function household() {
  const blob = MOCK.emptyBlob();
  blob.savedAt = "2026-10-26T09:00:00.000Z";
  blob.core.appData = {
    profile: { name: "", country: "CA", province: "ON" },
    accounts: [{ id: "m1", name: "Chequing", type: "checking", balance: 3000, institution: "Manual" }],
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-06", type: "employment" }],
    bills: [{ id: "mb_rent", name: "Rent", amount: 1500, date: "1", dayOfMonth: 1, freq: "monthly", recurring: true, origin: "manual", type: "fixed" }],
    transactions: [{ id: "t1", name: "Rent", amount: 1500, date: "2026-10-01", category: "Housing" }],
    debts: [], goals: [], bankConnected: false,
  };
  return blob;
}

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("RENT BEFORE PAYDAY (browser)"); return; }
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
  dist = tempDir("rent");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Toronto" });
    await ctx.addInitScript(([key, session]) => { try {
      localStorage.setItem(key, session);
      localStorage.setItem("flourish_first_visit_done", "1");
      localStorage.setItem("flourish_tour_done", "1");
      localStorage.setItem("flourish_ai_disclosure_seen", "1");
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession(Math.floor(Date.parse("2026-10-26T14:00:00Z") / 1000)))]);
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-26T10:00:00-04:00") });
    page.setDefaultTimeout(20000);
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.getByText("$791", { exact: false }).first().waitFor({ timeout: 40000 }).catch(() => {});
    const today = await page.locator("body").innerText();
    t.ok(/\$791\b/.test(today), "1a Today shows $791 safe until payday (was $2,291)");
    t.ok(!/\$2,291\b/.test(today), "1b …and not the old $2,291");
    // The breakdown: "How Flourish got this number" lists the bills before payday.
    const how = page.getByText("$791", { exact: false }).first();
    await how.click().catch(() => {});
    await page.waitForTimeout(600);
    const sheet = await page.locator("body").innerText();
    t.ok(/Upcoming bills[\s\S]{0,40}\$1,500/.test(sheet) || /Rent[\s\S]{0,60}\$1,500/.test(sheet), "1c the breakdown carries the $1,500 rent");
    await page.keyboard.press("Escape").catch(() => {});
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button").filter({ hasText: /^Watch(\s*\d+)?$/ }).last().click();
    await page.waitForTimeout(1200);
    const watch = await page.locator("body").innerText();
    t.ok(/Nov[^\n]{0,6}1[\s\S]{0,120}Rent[\s\S]{0,40}\$1,500/.test(watch) || /Rent[\s\S]{0,80}Nov[^\n]{0,4}1/.test(watch), "2a Watch takes the same rent out on Nov 1");
    await ctx.close();
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.message) || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("RENT BEFORE PAYDAY (browser)");
})();
