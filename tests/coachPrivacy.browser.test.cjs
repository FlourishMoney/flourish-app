// tests/coachPrivacy.browser.test.cjs
// -----------------------------------------------------------------------------
// THE REAL COACH REQUEST, IN A REAL BROWSER, CARRIES NO NAME AND NO FULL ACCOUNT NUMBER (audit 2026-10-26, B2).
//
// A signed-in household whose profile, partner and child have names, whose account and goal are named after
// them, and whose transactions include an e-transfer with a full account number, asks the coach a question that
// names them. Every request the built app sends to /api/coach is captured:
//   1  the chat request was sent, with the question in it
//   2  no request carries any of the household's names
//   3  no request carries the full account number (its last 4 may stay)
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
const NAME_RX = /priyanka|lindqvist|desmond|oluwaseun/i;
function household() {
  const blob = MOCK.emptyBlob();
  blob.savedAt = "2026-10-26T09:00:00.000Z";
  blob.core.isPremium = true;
  blob.core.appData = {
    profile: { name: "Priyanka Lindqvist", partnerName: "Desmond", status: "married", kids: [{ name: "Oluwaseun", birthYear: "2019" }], hasKids: true, country: "CA", province: "ON" },
    accounts: [{ id: "m1", name: "Priyanka's Chequing", type: "checking", balance: 3000, institution: "Manual" }],
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-06", type: "employment" }],
    bills: [{ id: "mb_rent", name: "Rent", amount: 1500, date: "1", dayOfMonth: 1, freq: "monthly", recurring: true, origin: "manual", type: "fixed" }],
    transactions: [{ id: "t1", name: "E-TRANSFER DESMOND 0051234567", amount: 200, date: "2026-10-20", category: "Transfer", account_id: "m1" },
                   { id: "t2", name: "Corner Grocery", amount: 48.2, date: "2026-10-22", category: "Groceries", account_id: "m1" }],
    goals: [{ id: "g1", name: "Oluwaseun's RESP", target: 5000, saved: 400 }],
    debts: [], bankConnected: false,
  };
  return blob;
}

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("COACH PRIVACY (browser)"); return; }
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
  dist = tempDir("coachpriv");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  const browser = await playwright.chromium.launch();
  const sent = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Toronto" });
    await ctx.addInitScript(([key, session]) => { try {
      localStorage.setItem(key, session);
      localStorage.setItem("flourish_first_visit_done", "1");
      localStorage.setItem("flourish_tour_done", "1");
      localStorage.setItem("flourish_ai_disclosure_seen", "1");
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession(Math.floor(Date.parse("2026-10-26T14:00:00Z") / 1000)))]);
    await ctx.route("**/api/coach", (r) => {
      sent.push(r.request().postData() || "");
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: "Here is what your numbers show." }] }) });
    });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-26T10:00:00-04:00") });
    page.setDefaultTimeout(20000);
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 });
    await page.getByRole("button").filter({ hasText: /^Learn(\s*\d+)?$/ }).last().click();
    const box = page.getByRole("textbox").last();
    await box.fill("Can Desmond and I start an RESP for Oluwaseun this year?");
    await box.press("Enter");
    for (let i = 0; i < 40 && !sent.some((b) => /RESP/.test(b)); i++) await page.waitForTimeout(250);
    await ctx.close();
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.message) || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  const chat = sent.filter((b) => /RESP/.test(b));
  t.ok(chat.length >= 1 && chat.some((b) => /start an RESP for child 1/.test(b)), `1 the chat request was sent with the question in it (${sent.length} coach requests)`);
  t.ok(sent.length >= 1 && sent.every((b) => !NAME_RX.test(b)), "2 no coach request carries a household name" + (sent.find((b) => NAME_RX.test(b)) ? ": " + (sent.find((b) => NAME_RX.test(b)).match(/.{0,40}(priyanka|lindqvist|desmond|oluwaseun).{0,40}/i) || [""])[0] : ""));
  t.ok(sent.every((b) => !/0051234567|51234567/.test(b)), "3 no coach request carries the full account number");
  t.summary("COACH PRIVACY (browser)");
})();
