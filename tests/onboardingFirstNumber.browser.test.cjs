// tests/onboardingFirstNumber.browser.test.cjs
// -----------------------------------------------------------------------------
// THE FIRST NUMBER, IN A BROWSER (onboarding, 2026-10-23). A new account, signed in, walks onboarding at 390 px
// to its first Safe to spend number, both ways, against a local build whose Supabase and functions are this
// test's own (tests/_mockSupabase.cjs; nothing reaches a real server) and a stand-in for Plaid's Link script:
//
//   manual    "Enter it myself": the balance, then paycheques with "When is your next payday?" (W1), bills,
//             "No debt, skip", the first number with "Welcome" (W5), "Here's your number." (W6), only the parts
//             in the number, and W2; Today with the tour first, then "Getting set up", and W3 with no estimate.
//   bank      Plaid links: pay and bills pre-filled from the bank's own transactions, payday not asked (the
//             deposits show it), the first number, counted as "linked".
//   cancel    Plaid closed: W4 with "Try again" and "Enter it myself", then a link that works.
//   error     Plaid failed: W4.
//   token     the link token could not be fetched: the main button is the retry, never "Ready".
//   confirm   the confirmation link lands on /confirmed with its session: a web signup goes on into the app
//             with no second sign-in; a signup made in a store app keeps "Open Flourish and sign in."
//   country   the country is the device's (a Canadian time zone is Canada; else a US time zone or region is the
//             US; else Canada), and it is what Plaid's institution search is asked for.
// And the counts: each step once, the bank link's outcomes, safe_view and first_number_shown on the first number,
// and no meeting_opened from the tour's Meet step. ONBOARDING_SHOTS=<dir> saves a screenshot of every screen.
//   founding  (audit H10 to H14, 2026-10-26) the whole founding path at 390 px and at 1440 px: the sign-up card in
//             the landing's brand with inline errors and no invite link, Create Account, the check-your-email state
//             (the address, the resend cooldown, Wrong email?), the confirmation link, the first number, the trial
//             countdown, and the upgrade screen with the founding price first and selected, a review step, and only
//             then checkout. And a signup_status check that fails: no beta code, a Try again that works.
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const MOCK = require("./_mockSupabase.cjs");

const ROOT = path.join(__dirname, "..");
const SHOTS = process.env.ONBOARDING_SHOTS || "";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".mp4": "video/mp4" };

const W1 = "When is your next payday?", W1_HELP = "Pick the date your next pay lands.";
const W2 = "The spending buffer starts after flourish has enough of your transactions to calculate it.";
const W3 = "From the numbers you entered. A linked bank can keep them up to date.";
const W4 = "Your bank wasn't connected. You can try again or enter your numbers yourself.";
const W6 = "Here's your number.";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// The bank's 90 days: pay every two weeks, rent and a streaming bill monthly, and everyday spending.
function bankTxns(today = new Date()) {
  const out = [];
  let id = 0;
  const push = (d, name, amount, category) => out.push({ id: `t${id++}`, date: iso(d), name, amount, category, pending: false, account_id: "acc-chq" });
  for (let k = 1; k <= 6; k++) push(addDays(today, -3 - 14 * (k - 1)), "ACME CORP PAYROLL", -2100, "INCOME");
  for (let m = 0; m < 3; m++) { push(addDays(today, -20 - 30 * m), "Landlord Rent", 1400, "RENT_AND_UTILITIES"); push(addDays(today, -12 - 30 * m), "Netflix", 16.99, "ENTERTAINMENT"); }
  for (let k = 1; k <= 40; k++) push(addDays(today, -k * 2), "Corner Grocery", 23 + (k % 5), "FOOD_AND_DRINK");
  return out;
}

// Plaid's Link script, as a stand-in: what open() does is set by window.__plaidMode before each tap.
const PLAID_STUB = `window.Plaid = { create: function (cfg) { return { open: function () {
  var m = window.__plaidMode || "success";
  setTimeout(function () {
    if (m === "success") cfg.onSuccess("public-test-token", { institution: { name: "Test Bank" } });
    else if (m === "cancel") cfg.onExit(null, { status: "requires_credentials" });
    else cfg.onExit({ error_code: "INTERNAL_SERVER_ERROR", error_message: "test" }, {});
  }, 30);
} }; } };`;

function buildApp(supabaseUrl) {
  if (process.env.ONBOARDING_DIST) return process.env.ONBOARDING_DIST;
  const out = tempDir("onboarding");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  return out;
}

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("ONBOARDING FIRST NUMBER (browser)"); return; }
  let dist = null;
  const server = http.createServer((req, res) => {
    if (MOCK.handle(req, res)) return;
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = buildApp(base);
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await playwright.chromium.launch();

  // A new account (signed in, no saved data), or, with signedIn false, nobody yet (the confirmation link).
  // A Canadian device unless a test says otherwise (Playwright's own default is en-US, which is the US).
  const open = async ({ token = "ok", signedIn = true, user = null, locale = "en-CA", timezoneId = "America/Toronto", desktop = false } = {}) => {
    const ctx = await browser.newContext({ viewport: desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1,
      isMobile: !desktop, hasTouch: !desktop, colorScheme: "light", locale, timezoneId });
    await ctx.addInitScript(([key, session, signedIn]) => { try {
      localStorage.setItem("flourish_theme", "light"); localStorage.setItem("flourish_theme_manual", "1");
      if (signedIn) localStorage.setItem(key, session);
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession()), signedIn]);
    const seen = { counts: [], plaid: [], tokenCalls: 0, tokenCountries: [], saved: [] };
    await ctx.route("**/rest/v1/user_data*", (r) => r.request().method() === "GET"
      ? r.fulfill({ status: 200, contentType: "application/json", body: /vnd\.pgrst\.object/.test(r.request().headers().accept || "") ? "null" : "[]" })
      : (seen.saved.push(r.request().postData() || ""), r.fulfill({ status: 201, contentType: "application/json", body: "[]" })));
    if (user) await ctx.route("**/auth/v1/user", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
    await ctx.route("**/api/coach", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
    await ctx.route("**/api/activation", (r) => { try { seen.counts.push(JSON.parse(r.request().postData() || "{}")); } catch {} return r.fulfill({ status: 204, body: "" }); });
    await ctx.route("https://cdn.plaid.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: PLAID_STUB }));
    await ctx.route("**/api/plaid", async (r) => {
      let body = {}; try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
      seen.plaid.push(body.action);
      const json = (status, b) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
      if (body.action === "create_link_token") { seen.tokenCalls++; seen.tokenCountries.push(body.country); return token === "fail" || (token === "fail-once" && seen.tokenCalls <= 3) ? json(502, { error: "plaid unavailable" }) : json(200, { link_token: "link-test-token" }); }
      if (body.action === "exchange_token") return json(200, { item_id: "item-test", institution_name: "Test Bank" });
      if (body.action === "get_accounts") return json(200, { accounts: [{ id: "acc-chq", name: "Chequing", mask: "1234", type: "depository", subtype: "checking", balance: { available: 3200, current: 3200, limit: null, currency: "CAD" } }] });
      if (body.action === "get_transactions") return json(200, { transactions: bankTxns(), removed: [], truncated: false, full: true });
      if (body.action === "list_items") return json(200, { items: [] });
      return json(200, {});
    });
    await ctx.route("**/api/**", (r) => r.fallback());
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e.message)));
    return { ctx, page, seen, errs };
  };

  let shotN = 0;
  const shot = async (page, name) => {
    if (!SHOTS) return;
    shotN++;
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SHOTS, `${String(shotN).padStart(2, "0")}-${name}.png`), fullPage: true });
  };
  const text = (page) => page.evaluate(() => document.body.innerText);
  const btn = (page, name) => page.getByRole("button", { name, exact: true }).last();
  const taps = [];
  const tap = async (page, name, note) => { await btn(page, name).click(); taps.push(note || name); await page.waitForTimeout(300); };

  // ── manual ──────────────────────────────────────────────────────────────────────────────────
  {
    const { ctx, page, seen, errs } = await open();
    taps.length = 0;
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await btn(page, "I Understand & Accept").waitFor({ timeout: 40000 });
    const started = Date.now();
    await shot(page, "manual-ai-disclosure");
    await tap(page, "I Understand & Accept");
    await btn(page, "Get Started →").waitFor();
    await shot(page, "manual-welcome");
    await tap(page, "Get Started →");
    const bank = await text(page);
    t.ok(/Link your accounts \(optional\)/.test(bank) && !/About you|Your name/.test(bank), "1a after Welcome: Link your accounts, with no \"About you\" screen before it");
    await shot(page, "manual-link-your-accounts");
    await tap(page, "Enter it myself");
    await page.getByPlaceholder("0.00").first().fill("2500"); taps.push("field: balance");
    await shot(page, "manual-balance");
    await tap(page, "Continue →", "Continue (balance)");
    const inc = await text(page);
    t.ok(/Your paycheques/.test(inc), "1b the balance, then the paycheques");
    const toggle = page.locator("[data-income-type-toggle]").first();
    t.ok(/^Income type · .*Employment \/ T4/.test((await toggle.innerText()).trim()) && await toggle.getAttribute("aria-expanded") === "false" && !/tap all that apply/.test(inc),
      "1c the income type is Employment by default, collapsed");
    await page.locator("[data-income-type-toggle]").first().click();
    t.ok((await text(page)).includes("tap all that apply") && await page.getByRole("button", { name: "Self-Employed" }).count() > 0, "1d …and the type chips are one tap away");
    await page.locator("[data-income-type-toggle]").first().click();
    t.ok(inc.includes(W1) && inc.includes(W1_HELP), "1e every two weeks (the default): W1 and its helper, word for word");
    const cont = page.getByRole("button", { name: "Continue →", exact: true }).last();
    await page.getByPlaceholder("e.g. 2100").first().fill("2100"); taps.push("field: pay amount");
    t.ok(await cont.isDisabled(), "1f Continue waits for the next payday");
    // The bill falls 3 days out (or on the 1st when that would pass the 28th, the field's limit) and payday 2 days
    // after it, so the bill is always strictly before payday. Payday was today + 5, which on the 27th to the 31st put
    // it on the same day as a bill moved to the 1st, and the bill dropped out of the number (failed 2026-10-27).
    const billOn = (() => { const d = addDays(new Date(), 3); return d.getDate() > 28 ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : d; })();
    const payday = iso(addDays(billOn, 2));
    await page.locator('input[type="date"]').first().fill(payday); taps.push("field: next payday");
    t.ok(await cont.isEnabled(), "1g …and goes once it is entered");
    await shot(page, "manual-paycheques");
    await page.locator("select[aria-label='How often']").first().selectOption("monthly");
    const monthly = await text(page);
    t.ok(!monthly.includes(W1) && monthly.includes("Day of the month you're paid"), "1h monthly pay keeps its day-of-month question, without W1");
    await page.locator("select[aria-label='How often']").first().selectOption("biweekly");
    await tap(page, "Continue →", "Continue (paycheques)");
    t.ok(/Your bills/.test(await text(page)), "1i then the bills");
    await page.getByPlaceholder("Netflix, Hydro, Rent…").first().fill("Rent"); taps.push("field: bill name");
    await page.locator('input[type="number"]').first().fill("1400"); taps.push("field: bill amount");
    await page.getByPlaceholder("1 to 28").first().fill(String(billOn.getDate())); taps.push("field: bill day");
    await shot(page, "manual-bills");
    await tap(page, "Continue →", "Continue (bills)");
    const debts = await text(page);
    t.ok(/Your debts/.test(debts) && debts.includes("No debt, skip") && debts.includes("Show me today's number →"), "1j then the debts, with \"No debt, skip\" and the way to the number");
    await shot(page, "manual-debts");
    await tap(page, "No debt, skip");
    await page.getByText(W6).first().waitFor();
    const first = await text(page);
    t.ok(!/credit score/i.test(first), "1k no credit-score screen before the number");
    t.ok(/^Welcome$/m.test(first) && !/Welcome, /.test(first), "1l with no name given, the greeting is \"Welcome\" (W5)");
    t.ok(first.includes(W6) && !/You're covered|breathing room/.test(first), "1m the headline is W6, not \"You're covered\"");
    const line = await page.locator("[data-first-number-line]").textContent();
    t.ok(/accounted for\./.test(line) && !/a spending buffer/.test(line) && line.includes(W2), `1n the sentence names only what is in the number, and W2 for the $0 buffer ("${line}")`);
    const elapsed = Date.now() - started;
    await shot(page, "manual-first-number");
    const firstTaps = taps.length;
    // The counts so far.
    await page.waitForTimeout(800);
    const steps = seen.counts.filter((c) => c.metric === "onboarding_step_completed").map((c) => c.detail);
    t.eq(steps, ["welcome", "balance", "bank", "income", "bills", "debts"], "1o each step counted once, in order");
    const fn = seen.counts.filter((c) => c.metric === "first_number_shown");
    t.ok(fn.length === 1 && fn[0].mode === "manual" && Number.isFinite(fn[0].fromSigninMs), "1p first_number_shown once, as \"manual\", with the time since sign-in");
    t.ok(seen.counts.some((c) => c.metric === "safe_view"), "1q safe_view fires on the first-number screen");
    t.ok(seen.counts.every((c) => !/@|2100|2500|Rent/.test(JSON.stringify(c))), "1r the counts carry no address, amount or name");
    // Today: the tour first, then the checklist.
    await page.getByRole("button", { name: /Take me to my dashboard|How is this calculated/ }).first().click();
    const dashBtn = page.getByRole("button", { name: /Take me to my dashboard/ });
    if (await dashBtn.count()) await dashBtn.first().click(); else await page.getByRole("button", { name: "Skip for now" }).click();
    await page.getByText("Step 1 of 5").first().waitFor();
    const today = await text(page);
    t.ok(!/Getting set up/.test(today), "1s Today opens with the tour, and no \"Getting set up\" while it shows");
    t.eq(await page.locator("#tour-body").innerText(), "Your number. What's safe to spend until payday, after bills due before payday and a savings amount are accounted for. Tap it to see the math.",
      "1s2 the tour's Today step names only the parts in this number, as the first-number screen did (no debt, no buffer yet)");
    for (let i = 0; i < 40 && !seen.saved.some((b) => b.includes('"profile"')); i++) await page.waitForTimeout(250);   // the save is debounced (2 s)
    const profiles = seen.saved.map((b) => { try { const j = JSON.parse(b); const row = Array.isArray(j) ? j[0] : j; const d = row && row.data; return d && d.core && d.core.appData && d.core.appData.profile; } catch { return null; } }).filter(Boolean);
    const prof = profiles[profiles.length - 1] || {};
    t.ok(profiles.length > 0 && prof.country === "CA" && prof.province === "" && !("status" in prof) && !("hasKids" in prof),
      `1s3 the saved profile: country CA, province unset, no status or kids assumed (${JSON.stringify({ country: prof.country, province: prof.province, status: prof.status, hasKids: prof.hasKids })})`);
    t.ok(today.includes(W3) && !/overspending|Estimate · Based on your setup|to work with/.test(today), "1t W3 for no bank, and no estimate built on an assumed spend rate");
    await shot(page, "manual-today-tour");
    for (let i = 0; i < 4; i++) { await page.getByRole("button", { name: "Next →" }).last().click(); await page.waitForTimeout(500); }
    t.ok(!seen.counts.some((c) => c.metric === "meeting_opened"), "1u the tour's Meet step does not count as a meeting opened");
    await page.getByRole("button", { name: /Done|Finish|Got it/ }).last().click();
    await page.getByRole("button", { name: "Today" }).last().click().catch(() => {});
    await page.getByText("Getting set up").first().waitFor({ timeout: 8000 }).catch(() => {});
    t.ok(/Getting set up/.test(await text(page)), "1v once the tour ends, \"Getting set up\" shows");
    await shot(page, "manual-today-after-tour");
    t.eq(errs, [], "1w no page errors");
    console.log(`  manual: ${firstTaps} taps and fields to the first number in ${(elapsed / 1000).toFixed(1)} s (by the test, screenshots included): ${taps.slice(0, firstTaps).join(", ")}`);
    await ctx.close();
  }

  // ── bank ────────────────────────────────────────────────────────────────────────────────────
  {
    const { ctx, page, seen, errs } = await open();
    taps.length = 0;
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await btn(page, "I Understand & Accept").waitFor({ timeout: 40000 });
    const started = Date.now();
    await tap(page, "I Understand & Accept");
    await tap(page, "Get Started →");
    await page.locator('[data-bank-button="connect"]').waitFor();
    await shot(page, "bank-link-your-accounts");
    await page.locator('[data-bank-button="connect"]').click(); taps.push("Connect My Bank Securely");
    await page.waitForTimeout(400);
    await shot(page, "bank-consent");
    await page.evaluate(() => { window.__plaidMode = "success"; });
    await tap(page, "Connect My Bank", "Connect My Bank (consent)");
    taps.push("(Plaid: choose the bank, sign in, pick accounts)");
    await page.getByText("Connected!").first().waitFor();
    await shot(page, "bank-connected");
    await tap(page, "Let's go →");
    const inc = await text(page);
    t.ok(inc.includes("We detected your income from your transactions. Confirm or adjust below.") && await page.getByPlaceholder("e.g. 2100").first().inputValue() === "2100",
      "2a the pay is pre-filled from the bank's deposits, to confirm");
    t.ok(!inc.includes(W1), "2b payday is not asked: the deposits show it");
    await shot(page, "bank-paycheques");
    await tap(page, "Continue →", "Continue (paycheques)");
    const bills = await text(page);
    t.ok(/We found \d+ recurring bills? from your transactions/.test(bills) || /Auto-detected/.test(bills), "2c the bills are pre-filled from the bank, to confirm");
    await shot(page, "bank-bills");
    await tap(page, "Continue →", "Continue (bills)");
    await tap(page, "No debt, skip");
    await page.getByText(W6).first().waitFor();
    const elapsed = Date.now() - started;
    await shot(page, "bank-first-number");
    const firstTaps = taps.length;
    await page.waitForTimeout(800);
    const fn = seen.counts.filter((c) => c.metric === "first_number_shown");
    t.ok(fn.length === 1 && fn[0].mode === "linked", "2d first_number_shown once, as \"linked\"");
    t.eq(seen.counts.filter((c) => /^bank_link_/.test(c.metric)).map((c) => c.metric), ["bank_link_started", "bank_link_completed"], "2e the bank link: started, then completed");
    t.eq(seen.counts.filter((c) => c.metric === "onboarding_step_completed").map((c) => c.detail), ["welcome", "bank", "income", "bills", "debts"], "2f the steps, with no balance step on the bank path");
    t.eq(errs, [], "2g no page errors");
    console.log(`  bank: ${firstTaps} taps to the first number in ${(elapsed / 1000).toFixed(1)} s (by the test, screenshots included): ${taps.slice(0, firstTaps).join(", ")}`);
    await ctx.close();
  }

  // ── cancel and error ────────────────────────────────────────────────────────────────────────
  for (const mode of ["cancel", "error"]) {
    const { ctx, page, seen } = await open();
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await btn(page, "I Understand & Accept").waitFor({ timeout: 40000 });
    await btn(page, "I Understand & Accept").click();
    await btn(page, "Get Started →").click();
    await page.locator('[data-bank-button="connect"]').click();
    await page.evaluate((m) => { window.__plaidMode = m; }, mode);
    await btn(page, "Connect My Bank").click();
    await page.locator("[data-bank-outcome]").waitFor();
    const w4 = await text(page);
    t.ok(w4.includes(W4) && await page.getByRole("button", { name: "Try again", exact: true }).count() === 1 && await page.getByRole("button", { name: "Enter it myself", exact: true }).count() === 1
      && await page.locator("[data-bank-button]").count() === 0,
      `3a Plaid ${mode === "cancel" ? "closed" : "failed"}: W4, with "Try again" and "Enter it myself", and no second connect or "Enter it myself" button`);
    t.eq(seen.counts.filter((c) => /^bank_link_/.test(c.metric)).map((c) => c.metric), ["bank_link_started", mode === "cancel" ? "bank_link_cancelled" : "bank_link_failed"],
      `3b counted as ${mode === "cancel" ? "cancelled" : "failed"}`);
    if (mode === "cancel") {
      await shot(page, "bank-cancelled-w4");
      await page.evaluate(() => { window.__plaidMode = "success"; });
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await page.getByText("Connected!").first().waitFor();
      t.ok(true, "3c \"Try again\" opens Plaid again, and the link goes through");
    } else {
      await page.getByRole("button", { name: "Enter it myself", exact: true }).first().click();
      t.ok(/Your chequing balance/.test(await text(page)), "3d \"Enter it myself\" goes to the balance");
    }
    await ctx.close();
  }

  // ── link token ──────────────────────────────────────────────────────────────────────────────
  {
    const { ctx, page } = await open({ token: "fail-once" });
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await btn(page, "I Understand & Accept").waitFor({ timeout: 40000 });
    await btn(page, "I Understand & Accept").click();
    await btn(page, "Get Started →").click();
    await page.locator('[data-bank-button="retry"]').waitFor({ timeout: 15000 });
    const label = (await page.locator("[data-bank-button]").textContent()).trim();
    t.ok(label === "↺ Retry" && await page.locator("[data-bank-button]").isEnabled() && !/\bReady\b/.test(await text(page)), `4a after a link-token error the main button is the retry ("${label}"), never "Ready"`);
    await shot(page, "bank-token-error");
    await page.locator('[data-bank-button="retry"]').click();
    await page.locator('[data-bank-button="connect"]').waitFor({ timeout: 15000 });
    t.ok(true, "4b the retry fetches a token and the button becomes \"Connect My Bank Securely →\"");
    await ctx.close();
  }

  // ── the device's country, and Plaid's search ────────────────────────────────────────────────
  for (const [locale, timezoneId, want] of [["en-CA", "America/Toronto", "CA"], ["fr-CA", "America/Vancouver", "CA"], ["en-US", "America/Toronto", "CA"], ["en-US", "America/New_York", "US"], ["en-CA", "America/Chicago", "US"]]) {
    const { ctx, page, seen } = await open({ locale, timezoneId });
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await btn(page, "I Understand & Accept").waitFor({ timeout: 40000 });
    await btn(page, "I Understand & Accept").click();
    await btn(page, "Get Started →").click();
    await page.locator('[data-bank-button="connect"]').waitFor();
    t.eq([...new Set(seen.tokenCountries)], [want], `6a a ${locale} device in ${timezoneId}: the country is ${want}, and Plaid's institution search is asked for ${want}`);
    if (want === "US") {
      await page.getByRole("button", { name: "Enter it myself", exact: true }).last().click();
      t.ok(/checking/i.test(await text(page)) && !/chequing/i.test(await text(page)), "6b …and the balance it asks for is a US checking balance");
    }
    await ctx.close();
  }

  // ── the confirmation link ───────────────────────────────────────────────────────────────────
  {
    const s = MOCK.makeSession();
    const hash = `#access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=${s.expires_in}&refresh_token=${s.refresh_token}&token_type=bearer&type=signup`;
    const web = await open({ signedIn: false, user: { ...s.user, user_metadata: { signup_platform: "web" } } });
    await web.page.goto(base + "/confirmed" + hash, { waitUntil: "domcontentloaded" });
    await btn(web.page, "I Understand & Accept").waitFor({ timeout: 40000 });
    t.ok(!/Open Flourish and sign in/.test(await text(web.page)) && new URL(web.page.url()).pathname === "/", "5a a web signup's confirmation link signs them in and goes on into the app, at \"/\", with no second sign-in");
    await web.ctx.close();
    const app = await open({ signedIn: false, user: { ...s.user, user_metadata: { signup_platform: "app" } } });
    await app.page.goto(base + "/confirmed" + hash, { waitUntil: "domcontentloaded" });
    await app.page.getByText("Open Flourish and sign in.").waitFor({ timeout: 40000 });
    t.ok(true, "5b a signup made in a store app keeps \"You're confirmed. Open Flourish and sign in.\"");
    await app.ctx.close();
  }


  // ── the founding path (audit H10 to H14) ────────────────────────────────────────────────────────
  for (const desktop of [false, true]) {
    const w = desktop ? "1440" : "390";
    const s0 = MOCK.makeSession();
    const { ctx, page, errs } = await open({ signedIn: false, desktop, user: { ...s0.user, user_metadata: { signup_platform: "web" } } });
    const beta = [], billing = [];
    let statusFails = 0;
    await ctx.route("**/api/beta", async (r) => {
      let body = {}; try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
      beta.push(body);
      const json = (status, b) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
      if (body.action === "signup_status") return statusFails-- > 0 ? r.fulfill({ status: 503, contentType: "text/html", body: "<html>busy</html>" }) : json(200, { openSignup: true });
      if (body.action === "signup") return json(200, { ok: true, source: "self_serve", needsConfirmation: true, sent: true });
      if (body.action === "resend_confirmation") return json(200, { ok: true });
      return json(200, {});
    });
    await ctx.route("**/api/billing", async (r) => {
      let body = {}; try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
      billing.push(body);
      const json = (status, b) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
      if (body.action === "status") return json(200, { enabled: true, paid: false, founding: { available: true, cohortLimit: 50 } });
      if (body.action === "create_checkout_session") return json(200, { url: base + "/__checkout_stub" });
      return json(200, {});
    });
    await ctx.route("**/__checkout_stub", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html><body>checkout stub</body></html>" }));

    // The landing, then Try free: the card is the landing's cream and white, on the Sign Up tab, with no invite link.
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Try flourish free for 14 days" }).first().click({ timeout: 40000 });
    await page.locator("[data-auth-card]").waitFor();
    await page.waitForTimeout(600);
    const card = await page.locator("[data-auth-card]").evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, page: getComputedStyle(el.parentElement.parentElement).backgroundColor }));
    t.eq(card, { bg: "rgb(255, 255, 255)", page: "rgb(253, 246, 236)" }, `F1a ${w}: the sign-up card is white on the landing's cream (H11)`);
    const signupTxt = await text(page);
    t.ok(!/invite code|Beta access code/i.test(signupTxt) && beta.some((b) => b.action === "signup_status"), `F1b ${w}: signup is open: no invite link and no code field (H11)`);
    // Inline errors once a field is left.
    await page.getByPlaceholder("Email address").fill("sam@");
    await page.getByPlaceholder("Password (min 8 characters)").fill("12345");
    await page.getByPlaceholder("Email address").click();
    await page.waitForTimeout(200);
    const errsShown = await page.locator("[data-field-error]").evaluateAll((els) => els.map((e) => e.getAttribute("data-field-error")));
    t.eq(errsShown.sort(), ["email", "password"], `F1c ${w}: "sam@" and a 5-character password, once left: an error under each (H11)`);
    t.eq(await page.getByPlaceholder("Email address").getAttribute("aria-invalid"), "true", `F1d ${w}: …and the field says it is invalid`);
    await shot(page, `founding-${w}-signup-errors`);
    // A tap on Create Account while a field is wrong submits nothing. (It is aria-disabled, not disabled, so the tap
    // still lands and shows the errors; Playwright treats aria-disabled as disabled, hence force.)
    await btn(page, "Create Account").click({ force: true });
    t.ok(!beta.some((b) => b.action === "signup"), `F1e ${w}: Create Account with a wrong field sends nothing`);
    await page.getByPlaceholder("Email address").fill("sam@example.invalid");
    await page.getByPlaceholder("Password (min 8 characters)").fill("a-long-enough-password");
    await page.getByPlaceholder("Email address").click();
    await page.waitForTimeout(200);
    t.eq(await page.locator("[data-field-error]").count(), 0, `F1f ${w}: corrected, the errors go`);
    await shot(page, `founding-${w}-signup-filled`);

    // Create Account: the check-your-email state, not Log In (H10).
    await btn(page, "Create Account").click();
    await page.locator("[data-check-email]").waitFor();
    const ce = await page.locator("[data-auth-card]").innerText();
    t.ok(ce.includes("Check your email") && (await page.locator("[data-check-email-address]").innerText()) === "sam@example.invalid",
      `F2a ${w}: "Check your email", naming the address the mail went to (H10)`);
    t.ok(!/Welcome back/.test(await text(page)) && await page.getByRole("button", { name: "Log In", exact: true }).count() === 0,
      `F2b ${w}: no "Welcome back" and no Log In button`);
    const resend = page.getByRole("button", { name: /^Resend in \d+s$/ });
    t.ok(await resend.count() === 1 && await resend.isDisabled(), `F2c ${w}: the resend waits out its cooldown ("${await resend.innerText().catch(() => "")}")`);
    t.ok(await page.getByRole("button", { name: "Wrong email? Start over" }).count() === 1, `F2d ${w}: and "Wrong email? Start over" is there`);
    await shot(page, `founding-${w}-check-email`);
    await page.getByRole("button", { name: "Wrong email? Start over" }).click();
    t.eq(await page.getByPlaceholder("Email address").inputValue(), "sam@example.invalid", `F2e ${w}: Wrong email? goes back to the form, with the address there to fix`);
    await page.getByPlaceholder("Email address").fill("sam@example.org");
    await btn(page, "Create Account").click();
    await page.locator("[data-check-email]").waitFor();
    t.eq(await page.locator("[data-check-email-address]").innerText(), "sam@example.org", `F2f ${w}: the corrected address is the one named`);
    t.eq(beta.filter((b) => b.action === "signup").map((b) => b.email), ["sam@example.invalid", "sam@example.org"], `F2g ${w}: one signup per Create Account`);

    // The confirmation link: into the app, then onboarding to the first number.
    const hash = `#access_token=${s0.access_token}&expires_at=${s0.expires_at}&expires_in=${s0.expires_in}&refresh_token=${s0.refresh_token}&token_type=bearer&type=signup`;
    await page.goto(base + "/confirmed" + hash, { waitUntil: "domcontentloaded" });
    await btn(page, "I Understand & Accept").waitFor({ timeout: 40000 });
    await btn(page, "I Understand & Accept").click();
    await btn(page, "Get Started →").click();
    await page.getByRole("button", { name: "Enter it myself", exact: true }).last().click();
    await page.getByPlaceholder("0.00").first().fill("2500");
    await btn(page, "Continue →").click();
    const billOn = (() => { const d = addDays(new Date(), 3); return d.getDate() > 28 ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : d; })();
    await page.getByPlaceholder("e.g. 2100").first().fill("2100");
    await page.locator('input[type="date"]').first().fill(iso(addDays(billOn, 2)));
    await btn(page, "Continue →").click();
    await page.getByPlaceholder("Netflix, Hydro, Rent…").first().fill("Rent");
    await page.locator('input[type="number"]').first().fill("1400");
    await page.getByPlaceholder("1 to 28").first().fill(String(billOn.getDate()));
    await btn(page, "Continue →").click();
    await btn(page, "No debt, skip").click();
    await page.getByText(W6).first().waitFor();
    t.ok(true, `F3a ${w}: the first number`);
    await shot(page, `founding-${w}-first-number`);

    // Today: the trial countdown (H13), in the trial's words, and not "Flourish Plus".
    await page.getByRole("button", { name: /Take me to my dashboard|How is this calculated/ }).first().click();
    const dash = page.getByRole("button", { name: /Take me to my dashboard/ });
    if (await dash.count()) await dash.first().click();
    await page.locator("[data-trial-countdown]").first().waitFor({ timeout: 15000 });
    const cd = await page.locator("[data-trial-countdown]").first().innerText();
    t.ok(/^13 days left in your trial\s*Upgrade →$/.test(cd.replace(/\n/g, " ").trim()) || /13 days left in your trial/.test(cd), `F4a ${w}: the countdown: "13 days left in your trial" with Upgrade → (H13) ("${cd.replace(/\n/g, " ")}")`);
    t.eq(await page.locator("[data-trial-countdown]").count(), 1, `F4b ${w}: one countdown`);
    t.ok(!/✦ Flourish Plus/.test(await text(page)), `F4c ${w}: the trial household is not called "Flourish Plus"`);
    await page.getByText("Step 1 of 5").first().waitFor({ timeout: 8000 }).catch(() => {});
    const skip = page.getByRole("button", { name: "Skip", exact: true });
    if (await skip.count()) { await skip.last().click(); await page.waitForTimeout(500); }
    await page.getByText("Safe until next payday").first().waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1200);       // the cards fade in
    await shot(page, `founding-${w}-today-countdown`);

    // Upgrade: the founding price first and selected; Continue; the review; only then checkout (H14).
    await page.locator("[data-trial-countdown]").first().getByRole("button", { name: "Upgrade →" }).click();
    await page.locator("[data-plan-choice]").first().waitFor();
    const rows = await page.locator("[data-plan-choice]").evaluateAll((els) => els.map((e) => e.getAttribute("data-plan-choice") + (e.querySelector("input").checked ? "*" : "")));
    t.eq(rows, ["founding_annual*", "monthly", "annual"], `F5a ${w}: founding first, and selected`);
    t.ok(await page.locator("[data-upgrade-trial]").count() === 1 && /\[WORDS: upgrade-trial-ends: /.test(await page.locator("[data-upgrade-trial]").innerText()), `F5b ${w}: the trial line, with its end date`);
    await shot(page, `founding-${w}-upgrade-plans`);
    await page.locator('[data-plan-choice="monthly"]').click();
    t.eq(await page.locator('[data-plan-choice="monthly"] input').isChecked(), true, `F5c ${w}: a tap on a row selects it`);
    t.ok(!billing.some((b) => b.action === "create_checkout_session"), `F5d ${w}: …and starts no checkout`);
    await page.locator('[data-plan-choice="founding_annual"]').click();
    await page.locator("[data-upgrade-continue]").click();
    await page.locator("[data-upgrade-review]").waitFor();
    t.eq(await page.locator("[data-review-plan]").getAttribute("data-review-plan"), "founding_annual", `F5e ${w}: Continue opens the review, for the chosen plan`);
    t.ok(!billing.some((b) => b.action === "create_checkout_session"), `F5f ${w}: still no checkout`);
    await shot(page, `founding-${w}-upgrade-review`);
    await page.getByRole("button", { name: "← Back", exact: true }).click();
    await page.locator("[data-plan-choice]").first().waitFor();
    t.eq(await page.locator('[data-plan-choice="founding_annual"] input').isChecked(), true, `F5g ${w}: Back keeps the choice`);
    await page.locator("[data-upgrade-continue]").click();
    await page.locator("[data-review-confirm]").click();
    await page.waitForURL(/__checkout_stub/, { timeout: 15000 });
    t.eq(billing.filter((b) => b.action === "create_checkout_session").map((b) => b.plan_key), ["founding_annual"], `F5h ${w}: the review's confirm starts one checkout, posting only the plan key`);
    t.eq(errs, [], `F6 ${w}: no page errors`);
    await ctx.close();
  }

  // ── signup_status cannot be checked (audit H12) ─────────────────────────────────────────────────
  {
    const { ctx, page, errs } = await open({ signedIn: false });
    let fails = 99, asks = 0;
    await ctx.route("**/api/beta", async (r) => {
      let body = {}; try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
      if (body.action === "signup_status") { asks++; return fails-- > 0 ? r.fulfill({ status: 503, contentType: "text/html", body: "<html>busy</html>" }) : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ openSignup: true }) }); }
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Try flourish free for 14 days" }).first().click({ timeout: 40000 });
    await page.locator('[data-signup-status="unavailable"]').waitFor({ timeout: 20000 });
    t.eq(asks, 3, "U1a the check is tried three times before the screen says it failed");
    const u = await text(page);
    t.ok(!/Beta access code|invite code/i.test(u), "U1b no beta code is asked for on an error");
    t.ok(u.includes("[WORDS: signup-status-unavailable]") && await page.getByRole("button", { name: "Try again", exact: true }).count() === 1, "U1c the line, and Try again");
    await page.getByPlaceholder("Email address").fill("sam@example.org");
    await page.getByPlaceholder("Password (min 8 characters)").fill("a-long-enough-password");
    t.eq(await btn(page, "Create Account").getAttribute("aria-disabled"), "false", "U1d Create Account still works (the server decides)");
    await shot(page, "founding-390-signup-status-unavailable");
    fails = 0;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.locator('[data-signup-status="unavailable"]').waitFor({ state: "detached", timeout: 10000 });
    t.ok(asks === 4 && !/Beta access code|invite code/i.test(await text(page)), "U1e Try again asks again; answered open, the line goes and still no code");
    t.eq(errs, [], "U1f no page errors");
    await ctx.close();
  }

  await browser.close(); server.close();
  t.summary("ONBOARDING FIRST NUMBER (browser)");
})();
