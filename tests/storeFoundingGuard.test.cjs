// tests/storeFoundingGuard.test.cjs
// -----------------------------------------------------------------------------
// NEVER BILLED FOR A REGULAR PLAN AND THE FOUNDING PLAN AT ONCE (version 1.1, 2026-10-18).
//
// The founding annual is an App Store subscription group of its own (docs/ops/IAP-1.1.md item 6), and Apple lets one
// person hold a subscription in each group at the same time. So:
//   1  a household the founding price is offered to (2026-10-29: confirmed, while founding seats are left) while a
//      regular store subscription is live (a free month included)
//      is told so by the server (store_status founding.held_on_regular_plan), and is never offered the founding
//      price on top: the paywall in that state sells nothing and opens the store's own manage-subscriptions screen
//      (Apple's sheet, Google Play's page), never a cancel flow of ours; Settings is the way in (once the founder's
//      words exist); the back key closes it;
//   2  if both are ever live, the household keeps its access, the row is flagged for support (support_flag,
//      migration 0022) and the support inbox is emailed the same moment, once (_lib/supportAlert.js); a store
//      purchase on top of a paid website subscription is flagged the same way;
//   3  no product has an introductory offer (the founding annual since 2026-10-18, all three since 2026-10-20): with
//      two App Store groups one would be claimable twice (one per group), cited; the paywall says each price is
//      charged on confirmation.
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
const A = require("../netlify/functions/_lib/supportAlert.js");

const NOW = Date.now();
const LATER = new Date(NOW + 200 * 86400000).toISOString();
const SOON = new Date(NOW + 20 * 86400000).toISOString();
const U1 = "11111111-1111-4111-8111-111111111111";
const HOLDER = "holder@example.ca";

function fakeAdmin({ email = HOLDER, position = 12, subscriptions = [], seats = 0 } = {}) {
  const db = { subscriptions: subscriptions.map((r) => ({ user_id: U1, ...r })) };
  const calls = { upserts: [], updates: [] };
  const from = (name) => {
    const f = [];
    const rows = () => (db[name] || []).filter((r) => f.every(([c, v]) => r[c] === v));
    const q = {
      select() { return q; }, eq(c, v) { f.push([c, v]); return q; },
      async maybeSingle() { return { data: rows()[0] ? { ...rows()[0] } : null, error: null }; },
      upsert(payload) { calls.upserts.push({ ...payload }); const t = (db[name] = db[name] || []); const i = t.findIndex((r) => r.user_id === payload.user_id);
        if (i >= 0) t[i] = { ...t[i], ...payload }; else t.push({ ...payload }); return Promise.resolve({ error: null }); },
      update(patch) { return { eq: async (c, v) => { calls.updates.push({ ...patch }); (db[name] || []).filter((r) => r[c] === v).forEach((r) => Object.assign(r, patch)); return { error: null }; } }; },
    };
    return q;
  };
  return {
    from, db, calls,
    rpc: async (fn, args) => fn === "waitlist_founding_number_for_email" ? { data: args.p_email === email && position ? position : null, error: null }
      : fn === "founding_seats_taken" ? { data: seats, error: null } : { data: null, error: null },
    auth: { admin: { getUserById: async () => ({ data: { user: { id: U1, email, email_confirmed_at: "2026-10-17T00:00:00Z", app_metadata: { email_confirmation: "link" } } }, error: null }) } },
  };
}
function loadBilling(admin) {
  delete require.cache[BILLING_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[API_PATH];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: U1, error: null }), getAdminClient: () => admin };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripeGet: async () => ({ data: [] }), stripePost: async () => ({ id: "cs", url: "https://stripe.test/x" }) } };
  const mod = require(BILLING_PATH); delete require.cache[BILLING_PATH]; return mod;
}
const post = (body) => ({ httpMethod: "POST", headers: { origin: "capacitor://localhost", authorization: "Bearer x" }, body: JSON.stringify(body) });
const sub = (key, o = {}) => ({ store: o.store || "app_store", period_type: o.period || "normal", expires_date: o.expires || LATER, is_sandbox: false, ownership_type: "PURCHASED", unsubscribe_detected_at: o.cancelled ? "2026-10-01T00:00:00Z" : null });

(async () => {
  const t = create();
  const C = await import("../src/lib/storeBilling.js");
  const O = await import("../src/lib/storeOffer.js");
  const B = await import("../src/lib/backButton.js");
  const APP = read("src", "App.jsx");
  const saved = { ...process.env };
  process.env.IAP_ENABLED = "true";
  const status = async (admin) => JSON.parse((await loadBilling(admin).handler(post({ action: "store_status" }))).body);

  // ── 1. The server says when a household offered founding is on a live regular store plan. ─────────────
  {
    const monthly = { provider: "app_store", status: "active", plan_key: "monthly", current_period_end: SOON, cancel_at_period_end: false };
    const s1 = await status(fakeAdmin({ subscriptions: [monthly] }));
    t.eq([s1.paid, s1.founding.available, s1.founding.held_on_regular_plan], [true, false, { renews: true, period_end: SOON }],
      "1a a household offered the founding price, paying a regular store plan: still paid, never offered it on top, told it could switch (renewing, until when)");
    const trial = await status(fakeAdmin({ subscriptions: [{ ...monthly, status: "trialing", plan_key: "annual" }] }));
    t.eq(trial.founding.held_on_regular_plan && trial.founding.held_on_regular_plan.renews, true, "1b …a regular plan in its free month counts too (the trial would turn into a charge)");
    const off = await status(fakeAdmin({ subscriptions: [{ ...monthly, cancel_at_period_end: true }] }));
    t.eq(off.founding.held_on_regular_plan, { renews: false, period_end: SOON }, "1c …and once it is cancelled in the store it says it will not renew, still live until its end");
    const nobody = await status(fakeAdmin({ seats: 50, subscriptions: [monthly] }));
    const founder = await status(fakeAdmin({ subscriptions: [{ ...monthly, plan_key: "founding_annual" }] }));
    const web = await status(fakeAdmin({ subscriptions: [{ ...monthly, provider: "stripe" }] }));
    const unpaid = await status(fakeAdmin({ subscriptions: [] }));
    t.eq([nobody.founding.held_on_regular_plan, founder.founding.held_on_regular_plan, web.founding.held_on_regular_plan, unpaid.founding.held_on_regular_plan, unpaid.founding.available],
      [null, null, null, null, true],
      "1d not once 50 founding seats are held, nor for one already on the founding plan, one paying on the website, or one paying nothing (who is simply offered the founding price)");

    t.eq([C.foundingSwitch(s1), C.foundingSwitch(off), C.foundingSwitch(unpaid)], [{ renews: true, periodEnd: SOON }, { renews: false, periodEnd: SOON }, null], "1e the app reads that answer (foundingSwitch)");
    let bought = 0;
    const out = await C.buy({ serverStatus: async () => s1, purchasePackage: async () => { bought++; }, serverSync: async () => ({ paid: true }) }, { product: { identifier: "app.flourishmoney.founding.annual" } });
    t.eq([out.outcome, bought], ["already_paid", 0], "1f a founding purchase asked for anyway never opens the store's sheet while the regular plan is live");

    const sp = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("function Paywall("));
    t.ok(/const held = foundingSwitch\(status\);/.test(sp) && /if\(held\) return \(\)=>\{ cancelled=true; \};/.test(sp) && /\{!held && cards\.map\(/.test(sp),
      "1g the paywall in that state loads no offerings and shows no plan to buy");
    t.ok(/\{onManage&&<button onClick=\{onManage\}[^>]*>Manage subscription<\/button>\}/.test(sp), "1h …it shows the store's own screen to cancel the regular plan");
    const manage = APP.slice(APP.indexOf("function manageStoreSubscription(){"), APP.indexOf("function manageStoreSubscription(){") + 500);
    t.ok(/storePurchases\.showManageSubscriptions\(\)/.test(manage) && /play\.google\.com\/store\/account\/subscriptions\?package=com\.flourishmoney\.app/.test(manage) && !/fetch\(|askStore\(|cancel/i.test(manage.replace(/\/\*[\s\S]*?\*\//g, "")),
      "1i …which is Apple's manage-subscriptions sheet or Google Play's subscriptions page, never a cancel flow of ours");
    t.ok(/onManage=\{manageStoreSubscription\} onClose=\{\(\)=>\{ setPaywallUp\(false\); setFoundingSwitchOpen\(false\); setPaywallLegal\(null\); \}\}/.test(APP), "1j the overlay wires it, and it can always be closed (2026-10-20: no hard paywall)");
    t.ok(/foundingSwitch: foundingSwitch\(storeStatus\) && FOUNDING_SWITCH_COPY\.settingsLine && FOUNDING_SWITCH_COPY\.settingsButton/.test(APP) && /onOpen: \(\)=>setFoundingSwitchOpen\(true\)/.test(APP),
      "1k Settings is the way in, and only once the founder's words exist (no wording is written by this change)");
    t.ok(Object.keys(O.FOUNDING_SWITCH_COPY).join(",") === "settingsLine,settingsButton,title,body,bodyCancelled" && Object.values(O.FOUNDING_SWITCH_COPY).every((v) => v === null || (typeof v === "string" && v.trim())),
      "1l the words the founder owes are named, and each is either still empty or written");
    t.eq([B.backAction({ foundingSwitchOpen: true }), B.backAction({ foundingSwitchOpen: true, paywallLegal: "terms" }), B.backAction({ paywallUp: true })], ["closeFoundingSwitch", "closePaywallLegal", "closeStorePaywall"],
      "1m the back key closes it, and the paywall too (2026-10-20: it is one more screen)");
  }

  // ── 2. If both are ever live: access kept, flagged on the row, the inbox told once. ──────────────────────
  {
    const sent = [];
    const alertSupport = async (m) => { sent.push(m); return true; };
    const both = { subscriptions: { "app.flourishmoney.plus.monthly": sub("m"), "app.flourishmoney.founding.annual": sub("f") }, entitlements: {} };
    const admin = fakeAdmin({ subscriptions: [] });
    const run = () => S.syncStoreSubscription(admin, U1, { fetchSubscriber: async () => both, user: { email: HOLDER }, now: NOW, env: {}, mayBuyFounding: async () => true, alertSupport });
    const r1 = await run();
    const row1 = { ...admin.db.subscriptions[0] };
    t.eq([r1.paid, r1.flag, row1.support_flag, typeof row1.support_flag_at], [true, "two_store_subscriptions", "two_store_subscriptions", "string"],
      "2a both live: the household keeps its access, and the row is flagged for support with the time");
    t.eq(sent.map((m) => [m.flag, m.userId, m.provider]), [["two_store_subscriptions", U1, "app_store"]], "2b …and the support inbox is told the same moment");
    await run();
    t.eq([sent.length, admin.db.subscriptions[0].support_flag_at], [1, row1.support_flag_at], "2c the next sync tells nobody again and keeps the first time seen");
    const throwing = await S.syncStoreSubscription(fakeAdmin({ subscriptions: [] }), U1, { fetchSubscriber: async () => both, user: { email: HOLDER }, now: NOW, env: {}, mayBuyFounding: async () => true,
      alertSupport: async () => { throw new Error("mail down"); } });
    t.eq([throwing.paid, throwing.flag], [true, "two_store_subscriptions"], "2d a failed alert never fails the sync or the household's access");

    const webAdmin = fakeAdmin({ subscriptions: [{ provider: "stripe", status: "active", plan_key: "founding_annual", current_period_end: LATER }] });
    const sentWeb = [];
    const rw = await S.syncStoreSubscription(webAdmin, U1, { fetchSubscriber: async () => ({ subscriptions: { "app.flourishmoney.plus.monthly": sub("m") }, entitlements: {} }),
      user: { email: HOLDER }, now: NOW, env: {}, mayBuyFounding: async () => true, alertSupport: async (m) => { sentWeb.push(m.flag); return true; } });
    t.eq([rw.paid, rw.conflict, rw.flag, webAdmin.db.subscriptions[0].provider, webAdmin.db.subscriptions[0].support_flag, sentWeb], [true, true, "store_and_web_subscriptions", "stripe", "store_and_web_subscriptions", ["store_and_web_subscriptions"]],
      "2e a store purchase on top of a paid website subscription (the founding price paid on the web) is flagged the same way; the website's row stays");

    const msg = A.supportAlertMessage({ flag: "two_store_subscriptions", userId: U1, provider: "app_store" });
    t.ok(msg.subject.includes("two_store_subscriptions") && msg.text.includes(U1) && !/@/.test(msg.text) && !/\$\s?\d/.test(msg.text), "2f the alert carries the account id and the flag, never an address or an amount");
    const posts = [];
    const ok = await A.alertSupport({ flag: "two_store_subscriptions", userId: U1, provider: "app_store" }, { env: { RESEND_API_KEY: "re_test" }, fetchImpl: async (url, o) => { posts.push([url, JSON.parse(o.body).to]); return { ok: true }; } });
    const skipped = await A.alertSupport({ flag: "x", userId: U1 }, { env: {}, fetchImpl: async () => { throw new Error("must not send"); } });
    t.eq([ok, posts, skipped], [true, [["https://api.resend.com/emails", ["hello@flourishmoney.app"]]], false], "2g it goes to the support inbox through Resend, and without a key nothing is sent");
    const M22 = read("supabase", "migrations", "0022_store_support_flags.sql");
    t.ok(/add column if not exists support_flag text/.test(M22) && /add column if not exists support_flag_at timestamptz/.test(M22) && /^-- grants: service_role only$/m.test(M22) && !/^\s*(drop|delete)/im.test(M22),
      "2h migration 0022 only adds the two nullable columns (rollback in its header)");
  }

  // ── 3. No introductory offer on any product, the founding annual included (2026-10-18, all products 2026-10-20). ──
  {
    const D = read("docs", "ops", "IAP-1.1.md");
    const appleAll = D.slice(D.indexOf("### B. App Store Connect"), D.indexOf("Connecting Apple to RevenueCat:"));
    const apple = D.slice(D.indexOf("Founding annual, in a SUBSCRIPTION GROUP OF ITS OWN"), D.indexOf("Connecting Apple to RevenueCat:"));
    const play = D.slice(D.indexOf("### C. Play Console"), D.indexOf("### D. RevenueCat"));
    t.ok(/34\. Introductory Offers: \*\*none\*\*/.test(apple) && /14\. Introductory Offers: \*\*none\*\*/.test(appleAll) && /23\. Introductory Offers: \*\*none\*\*/.test(appleAll) && !/Introductory Offers → \*\*\+\*\*/.test(D),
      "3a App Store: no product has an introductory offer, the founding annual included");
    t.ok(/Customers can\s+redeem one introductory offer per subscription group/.test(apple) && apple.includes("https://developer.apple.com/app-store/subscriptions/"),
      "3b …and with two groups one would have been claimable twice (Apple's rule, cited)");
    t.ok(/21\. `monthly`, `annual`, `founding`: \*\*no offer\*\* on any of them/.test(play) && !/Offers → \*\*Add offer\*\*/.test(D) && !/free-month|Free trial/.test(D) && /Why no offer on any base plan/.test(play),
      "3c Google Play: no offer on any base plan, so the prices are the same offer in both stores");
    t.ok(!("introEligible" in O), "3d the app asks the store for no introductory eligibility (lib/storeOffer.js)");
    const founding = O.offerCopy({ plan: "founding_annual", priceString: "CA$79.99", platform: "ios" });
    t.eq([founding.button, founding.note, O.storeDisclosure("ios").startsWith("Payment is charged to your Apple Account when you confirm.")], ["Subscribe for CA$79.99 a year", O.FOUNDING_LINE, true],
      "3e the paywall promises no free month: the founding annual is charged on confirmation (the approved disclosure)");
  }

  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  t.summary("storeFoundingGuard.test");
})();
