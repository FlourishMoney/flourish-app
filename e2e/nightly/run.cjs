// e2e/nightly/run.cjs
// -----------------------------------------------------------------------------
// THE NIGHTLY END-TO-END WALK (e2e/nightly/README.md). A real person's first ten minutes, on three devices, against
// the real server functions (e2e/nightly/server.cjs), a throwaway Supabase and Plaid's SANDBOX:
//
//   1 fresh visit   2 sign up (a throwaway address)   3 AI notice   4 "Before you start"
//   5 connect a bank (Plaid sandbox, the standard test user)   6 first number   7 "Choose your plan"
//   8 Delete Account   9 the account is gone (asked of the database, not of the app)
//
// Devices: the iPhone app and the Android app (the store build, in a phone-sized window, with the platform each app
// reports and the Origin each app sends) and the website (a desktop window).
//
// NOTHING HERE CAN REACH PRODUCTION. Every request the browser makes is checked: this machine, the throwaway
// Supabase and Plaid are let through; the store build's calls to https://flourishmoney.app/api are answered by the
// local server instead (they never leave this machine); anything else to flourishmoney.app or to production's
// Supabase is refused AND fails the run; every other host is refused.
//
// A step that fails: a picture is saved, the walk stops for that device, the others still run, and the process ends
// 1 after writing <out>/failure.json (the first failure: device, step, what happened). On GitHub it also writes an
// error annotation and the run's summary, both naming the step: GitHub's own failure email shows the annotation, so the
// email says what broke.
// E2E_BANK=manual types the balance by hand at step 5 (a rehearsal of everything but Plaid; never the nightly).
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { WEB_PORT, STORE_PORT, PRODUCTION_SUPABASE_HOST } = require("./server.cjs");

const OUT = path.resolve(process.env.E2E_OUT || path.join(__dirname, "output"));
const BANK = process.env.E2E_BANK === "manual" ? "manual" : "plaid";
const SUPABASE_URL = process.env.SUPABASE_URL || "", SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || "";
const INSTITUTION = process.env.E2E_PLAID_INSTITUTION || "Tartan";      // a sandbox bank with no OAuth, offered for Canada
const RUN = String(Date.now()).slice(-8);
// The fire drill: fail on purpose, at a step that says so, to prove the alert email arrives (the workflow's "drill").
const DRILL = process.env.E2E_DRILL === "true";
const DRILL_STEP = "fire drill (a failure made on purpose, to test this alert)";
const WEB = `http://localhost:${WEB_PORT}`, STORE = `http://localhost:${STORE_PORT}`;

const DEVICES = [
  { key: "iphone", label: "iPhone app", base: STORE, platform: "ios", origin: "capacitor://localhost", viewport: { width: 390, height: 844 }, mobile: true },
  { key: "android", label: "Android app", base: STORE, platform: "android", origin: "https://localhost", viewport: { width: 412, height: 915 }, mobile: true },
  { key: "website", label: "website", base: WEB, platform: null, origin: null, viewport: { width: 1280, height: 800 }, mobile: false },
];
const STEPS = ["fresh visit", "sign up", "AI notice", "Before you start", BANK === "plaid" ? "connect a bank (Plaid sandbox)" : "balance typed by hand (rehearsal, no bank)", "first number", "Choose your plan", "Delete Account", "the account is gone"];

/** Where a request may go: "allow", "api" (answer it from the local server), "production" (refuse and fail) or "block". */
function verdict(url, supabaseUrl = SUPABASE_URL) {
  let u; try { u = new URL(url); } catch { return "block"; }
  if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "about:") return "allow";
  if ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && [String(WEB_PORT), String(STORE_PORT)].includes(u.port)) return "allow";
  if (supabaseUrl && u.origin === new URL(supabaseUrl).origin && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return "allow";
  if (u.hostname === "flourishmoney.app" || u.hostname.endsWith(".flourishmoney.app")) return u.hostname === "flourishmoney.app" && u.pathname.startsWith("/api/") ? "api" : "production";
  if (u.hostname === PRODUCTION_SUPABASE_HOST || u.hostname.endsWith(".supabase.co")) return "production";
  if (u.hostname === "production.plaid.com" || u.hostname === "development.plaid.com") return "production";
  if (u.protocol === "https:" && (u.hostname === "plaid.com" || u.hostname.endsWith(".plaid.com"))) return "allow";
  return "block";
}

// Runs in the page before the store build: the platform the app reports, and the store's plans behind Capacitor's bridge.
function installStoreApp(platform) {
  const ids = platform === "android" ? ["flourish_plus:monthly", "flourish_plus:annual"] : ["app.flourishmoney.plus.monthly", "app.flourishmoney.plus.annual"];
  const pkg = (id, price) => ({ identifier: `$rc_${id.includes("monthly") ? "monthly" : "annual"}`, offeringIdentifier: "default", product: { identifier: id, priceString: price, currencyCode: "CAD" } });
  const std = { identifier: "default", availablePackages: [pkg(ids[0], "$11.99"), pkg(ids[1], "$99.99")] };
  const st = { configured: false, uid: null };
  const impl = {
    isConfigured: async () => ({ isConfigured: st.configured }), configure: async (o) => { st.configured = true; st.uid = o && o.appUserID; },
    logIn: async (o) => { st.uid = o && o.appUserID; return { customerInfo: {}, created: false }; }, getAppUserID: async () => ({ appUserID: st.uid }),
    getOfferings: async () => ({ current: std, all: { default: std } }), checkTrialOrIntroductoryPriceEligibility: async () => ({}),
    restorePurchases: async () => ({ customerInfo: {} }), showManageSubscriptions: async () => {},
  };
  window.CapacitorCustomPlatform = { name: platform, plugins: {} };
  window.Capacitor = { PluginHeaders: [{ name: "Purchases", methods: Object.keys(impl).map((name) => ({ name, rtype: "promise" })) }],
    nativePromise: (plugin, method, options) => plugin === "Purchases" && impl[method] ? impl[method](options) : Promise.reject(new Error(`${plugin}.${method} is not in the nightly test`)) };
}

class StepFailed extends Error {}

/** What a failure says on GitHub: one error annotation (shown in GitHub's failure email and on the run) and the summary. */
function alertLines(f) {
  const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const title = `Nightly test broke at: ${flat(f.step)}`;
  const also = f.others && f.others.length ? ` Also failed: ${f.others.join("; ")}.` : "";
  // GitHub's workflow command: a property (the title) escapes % : and , ; the message escapes %.
  const prop = (s) => s.replace(/%/g, "%25").replace(/:/g, "%3A").replace(/,/g, "%2C");
  const annotation = `::error title=${prop(title)}::${`${flat(f.device)} failed at "${flat(f.step)}". ${flat(f.message)}${also}`.replace(/%/g, "%25")}`;
  const summary = [`## ${title}`, ``, `| Device | Step that broke | What happened |`, `|---|---|---|`,
    `| ${flat(f.device)} | ${flat(f.step)} | ${flat(f.message).replace(/\|/g, "/").slice(0, 400)} |`,
    ...(f.others && f.others.length ? [``, `Also failed: ${f.others.join("; ")}`] : []),
    ...(f.passed && f.passed.length ? [``, `Passed: ${f.passed.join(", ")}`] : []),
    ``, `Pictures of every step are in this run's artifacts.`].join("\n") + "\n";
  return { annotation, summary };
}

async function walk(browser, device) {
  const dir = path.join(OUT, device.key);
  fs.mkdirSync(dir, { recursive: true });
  const st = { step: null, n: 0, done: [], production: [], blocked: new Set(), apiErrors: [], email: `nightly-${device.key}-${RUN}@flourishmoney.app`, userId: null };
  const password = `Nightly-${RUN}-${Math.random().toString(36).slice(2, 10)}!`;
  const ctx = await browser.newContext({ viewport: device.viewport, deviceScaleFactor: device.mobile ? 2 : 1, isMobile: device.mobile, hasTouch: device.mobile, locale: "en-CA", timezoneId: "America/Toronto", colorScheme: "light" });
  if (device.platform) await ctx.addInitScript(installStoreApp, device.platform);
  await ctx.route("**/*", async (route) => {
    const req = route.request(), url = req.url(), v = verdict(url);
    if (v === "allow") return route.continue();
    if (v === "production") { st.production.push(`${req.method()} ${url.split("?")[0]}`); return route.abort(); }
    if (v === "block") { try { st.blocked.add(new URL(url).host); } catch {} return route.abort(); }
    // The store build calls https://flourishmoney.app/api/…: answered here, by the local server, with the Origin the app sends.
    const u = new URL(url);
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    try {
      const res = await route.fetch({ url: `${WEB}${u.pathname}${u.search}`, headers: { ...req.headers(), origin: device.origin || WEB } });
      if (res.status() >= 500) st.apiErrors.push(`${u.pathname} answered ${res.status()}`);
      return route.fulfill({ response: res, headers: { ...res.headers(), "access-control-allow-origin": "*" } });
    } catch (e) { st.apiErrors.push(`${u.pathname} could not be reached: ${e.message}`); return route.abort(); }
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on("response", (r) => { try { const u = new URL(r.url()); if (u.origin === WEB && u.pathname.startsWith("/api/") && r.status() >= 500) st.apiErrors.push(`${u.pathname} answered ${r.status()}`); } catch {} });

  const shot = async (name) => { st.n++; await page.screenshot({ path: path.join(dir, `${String(st.n).padStart(2, "0")}-${name.replace(/[^\w]+/g, "-").toLowerCase()}.png`) }).catch(() => {}); };
  const seen = (text, ms = 40000) => page.getByText(text, { exact: false }).first().waitFor({ timeout: ms });
  const tap = (name) => page.getByRole("button", { name, exact: true }).first().click();
  const step = async (name, fn) => {
    st.step = name;
    try { await fn(); } catch (e) {
      await shot(`FAILED-${name}`);
      const said = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200)).catch(() => "");
      throw new StepFailed(`${String(e && e.message).split("\n")[0].slice(0, 220)} | the screen said: ${said}${st.apiErrors.length ? ` | server: ${st.apiErrors.slice(-2).join("; ")}` : ""}`);
    }
    if (st.production.length) { await shot(`FAILED-${name}`); throw new StepFailed(`the app tried to reach production: ${st.production.slice(0, 3).join(", ")}`); }
    st.done.push(name);
    await shot(name);
  };

  try {
    await step(STEPS[0], async () => {
      await page.goto(device.base + "/", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Get started", exact: true }).first().waitFor({ timeout: 60000 });
      if (device.platform) await seen("Example, sample data");
    });
    if (DRILL) await step(DRILL_STEP, async () => { throw new Error("Nothing is broken. Someone ran the fire drill to check that the failure email arrives."); });
    await step(STEPS[1], async () => {
      await tap("Get started");
      await page.getByRole("button", { name: "Create Account", exact: true }).waitFor();
      await page.getByPlaceholder("you@example.com").or(page.locator('input[type="email"]')).first().fill(st.email);
      await page.locator('input[type="password"]').first().fill(password);
      await tap("Create Account");
      await seen("About AI in Flourish");
      st.userId = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) { try { return JSON.parse(localStorage.getItem(k)).user.id; } catch (e) {} } return null; });
      if (!st.userId) throw new Error("signed up, but no session was kept on the device");
    });
    await step(STEPS[2], async () => { await tap("I Understand & Accept"); await seen("Before you start"); });
    await step(STEPS[3], async () => { await tap("Get started"); await seen("Link your accounts"); });
    await step(STEPS[4], async () => {
      if (BANK === "manual") {   // the rehearsal: everything but Plaid
        await tap("Enter it myself");
        await page.getByPlaceholder("0.00").first().fill("2500");
        await tap("Continue →");
        return;
      }
      if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET || /^rehearsal/.test(process.env.PLAID_SECRET)) {
        throw new Error("Plaid's sandbox keys are not here: add the repository secrets PLAID_CLIENT_ID and PLAID_SANDBOX_SECRET (e2e/nightly/README.md)");
      }
      const button = page.locator("[data-bank-button]").first();
      await button.waitFor();
      // The button reads "connect" once the server has a Plaid link token; "retry" or "unavailable" is a failure of ours or Plaid's.
      const state = await (async () => { const end = Date.now() + 30000; let s = ""; while (Date.now() < end) { s = await button.getAttribute("data-bank-button"); if (s === "connect" || s === "retry" || s === "unavailable") return s; await page.waitForTimeout(300); } return s; })();
      if (state !== "connect") throw new Error(`the bank button never became ready (it says "${state}"): the server could not get a Plaid link token, or Plaid's script did not load`);
      await button.click();
      await tap("Connect My Bank");
      await plaidSandbox(page, shot);
      await seen("Connected!", 90000);
      await tap("Let's go →");
    });
    await step(STEPS[5], async () => {
      await seen("Your paycheques");
      const amount = page.getByPlaceholder("e.g. 2100").first();
      if (await amount.count() && !(await amount.inputValue())) await amount.fill("2100");
      const date = page.locator('input[type="date"]').first();
      if (await date.count() && !(await date.inputValue())) { const d = new Date(Date.now() + 9 * 86400e3); await date.fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); }
      await page.getByRole("button", { name: /Show my starting number|Continue/ }).last().click();
      await seen("Here's your number.");
      const number = await page.evaluate(() => (document.body.innerText.match(/\$\s*[\d,]+/) || [""])[0]);
      if (!/\d/.test(number)) throw new Error("the first-number screen shows no number");
    });
    await step(STEPS[6], async () => {
      await page.getByText("Skip for now", { exact: true }).first().click();
      const notNow = page.getByRole("button", { name: "Not now", exact: true }).first(), plans = page.getByRole("heading", { name: "Choose your plan", exact: true });
      for (let i = 0; i < 3 && !(await plans.count()); i++) { await notNow.or(plans).first().waitFor({ timeout: 40000 }); if (await plans.count()) break; await notNow.click(); await page.waitForTimeout(800); }
      await plans.waitFor({ timeout: 40000 });
      await page.getByText(/\$11\.99/).first().waitFor({ timeout: 20000 });   // a plan with its price, not an empty screen
    });
    await step(STEPS[7], async () => {
      await page.locator("[data-plans-delete]").click();
      await seen("Delete your account?", 10000);
      await tap("Delete account");
      await page.getByRole("heading", { name: "Choose your plan", exact: true }).waitFor({ state: "detached", timeout: 30000 });
      await page.getByRole("button", { name: "Get started", exact: true }).first().waitFor({ timeout: 40000 });
    });
    await step(STEPS[8], async () => {
      const gone = await accountIsGone(st.userId, st.email, password);
      if (gone !== true) throw new Error(gone);
    });
  } catch (e) {
    if (!(e instanceof StepFailed)) throw e;
    await ctx.close();
    return { device, ok: false, step: st.step, done: st.done, message: e.message, blocked: [...st.blocked] };
  }
  await ctx.close();
  return { device, ok: true, done: st.done, blocked: [...st.blocked] };
}

// Plaid Link, in its sandbox, as a person: pick the bank, sign in as Plaid's standard test user (user_good /
// pass_good, which Plaid publishes for every sandbox), keep the accounts it offers, finish. Link's screens change
// from time to time, so this reads what is on the screen and acts on what it finds, for up to two minutes.
async function plaidSandbox(page, shot) {
  const frame = page.frameLocator('iframe[id^="plaid-link-iframe"]').last();
  const end = Date.now() + 120000;
  let searched = false, signedIn = false, last = "", lastChange = Date.now(), pictures = 0;
  const visible = async (loc) => { try { return (await loc.count()) > 0 && await loc.first().isVisible(); } catch { return false; } };
  while (Date.now() < end) {
    if (await page.getByText("Connected!", { exact: false }).count()) return;
    if (!(await page.locator('iframe[id^="plaid-link-iframe"]').count())) { await page.waitForTimeout(500); continue; }
    const text = await frame.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    const key = text.replace(/\s+/g, " ").slice(0, 160);
    if (key !== last) { last = key; lastChange = Date.now(); if (pictures < 12) { pictures++; await shot(`plaid-${pictures}`); } }
    if (Date.now() - lastChange > 45000) throw new Error(`Plaid's window stopped changing. It said: ${key}`);
    const pass = frame.locator('input[type="password"]');
    if (!signedIn && await visible(pass)) {
      await frame.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])').first().fill("user_good");
      await pass.first().fill("pass_good");
      await frame.getByRole("button", { name: /^(Submit|Continue|Log in|Sign in)$/i }).first().click();
      signedIn = true; await page.waitForTimeout(1500); continue;
    }
    const search = frame.locator('input[type="search"], input[placeholder*="Search" i], input[aria-label*="Search" i]');
    if (!searched && await visible(search)) {
      await search.first().fill(INSTITUTION);
      await page.waitForTimeout(2500);
      const hit = frame.getByRole("button").filter({ hasText: new RegExp(INSTITUTION, "i") }).or(frame.locator("li, [role=option]").filter({ hasText: new RegExp(INSTITUTION, "i") }));
      if (await visible(hit)) { await hit.first().click(); searched = true; await page.waitForTimeout(1500); continue; }
      throw new Error(`Plaid's sandbox did not list a bank called "${INSTITUTION}"`);
    }
    let acted = false;
    // "Continue as guest" and "Continue without phone number" are sometimes links, not buttons.
    const guest = frame.getByText(/continue as guest|continue without (a )?phone|without phone number/i).first();
    if (await visible(guest)) { await guest.click().catch(() => {}); await page.waitForTimeout(1500); continue; }
    for (const name of [/continue as guest/i, /without (a )?phone/i, /^skip/i, /^continue$/i, /^get started$/i, /^allow$/i, /^agree/i, /^finish/i, /^done$/i, /^submit$/i, /^next$/i]) {
      const b = frame.getByRole("button", { name }).first();
      if (await visible(b) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); acted = true; await page.waitForTimeout(1500); break; }
    }
    if (!acted) await page.waitForTimeout(700);
  }
  throw new Error(`Plaid's window did not finish in two minutes. It last said: ${last}`);
}

// Asked of the throwaway database with its own service key, never of the app: the account, and everything kept
// against it, is gone; and its address and password no longer sign in.
async function accountIsGone(userId, email, password) {
  if (!userId) return "no account id was kept to check";
  const h = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" };
  const user = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { headers: h });
  if (user.status !== 404) return `the account still exists in the database (the admin API answered ${user.status})`;
  for (const table of ["profiles", "user_data", "plaid_items", "legal_consents", "subscriptions"]) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=user_id&user_id=eq.${userId}`, { headers: h });
    if (!r.ok) return `could not read ${table} to check (${r.status})`;
    const rows = await r.json();
    if (rows.length) return `${rows.length} row(s) of the deleted account are still in ${table}`;
  }
  const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: h, body: JSON.stringify({ email, password }) });
  if (signIn.ok) return "the deleted account's address and password still sign in";
  return true;
}

async function main() {
  const playwright = require("playwright");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await playwright.chromium.launch();
  const results = [];
  for (const device of DEVICES.filter((d) => !process.env.E2E_DEVICES || process.env.E2E_DEVICES.split(",").includes(d.key))) {
    let r;
    try { r = await walk(browser, device); } catch (e) { r = { device, ok: false, step: "the test itself", done: [], message: String(e && e.message).split("\n")[0], blocked: [] }; }
    results.push(r);
    console.log(r.ok ? `✓ ${device.label}: all ${STEPS.length} steps (${r.done.join(", ")})` : `✗ ${device.label}: FAILED at "${r.step}" after ${r.done.length} step(s). ${r.message}`);
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify({ bank: BANK, results: results.map((r) => ({ device: r.device.label, ok: r.ok, step: r.step || null, done: r.done, message: r.message || null, blocked: r.blocked })) }, null, 1));
  if (failed.length) {
    const failure = { device: failed[0].device.label, step: failed[0].step, message: failed[0].message,
      others: failed.slice(1).map((r) => `${r.device.label}: ${r.step}`), passed: results.filter((r) => r.ok).map((r) => r.device.label) };
    fs.writeFileSync(path.join(OUT, "failure.json"), JSON.stringify(failure, null, 1));
    const alert = alertLines(failure);
    if (process.env.GITHUB_ACTIONS === "true") { console.log(alert.annotation); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, alert.summary); }
    console.log(`\n✗ NIGHTLY: ${failed.length} of ${results.length} devices failed. First: ${failed[0].device.label}, step "${failed[0].step}".`);
    process.exit(1);
  }
  console.log(`\n✓ NIGHTLY: ${results.length} devices, ${STEPS.length} steps each, bank step: ${BANK === "plaid" ? "Plaid sandbox" : "typed by hand (rehearsal)"}.`);
}

module.exports = { verdict, STEPS, DEVICES, DRILL_STEP, alertLines };
if (require.main === module) main().catch((e) => { console.error(`✗ the nightly test could not run: ${e && e.stack}`); process.exit(1); });
