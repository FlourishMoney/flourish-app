// tests/freeV1Web.browser.test.cjs
// -----------------------------------------------------------------------------
// FREE V1 ON THE WEBSITE, IN A BROWSER (2026-11-23). A local website build at 390 px, its Supabase and functions this
// test's own (tests/_mockSupabase.cjs and the routes below; nothing reaches a real server), plans first switched on:
//
//   free      a new account with no plan (the server refuses a new bank: 402 plan_limit, as plaid.js now answers):
//             onboarding's bank step shows the free-bank line and its button, never "Couldn't reach your bank" and
//             never the Retry; the statement and "Enter it myself" still work; the button opens the plans, which close
//             back to the bank step; Plaid is never opened.
//   setup     the same account set up by hand: after the first number and the bills step the plans open once and
//             close onto Free (the app, not a wall); a reload does not open them again; Settings' "+ Connect a Bank"
//             shows the free-bank line with its button, which opens the plans.
//   paid      a paying account: the bank step is today's (the Connect button, the link token used), no free line.
//   late      review round 1 (Gemini, ChatGPT): the app already knows the account is paid, but the server's first answer
//             is the free plan's refusal (its subscription not landed there yet): the refusal is stale, the step asks
//             once more with a fresh link token, and today's Connect button shows.
//   disagree  the app says paid and the server keeps refusing: the step asks once more, never in a loop, and the
//             free-bank line stays.
//   sdk       review round 1 (ChatGPT): Plaid's script fails while a Free account is at the bank step: only the
//             free-bank line shows, never "Plaid SDK failed to load" beside it.
// The words are the slots in src/lib/freeWords.js, read from the file (placeholders until the words are pasted in).
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
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".mp4": "video/mp4" };

const FRW = fs.readFileSync(path.join(ROOT, "src", "lib", "firstRunWords.js"), "utf8");
const word = (k) => (FRW.match(new RegExp(`\\b${k}: "([^"]+)"`)) || [])[1];
const SHOW_NUMBER = word("showNumber"), NOT_NOW = word("notNow"), GET_STARTED = word("getStarted");
const W6 = "Here's your number.";
const UF = fs.readFileSync(path.join(ROOT, "src", "lib", "upgradeFlow.js"), "utf8");
const PLANS_HEADLINE = (UF.match(/headline: "([^"]+)"/) || [])[1];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const PLAID_STUB = `window.__plaidOpens = 0; window.Plaid = { create: function (cfg) { return { open: function () { window.__plaidOpens++; setTimeout(function () { cfg.onExit(null, {}); }, 30); } }; } };`;

function buildApp(supabaseUrl) {
  if (process.env.FREE_V1_DIST) return process.env.FREE_V1_DIST;
  const out = tempDir("free-v1-web");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  return out;
}

(async () => {
  const t = create();
  const { FREE_WORDS } = await import("../src/lib/freeWords.js");
  const LINE = FREE_WORDS["free-bank-line"], BUTTON = FREE_WORDS["free-bank-button"], CLOSE = FREE_WORDS["free-plans-close"];
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("FREE V1 WEB (browser)"); return; }
  let dist = null;
  const server = http.createServer((req, res) => {
    if (MOCK.handle(req, res)) return;
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "app.html");
    if (!fs.existsSync(f)) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = buildApp(base);
  const browser = await playwright.chromium.launch();

  // who: "free" (no plan: the server refuses a new bank) or "paid". opts.link: the link-token answers in order (402 the
  // free plan's refusal, 200 a token; the last repeats); opts.plaidScript "fail": Plaid's script cannot load.
  const open = async (who, opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light", locale: "en-CA", timezoneId: "America/Toronto" });
    await ctx.addInitScript(([key, session]) => { try {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("flourish_theme", "light"); localStorage.setItem("flourish_theme_manual", "1");
      localStorage.setItem("flourish_tour_done", "1");
      localStorage.setItem(key, session);
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession())]);
    await ctx.addInitScript(() => { window.addEventListener("error", (e) => { if (e.target && /cdn\.plaid\.com/.test(String(e.target.src || ""))) window.__plaidScriptFailed = true; }, true); });
    const seen = { plaid: [], billing: [], saved: null };
    const tpf = { trial_plan_first: { on: true, trial_days: 14, account_trial: false, web_trial_eligible: true, trialing: false, trial_ends: null } };
    await ctx.route("**/rest/v1/user_data*", (r) => {
      if (r.request().method() !== "GET") { try { seen.saved = JSON.parse(r.request().postData() || "null"); } catch {} return r.fulfill({ status: 201, contentType: "application/json", body: "[]" }); }
      const obj = /vnd\.pgrst\.object/.test(r.request().headers().accept || "");
      const row = seen.saved ? (Array.isArray(seen.saved) ? seen.saved[0] : seen.saved) : null;
      const out = row && row.data ? { data: row.data, updated_at: new Date().toISOString() } : null;
      return r.fulfill({ status: 200, contentType: "application/json", body: obj ? JSON.stringify(out) : JSON.stringify(out ? [out] : []) });
    });
    await ctx.route("https://cdn.plaid.com/**", async (r) => { if (opts.plaidScript === "fail") { await new Promise((ok) => setTimeout(ok, 9000)); return r.abort().catch(() => {}); } return r.fulfill({ status: 200, contentType: "text/javascript", body: PLAID_STUB }); });
    const linkAnswers = (opts.link || [who === "paid" ? 200 : 402]).slice();
    await ctx.route("**/api/**", async (r) => {
      const req = r.request(), u = new URL(req.url()), name = u.pathname.slice(5);
      let body = {}; try { body = JSON.parse(req.postData() || "{}"); } catch {}
      const json = (status, b) => r.fulfill({ status, contentType: "application/json", body: b === undefined ? "" : JSON.stringify(b) });
      if (name === "trial-plan-first") return json(200, { on: true, since: new Date(Date.now() - 5 * 86400e3).toISOString() });
      if (name === "billing") {
        seen.billing.push(body.action);
        if (body.action === "status") return json(200, who === "paid"
          ? { enabled: true, paid: true, provider: "stripe", plan_key: "annual", status: "active", period_end: new Date(Date.now() + 300 * 86400e3).toISOString(), ...tpf }
          : { enabled: true, paid: false, ...tpf });
        return json(404, { error: "not_found" });
      }
      if (name === "plaid") {
        seen.plaid.push(body.action + (body.item_id ? ":update" : ""));
        if (body.action === "create_link_token") {
          const status = linkAnswers.length > 1 ? linkAnswers.shift() : linkAnswers[0];
          return status === 200 ? json(200, { link_token: `link-sandbox-test-${seen.plaid.length}` }) : json(402, { error: "plan_limit", message: "server words" });
        }
        if (body.action === "list_items") return json(200, { items: [] });
        return json(200, {});
      }
      if (name === "beta") return json(200, body.action === "signup_status" ? { openSignup: true } : {});
      if (name === "coach") return json(200, { ok: true });
      if (name === "activation" || name === "attribution") return r.fulfill({ status: 204, body: "" });
      return json(404, { error: "not_found" });
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e.message)));
    return { ctx, page, seen, errs };
  };
  const text = (page) => page.evaluate(() => document.body.innerText);
  const btn = (page, name) => page.getByRole("button", { name, exact: true }).last();
  const tap = async (page, name) => { await btn(page, name).click(); await page.waitForTimeout(300); };
  const toBankStep = async (page) => {
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await btn(page, "I Understand & Accept").waitFor({ timeout: 40000 });
    await tap(page, "I Understand & Accept");
    await btn(page, GET_STARTED).waitFor();
    await tap(page, GET_STARTED);
    await page.getByText("Link your accounts (optional)").first().waitFor();
  };
  const byHand = async (page) => {
    await tap(page, "Enter it myself");
    await page.getByPlaceholder("0.00").first().fill("2500");
    await tap(page, "Continue →");
    await page.getByPlaceholder("e.g. 2100").first().fill("2100");
    await page.locator('input[type="date"]').first().fill(iso(addDays(new Date(), 6)));
    await tap(page, SHOW_NUMBER);
    await page.getByText(W6).first().waitFor();
    await page.getByRole("button", { name: /Take me to my dashboard|How is this calculated/ }).first().click();
    const dash = page.getByRole("button", { name: /Take me to my dashboard/ });
    if (await dash.count()) await dash.first().click();
    await btn(page, NOT_NOW).waitFor();
    await tap(page, NOT_NOW);
  };

  // Each scenario: a step that times out is a failure with its message, and its browser context always closes.
  const scenario = async (name, who, fn, opts) => {
    const o = await open(who, opts);
    try { await fn(o); } catch (e) { t.ok(false, `${name}: ${String(e && e.message || e).split("\n")[0]}`); }
    finally { await o.ctx.close().catch(() => {}); }
  };

  // ── free: onboarding's bank step ───────────────────────────────────────────────────────────────
  await scenario("free", "free", async ({ page, seen, errs }) => {
    await toBankStep(page);
    await page.locator("[data-free-bank]").waitFor();
    const s = await text(page);
    t.ok(s.includes(LINE), "1a a Free account at the bank step: the free-bank line");
    t.ok(!/Couldn.t reach your bank/.test(s) && await page.getByRole("button", { name: /Retry/ }).count() === 0, "1b …never \"Couldn't reach your bank\", and no Retry");
    t.eq(await page.locator("[data-bank-button]").count(), 0, "1c …and no Connect button that cannot work");
    t.ok(await btn(page, "Enter it myself").count() === 1 && await page.locator('input[type="file"]').count() === 1, "1d the statement and \"Enter it myself\" are still there");
    t.eq(seen.plaid.filter((a) => a === "create_link_token").length >= 1, true, "1e (not vacuous: the link token was asked and refused)");
    await tap(page, BUTTON);
    await btn(page, CLOSE).waitFor();
    const plans = await text(page);
    t.ok(plans.includes(PLANS_HEADLINE), `1f the button opens the plans ("${PLANS_HEADLINE}")`);
    await tap(page, CLOSE);
    await page.getByText("Link your accounts (optional)").first().waitFor();
    t.ok((await text(page)).includes(LINE), "1g closing the plans goes back to the bank step");
    t.eq(await page.evaluate(() => window.__plaidOpens || 0), 0, "1h Plaid was never opened");
    t.eq(errs, [], "1i no page errors");
  });

  // ── setup: by hand, the plans once, then Free; Settings' Connect a Bank ─────────────────────────
  await scenario("setup", "free", async ({ page, errs }) => {
    await toBankStep(page);
    await page.locator("[data-free-bank]").waitFor();
    await byHand(page);
    await btn(page, CLOSE).waitFor();
    const plans = await text(page);
    t.ok(plans.includes(PLANS_HEADLINE) && !/^Sign out$/m.test(plans), "2a after setting up, the plans open once, and can be closed (no wall, no sign-out way out)");
    await tap(page, CLOSE);
    await page.getByRole("button", { name: "Settings" }).first().waitFor();
    t.ok(!(await text(page)).includes(PLANS_HEADLINE), "2b closing them lands in the app, on Free");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Settings" }).first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(2500);
    t.ok(!(await text(page)).includes(PLANS_HEADLINE), "2c a reload does not open them again");
    await page.getByRole("button", { name: "Settings" }).first().click();
    await page.getByRole("button", { name: "+ Connect a Bank" }).first().click();
    const consent = page.getByRole("button", { name: "Connect My Bank", exact: true });
    if (await consent.count()) await consent.first().click();
    await page.getByText(LINE).first().waitFor();
    t.ok(!/Could not start bank connection/.test(await text(page)), "2d Settings' + Connect a Bank on Free: the free-bank line, not \"Could not start bank connection\"");
    // The box's own button: Settings' plan card behind it has a "See plans" button too.
    await page.getByRole("dialog").filter({ hasText: LINE }).getByRole("button", { name: BUTTON, exact: true }).click();
    await page.waitForTimeout(300);
    await btn(page, CLOSE).waitFor();
    t.ok((await text(page)).includes(PLANS_HEADLINE), "2e …and its button opens the plans");
    await tap(page, CLOSE);
    t.eq(await page.evaluate(() => window.__plaidOpens || 0), 0, "2f Plaid was never opened");
    t.eq(errs, [], "2g no page errors");
  });

  // ── paid: today's bank step ─────────────────────────────────────────────────────────────────────
  await scenario("paid", "paid", async ({ page, seen, errs }) => {
    await toBankStep(page);
    await page.locator('[data-bank-button="connect"]').waitFor();
    const s = await text(page);
    t.ok(!s.includes(LINE) && await page.locator("[data-free-bank]").count() === 0, "3a a paying account: no free-bank line");
    t.ok(/Connect My Bank Securely/.test(s) && seen.plaid.includes("create_link_token"), "3b …today's Connect button, with its link token");
    t.eq(errs, [], "3c no page errors");
  });

  // ── late: paid in the app, the server's first answer a stale refusal ───────────────────────────────
  await scenario("late", "paid", async ({ page, seen, errs }) => {
    await toBankStep(page);
    await page.locator('[data-bank-button="connect"]').waitFor();
    const s = await text(page);
    t.eq(seen.plaid.filter((a) => a === "create_link_token").length, 2, "4a a stale refusal for a paid account: the link token is asked once more");
    t.ok(!s.includes(LINE) && await page.locator("[data-free-bank]").count() === 0, "4b …the free-bank line goes");
    t.ok(/Connect My Bank Securely/.test(s) && !/Couldn.t reach your bank/.test(s), "4c …and today's Connect button shows, with no error");
    t.eq(errs, [], "4d no page errors");
  }, { link: [402, 200] });

  // ── disagree: paid in the app, the server keeps refusing ──────────────────────────────────────────
  await scenario("disagree", "paid", async ({ page, seen, errs }) => {
    await toBankStep(page);
    await page.locator("[data-free-bank]").waitFor();
    await page.waitForTimeout(4000);
    const asks = seen.plaid.filter((a) => a === "create_link_token").length;
    t.eq(asks, 2, "5a the server keeps refusing: asked once more, never in a loop");
    t.ok((await text(page)).includes(LINE), "5b …and the free-bank line stays");
    t.eq(errs, [], "5c no page errors");
  }, { link: [402] });

  // ── sdk: Plaid's script cannot load on a Free account ──────────────────────────────────────────────
  await scenario("sdk", "free", async ({ page, errs }) => {
    await toBankStep(page);
    await page.locator("[data-free-bank]").waitFor();
    await page.waitForFunction(() => !!window.__plaidScriptFailed, null, { timeout: 20000 });
    await page.waitForTimeout(500);
    const s = await text(page);
    t.ok(s.includes(LINE), "6a Plaid's script cannot load on Free: the free-bank line shows");
    t.ok(!/Plaid SDK failed to load|Couldn.t reach your bank/.test(s), "6b …and no bank error beside it");
    t.eq(errs, [], "6c no page errors");
  }, { plaidScript: "fail" });
  await scenario("sdk-paid", "paid", async ({ page }) => {
    await toBankStep(page);
    await page.waitForFunction(() => !!window.__plaidScriptFailed, null, { timeout: 20000 });
    await page.getByText("Plaid SDK failed to load").first().waitFor();
    t.ok(true, "6d (not vacuous: the same failure on a paid account shows Plaid's error)");
  }, { plaidScript: "fail" });

  await browser.close();
  server.close();
  t.summary("FREE V1 WEB (browser)");
})().catch((e) => { console.error(e); process.exitCode = 1; });
