// tests/balanceTruth.browser.test.cjs
// -----------------------------------------------------------------------------
// HONEST BANK BALANCES, IN A REAL BROWSER (balance-truth, 2026-11-06).
//
// The built app, signed in, against a stand-in database and a stand-in Plaid on this machine (nothing reaches
// Plaid or Supabase). The household of the report: Scotiabank linked, last answered on Oct 30, and its sign-in run out.
//   1  Today: when the bank last answered (no "Live · up to date"), and a card saying Scotiabank needs a sign-in
//   2  the card's button opens the bank consent, then the bank window for Scotiabank (update mode, its item)
//   3  every way that window can close says why and what it means (closed, bank down, code, sign-in, other)
//   4  Settings > Connect Another Bank: a window that closes says nothing was added
//   5  a new bank (Tangerine) whose history is not ready: "loading your history", asked again every 20 seconds,
//      gone once the 90 days are in, with the transactions there
// The words are placeholders until approved; the checks look for the facts beside them.
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
const OCT30 = "2026-10-30T16:00:00.000Z";
function household() {
  const blob = MOCK.emptyBlob();
  blob.savedAt = "2026-11-06T09:00:00.000Z";
  blob.core.isPremium = true;
  blob.core.appData = {
    profile: { name: "Amanda", country: "CA", province: "ON" },
    accounts: [
      { id: "acct-chq", name: "Preferred Package", type: "depository", subtype: "checking", balance: 779.25, currency: "CAD", institution: "Scotiabank", _item: "item-scotia", bankAnsweredAt: OCT30 },
      { id: "acct-sav", name: "Money Master", type: "depository", subtype: "savings", balance: 0, currency: "CAD", institution: "Scotiabank", _item: "item-scotia", bankAnsweredAt: OCT30 },
    ],
    incomes: [{ id: "i1", label: "Pay", amount: 2600, freq: "biweekly", nextPayDate: "2026-11-13", type: "employment" }],
    bills: [], transactions: [], debts: [], goals: [], bankConnected: true,
  };
  blob.sideKeys = { ...blob.sideKeys, flourish_plaid_consented_at: "2026-07-21T18:47:26.207Z" };
  return blob;
}
const day = (n) => new Date(Date.parse("2026-11-06T12:00:00Z") - n * 86400000).toISOString().slice(0, 10);
const tangerineTxns = () => Array.from({ length: 12 }, (_, i) => ({ id: `tg-${i}`, account_id: "acct-tg", date: day(i * 7 + 1), name: i % 2 ? "LOBLAWS" : "PAYROLL ACME", amount: i % 2 ? 84.12 : -1300, category: i % 2 ? "FOOD_AND_DRINK" : "INCOME", currency: "CAD", pending: false, account_type: "depository", account_subtype: "checking" }));

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("BALANCE TRUTH (browser)"); return; }
  let dist = null;
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    if (p === "/rest/v1/user_data" && req.method === "GET") {
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
      const row = { data: household(), updated_at: "2026-11-06T09:00:00.000Z" };
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(wantsObject ? row : [row])); return;
    }
    if (p === "/rest/v1/profiles" && req.method === "GET") {
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
      const row = { plan: "plus", trial_started_at: "2026-06-16T00:00:00.000Z", trial_ends_at: "2026-06-30T00:00:00.000Z", founder_flag: false };
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
  dist = tempDir("balancetruth");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  const browser = await playwright.chromium.launch();

  // A stand-in Plaid Link: open() answers the way the test asks (window.__plaidMode), after a beat.
  const FAKE_LINK = `window.Plaid = { create: function (cfg) { return { open: function () {
    var m = window.__plaidMode || {}; window.__plaidOpened = (window.__plaidOpened || 0) + 1; window.__plaidToken = cfg.token;
    setTimeout(function () { if (m.success) cfg.onSuccess(m.public_token, { institution: { name: m.bank } }); else cfg.onExit(m.err || null, { institution: m.bank ? { name: m.bank } : null }); }, 50);
  } }; } };`;

  // plaid: { [action]: (body, n) => [status, json] }, n = how many times that action has been asked.
  const open = async ({ plaidMode = {}, plaid = {} } = {}) => {
    const asked = [];
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Toronto" });
    await ctx.addInitScript(([key, session, mode]) => { try {
      localStorage.setItem(key, session);
      localStorage.setItem("flourish_first_visit_done", "1");
      localStorage.setItem("flourish_tour_done", "1");
      localStorage.setItem("flourish_ai_disclosure_seen", "1");
      localStorage.setItem("flourish_plaid_consented_at", "2026-07-21T18:47:26.207Z");
      window.__plaidMode = mode;
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession(Math.floor(Date.parse("2026-11-06T20:40:00Z") / 1000))), plaidMode]);
    await ctx.route("https://cdn.plaid.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_LINK }));
    await ctx.route("**/api/plaid", (r) => {
      let b = {}; try { b = JSON.parse(r.request().postData() || "{}"); } catch {}
      asked.push(b);
      const n = asked.filter((x) => x.action === b.action).length;
      const fn = plaid[b.action];
      const [status, json] = fn ? fn(b, n) : [404, {}];
      r.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
    });
    await ctx.route("**/api/billing", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, paid: true, provider: "stripe", period_end: "2027-01-01", manageable: false, founding: { available: false } }) }));
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-11-06T15:40:00-05:00") });
    page.setDefaultTimeout(20000);
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 });
    return { ctx, page, asked };
  };
  const settle = async (page, ms = 500) => { await page.waitForTimeout(ms); };
  const expired = () => [400, { error: "Bank session expired. Please reconnect.", needs_reconnect: true }];
  const scotiaExpired = {
    list_items: () => [200, { items: [{ id: "row-1", item_id: "item-scotia", institution_name: "Scotiabank", status: "login_required", transactions_pending: false }] }],
    get_accounts: expired, get_transactions: expired, get_liabilities: expired, get_investments: expired,
    create_link_token: (b) => [200, { link_token: b.item_id ? `link-update-${b.item_id}` : "link-new" }],
  };
  const body = async (page) => page.locator("body").innerText();

  try {
    // ── 1. Today ────────────────────────────────────────────────────────────────────────────────
    {
      const { ctx, page, asked } = await open({ plaid: scotiaExpired });
      await page.clock.runFor(2500); await settle(page);
      await page.locator("[data-bank-signin]").first().waitFor({ timeout: 15000 }).catch(() => {});
      const txt = await body(page);
      t.ok(/\[WORDS: balance-last-updated\] \(Oct 30\)/.test(txt), "1a Today says when the bank last answered (Oct 30)");
      t.ok(!/Live\s*·/.test(txt) && !/up to date/.test(txt) && !/updated today/.test(txt) && !/· live/.test(txt), "1b …and nowhere says Live, up to date, updated today or · live");
      t.ok(/\[WORDS: balance-signin-title\] \(Scotiabank\)/.test(txt) && /\[WORDS: balance-signin-body\]/.test(txt), "1c the card: Scotiabank needs a sign-in, and what that means");
      t.ok(asked.some((b) => b.action === "list_items") && asked.some((b) => b.action === "get_accounts"), "1d it asked the server which banks need a sign-in, and tried the bank");
      const chip = await page.locator("[data-bank-chip='stale']").count();
      t.ok(chip >= 1, "1e the header chip is the not-live one (no live dot)");

      // ── 2. The card's button: consent, then Scotiabank's own sign-in ───────────────────────────
      await page.getByRole("button", { name: /\[WORDS: balance-signin-button\] \(Scotiabank\)/ }).click();
      await page.getByRole("button", { name: "Connect My Bank" }).click();
      await page.waitForFunction(() => (window.__plaidOpened || 0) >= 1, null, { timeout: 10000 }).catch(() => {});
      const token = await page.evaluate(() => window.__plaidToken);
      t.ok(asked.some((b) => b.action === "create_link_token" && b.item_id === "item-scotia"), "2a the button opens the bank consent, then asks for Scotiabank's update-mode window (its own item)");
      t.eq(token, "link-update-item-scotia", "2b …and the bank window opens with that token");
      await page.getByRole("dialog").waitFor({ timeout: 10000 }).catch(() => {});
      const d = await body(page);
      t.ok(/\[WORDS: balance-link-closed\]/.test(d) && /\[WORDS: balance-link-still-needed\] \(Scotiabank\)/.test(d), "2c closing it says so, and that Scotiabank still needs a sign-in");
      await ctx.close();
    }

    // ── 3. Every way the window can close, on a reconnect ───────────────────────────────────────
    const exits = [
      [{ error_code: "INSTITUTION_NOT_RESPONDING", error_type: "INSTITUTION_ERROR" }, "balance-link-bank-down", "3a the bank didn't respond"],
      [{ error_code: "INVALID_MFA", error_type: "ITEM_ERROR" }, "balance-link-code-wrong", "3b the security code didn't match"],
      [{ error_code: "INVALID_CREDENTIALS", error_type: "ITEM_ERROR" }, "balance-link-login-wrong", "3c the bank didn't accept the sign-in"],
      [{ error_code: "INTERNAL_SERVER_ERROR", error_type: "API_ERROR" }, "balance-link-other", "3d anything else"],
    ];
    for (const [err, id, label] of exits) {
      const { ctx, page } = await open({ plaid: scotiaExpired, plaidMode: { err, bank: "Scotiabank" } });
      await page.clock.runFor(2500); await settle(page);
      await page.locator("[data-bank-signin]").first().waitFor({ timeout: 15000 }).catch(() => {});
      await page.getByRole("button", { name: /\[WORDS: balance-signin-button\]/ }).click();
      await page.getByRole("button", { name: "Connect My Bank" }).click();
      await page.getByRole("dialog").waitFor({ timeout: 10000 }).catch(() => {});
      const d = await body(page);
      t.ok(new RegExp(`\\[WORDS: ${id}\\]`).test(d) && /\[WORDS: balance-link-still-needed\]/.test(d), `${label} (${err.error_code}), and that the bank still needs a sign-in`);
      await ctx.close();
    }

    // ── 4. Settings > Connect Another Bank: nothing was added ──────────────────────────────────
    {
      const { ctx, page } = await open({ plaid: scotiaExpired, plaidMode: { err: { error_code: "INSTITUTION_NOT_RESPONDING" }, bank: "RBC Royal Bank" } });
      await page.clock.runFor(2500); await settle(page);
      await page.getByRole("button", { name: "Settings" }).first().click();
      await page.getByRole("button", { name: /Connect Another Bank|Connect a Bank/ }).first().click();
      await page.getByRole("button", { name: "Connect My Bank" }).click();
      await page.getByRole("dialog").waitFor({ timeout: 10000 }).catch(() => {});
      const d = await body(page);
      t.ok(/\[WORDS: balance-link-bank-down\] \(RBC Royal Bank\)/.test(d) && /\[WORDS: balance-link-nothing-added\]/.test(d), "4a a new bank that didn't respond: says which, and that nothing was added");
      await ctx.close();
    }

    // ── 5. A new bank whose history is not ready ───────────────────────────────────────────────
    {
      let historyReady = false, linked = false;
      const plaid = {
        ...scotiaExpired,
        list_items: () => [200, { items: [
          { id: "row-1", item_id: "item-scotia", institution_name: "Scotiabank", status: "login_required", transactions_pending: false },
          ...(linked ? [{ id: "row-2", item_id: "item-tg", institution_name: "Tangerine", status: "active", transactions_pending: historyReady }] : []),
        ] }],
        exchange_token: () => { linked = true; return [200, { ok: true, item_id: "item-tg", institution_name: "Tangerine" }]; },
        get_accounts: (b) => (b.item_id === "item-tg"
          ? [200, { accounts: [{ id: "acct-tg", name: "Tangerine Chequing", type: "depository", subtype: "checking", mask: "4401", balance: { available: 1520.4, current: 1520.4, limit: null, currency: "CAD" } }] }]
          : expired()),
        get_transactions: (b) => (b.item_id === "item-tg"
          ? [200, historyReady ? { transactions: tangerineTxns(), removed: [], truncated: false, full: true, update_status: "HISTORICAL_UPDATE_COMPLETE" } : { transactions: [], removed: [], truncated: false, full: true, update_status: "NOT_READY" }]
          : expired()),
        enrich_transactions: () => [200, { enriched: [] }],
      };
      const { ctx, page, asked } = await open({ plaid, plaidMode: { success: true, public_token: "public-sandbox-tg", bank: "Tangerine" } });
      await page.clock.runFor(2500); await settle(page);
      await page.getByRole("button", { name: "Settings" }).first().click();
      await page.getByRole("button", { name: /Connect Another Bank|Connect a Bank/ }).first().click();
      await page.getByRole("button", { name: "Connect My Bank" }).click();
      await page.waitForFunction(() => (window.__plaidOpened || 0) >= 1, null, { timeout: 10000 }).catch(() => {});
      await settle(page, 1500);
      if (await page.getByRole("dialog").count()) t.ok(false, `5 no dialog after linking Tangerine: ${(await page.getByRole("dialog").first().innerText()).slice(0, 200)}`);
      // Back to Today.
      await page.getByRole("button", { name: "← Back" }).first().click();
      await settle(page, 800);
      await page.locator("[data-history-loading='loading']").first().waitFor({ timeout: 10000 }).catch(() => {});
      const before = await body(page);
      t.ok(/\[WORDS: balance-history-loading\] \(Tangerine\)/.test(before) && /\[WORDS: balance-history-loading-body\]/.test(before), "5a a new bank whose 90 days aren't ready: Today says the history is loading, for Tangerine");
      const n0 = asked.filter((b) => b.action === "get_transactions" && b.item_id === "item-tg").length;
      await page.clock.runFor(20500); await settle(page, 1200);
      const n1 = asked.filter((b) => b.action === "get_transactions" && b.item_id === "item-tg").length;
      t.ok(n1 > n0, `5b it asks again after 20 seconds (${n0} then ${n1})`);
      historyReady = true;
      await page.clock.runFor(20500); await settle(page, 1500);
      const after = await body(page);
      t.ok(!/balance-history-loading/.test(after), "5c once the 90 days are in, the loading card goes");
      const kept = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("flourish_v1") || "{}"); } catch { return {}; } });
      const txns = ((kept.appData || kept.core?.appData || {}).transactions || []).filter((x) => x.account_id === "acct-tg");
      t.ok(txns.length >= 10, `5d …and Tangerine's transactions are there (${txns.length})`);
      await ctx.close();
    }
  } catch (e) {
    t.ok(false, `browser run: ${e && e.message}`);
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("balanceTruth.browser");
})();
