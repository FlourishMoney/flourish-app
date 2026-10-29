// tests/foundingPlans.browser.test.cjs
// -----------------------------------------------------------------------------
// A FOUNDING HOUSEHOLD IS ASKED TO PAY STRAIGHT AWAY (1.1.3, lib/foundingPlans.js), IN THE BUILT STORE APP.
//
// The app is built as a store build that sells (VITE_IAP_ENABLED "true", a RevenueCat public key of the right shape)
// and run in Chromium as the iPhone or Android app: Capacitor's own custom-platform hook names the platform, and a
// fake RevenueCat plugin answers through Capacitor's native bridge with the store's packages and price strings.
// The server (Supabase and /api/billing store_status) is this test's own; nothing reaches the network.
//   1  founding + confirmed + unpaid: the plans screen opens by itself, Founding annual first and marked chosen,
//      the store's prices, the approved disclosure, a close button; one tap on Founding annual opens the store's
//      sheet for the founding package, and the confirmed purchase closes the screen
//   2  not founding: nothing opens by itself; See plans in Settings still opens the plans, in the old order
//   3  already paid: never opens
//   4  closed once: a reload, and signing out and back in, do not open it again; See plans still does
//   5  a new account: it opens over onboarding, and on Android with Google Play's disclosure
//   6  keep the trial (2026-10-29): small print under the founding plans opens a confirm stating the live founding
//      spots left (asked of the server again as it opens); "stay" goes back to the plans, "leave" closes them and the
//      trial goes on, and the plans do not reopen on their own; no count, no link
// FOUNDING_PLANS_SHOTS=<dir> also saves screenshots of the auto-opened screen there (for the store build review).
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
const SHOTS = process.env.FOUNDING_PLANS_SHOTS || "";

function household({ onboarded = true } = {}) {
  const blob = MOCK.emptyBlob();
  blob.savedAt = "2026-10-28T09:00:00.000Z";
  blob.core.onboarded = onboarded;
  blob.core.appData = onboarded ? {
    profile: { name: "", country: "CA", province: "ON" },
    accounts: [{ id: "m1", name: "Chequing", type: "checking", balance: 3000, institution: "Manual" }],
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-06", type: "employment" }],
    bills: [], transactions: [], debts: [], goals: [], bankConnected: false,
  } : null;
  return blob;
}
const status = ({ paid = false, founding = false, provider = null, plan_key = null, spots = 7 } = {}) => ({
  enabled: true, paid, provider, plan_key, conflict: false, conflict_kind: null, web_attention: false,
  period_end: paid ? "2027-10-28T00:00:00.000Z" : null, founding: { available: founding, held_on_regular_plan: null, spots_left: founding ? spots : null },
});

// Runs in the page before the app: the platform, and RevenueCat behind Capacitor's native bridge.
function installStore([platform, uid]) {
  const ids = platform === "android"
    ? { monthly: "flourish_plus:monthly", annual: "flourish_plus:annual", founding: "flourish_plus:founding" }
    : { monthly: "app.flourishmoney.plus.monthly", annual: "app.flourishmoney.plus.annual", founding: "app.flourishmoney.founding.annual" };
  const pkg = (id, price, offering) => ({ identifier: `$rc_${id.includes("monthly") ? "monthly" : "annual"}`, offeringIdentifier: offering,
    product: { identifier: id, priceString: price, currencyCode: "CAD" } });
  const std = { identifier: "default", availablePackages: [pkg(ids.monthly, "$11.99", "default"), pkg(ids.annual, "$99.99", "default")] };
  const fnd = { identifier: "founding", availablePackages: [pkg(ids.founding, "$79.99", "founding")] };
  window.__store = { purchases: [], configured: false };
  const impl = {
    isConfigured: async () => ({ isConfigured: window.__store.configured }),
    configure: async () => { window.__store.configured = true; },
    logIn: async () => ({ customerInfo: {}, created: false }),
    getAppUserID: async () => ({ appUserID: uid }),
    getOfferings: async () => ({ current: std, all: { default: std, founding: fnd } }),
    purchasePackage: async ({ aPackage }) => { window.__store.purchases.push(aPackage.product.identifier); return { customerInfo: {}, productIdentifier: aPackage.product.identifier }; },
    restorePurchases: async () => ({ customerInfo: {} }),
    showManageSubscriptions: async () => {},
  };
  window.CapacitorCustomPlatform = { name: platform, plugins: {} };
  window.Capacitor = {
    PluginHeaders: [{ name: "Purchases", methods: Object.keys(impl).map((name) => ({ name, rtype: "promise" })) }],
    nativePromise: (plugin, method, options) => plugin === "Purchases" && impl[method] ? impl[method](options) : Promise.reject(new Error(`${plugin}.${method} not in the test`)),
  };
}

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("FOUNDING PLANS (browser)"); return; }
  let dist = null, onboarded = true;
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    if (p === "/rest/v1/user_data" && req.method === "GET") {
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
      const row = { data: household({ onboarded }), updated_at: "2026-10-28T09:00:00.000Z" };
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(wantsObject ? row : [row])); return;
    }
    if (MOCK.handle(req, res)) return;     // profiles: a fresh 14-day trial, as the server grants at signup
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = tempDir("foundingplans");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      VITE_IAP_ENABLED: "true", VITE_REVENUECAT_IOS_KEY: "appl_testkey000000", VITE_REVENUECAT_ANDROID_KEY: "goog_testkey000000" } });
  const browser = await playwright.chromium.launch();
  const DIALOG = '[role="dialog"][aria-label="Subscription"]';

  // A phone: one browser context is one phone (its storage survives reloads). scenario.status is what the server answers.
  const phone = async ({ platform = "ios", scenario }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, timezoneId: "America/Toronto", colorScheme: "dark" });
    await ctx.addInitScript(installStore, [platform, MOCK.USER_ID]);
    await ctx.addInitScript(([key, session]) => { try {
      if (!localStorage.getItem("test_seeded")) {
        localStorage.setItem("test_seeded", "1");
        localStorage.setItem(key, session);
        localStorage.setItem("flourish_first_visit_done", "1");
        localStorage.setItem("flourish_tour_done", "1");
        localStorage.setItem("flourish_ai_disclosure_seen", "1");
      }
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession(Math.floor(Date.now() / 1000)))]);
    const asked = [];
    // Nothing leaves this machine: the store app's API origin is answered here, and any other host is refused.
    await ctx.route((url) => !url.href.startsWith(base), (r) => {
      const u = new URL(r.request().url());
      if (u.origin === "https://flourishmoney.app" && u.pathname === "/api/billing") {
        let action = null; try { action = JSON.parse(r.request().postData() || "{}").action; } catch {}
        asked.push(action);
        if (action === "store_status") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(scenario.status) });
        if (action === "store_sync") { scenario.status = status({ paid: true, provider: platform === "android" ? "play_store" : "app_store", plan_key: "founding_annual" });
          return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...scenario.status }) }); }
        if (action === "status") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, paid: scenario.status.paid }) });
        // Couple mode's purchase hold (billing.js store_hold): an account in no household is held at once.
        if (action === "store_hold") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(scenario.status.paid ? { held: false, paid: true } : { held: true }) });
        return r.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      }
      if (u.protocol === "data:" || u.protocol === "blob:") return r.continue();
      return r.abort();
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    return { ctx, page, asked };
  };
  const go = async (page, waitFor = "safe to spend") => {
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    if (waitFor) await page.getByText(waitFor, { exact: false }).first().waitFor({ timeout: 40000 });
  };
  const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
  const dialogUp = (page) => page.locator(DIALOG).count().then((n) => n > 0);
  const quiet = async (page, asked) => { await until(async () => asked.includes("store_status"), 15000); await page.waitForTimeout(2500); };
  const plans = (page) => page.locator(`${DIALOG} [data-plan]`).evaluateAll((els) => els.map((e) => [e.getAttribute("data-plan"), e.hasAttribute("data-selected")]));
  const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), fullPage: false }); };
  const seePlansInSettings = async (page) => {
    await page.getByRole("button", { name: /settings/i }).first().click();
    await page.getByRole("button", { name: "See plans", exact: true }).first().click();
  };

  try {
    // ── 1. Founding, confirmed, unpaid ────────────────────────────────────────────────────────────
    {
      const scenario = { status: status({ founding: true }) };
      const { ctx, page, asked } = await phone({ scenario });
      await go(page);
      const opened = await until(() => dialogUp(page), 15000);
      t.ok(opened, "1a the plans screen opens by itself once the account is in the app");
      await page.locator(`${DIALOG} [data-plan]`).first().waitFor({ timeout: 10000 });
      t.eq(await plans(page), [["founding_annual", true], ["monthly", false]], "1b Founding annual first, marked as the chosen plan, then Monthly");
      const text = await page.locator(DIALOG).innerText();
      t.ok(/Founding annual\s*\$79\.99 a year/.test(text) && /\$11\.99 a month/.test(text) && text.indexOf("Founding annual") < text.indexOf("Monthly"), "1c the store's own prices");
      t.ok(text.includes("Payment is charged to your Apple Account when you confirm.") && text.includes("For the first 50 households who subscribe. Stays the same while you stay subscribed."), "1d the approved disclosure and the founding line (words to come, 2026-10-29) are on it");
      t.eq(await page.locator(`${DIALOG} button[aria-label="Close"]`).count(), 1, "1e it has a visible close button");
      await page.waitForTimeout(600);
      await shot(page, "ios-founding-plans-auto-open.png");
      await page.locator(`${DIALOG} [data-plan="founding_annual"] button`).click();
      const sheet = await until(() => page.evaluate(() => window.__store.purchases.length > 0), 8000);
      t.eq(sheet ? await page.evaluate(() => window.__store.purchases) : [], ["app.flourishmoney.founding.annual"], "1f one tap on its button opens the store's sheet for the founding annual");
      t.ok(asked.includes("store_hold") && asked.indexOf("store_hold") < (asked.indexOf("store_sync") < 0 ? Infinity : asked.indexOf("store_sync")), "1f2 …after the server held the household for this purchase (couple mode: one purchase at a time)");
      t.ok(await until(async () => !(await dialogUp(page)), 15000) && asked.includes("store_sync"), "1g the server confirms the purchase and the screen closes");
      await ctx.close();
    }

    // ── 2. Not founding: no change ───────────────────────────────────────────────────────────────
    {
      const scenario = { status: status({ founding: false }) };
      const { ctx, page, asked } = await phone({ scenario });
      await go(page);
      await quiet(page, asked);
      t.eq(await dialogUp(page), false, "2a a household that is not founding: nothing opens by itself");
      await seePlansInSettings(page);
      await page.locator(`${DIALOG} [data-plan]`).first().waitFor({ timeout: 10000 });
      t.eq(await plans(page), [["monthly", false], ["annual", false]], "2b See plans opens the plans as before: Monthly, then Annual, nothing marked");
      await ctx.close();
    }

    // ── 3. Already paid: never ───────────────────────────────────────────────────────────────────
    for (const [provider, plan_key] of [["app_store", "founding_annual"], ["stripe", "annual"]]) {
      const scenario = { status: status({ paid: true, provider, plan_key, founding: false }) };
      const { ctx, page, asked } = await phone({ scenario });
      await go(page);
      await quiet(page, asked);
      t.eq(await dialogUp(page), false, `3a paid through ${provider}: it never opens`);
      await ctx.close();
    }

    // ── 4. Closed once ───────────────────────────────────────────────────────────────────────────
    {
      const scenario = { status: status({ founding: true }) };
      const { ctx, page, asked } = await phone({ scenario });
      await go(page);
      t.ok(await until(() => dialogUp(page), 15000), "4a (it opened by itself)");
      await page.locator(`${DIALOG} button[aria-label="Close"]`).click();
      t.ok(await until(async () => !(await dialogUp(page)), 5000), "4b the close button closes it");
      await page.waitForTimeout(2500);
      t.eq(await dialogUp(page), false, "4c …and it stays closed in this session");
      asked.length = 0;
      await go(page);
      await quiet(page, asked);
      t.eq(await dialogUp(page), false, "4d after the app is opened again, it does not reopen on its own");
      // Signing out keeps the marker (App.jsx signOut): seed the same session again, as signing back in does.
      await page.evaluate((key) => { const keep = new Set([key, "flourish_founding_plans_shown", "flourish_uid", "flourish_v1", "test_seeded"]);
        Object.keys(localStorage).filter((k) => k.startsWith("flourish_") && !keep.has(k)).forEach((k) => localStorage.removeItem(k));
        localStorage.setItem("flourish_first_visit_done", "1"); localStorage.setItem("flourish_tour_done", "1"); localStorage.setItem("flourish_ai_disclosure_seen", "1"); }, MOCK.storageKey(base));
      asked.length = 0;
      await go(page);
      await quiet(page, asked);
      t.eq(await dialogUp(page), false, "4e signed out and back in, the same account: it does not reopen");
      await seePlansInSettings(page);
      t.ok(await until(() => dialogUp(page), 5000), "4f See plans still opens it any time");
      await ctx.close();
    }

    // ── 5. A new account: over onboarding; Android ──────────────────────────────────────────────
    {
      onboarded = false;
      const scenario = { status: status({ founding: true }) };
      const { ctx, page } = await phone({ platform: "android", scenario });
      await go(page, null);
      t.ok(await until(() => dialogUp(page), 30000), "5a a new founding account is asked straight away, over onboarding");
      await page.locator(`${DIALOG} [data-plan]`).first().waitFor({ timeout: 10000 });
      t.eq(await plans(page), [["founding_annual", true], ["monthly", false]], "5b Android: Founding annual first, marked chosen");
      const text = await page.locator(DIALOG).innerText();
      t.ok(text.includes("Payment is charged through Google Play when you confirm.") && !/Apple Account/.test(text), "5c …with Google Play's approved disclosure");
      await page.waitForTimeout(600);
      await shot(page, "android-founding-plans-auto-open.png");
      await page.locator(`${DIALOG} button[aria-label="Close"]`).click();
      t.ok(await until(async () => !(await dialogUp(page)), 5000), "5d closed, onboarding is where it was underneath");
      await shot(page, "android-onboarding-after-close.png");
      await ctx.close();
      onboarded = true;
    }
    // ── 6. Keep the trial ────────────────────────────────────────────────────────────────────────
    {
      const O = await import("../src/lib/storeOffer.js");
      const W = O.TRIAL_KEEP_COPY;
      const scenario = { status: status({ founding: true, spots: 7 }) };
      const { ctx, page, asked } = await phone({ scenario });
      await go(page);
      t.ok(await until(() => dialogUp(page), 15000), "6a (it opened by itself, the account in its 14-day trial)");
      await page.locator(`${DIALOG} [data-trial-link]`).waitFor({ timeout: 10000 });
      t.eq(await page.locator(`${DIALOG} [data-trial-link]`).innerText(), W.link, "6b the small print under the plans");
      const order = await page.locator(DIALOG).evaluate((d) => { const all = [...d.querySelectorAll("*")]; const at = (sel) => all.indexOf(d.querySelector(sel));
        return [at('[data-plan="monthly"]'), at("[data-trial-link]")]; });
      t.ok(order[0] >= 0 && order[1] > order[0], "6c …below the plans");
      const before = asked.filter((a) => a === "store_status").length;
      scenario.status = status({ founding: true, spots: 6 });        // a spot was taken since the screen opened
      await page.locator(`${DIALOG} [data-trial-link]`).click();
      const confirm = page.locator("[data-trial-confirm]");
      await confirm.waitFor({ timeout: 5000 });
      t.ok(await until(async () => (await confirm.innerText()).includes(O.trialConfirmBody(6)), 5000) && asked.filter((a) => a === "store_status").length > before,
        "6d the confirm states the live spots left, asked of the server as it opens (6, not the 7 the screen opened with)");
      const ctext = await confirm.innerText();
      t.ok(ctext.includes(W.title) && ctext.includes(W.stay) && ctext.includes(W.leave), "6e …with its title and two buttons");
      t.eq(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute("data-trial-stay")), true, "6f the first button has the focus");
      await page.waitForTimeout(300);
      await shot(page, "ios-trial-confirm.png");
      await page.locator("[data-trial-stay]").click();
      t.ok(await until(async () => (await confirm.count()) === 0, 3000) && await dialogUp(page) && (await plans(page))[0][0] === "founding_annual", "6g stay: back to the plans, Founding annual still first");
      await page.locator(`${DIALOG} [data-trial-link]`).click();
      await confirm.waitFor({ timeout: 5000 });
      await page.locator("[data-trial-leave]").click();
      t.ok(await until(async () => !(await dialogUp(page)), 5000), "6h leave: the plans close");
      t.ok(await page.getByText(/days? left/i).first().isVisible().catch(() => false), "6i …and the trial goes on (the trial chip is there)");
      asked.length = 0;
      await go(page);
      await quiet(page, asked);
      t.eq(await dialogUp(page), false, "6j the plans do not reopen on their own afterwards");
      await ctx.close();

      const none = { status: status({ founding: true, spots: null }) };
      const p2 = await phone({ scenario: none });
      await go(p2.page);
      t.ok(await until(() => dialogUp(p2.page), 15000), "6k (founding offered, but no count came with it)");
      await p2.page.locator(`${DIALOG} [data-plan]`).first().waitFor({ timeout: 10000 });
      t.eq(await p2.page.locator(`${DIALOG} [data-trial-link]`).count(), 0, "6l no count to state: no trial link");
      await p2.ctx.close();
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.message) || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("FOUNDING PLANS (browser)");
})();
