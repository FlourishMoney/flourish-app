// tests/plusBuy.browser.test.cjs
// -----------------------------------------------------------------------------
// BUYING THE FLOURISH PLUS ADD-ON (1.1.8), IN THE BUILT APP, IN A REAL BROWSER.
//
// The app is built twice: as the website, and as a store build that sells (VITE_IAP_ENABLED "true"), run in Chromium
// as the iPhone or Android app with a fake RevenueCat behind Capacitor's native bridge (as foundingPlans.browser does).
// The server (Supabase, /api/billing) is this test's own, and Stripe's two hosts are answered here: nothing reaches
// the network.
//   W1  PLUS_ENABLED off (plus_status 404): no card, no button, and a ?plus=success address opens nothing
//   W2  the website, no Plus: Settings' card opens the screen; both plans at $4.99 a month and $49.99 a year, CAD plus
//       tax; THE PRODUCT DOES NOT EXIST YET (price_not_configured): one calm line, nothing breaks, nothing navigates
//   W3  the website, the price exists: the button goes to Stripe's checkout
//   W4  back from Stripe (?plus=success): the address grants nothing; the screen waits for the server's yes, then shows
//       Manage subscription, which opens Stripe's portal
//   W5  it fits a 320px phone at double text size, in both themes
//   S1  a store app, THE PRODUCTS DO NOT EXIST YET: one calm line, no plan to tap, Restore purchases still there
//   S2  a store app, the products exist: the store's own price, the store disclosure, one tap opens the store's sheet
//       for the add-on's product, the server confirms, and Manage subscription opens the store's own screen
//   S3  the store refuses with "product not available", or the person closes the sheet: a calm line, or nothing
//   S4  Android: Google Play's disclosure and Google's product id
//   S5  a store app never reads a return address, never shows our price and never asks Stripe for anything
// PLUS_BUY_SHOTS=<dir> also saves screenshots there.
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
const SHOTS = process.env.PLUS_BUY_SHOTS || "";

function household() {
  const blob = MOCK.emptyBlob();
  blob.savedAt = "2026-11-20T09:00:00.000Z";
  blob.core.onboarded = true;
  blob.core.appData = {
    profile: { name: "", country: "CA", province: "ON" },
    accounts: [{ id: "m1", name: "Chequing", type: "checking", balance: 3000, institution: "Manual" }],
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-12-04", type: "employment" }],
    bills: [], transactions: [], debts: [], goals: [], bankConnected: false,
  };
  return blob;
}
// The main plan is paid throughout, so no plans screen of its own is in the way: Plus is an add-on to any plan.
const MAIN_WEB = { enabled: true, paid: true, provider: "stripe", period_end: "2027-11-20T00:00:00.000Z", manageable: true, founding: { available: false, cohortLimit: 50, confirmEmail: false } };
const mainStore = (platform) => ({ enabled: true, paid: true, provider: platform === "android" ? "play_store" : "app_store", plan_key: "annual", conflict: false, conflict_kind: null, web_attention: false,
  period_end: "2027-11-20T00:00:00.000Z", founding: { available: false, held_on_regular_plan: null, spots_left: null } });
const plus = (body) => ({ status: 200, body: { enabled: true, plus: false, covered_by: null, manage: null, ...body } });

// Runs in the page before the app: the platform, and RevenueCat behind Capacitor's native bridge.
// opts.addon: the add-on's products exist in the store. opts.refuse: the code the store's sheet fails with.
function installStore([platform, uid, opts]) {
  const main = platform === "android" ? ["flourish_plus:monthly", "flourish_plus:annual"] : ["app.flourishmoney.plus.monthly", "app.flourishmoney.plus.annual"];
  const addon = platform === "android" ? ["flourish_plus_addon:monthly", "flourish_plus_addon:annual"] : ["app.flourishmoney.plusaddon.monthly", "app.flourishmoney.plusaddon.annual"];
  const pkg = (id, price, offering) => ({ identifier: `$rc_${id.includes("monthly") ? "monthly" : "annual"}`, offeringIdentifier: offering, product: { identifier: id, priceString: price, currencyCode: "CAD" } });
  const std = { identifier: "default", availablePackages: [pkg(main[0], "$11.99", "default"), pkg(main[1], "$99.99", "default")] };
  const all = { default: std };
  if (opts.addon) all.plus_addon = { identifier: "plus_addon", availablePackages: [pkg(addon[0], "$4.99", "plus_addon"), pkg(addon[1], "$49.99", "plus_addon")] };
  window.__store = { purchases: [], restores: 0, managed: 0, configured: false };
  const impl = {
    isConfigured: async () => ({ isConfigured: window.__store.configured }),
    configure: async () => { window.__store.configured = true; },
    logIn: async () => ({ customerInfo: {}, created: false }),
    getAppUserID: async () => ({ appUserID: uid }),
    getOfferings: async () => ({ current: std, all }),
    purchasePackage: async ({ aPackage }) => {
      window.__store.purchases.push(aPackage.product.identifier);
      if (opts.refuse) { const e = new Error("store"); e.code = String(opts.refuse); throw e; }
      return { customerInfo: {}, productIdentifier: aPackage.product.identifier };
    },
    restorePurchases: async () => { window.__store.restores++; return { customerInfo: {} }; },
    showManageSubscriptions: async () => { window.__store.managed++; },
  };
  window.CapacitorCustomPlatform = { name: platform, plugins: {} };
  window.Capacitor = {
    PluginHeaders: [{ name: "Purchases", methods: Object.keys(impl).map((name) => ({ name, rtype: "promise" })) }],
    nativePromise: (plugin, method, options) => plugin === "Purchases" && impl[method] ? impl[method](options) : Promise.reject(Object.assign(new Error(`${plugin}.${method} not in the test`), { code: String(opts.refuse || "0") })),
  };
}

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("PLUS BUY (browser)"); return; }
  let dist = null;
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    if (p === "/rest/v1/user_data" && req.method === "GET") {
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
      const row = { data: household(), updated_at: "2026-11-20T09:00:00.000Z" };
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(wantsObject ? row : [row])); return;
    }
    if (MOCK.handle(req, res)) return;
    const root = req.headers["x-test-dist"] === "store" ? dist.store : (req.url.startsWith("/__store/") ? dist.store : dist.web);
    let f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const build = (name, env) => {
    const out = tempDir(name);
    execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
      { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key", ...env } });
    return out;
  };
  dist = { web: build("plusbuy-web", {}), store: null };
  dist.store = build("plusbuy-store", { VITE_IAP_ENABLED: "true", VITE_REVENUECAT_IOS_KEY: "appl_testkey000000", VITE_REVENUECAT_ANDROID_KEY: "goog_testkey000000" });
  const browser = await playwright.chromium.launch();
  const SCREEN = "[data-plus-screen]";
  const until = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); } return false; };
  const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), fullPage: false }); };
  const seed = async (ctx, theme = null) => ctx.addInitScript(([key, session, chosen]) => { try {
    if (!localStorage.getItem("test_seeded")) {
      localStorage.setItem("test_seeded", "1");
      if (chosen) { localStorage.setItem("flourish_theme", chosen); localStorage.setItem("flourish_theme_manual", "1"); }
      localStorage.setItem(key, session);
      localStorage.setItem("flourish_first_visit_done", "1");
      localStorage.setItem("flourish_tour_done", "1");
      localStorage.setItem("flourish_ai_disclosure_seen", "1");
    }
  } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession(Math.floor(Date.now() / 1000))), theme]);
  const openSettings = async (page) => { await page.getByRole("button", { name: /settings/i }).first().click(); };
  const openPlusFromSettings = async (page) => {
    await openSettings(page);
    await page.locator("[data-plus-settings] button").first().click();
    await page.locator(SCREEN).first().waitFor({ timeout: 10000 });
  };

  // The website. scenario: { plusStatus(n) -> answer, checkout, portal }.
  const website = async (scenario, { width = 390, theme = null } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: "America/Toronto", colorScheme: theme === "light" ? "light" : "dark" });
    await seed(ctx, theme);
    const asked = [], errors = [], stripe = [];
    let statusCalls = 0;
    await ctx.route("**/api/billing", (r) => {
      let b = {}; try { b = JSON.parse(r.request().postData() || "{}"); } catch {}
      asked.push(b.action);
      const send = (a) => r.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.body || {}) });
      if (b.action === "status") return send({ status: 200, body: MAIN_WEB });
      if (b.action === "plus_status") return send(scenario.plusStatus(statusCalls++));
      if (b.action === "plus_checkout") return send(scenario.checkout ? scenario.checkout(b) : { status: 404, body: {} });
      if (b.action === "plus_portal") return send(scenario.portal || { status: 404, body: { error: "no_customer" } });
      return send({ status: 404, body: {} });
    });
    await ctx.route(/^https:\/\/(checkout|billing)\.stripe\.com\//, (r) => { stripe.push(r.request().url()); r.fulfill({ status: 200, contentType: "text/html", body: "<title>stripe stub</title><p>stripe stub</p>" }); });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e && e.message)));
    page.setDefaultTimeout(20000);
    const go = async (search = "") => {
      await page.goto(base + "/" + search, { waitUntil: "domcontentloaded" });
      await page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 }).catch(() => {});
    };
    return { ctx, page, asked, errors, stripe, go };
  };

  // A phone running the store build.
  const phone = async ({ platform = "ios", addon = false, refuse = null, scenario }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: "America/Toronto", colorScheme: "dark", extraHTTPHeaders: { "x-test-dist": "store" } });
    await ctx.addInitScript(installStore, [platform, MOCK.USER_ID, { addon, refuse }]);
    await seed(ctx);
    const asked = [], errors = [], outside = [];
    let statusCalls = 0;
    await ctx.route((url) => !url.href.startsWith(base), (r) => {
      const u = new URL(r.request().url());
      if (u.origin === "https://flourishmoney.app" && u.pathname === "/api/billing") {
        let b = {}; try { b = JSON.parse(r.request().postData() || "{}"); } catch {}
        asked.push(b.action);
        const send = (a) => r.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.body || {}) });
        if (b.action === "store_status" || b.action === "store_sync") return send({ status: 200, body: mainStore(platform) });
        if (b.action === "status") return send({ status: 200, body: { enabled: true, paid: true } });
        if (b.action === "plus_status") return send(scenario.plusStatus(statusCalls++));
        if (b.action === "plus_store_sync") return send(scenario.sync ? scenario.sync() : plus({}));
        return send({ status: 404, body: {} });
      }
      if (u.protocol === "data:" || u.protocol === "blob:") return r.continue();
      outside.push(u.href);
      return r.abort();
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e && e.message)));
    page.setDefaultTimeout(20000);
    const go = async (search = "") => {
      await page.goto(base + "/" + search, { waitUntil: "domcontentloaded" });
      await page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 }).catch(() => {});
    };
    return { ctx, page, asked, errors, outside, go };
  };

  try {
    // ── W1. PLUS_ENABLED off ─────────────────────────────────────────────────────────────────────
    {
      const { ctx, page, asked, errors, go } = await website({ plusStatus: () => ({ status: 404, body: { error: "not_found" } }) });
      await go("?plus=success&session_id=cs_test_1");
      await until(() => asked.includes("plus_status"));
      await page.waitForTimeout(1500);
      await openSettings(page);
      await page.waitForTimeout(500);
      t.eq([await page.locator(SCREEN).count(), await page.locator("[data-plus-settings]").count(), await page.locator("[data-plus-open]").count()], [0, 0, 0], "W1a Plus switched off: no screen, no Settings card and no button, even from a ?plus=success address");
      t.ok(!asked.includes("plus_checkout") && !asked.includes("plus_portal") && errors.length === 0, "W1b …and nothing is asked of Stripe and nothing breaks");
      t.ok(!/[?&]plus=/.test(page.url()), "W1c the address is cleaned all the same");
      await ctx.close();
    }

    // ── W2. The website: the offer, and a product that does not exist yet ───────────────────────────────────
    {
      const { ctx, page, asked, errors, stripe, go } = await website({ plusStatus: () => plus({}), checkout: () => ({ status: 500, body: { error: "price_not_configured" } }) });
      await go();
      await until(() => asked.includes("plus_status"));
      await openSettings(page);
      const card = page.locator('[data-plus-settings="offer"]');
      await card.waitFor({ timeout: 10000 });
      t.ok(!/\$\d/.test(await card.innerText()), "W2a Settings has a flourish Plus card for a household without it, with no price on it");
      await card.locator("button").first().click();
      const screen = page.locator('[data-plus-screen="offer"]');
      await screen.waitFor({ timeout: 10000 });
      const text = await screen.innerText();
      t.ok(/Monthly\s*\$4\.99 a month\s*CAD plus tax/.test(text) && /Annual\s*\$49\.99 a year\s*CAD plus tax/.test(text), "W2b the screen: Monthly $4.99 a month and Annual $49.99 a year, CAD plus tax");
      t.eq([await screen.locator("[data-plus-plan]").count(), await screen.locator("[data-plus-restore]").count(), await screen.locator("[data-plus-web-note]").count()], [2, 0, 1], "W2c two plans, the note about Stripe, and no Restore purchases (that is the store apps')");
      await shot(page, "web-offer.png");
      await screen.locator('[data-plus-buy="plus_monthly"]').click();
      await page.locator('[data-plus-outcome="not_available"]').waitFor({ timeout: 10000 });
      t.ok(asked.includes("plus_checkout") && stripe.length === 0 && errors.length === 0 && new URL(page.url()).origin === base, "W2d the product does not exist yet: one calm line, no navigation and no error");
      t.eq([await screen.locator("[data-plus-plan]").count(), await screen.locator('[data-plus-buy="plus_annual"]').isEnabled()], [2, true], "W2e …and the screen is still whole: both plans, and the other can be tried");
      await shot(page, "web-not-available.png");
      await screen.locator('button[aria-label="Close"]').click();
      t.ok(await until(async () => (await page.locator(SCREEN).count()) === 0, 5000), "W2f Close closes it");
      await ctx.close();
    }

    // ── W3. The website: the price exists ────────────────────────────────────────────────────────────
    {
      let sent = null;
      const { ctx, page, asked, stripe, go } = await website({ plusStatus: () => plus({}), checkout: (b) => { sent = b; return { status: 200, body: { url: "https://checkout.stripe.com/c/pay/cs_test_plus" } }; } });
      await go();
      await until(() => asked.includes("plus_status"));
      await openPlusFromSettings(page);
      await page.locator('[data-plus-buy="plus_annual"]').click();
      t.ok(await until(() => stripe.length > 0 && page.url().startsWith("https://checkout.stripe.com/"), 10000), "W3a the button goes to Stripe's checkout");
      t.eq([sent && sent.action, sent && sent.plan_key], ["plus_checkout", "plus_annual"], "W3b …asked of the server for the plan that was tapped");
      await ctx.close();
    }

    // ── W4. Back from Stripe ─────────────────────────────────────────────────────────────────────
    {
      // The first two answers still say no Plus (the webhook has not landed); then the buyer's own Plus, on Stripe.
      const { ctx, page, asked, errors, stripe, go } = await website({ plusStatus: (n) => (n < 2 ? plus({}) : plus({ plus: true, manage: "stripe" })), portal: { status: 200, body: { url: "https://billing.stripe.com/p/session/test_plus" } } });
      await go("?plus=success&session_id=cs_test_plus");
      await page.locator(SCREEN).first().waitFor({ timeout: 15000 });
      t.ok(!/[?&](plus|session_id)=/.test(page.url()), "W4a the address is cleaned at once");
      const have = page.locator('[data-plus-screen="have"]');
      t.ok(await until(async () => (await have.count()) === 1, 20000), "W4b the screen shows Plus only once the server says so (asked again while the webhook lags)");
      t.ok(asked.filter((a) => a === "plus_status").length >= 3, "W4c …which took at least three answers here, and the address granted nothing");
      await shot(page, "web-have.png");
      t.eq([await have.locator('[data-plus-manage="portal"]').count(), await have.locator("[data-plus-plan]").count(), /\$\d/.test(await have.innerText())], [1, 0, false], "W4d once bought: Manage subscription, nothing to buy and no price");
      await have.locator('[data-plus-manage="portal"]').click();
      t.ok(await until(() => stripe.some((u) => u.startsWith("https://billing.stripe.com/")), 10000) && asked.includes("plus_portal") && errors.length === 0, "W4e Manage subscription opens Stripe's portal for Plus");
      await ctx.close();
    }
    {
      const { ctx, page, asked, go } = await website({ plusStatus: () => plus({}) });
      await go("?plus=cancelled");
      await page.locator('[data-plus-outcome="web_cancelled"]').waitFor({ timeout: 15000 });
      t.ok((await page.locator('[data-plus-screen="offer"] [data-plus-plan]').count()) === 2 && !asked.includes("plus_checkout"), "W4f back from a closed checkout: it says so, and the plans are still there");
      await ctx.close();
    }

    // ── W5. It fits a small phone at double text size ────────────────────────────────────────────────────
    for (const theme of ["dark", "light"]) {
      const { ctx, page, asked, go } = await website({ plusStatus: () => plus({}) }, { width: 320, theme });
      await go();
      await until(() => asked.includes("plus_status"));
      await openPlusFromSettings(page);
      await page.evaluate(() => { const els = [...document.querySelectorAll("[data-plus-screen] *")]; const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize)); els.forEach((e, i) => { if (sizes[i]) e.style.fontSize = sizes[i] * 2 + "px"; }); });
      const fit = await page.evaluate(() => {
        const dialog = document.querySelector("[data-plus-screen]").parentElement;
        const out = [...document.querySelectorAll("[data-plus-screen] button, [data-plus-screen] [data-plus-plan]")].filter((e) => { const r = e.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5; }).length;
        return { sideways: dialog.scrollWidth > dialog.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1, out };
      });
      t.eq(fit, { sideways: false, out: 0 }, `W5 ${theme}, 320px, text ×2: nothing scrolls sideways and every button is on screen`);
      await shot(page, `web-offer-320-x2-${theme}.png`);
      await ctx.close();
    }

    // ── S1. A store app: the products do not exist yet ───────────────────────────────────────────────────
    {
      const { ctx, page, asked, errors, outside, go } = await phone({ addon: false, scenario: { plusStatus: () => plus({}) } });
      await go();
      await until(() => asked.includes("plus_status"));
      await openPlusFromSettings(page);
      const screen = page.locator('[data-plus-screen="offer"]');
      await screen.locator('[data-plus-store-line="not_available"]').waitFor({ timeout: 10000 });
      const text = await screen.innerText();
      t.eq([await screen.locator("[data-plus-plan]").count(), await screen.locator("[data-plus-restore]").count(), errors.length], [0, 1, 0], "S1a the store has no flourish Plus product yet: one calm line, no plan to tap, Restore purchases still there, nothing broken");
      t.ok(!/\$\d|CAD|Stripe|secure checkout|flourishmoney\.app/i.test(text) && text.includes("Terms of Use") && text.includes("Privacy Policy"), "S1b …with no price, no Stripe and no website on it, and the two legal links");
      await shot(page, "ios-not-available.png");
      await screen.locator("[data-plus-restore]").click();
      await page.locator('[data-plus-outcome="nothing_to_restore"]').waitFor({ timeout: 15000 });
      t.ok((await page.evaluate(() => window.__store.restores)) === 1 && asked.includes("plus_store_sync") && errors.length === 0, "S1c Restore purchases asks the store, then the server, and says when there is nothing");
      t.eq(outside.filter((u) => /stripe/i.test(u)), [], "S1d nothing was asked of Stripe");
      await ctx.close();
    }

    // ── S2. A store app: the products exist ──────────────────────────────────────────────────────────
    {
      let bought = false;
      const scenario = { plusStatus: () => (bought ? plus({ plus: true, manage: "app_store" }) : plus({})), sync: () => { bought = true; return plus({ plus: true, manage: "app_store" }); } };
      const { ctx, page, asked, errors, go } = await phone({ addon: true, scenario });
      await go();
      await until(() => asked.includes("plus_status"));
      await openPlusFromSettings(page);
      const screen = page.locator('[data-plus-screen="offer"]');
      await screen.locator("[data-plus-plan]").first().waitFor({ timeout: 10000 });
      const text = await screen.innerText();
      t.ok(/Monthly\s*\$4\.99 a month/.test(text) && /Annual\s*\$49\.99 a year/.test(text) && text.includes("Subscribe for $4.99 a month") && !/CAD plus tax|Stripe|secure checkout/.test(text), "S2a the store's own price on each plan, in the approved pattern, and nothing of the website's");
      t.ok(text.includes("Payment is charged to your Apple Account when you confirm.") && text.includes("Restore purchases") && text.includes("Terms of Use") && text.includes("Privacy Policy"), "S2b Apple's disclosure, Restore purchases, Terms of Use and Privacy Policy");
      await shot(page, "ios-offer.png");
      const before = asked.length;
      await screen.locator('[data-plus-buy="plus_monthly"]').click();
      t.ok(await until(() => page.evaluate(() => window.__store.purchases.length > 0), 8000), "S2c one tap opens the store's sheet");
      t.eq(await page.evaluate(() => window.__store.purchases), ["app.flourishmoney.plusaddon.monthly"], "S2d …for the add-on's own product, never the main plan's");
      const have = page.locator('[data-plus-screen="have"]');
      t.ok(await until(async () => (await have.count()) === 1, 15000), "S2e the server confirms it and the screen shows Plus");
      const after = asked.slice(before);
      t.ok(after.indexOf("plus_status") === 0 && after.includes("plus_store_sync") && after.indexOf("plus_status") < after.indexOf("plus_store_sync"), "S2f the server was asked before the sheet opened, and asked to look at the store after it");
      await have.locator('[data-plus-manage="store"]').click();
      t.ok(await until(() => page.evaluate(() => window.__store.managed === 1), 5000) && errors.length === 0, "S2g Manage subscription opens the store's own subscriptions screen");
      await shot(page, "ios-have.png");
      await ctx.close();
    }

    // ── S3. The store refuses, or the person closes the sheet ──────────────────────────────────────────────────
    for (const [code, want] of [["5", "not_available"], ["1", null], ["20", "pending"], ["2", "failed"]]) {
      const { ctx, page, asked, errors, go } = await phone({ addon: true, refuse: code, scenario: { plusStatus: () => plus({}) } });
      await go();
      await until(() => asked.includes("plus_status"));
      await openPlusFromSettings(page);
      const screen = page.locator('[data-plus-screen="offer"]');
      await screen.locator('[data-plus-buy="plus_annual"]').click();
      await until(() => page.evaluate(() => window.__store.purchases.length > 0), 8000);
      if (want) await page.locator(`[data-plus-outcome="${want}"]`).waitFor({ timeout: 10000 }).catch(() => {});
      else await page.waitForTimeout(800);
      const said = await page.locator("[data-plus-outcome]").evaluateAll((els) => els.map((e) => e.getAttribute("data-plus-outcome")));
      t.eq([said, errors.length, await screen.locator("[data-plus-plan]").count(), asked.includes("plus_store_sync")], [want ? [want] : [], 0, 2, false],
        `S3 the store's sheet ends with code ${code}: ${want ? `"${want}", said in one line` : "nothing is said"}, nothing breaks, the plans stay, and the server is not told of a purchase`);
      await ctx.close();
    }

    // ── S4. Android ──────────────────────────────────────────────────────────────────────────────
    {
      let bought = false;
      const scenario = { plusStatus: () => (bought ? plus({ plus: true, manage: "play_store" }) : plus({})), sync: () => { bought = true; return plus({ plus: true, manage: "play_store" }); } };
      const { ctx, page, asked, go } = await phone({ platform: "android", addon: true, scenario });
      await go();
      await until(() => asked.includes("plus_status"));
      await openPlusFromSettings(page);
      const screen = page.locator('[data-plus-screen="offer"]');
      await screen.locator("[data-plus-plan]").first().waitFor({ timeout: 10000 });
      const text = await screen.innerText();
      t.ok(text.includes("Payment is charged through Google Play when you confirm.") && !text.includes("Apple") && (await screen.locator('a[href*="apple.com"]').count()) === 0, "S4a Android: Google Play's disclosure, and nothing of Apple's");
      await screen.locator('[data-plus-buy="plus_annual"]').click();
      await until(() => page.evaluate(() => window.__store.purchases.length > 0), 8000);
      t.eq(await page.evaluate(() => window.__store.purchases), ["flourish_plus_addon:annual"], "S4b …and Google's own product: flourish_plus_addon, base plan annual");
      t.ok(await until(async () => (await page.locator('[data-plus-screen="have"] [data-plus-manage="store"]').count()) === 1, 15000), "S4c once bought: Manage subscription, for Google Play's own screen");
      await ctx.close();
    }

    // ── S5. A store app never reads a return address ──────────────────────────────────────────────────────
    {
      const { ctx, page, asked, outside, go } = await phone({ addon: true, scenario: { plusStatus: () => plus({}) } });
      await go("?plus=success&session_id=cs_test_1");
      await until(() => asked.includes("plus_status"));
      await page.waitForTimeout(1500);
      t.eq([await page.locator(SCREEN).count(), asked.includes("plus_checkout"), asked.includes("plus_portal"), outside.filter((u) => /stripe/i.test(u)).length], [0, false, false, 0],
        "S5 a ?plus=success address opens nothing in a store app, and Stripe is never asked for anything");
      await ctx.close();
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.stack) || e).split("\n").slice(0, 4).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("PLUS BUY (browser)");
})();
