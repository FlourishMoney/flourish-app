// tests/plusBuy.test.cjs
// -----------------------------------------------------------------------------
// BUYING THE FLOURISH PLUS ADD-ON (1.1.8, 2026-11-20): src/lib/plusBuy.js and src/PlusAddonScreen.jsx.
//   1  the add-on's ids are its own, the same on the app and the server, and never the main plan's; its prices
//   2  only the add-on's own offering and products are ever offered as Plus
//   3  THE PRODUCTS DO NOT EXIST YET: every such answer from the store is one calm state, never a throw
//   4  what the screen may show, from the server's answer alone (offer, have, manage, unavailable, hidden)
//   5  a store purchase: nothing is sold on a guess, nothing twice, and every way it can end has an outcome
//   6  the website: Stripe's own address only; every server answer has an outcome
//   7  coming back from Stripe grants nothing
//   8  every outcome has a line or none, and none throws
//   9  the words: 20 placeholders, each listed with its facts and limit, each with a draft that fits
//  10  the screen, rendered: the website shows our price and never Restore; a store app shows no price of ours, no
//      Stripe and no website, and has Restore purchases, Terms of Use and Privacy Policy
//  11  the app: the screen is behind the server's answer; a store app ignores a return address
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const ok200 = (body) => ({ status: 200, body: { enabled: true, covered_by: null, manage: null, ...body } });
const pkg = (id, priceString) => ({ identifier: id, product: { identifier: id, priceString } });
const rcError = (code) => Object.assign(new Error("store"), { code });

(async () => {
  const t = create();
  const B = await import("../src/lib/plusBuy.js");
  const SB = await import("../src/lib/storeBilling.js");
  const PR = await import("../src/lib/pricing.js");
  const W = await import("../src/lib/netWorthWords.js");
  const SO = await import("../src/lib/storeOffer.js");
  const SRV = require("../netlify/functions/_lib/plusAddon.js");
  const LIMITS = require("../netlify/functions/_lib/bankLimits.js");

  // ── 1. The ids and the prices ────────────────────────────────────────────────────────────────
  {
    const mine = Object.values(B.PLUS_PRODUCT_IDS).flatMap((o) => Object.entries(o).map(([plan, id]) => `${id}=${plan}`)).sort();
    const servers = Object.entries(SRV.PLUS_PRODUCTS).map(([id, plan]) => `${id}=${plan}`).sort();
    t.eq(mine, servers, "1a the app's product table is the server's, product for product and plan for plan");
    t.eq(mine, ["app.flourishmoney.plusaddon.annual=plus_annual", "app.flourishmoney.plusaddon.monthly=plus_monthly", "flourish_plus_addon:annual=plus_annual", "flourish_plus_addon:monthly=plus_monthly"],
      "1b …and they are the ids Amanda fixed: app.flourishmoney.plusaddon.monthly / .annual, and Play's flourish_plus_addon with base plans monthly and annual");
    t.eq([B.PLUS_ADDON_ENTITLEMENT_ID, SRV.PLUS_ENTITLEMENT_ID, B.PLUS_OFFERING_ID], ["plus_addon", "plus_addon", "plus_addon"], "1c RevenueCat's entitlement is plus_addon, and the add-on has an offering of its own");
    const main = Object.values(SB.PRODUCT_IDS).flatMap((o) => Object.values(o));
    t.ok(B.PLUS_ADDON_ENTITLEMENT_ID !== SB.ENTITLEMENT_ID && !Object.values(SB.OFFERING_IDS).includes(B.PLUS_OFFERING_ID)
      && Object.values(B.PLUS_PRODUCT_IDS).flatMap((o) => Object.values(o)).every((id) => !main.includes(id) && SB.planKeyForProduct(id) === null)
      && main.every((id) => B.plusPlanForProduct(id) === null), "1d none of them is the main plan's: its entitlement, its offerings and its products are all different");
    t.eq([PR.PLUS_ADDON_PRICING.CA.monthly, PR.PLUS_ADDON_PRICING.CA.annual, PR.PLUS_ADDON_PRICING.CA.currency], [4.99, 49.99, "CAD"], "1e $4.99 a month and $49.99 a year, in CAD");
    t.eq([B.PLUS_HOUSEHOLD_BANKS, LIMITS.PLUS_HOUSEHOLD_FAIR_USE], [10, 10], "1f the line's fair use limit is the server's own");
    t.eq(B.PLUS_PLAN_KEYS.join(","), SRV.PLUS_PLAN_KEYS.join(","), "1g the plan keys are the server's");
  }

  // ── 2. Only the add-on's offering, only its products ─────────────────────────────────────────────────
  {
    const mainMonthly = pkg("app.flourishmoney.plus.monthly", "$11.99");
    const addM = pkg("app.flourishmoney.plusaddon.monthly", "$4.99"), addA = pkg("app.flourishmoney.plusaddon.annual", "$49.99");
    const std = { identifier: "default", availablePackages: [mainMonthly, pkg("app.flourishmoney.plus.annual", "$99.99")] };
    const got = B.choosePlusPackages({ current: std, all: { default: std, plus_addon: { identifier: "plus_addon", availablePackages: [addM, addA] } } });
    t.eq([got.plus_monthly === addM, got.plus_annual === addA], [true, true], "2a the two add-on packages, from the add-on's offering");
    t.eq(B.choosePlusPackages({ current: std, all: { default: std } }), { plus_monthly: null, plus_annual: null }, "2b no add-on offering: nothing, never the current offering's plans");
    t.eq(B.choosePlusPackages({ all: { plus_addon: { availablePackages: [mainMonthly] } } }), { plus_monthly: null, plus_annual: null }, "2c a main-plan product put in the add-on's offering by mistake is never offered as Plus");
    t.eq([null, undefined, {}, { all: null }, { all: { plus_addon: {} } }, { all: { plus_addon: { availablePackages: [null, {}, { product: null }] } } }].map((o) => JSON.stringify(B.choosePlusPackages(o))),
      Array(6).fill(JSON.stringify({ plus_monthly: null, plus_annual: null })), "2d an empty, missing or broken answer: nothing, and no throw");
    const android = B.choosePlusPackages({ all: { plus_addon: { availablePackages: [pkg("flourish_plus_addon:annual", "$49.99")] } } });
    t.eq([android.plus_monthly, !!android.plus_annual], [null, true], "2e Google's product names (subscription:base plan), one plan alone");
    const cards = B.plusStoreCards({ plus_monthly: addM, plus_annual: addA }, "ios");
    t.eq(cards.map((c) => [c.planKey, c.name, c.price, c.button, c.note]), [["plus_monthly", "Monthly", "$4.99 a month", "Subscribe for $4.99 a month", null], ["plus_annual", "Annual", "$49.99 a year", "Subscribe for $49.99 a year", null]],
      "2f a store card shows the store's own price string, in the approved pattern");
    t.eq(B.plusStoreCards({ plus_monthly: pkg("app.flourishmoney.plusaddon.monthly", ""), plus_annual: null }), [], "2g a product with no price is not offered");
    t.eq(B.plusWebCards().map((c) => [c.planKey, c.name, c.price, c.note, c.button]), [["plus_monthly", "Monthly", "$4.99 a month", "CAD plus tax", "Go to secure checkout"], ["plus_annual", "Annual", "$49.99 a year", "CAD plus tax", "Go to secure checkout"]],
      "2h the website's two plans: our price, CAD plus tax");
  }

  // ── 3. The products do not exist yet ─────────────────────────────────────────────────────────────
  {
    const std = { identifier: "default", availablePackages: [pkg("app.flourishmoney.plus.monthly", "$11.99")] };
    const states = [];
    states.push((await B.loadPlusPackages(null)).state);
    states.push((await B.loadPlusPackages({})).state);
    states.push((await B.loadPlusPackages({ getOfferings: async () => ({ current: std, all: { default: std } }) })).state);
    states.push((await B.loadPlusPackages({ getOfferings: async () => ({ all: { plus_addon: { availablePackages: [] } } }) })).state);
    states.push((await B.loadPlusPackages({ getOfferings: async () => { throw rcError("23"); } })).state);
    states.push((await B.loadPlusPackages({ getOfferings: async () => { throw rcError(5); } })).state);
    states.push((await B.loadPlusPackages({ getOfferings: async () => { throw rcError("10"); } })).state);
    states.push((await B.loadPlusPackages({ getOfferings: async () => { throw null; } })).state);
    states.push((await B.loadPlusPackages({ getOfferings: async () => null })).state);
    t.eq(states, ["store_unavailable", "store_unavailable", "not_available", "not_available", "not_available", "not_available", "store_unavailable", "store_unavailable", "not_available"],
      "3a no store, no add-on offering, an empty one, RevenueCat's configuration or product-not-available error, a network error: each is a state, never a throw");
    const ready = await B.loadPlusPackages({ getOfferings: async () => ({ all: { plus_addon: { availablePackages: [pkg("app.flourishmoney.plusaddon.monthly", "$4.99")] } } }) });
    t.eq([ready.state, !!ready.packages.plus_monthly, ready.packages.plus_annual], ["ready", true, null], "3b once a product exists it is offered, the other plan or not");
    t.ok(typeof B.plusOutcomeLine("not_available") === "string" && B.plusOutcomeLine("not_available").length > 0 && typeof B.plusOutcomeLine("store_unavailable") === "string",
      "3c each of those has one line to say");
  }

  // ── 4. What the screen may show ──────────────────────────────────────────────────────────────────
  {
    const v = (res, platform, selling) => { const x = B.plusScreenView(res, { platform, selling }); return [x.mode, x.manage, x.note ? "note" : null].filter((y) => y !== null).join(":"); };
    t.eq([undefined, { status: 404, body: { error: "not_found" } }, { status: 200 }, { status: 200, body: { enabled: true } }, { status: 200, body: { enabled: false, plus: false } }, { status: 500, body: {} }, { status: 200, body: { enabled: true, plus: "yes" } }]
      .map((r) => v(r, "web", true)), Array(7).fill("hidden"), "4a not asked yet, PLUS_ENABLED off (404), or an answer that makes no sense: nothing about Plus");
    t.eq([v(null, "web", true), v({ status: 503, body: { error: "status_unavailable" } }, "ios", true)], ["unavailable", "unavailable"], "4b no answer, or the plan could not be read: unavailable, never an offer and never 'no Plus'");
    const none = ok200({ plus: false });
    t.eq([v(none, "web", true), v(none, "ios", true), v(none, "android", true), v(none, "ios", false), v(none, "android", false)], ["offer", "offer", "offer", "hidden", "hidden"],
      "4c no Plus: the offer on the website and in a store build that sells; nothing in a store build that does not sell");
    t.eq(v(ok200({ plus: false, covered_by: "partner" }), "web", true), "hidden", "4d an answer that contradicts itself offers nothing");
    const have = (manage, covered_by = null) => ok200({ plus: true, manage, covered_by });
    t.eq([v(have("stripe"), "web", true), v(have("stripe"), "ios", true), v(have("stripe"), "android", true)], ["have:portal", "have:note", "have:note"], "4e bought on the website: Stripe's portal on the website; in a store app only a line that names no website");
    t.eq([v(have("app_store"), "ios", true), v(have("app_store"), "ios", false), v(have("app_store"), "android", true), v(have("app_store"), "web", true)], ["have:store", "have:note", "have:note", "have:note"],
      "4f bought in the App Store: Apple's own screen on an iPhone that sells; everywhere else a line");
    t.eq([v(have("play_store"), "android", true), v(have("play_store"), "android", false), v(have("play_store"), "ios", true), v(have("play_store"), "web", true)], ["have:store", "have:store", "have:note", "have:note"],
      "4g bought in Google Play: Google Play's own screen on Android; everywhere else a line");
    t.eq([v(have(null), "web", true), v(have("stripe", "partner"), "web", true), v(have("carrier-pigeon"), "web", true)], ["have", "have", "have"], "4h complimentary Plus, a partner's Plus, an unknown provider: nothing to manage here");
    const native = ["ios", "android"].flatMap((p) => [have("stripe"), have("app_store"), have("play_store"), have(null), have(null, "partner"), none].map((r) => B.plusScreenView(r, { platform: p, selling: true })));
    const nativeWords = native.flatMap((x) => [x.line, x.note]).filter(Boolean);
    t.ok(nativeWords.length >= 10 && !nativeWords.includes(W.netWorthWords("plus-buy-manage-app-store")) && !nativeWords.includes(W.netWorthWords("plus-buy-manage-play")) && !nativeWords.some((s) => /stripe|website|flourishmoney\.app|https?:/i.test(s)),
      "4i a store app is never given a line that names the website, Stripe or the other store");
  }

  // ── 5. A store purchase ───────────────────────────────────────────────────────────────────────
  {
    const P = pkg("app.flourishmoney.plusaddon.monthly", "$4.99");
    const run = async ({ status = ok200({ plus: false }), purchase = async () => ({}), sync = [ok200({ plus: true, manage: "app_store" })], item = P } = {}) => {
      const log = []; let n = 0;
      const deps = {
        serverStatus: async () => { log.push("status"); if (status instanceof Error) throw status; return status; },
        purchasePackage: async (x) => { log.push("purchase"); return purchase(x); },
        serverSync: async () => { log.push("sync"); const r = sync[Math.min(n, sync.length - 1)]; n++; if (r instanceof Error) throw r; return r; },
        sleep: async () => {},
      };
      const r = await B.buyPlusInStore(deps, item);
      return [r.outcome, log.join(",")];
    };
    t.eq(await run(), ["plus", "status,purchase,sync"], "5a the server is asked first, the store's sheet opens, the server confirms: Plus");
    t.eq([await run({ status: null }), await run({ status: new Error("offline") }), await run({ status: { status: 503, body: { error: "status_unavailable" } } }), await run({ status: { status: 404, body: {} } })],
      Array(4).fill(["status_unavailable", "status"]), "5b no answer, a failed read, or PLUS_ENABLED off: nothing is sold on a guess (the sheet never opens)");
    t.eq(await run({ status: ok200({ plus: true, manage: "stripe" }) }), ["already_plus", "status"], "5c the household already has Plus (its own or a partner's): nothing is sold");
    t.eq(await run({ status: ok200({ plus: true, covered_by: "partner" }) }), ["already_plus", "status"], "5c2 …a partner's Plus included");
    t.eq(await run({ item: null }), ["not_available", "status"], "5d no product to sell: not available, and the sheet never opens");
    t.eq([await run({ purchase: async () => { throw rcError("5"); } }), await run({ purchase: async () => { throw rcError("23"); } })], Array(2).fill(["not_available", "status,purchase"]),
      "5e the store says the product is not there (RevenueCat 5 or 23): not available, calmly");
    t.eq([await run({ purchase: async () => { throw rcError("1"); } }), await run({ purchase: async () => { throw Object.assign(new Error("x"), { userCancelled: true }); } })], Array(2).fill(["cancelled", "status,purchase"]), "5f the person closed the sheet: cancelled, and nothing is said");
    t.eq(await run({ purchase: async () => { throw rcError("20"); } }), ["pending", "status,purchase"], "5g Ask to Buy or a slow payment: pending");
    t.eq([await run({ purchase: async () => { throw rcError("3"); } }), await run({ purchase: async () => { throw rcError("6"); } }), await run({ purchase: async () => { throw new Error("boom"); } }), await run({ purchase: async () => { throw null; } })],
      Array(4).fill(["failed", "status,purchase"]), "5h any other refusal: failed, never a throw");
    t.eq(await run({ sync: [null, new Error("x"), ok200({ plus: false }), ok200({ plus: true })] }), ["plus", "status,purchase,sync,sync,sync,sync"], "5i the server is asked again while the store's confirmation lags");
    t.eq(await run({ sync: [ok200({ plus: false })] }), ["unconfirmed", "status,purchase,sync,sync,sync,sync,sync"], "5j never confirmed: unconfirmed after five tries, not Plus");
    t.eq(await run({ sync: [ok200({ plus: true, manage: "stripe", conflict: true })] }), ["charged_twice", "status,purchase,sync"], "5k the store took it although Plus was already on the website: said plainly");
    const restore = async (sync, restorePurchases = async () => ({})) => (await B.restorePlus({ restorePurchases, serverSync: async () => sync, sleep: async () => {} })).outcome;
    t.eq([await restore(ok200({ plus: true })), await restore(ok200({ plus: false })), await restore(null), await restore(ok200({ plus: true }), async () => { throw new Error("x"); })],
      ["plus", "nothing_to_restore", "nothing_to_restore", "failed"], "5l Restore purchases: Plus when the server finds it, 'nothing to restore' when it does not, failed when the store refuses");
    const lib = read("src", "lib", "plusBuy.js");
    t.ok(!/customerInfo|entitlements\.active/.test(lib), "5m the store SDK's own customer record is never read as Plus: only the server's answer is");
  }

  // ── 6. The website ───────────────────────────────────────────────────────────────────────────
  {
    const co = async (answer, plan = "plus_monthly") => { const asked = []; const r = await B.startPlusCheckout({ ask: async (a, p) => { asked.push([a, p]); if (answer instanceof Error) throw answer; return answer; } }, plan); return [r.outcome, r.url || null, asked.length]; };
    t.eq(await co({ status: 200, body: { url: "https://checkout.stripe.com/c/pay/cs_test_1" } }), ["redirect", "https://checkout.stripe.com/c/pay/cs_test_1", 1], "6a the server's Stripe Checkout address is followed");
    t.eq([await co({ status: 200, body: { url: "https://evil.example/pay" } }), await co({ status: 200, body: { url: "https://stripe.com.evil.example/pay" } }), await co({ status: 200, body: { url: "http://checkout.stripe.com/x" } }), await co({ status: 200, body: {} }), await co({ status: 200, body: { url: 7 } })],
      Array(5).fill(["web_failed", null, 1]), "6b an address that is not Stripe's own, over https, is never followed");
    t.eq(await co({ status: 409, body: { error: "already_plus" } }), ["already_plus", null, 1], "6c already has Plus: nothing is sold twice");
    t.eq([await co({ status: 500, body: { error: "price_not_configured" } }), await co({ status: 404, body: { error: "not_found" } }), await co({ status: 400, body: { error: "unknown_plan" } })], Array(3).fill(["not_available", null, 1]),
      "6d no Plus price in Stripe yet, or Plus or billing switched off: not available, calmly");
    t.eq(await co({ status: 200, body: { url: "https://checkout.stripe.com/x" } }, "monthly"), ["not_available", null, 0], "6e a plan key that is not Plus's (the main plan's monthly) is never sent");
    t.eq([await co({ status: 503, body: { error: "status_unavailable" } }), await co({ status: 503, body: { error: "unavailable" } }), await co(null), await co(new Error("offline")), await co({ status: 502, body: { error: "billing_provider_error" } }), await co({ status: 403, body: { error: "store_app" } })].map((x) => x[0]),
      ["status_unavailable", "web_failed", "web_failed", "web_failed", "web_failed", "web_failed"], "6f every other answer, or none: a plain line, never a throw");
    const portal = async (answer) => { const r = await B.openPlusPortal({ ask: async () => { if (answer instanceof Error) throw answer; return answer; } }); return [r.outcome, r.url || null]; };
    t.eq([await portal({ status: 200, body: { url: "https://billing.stripe.com/p/session/x" } }), await portal({ status: 404, body: { error: "no_customer" } }), await portal({ status: 200, body: { url: "https://example.com/" } }), await portal(new Error("x"))],
      [["redirect", "https://billing.stripe.com/p/session/x"], ["web_failed", null], ["web_failed", null], ["web_failed", null]], "6g Manage opens Stripe's portal, and only Stripe's");
    const wait = async (answers) => { let n = 0; const r = await B.confirmPlusOnWeb({ serverStatus: async () => { const a = answers[Math.min(n, answers.length - 1)]; n++; if (a instanceof Error) throw a; return a; }, sleep: async () => {} }); return [r.outcome, n]; };
    t.eq([await wait([ok200({ plus: false }), null, new Error("x"), ok200({ plus: true, manage: "stripe" })]), await wait([ok200({ plus: false })])], [["plus", 4], ["started", 6]],
      "6h back from Stripe the server is asked up to six times; until it says yes the screen says Plus will show, never that it is on");
  }

  // ── 7. A return address grants nothing ────────────────────────────────────────────────────────────
  {
    t.eq(["?plus=success&session_id=cs_1", "?plus=cancelled", "?plus=portal_return", "?billing=success", "?plus=yes", "", null, "?plus=success&plus=cancelled"].map((s) => B.plusReturnNotice(s)),
      ["success", "cancelled", "portal_return", null, null, null, null, "success"], "7a only the three return values are read; the main plan's ?billing= is not Plus's");
    t.eq(B.PLUS_RETURN_PARAMS.join(","), "plus,session_id", "7b the address is cleaned of them");
    const lib = read("src", "lib", "plusBuy.js"), nw = read("src", "lib", "netWorthAccess.js");
    t.ok(!/setPlusAnswer|localStorage|setItem/.test(lib) && /export function openPlusBuy\(notice = null\) \{ state = \{ \.\.\.state, buy: true, buyNotice: notice \}; emit\(\); \}/.test(nw),
      "7c the return only opens the screen: it writes no answer and stores nothing");
  }

  // ── 8. Every outcome has a line, or none ───────────────────────────────────────────────────────────
  {
    const all = ["plus", "cancelled", "already_plus", "not_available", "status_unavailable", "pending", "charged_twice", "web_failed", "started", "web_cancelled", "failed", "unconfirmed", "nothing_to_restore", "store_unavailable", "something_new", null, undefined];
    const lines = all.map((o) => B.plusOutcomeLine(o));
    t.eq(lines.map((l) => (l === null ? 0 : typeof l === "string" && l.length > 0 ? 1 : -1)), [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0], "8a a line for each outcome that needs one; nothing for Plus confirmed, a closed sheet, or anything unknown");
    t.eq([B.plusOutcomeLine("failed"), B.plusOutcomeLine("unconfirmed"), B.plusOutcomeLine("nothing_to_restore"), B.plusOutcomeLine("store_unavailable")],
      [SO.PAYWALL_COPY.outcomes.failed, SO.PAYWALL_COPY.outcomes.unconfirmed, SO.PAYWALL_COPY.outcomes.nothing_to_restore, SO.PAYWALL_COPY.storeUnavailable], "8b four are the store paywall's approved lines, reused exactly");
    t.eq(B.plusOutcomeLine("status_unavailable"), "We couldn't check your plan just now. Nothing has changed. Please try again.", "8c …and the plan that could not be read is the approved line");
    t.ok(!/full access/i.test(String(B.plusOutcomeLine("pending"))), "8d the pending line is Plus's own: it does not promise 'full access'");
  }

  // ── 9. The words ───────────────────────────────────────────────────────────────────────────
  {
    const ids = Object.keys(W.NET_WORTH_WORDS).filter((id) => id.startsWith("plus-buy-"));
    t.eq([ids.length, ids.filter((id) => W.NET_WORTH_WORDS[id] !== `[WORDS: ${id}]`)], [20, []], "9a twenty new lines, every one a [WORDS: id] placeholder in the code");
    const doc = read("docs", "product", "NET-WORTH-WORDS.md");
    const rows = Object.fromEntries([...doc.matchAll(/^\| `(plus-buy-[a-z0-9-]+)` \| ([^|]+) \| ([^|]+) \| \[WORDS: (plus-buy-[a-z0-9-]+)\] \| (\d+) \|$/gm)].filter((m) => m[1] === m[4]).map((m) => [m[1], { where: m[2].trim(), facts: m[3].trim(), limit: Number(m[5]) }]));
    t.eq(ids.filter((id) => !rows[id] || rows[id].where.length < 20 || rows[id].facts.length < 8 || !(rows[id].limit >= 20)), [], "9b each is in the words doc with where it shows, the facts it must say and a limit");
    const review = read("docs", "review", "PLUS-BUY-COPY.md");
    const drafts = Object.fromEntries([...review.matchAll(/^\| (\d+) \| `(plus-buy-[a-z0-9-]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (\d+) \/ (\d+) \|$/gm)].map((m) => [m[2], { n: Number(m[1]), where: m[3].trim(), facts: m[4].trim(), draft: m[5].trim(), len: Number(m[6]), limit: Number(m[7]) }]));
    t.eq([Object.keys(drafts).sort().join(","), Object.values(drafts).map((d) => d.n).sort((a, b) => a - b).join(",")], [ids.slice().sort().join(","), Array.from({ length: 20 }, (_, i) => i + 1).join(",")],
      "9c docs/review/PLUS-BUY-COPY.md lists the same twenty, numbered 1 to 20");
    const longest = (s) => [...s.replace("{limit}", "10")].length;
    t.eq(ids.filter((id) => { const d = drafts[id]; return !d || d.limit !== rows[id].limit || d.where !== rows[id].where || d.facts !== rows[id].facts || longest(d.draft) !== d.len || d.len > d.limit; }), [],
      "9d each draft has the same place, facts and limit as the words doc, and fits its limit");
    const BANNED = /sets aside|holds back|\blearns\b|\bremembers\b|smarter|\bcovered\b|\bcovers\b|web app|never invents|—|–|Flourish/;
    t.eq(ids.filter((id) => BANNED.test(drafts[id].draft) || /(^|[.!?] )(Save|Spend|Pay|Invest)\b/.test(drafts[id].draft) || /\$\d/.test(drafts[id].draft)), [],
      "9e no draft uses a banned word, a dash, a capital-F Flourish, a price, or a sentence that starts with Save, Spend, Pay or Invest");
    t.eq(["plus-buy-manage-elsewhere", "plus-buy-not-available", "plus-buy-pending", "plus-buy-charged-twice", "plus-buy-already", "plus-buy-have", "plus-buy-have-partner", "plus-buy-open", "plus-buy-title", "plus-buy-lead", "plus-buy-includes-networth", "plus-buy-includes-investments", "plus-buy-includes-banks", "plus-buy-separate"]
      .filter((id) => /website|stripe|flourishmoney\.app|checkout/i.test(drafts[id].draft)), [], "9f no draft a store app can show names the website, Stripe or a checkout");
    t.ok(W.netWorthWords("plus-buy-includes-banks", { limit: 10 }) === "[WORDS: plus-buy-includes-banks] [limit 10]", "9g the fair use number goes into its line (shown after the placeholder until the words exist)");
  }

  // ── 10. The screen, rendered ───────────────────────────────────────────────────────────────────
  {
    let A = null;
    try { A = loadApp(["PlusAddonScreen", "DARK_C"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A) {
      const screen = (props) => A.render(A.h(A.PlusAddonScreen, { C: A.DARK_C, ask: async () => null, onAnswer() {}, onClose() {}, onViewLegal() {}, onManageStore() {}, ...props }));
      const none = ok200({ plus: false });
      const web = textOf(screen({ platform: "web", selling: true, answer: none }));
      t.ok(web.includes("$4.99 a month") && web.includes("$49.99 a year") && (web.match(/CAD plus tax/g) || []).length === 2 && (web.match(/Go to secure checkout/g) || []).length === 2,
        "10a the website: both plans, our price, CAD plus tax, and a button each");
      t.ok(web.includes("[WORDS: plus-buy-title]") && web.includes("[WORDS: plus-buy-lead]") && web.includes("[WORDS: plus-buy-includes-banks] [limit 10]") && web.includes("[WORDS: plus-buy-separate]") && web.includes("[WORDS: plus-buy-web-note]"),
        "10b …with what Plus includes, that it is billed by itself, and the note about Stripe");
      t.ok(!/Restore purchases|Terms of Use|Apple Account|Google Play/.test(web), "10c …and nothing that belongs to a store app");
      for (const platform of ["ios", "android"]) {
        const html = screen({ platform, selling: true, answer: none, purchases: {} });
        const app = textOf(html);
        t.ok(!/\$\d|CAD|plus tax|Stripe|secure checkout|flourishmoney\.app|website/i.test(app) && !/href="https?:\/\/(?!www\.apple\.com\/legal\/)/.test(html), `10d ${platform}: no price of ours, no Stripe, no website and no link out but Apple's licence agreement`);
        t.ok(app.includes("Restore purchases") && app.includes("Terms of Use") && app.includes("Privacy Policy") && app.includes("Confirming with the store…"), `10e ${platform}: Restore purchases, Terms of Use and Privacy Policy are on it while the store is asked`);
        t.eq(/href="https:\/\/www\.apple\.com\/legal\/internet-services\/itunes\/dev\/stdeula\/"/.test(html), platform === "ios", `10f ${platform}: Terms of Use opens Apple's standard licence on an iPhone only`);
      }
      const closed = textOf(screen({ platform: "ios", selling: false, answer: none }));
      t.ok(!/Restore purchases|Subscribe for|\$\d/.test(closed) && !closed.includes("[WORDS: plus-buy-lead]"), "10g a store build that does not sell: no offer, no Restore, no price");
      const mine = screen({ platform: "web", selling: true, answer: ok200({ plus: true, manage: "stripe" }) });
      t.ok(textOf(mine).includes("[WORDS: plus-buy-have]") && /data-plus-manage="portal"/.test(mine) && textOf(mine).includes("Manage subscription") && !/\$\d|Go to secure checkout/.test(textOf(mine)), "10h once bought on the website: it says so, with Manage subscription and nothing to buy");
      const ios = screen({ platform: "ios", selling: true, answer: ok200({ plus: true, manage: "app_store" }), purchases: {} });
      t.ok(/data-plus-manage="store"/.test(ios) && !/Subscribe for/.test(textOf(ios)), "10i once bought in the App Store, on an iPhone: Manage subscription opens the store's own screen");
      const partner = screen({ platform: "web", selling: true, answer: ok200({ plus: true, covered_by: "partner", manage: null }) });
      t.ok(textOf(partner).includes("[WORDS: plus-buy-have-partner]") && !/data-plus-manage=/.test(partner) && !/Go to secure checkout/.test(textOf(partner)), "10j a partner's Plus: said so, nothing to buy and nothing to manage");
      const elsewhere = textOf(screen({ platform: "android", selling: true, answer: ok200({ plus: true, manage: "stripe" }), purchases: {} }));
      t.ok(elsewhere.includes("[WORDS: plus-buy-manage-elsewhere]") && !/stripe|website/i.test(elsewhere.replace(/\[WORDS: [a-z-]+\]/g, "")), "10k Plus bought on the website, seen in a store app: one line that names no website");
      const down = screen({ platform: "web", selling: true, answer: null });
      t.ok(textOf(down).includes("We couldn't check your plan just now. Nothing has changed. Please try again.") && /data-plus-check=""/.test(down) && !/\$\d/.test(textOf(down)), "10l the plan could not be read: the plain line and Check again, never an offer");
      t.ok(typeof screen({ platform: "web", selling: true, answer: undefined }) === "string" && typeof screen({ platform: "ios", selling: true, answer: { status: 404, body: {} } }) === "string", "10m an answer not in yet, or Plus switched off: it still renders (the heading and Close), never a throw");
    }
  }

  // ── 11. The app ────────────────────────────────────────────────────────────────────────────
  {
    const app = read("src", "App.jsx"), scr = read("src", "PlusAddonScreen.jsx");
    t.ok(/if\(!user\?\.id \|\| nativeApp\) return;\s*\n\s*const notice = plusReturnNotice\(/.test(app), "11a a store app never reads a return address");
    t.ok(/useEffect\(\(\)=>\{ if\(!user\?\.id \|\| plusRoot\.mode==="today"\) closePlusBuy\(\); \},\[user\?\.id, plusRoot\.mode\]\);/.test(app), "11b signed out, or PLUS_ENABLED off: the screen is closed");
    t.ok(/const plusOffer = usePlusView\(\)\.mode==="offer" && mode==="locked";/.test(app) && /\{plusOffer && <button data-plus-open=""/.test(app), "11c the locked net worth card offers the screen only when the server's answer is an offer");
    t.ok(/\{!data\?\.demo && <PlusSettingsCard C=\{C\}\/>\}/.test(app) && /if\(v\.mode!=="offer" && v\.mode!=="have"\) return null;/.test(app), "11d Settings' card shows only for an offer or for a household with Plus, never in the demo");
    t.ok(/const plusSelling = \(\) => !isNativeApp\(\) \|\| storeBillingBuild\(\);/.test(app), "11e a store build sells only with in-app purchase on");
    t.ok(/const cards = !offering \? \[\] : web \? plusWebCards\(\) : /.test(scr) && !/flourishmoney\.app|https?:\/\//.test(scr.replace(/^\s*\/\/.*$/gm, "")), "11f the screen draws our price only on the website, and holds no address of its own");
    t.ok(/\{!web && selling && view\.mode !== "hidden" && \(/.test(scr) && /PAYWALL_COPY\.restore/.test(scr) && /storeDisclosure\(platform\)/.test(scr), "11g Restore purchases and the store disclosure are drawn in a selling store app only");
  }

  t.summary("plusBuy.test");
})();
