// tests/storeFounding.test.cjs
// -----------------------------------------------------------------------------
// FOUNDING 50 IN THE STORE APPS (founder's rule, 2026-10-17: one ledger of 50 positions shared by the website,
// iPhone and Android; the founding price, CAD 79.99 a year plus tax, locked while continuously subscribed).
//
//   1  the founding offering is shown only to a household holding a position: store_status says so only when
//      checkout's own rule (_lib/foundingCohort.js mayBuyFoundingPrice) does, and the app offers the founding
//      package only then;
//   2  a household that paid the founding price on the website is unlocked in the iPhone and Android 1.1 apps
//      through the shared entitlements (Apple 3.1.3(b): the same plan is sold in-app), and is never offered a
//      second, store purchase; a 1.0 build (which cannot sell) still ignores it;
//   3  a founding store purchase the server did not offer is counted (it was paid) and flagged for support;
//   4  the store setup that keeps the price locked and the offer closed (docs/ops/IAP-1.1.md): Apple, the
//      founding annual in a subscription group of its own, never removed from sale, its price raised for new
//      subscribers only once 50 are issued (not a Promotional Offer); Google, Resubscribe off on the founding
//      base plan and the base plan deactivated once 50 are issued. With the Apple and Google pages cited.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const S = require("../netlify/functions/_lib/storeSubscriptions.js");
const R = require("../netlify/functions/_lib/planRules.js");

const NOW = Date.now();
const LATER = new Date(NOW + 200 * 86400000).toISOString();
const U1 = "11111111-1111-4111-8111-111111111111";
const HOLDER = "holder@example.ca", NOBODY = "nobody@example.ca";

// A service-role client with a founding ledger behind waitlist_founding_number_for_email (0025).
function fakeAdmin({ email, confirmedByLink = true, position = null, subscriptions = [], profile = null } = {}) {
  const db = { subscriptions: subscriptions.map((r) => ({ ...r })), profiles: profile ? [{ user_id: U1, ...profile }] : [] };
  const from = (name) => {
    const f = [];
    const rows = () => (db[name] || []).filter((r) => f.every(([c, v]) => r[c] === v));
    const q = { select() { return q; }, eq(c, v) { f.push([c, v]); return q; },
      async maybeSingle() { return { data: rows()[0] ? { ...rows()[0] } : null, error: null }; },
      upsert(payload) { (db[name] = db[name] || []).push({ ...payload }); return Promise.resolve({ error: null }); } };
    return q;
  };
  return {
    from,
    rpc: async (fn, args) => fn === "waitlist_founding_number_for_email"
      ? { data: args.p_email === email && position ? position : null, error: null } : { data: null, error: null },
    auth: { admin: { getUserById: async () => ({ data: { user: { id: U1, email, email_confirmed_at: confirmedByLink ? "2026-10-17T00:00:00Z" : null,
      app_metadata: { email_confirmation: "link" } } }, error: null }) } },
    db,
  };
}
function loadBilling(admin) {
  delete require.cache[BILLING_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[API_PATH];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: U1, error: null }), getAdminClient: () => admin };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripePost: async () => ({ id: "cs", url: "https://stripe.test/x" }) } };
  const mod = require(BILLING_PATH); delete require.cache[BILLING_PATH]; return mod;
}
const post = (body) => ({ httpMethod: "POST", headers: { origin: "capacitor://localhost", authorization: "Bearer x" }, body: JSON.stringify(body) });

(async () => {
  const t = create();
  const C = await import("../src/lib/storeBilling.js");
  const saved = { ...process.env };
  process.env.IAP_ENABLED = "true";
  const status = async (admin) => JSON.parse((await loadBilling(admin).handler(post({ action: "store_status" }))).body);

  // ── 1. Only a household holding a position sees the founding offering. ───────────────────────────
  {
    const holder = await status(fakeAdmin({ email: HOLDER, position: 12 }));
    const nobody = await status(fakeAdmin({ email: NOBODY, position: null }));
    const unconfirmed = await status(fakeAdmin({ email: HOLDER, position: 12, confirmedByLink: false }));
    t.eq([holder.founding.available, nobody.founding.available, unconfirmed.founding.available], [true, false, false],
      "1a store_status offers the founding price to a household holding a position, never to one without, never before the address is confirmed");
    const ended = await status(fakeAdmin({ email: HOLDER, position: 12, subscriptions: [{ user_id: U1, provider: "app_store", status: "canceled", current_period_end: "2026-01-01T00:00:00Z", founding_ended_at: "2026-01-01T00:00:00Z" }] }));
    t.eq(ended.founding.available, false, "1b …nor to one whose founding subscription ended (ended is final)");
    const offerings = { current: { availablePackages: [{ product: { identifier: "app.flourishmoney.plus.monthly" } }, { product: { identifier: "app.flourishmoney.plus.annual" } }] },
      all: { default: { availablePackages: [{ product: { identifier: "app.flourishmoney.plus.monthly" } }, { product: { identifier: "app.flourishmoney.plus.annual" } }] },
        founding: { availablePackages: [{ product: { identifier: "app.flourishmoney.founding.annual" } }] } } };
    const ids = (fa) => Object.values(C.choosePackages(offerings, { foundingAvailable: fa })).filter(Boolean).map((p) => p.product.identifier).sort();
    t.eq([ids(nobody.founding.available), ids(holder.founding.available)],
      [["app.flourishmoney.plus.annual", "app.flourishmoney.plus.monthly"], ["app.flourishmoney.founding.annual", "app.flourishmoney.plus.monthly"]],
      "1c the app offers the founding annual only on that answer (in place of the regular annual), never otherwise");
    const paywall = read("src", "App.jsx");
    const sp = paywall.slice(paywall.indexOf("function StorePaywall("), paywall.indexOf("function Paywall("));
    t.ok(/const foundingAvailable = !!status\?\.founding\?\.available;/.test(sp) && /choosePackages\(off, \{ foundingAvailable \}\)/.test(sp),
      "1d (the paywall takes the founding answer from the server's store_status, not from anything the app knows)");
  }

  // ── 2. A household that paid the founding price on the website is unlocked in the apps. ────────────
  {
    const webFounder = [{ user_id: U1, provider: "stripe", status: "active", plan_key: "founding_annual", current_period_end: LATER, provider_subscription_id: "sub_1" }];
    const st = await status(fakeAdmin({ email: HOLDER, position: 12, subscriptions: webFounder }));
    t.eq([st.paid, st.provider, st.plan_key, st.founding.available], [true, "stripe", "founding_annual", false],
      "2a store_status: paid, through the website's founding subscription, and nothing more to buy (founding not offered again)");
    let bought = 0;
    const out = await C.buy({ serverStatus: async () => st, purchasePackage: async () => { bought++; }, serverSync: async () => ({ paid: true }) }, { product: { identifier: "app.flourishmoney.founding.annual" } });
    t.eq([out.outcome, bought], ["already_paid", 0], "2b …so the app never opens the store's sheet for it: no second charge");
    const row = { provider: "stripe", status: "active", plan_key: "founding_annual", current_period_end: LATER };
    t.eq([R.deriveEntitlement({}, row, NOW, { native: true, storeBilling: true }).plan, R.deriveEntitlement({}, row, NOW, {}).plan], ["premium", "premium"],
      "2c the shared entitlements unlock it in a 1.1 store app exactly as on the website (Apple 3.1.3(b): the same plan is sold in-app)");
    t.eq(R.deriveEntitlement({}, row, NOW, { native: true, storeBilling: false }).plan, "premium", "2d (a 1.0 build gets the same answer since 2026-10-20: one rule for every app, #84)");
  }

  // ── 3. A founding store purchase the server did not offer: counted, flagged. ────────────────────────
  {
    const admin = { from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; }, upsert: async () => ({ error: null }) }), rpc: async () => ({ data: null, error: null }) };
    const sub = { subscriptions: { "app.flourishmoney.founding.annual": { store: "app_store", period_type: "normal", expires_date: LATER, is_sandbox: false, ownership_type: "PURCHASED" } }, entitlements: {} };
    const r = await S.syncStoreSubscription(admin, U1, { fetchSubscriber: async () => sub, user: { email: NOBODY }, now: NOW, env: {}, mayBuyFounding: async () => false });
    t.eq([r.paid, r.plan_key, r.flag], [true, "founding_annual", "founding_not_eligible"], "3a a founding purchase by a household without a position is counted (it was paid) and flagged for support");
  }

  // ── 4. The store setup that keeps the price locked and the offer closed. ────────────────────────────
  {
    const D = read("docs", "ops", "IAP-1.1.md");
    const apple = D.slice(D.indexOf("Founding annual, in a SUBSCRIPTION GROUP OF ITS OWN"), D.indexOf("Connecting Apple to RevenueCat:"));
    t.ok(/Subscription Groups → \*\*\+\*\* → Reference Name: `Flourish founding`/.test(apple) && /In the `Flourish founding` group, \*\*Create\*\*/.test(apple),
      "4a Apple: the founding annual is in a subscription group of its own, so it is never offered as a plan to switch to");
    t.ok(/NEVER use \*\*Remove from Sale\*\* on the founding annual/.test(apple), "4b Apple: never removed from sale (removal stops renewals)");
    t.ok(/keep existing subscribers at their current price/.test(apple) && /50th founding position/.test(apple), "4c Apple: once 50 are issued its price rises for new subscribers only; founding households keep CAD 79.99");
    t.ok(/Promotional Offer[^.]*cannot keep the price/.test(apple) && /existing and\s+previously subscribed customers/.test(apple), "4d Apple: why not a Promotional Offer (new households are not eligible; at most one year)");
    for (const url of ["https://developer.apple.com/app-store/subscriptions/", "https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-availability-for-an-auto-renewable-subscription/",
      "https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-promotional-offers-for-auto-renewable-subscriptions/"]) t.ok(apple.includes(url), `4e Apple's page is cited: ${url}`);
    t.ok(!/same level\*\* \(they are one service at three prices/.test(D) && !/Promotional Offer on `app\.flourishmoney\.plus\.annual`, signed by the server,\s+instead/.test(D),
      "4f the old setup is gone (all three on one level; the Promotional Offer as the fix)");
    const play = D.slice(D.indexOf("### C. Play Console"), D.indexOf("### D. RevenueCat"));
    t.ok(/`founding` → base plan settings → \*\*Resubscribe\*\*: off/.test(play) && /`founding` → \*\*Deactivate\*\*/.test(play), "4g Google: Resubscribe off on the founding base plan, and deactivated once 50 are issued");
    t.ok(play.includes("https://support.google.com/googleplay/android-developer/answer/140504?hl=en") && play.includes("https://developer.android.com/google/play/billing/subscriptions"),
      "4h Google's pages are cited");
    t.eq(C.PRODUCT_IDS.ios.founding_annual + " " + C.PRODUCT_IDS.android.founding_annual, "app.flourishmoney.founding.annual flourish_plus:founding",
      "4i (the product ids the setup names are the ones the code buys)");
  }

  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  t.summary("storeFounding.test");
})();
