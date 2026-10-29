// tests/foundingPlans.test.cjs
// -----------------------------------------------------------------------------
// A FOUNDING HOUSEHOLD IS ASKED TO PAY STRAIGHT AWAY (version 1.1.3, Amanda, 2026-10-28; lib/foundingPlans.js).
//
// In a store app that sells, the existing plans screen opens by itself once per account, as soon as the account is
// in the app, when the server offers it the founding price (since 2026-10-29: any confirmed address while founding
// seats are left, migration 0032) and it has no paid plan. Founding annual is first. It can be closed; it never opens by itself again for that account.
//   1  founding + confirmed + unpaid: opens, once, with Founding annual first
//   2  not founding (seats full, or the address not confirmed): no change
//   3  already paid (any provider, a founding switch, a web subscription in collection): never opens
//   4  closed once: does not reopen on its own (the marker survives sign out; storage blocked: once per session)
//   5  the wiring in App.jsx, and the words: the approved disclosure and the close button stay
//   6  keep the trial (2026-10-29): who sees the small print, the confirm's live count, the wiring; the words still to
//      come live in lib/pendingWords.js only, and no production or store build ships with one
// tests/foundingPlans.browser.test.cjs drives the built app through the same four cases.
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

const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const HOLDER = "holder@example.ca", NOBODY = "nobody@example.ca";
const LATER = new Date(Date.now() + 200 * 86400000).toISOString();

// A service-role client with `seats` founding seats held (0032) and a ledger behind waitlist_founding_number_for_email.
function fakeAdmin({ email, confirmedByLink = true, position = null, subscriptions = [], seats = 0 } = {}) {
  const db = { subscriptions: subscriptions.map((r) => ({ ...r })), profiles: [] };
  const from = (name) => {
    const f = [];
    const rows = () => (db[name] || []).filter((r) => f.every(([c, v]) => r[c] === v));
    const q = { select() { return q; }, eq(c, v) { f.push([c, v]); return q; },
      async maybeSingle() { return { data: rows()[0] ? { ...rows()[0] } : null, error: null }; },
      upsert() { return Promise.resolve({ error: null }); } };
    return q;
  };
  return {
    from,
    rpc: async (fn, args) => fn === "waitlist_founding_number_for_email"
      ? { data: args.p_email === email && position ? position : null, error: null }
      : fn === "founding_seats_taken" ? { data: seats, error: null } : { data: null, error: null },
    auth: { admin: { getUserById: async () => ({ data: { user: { id: U1, email, email_confirmed_at: confirmedByLink ? "2026-10-28T00:00:00Z" : null,
      app_metadata: { email_confirmation: "link" } } }, error: null }) } },
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

// A phone's storage.
function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }
const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };

(async () => {
  const t = create();
  const F = await import("../src/lib/foundingPlans.js");
  const saved = { ...process.env };
  process.env.IAP_ENABLED = "true";
  const status = async (admin) => JSON.parse((await loadBilling(admin).handler(post({ action: "store_status" }))).body);
  const ready = (st, extra = {}) => ({ storeBilling: true, userId: U1, askedFor: U1, status: st, planKnown: true, inApp: true, shown: false, ...extra });

  const holder = await status(fakeAdmin({ email: HOLDER, position: 36 }));
  const offerPkgs = { monthly: { id: "m" }, annual: null, founding: { id: "f" } };
  const regularPkgs = { monthly: { id: "m" }, annual: { id: "a" }, founding: null };

  // ── 1. Founding, confirmed by our link, not paying: opens once, Founding annual first ────────────────
  {
    t.eq([holder.paid, holder.founding.available], [false, true], "1a the server: a confirmed address with no subscription, while seats are left, is offered the founding price and is not paid");
    t.eq(F.foundingPlansAutoOpen(ready(holder)), true, "1b …so the plans screen opens by itself");
    const s = memStorage();
    t.eq(F.foundingPlansShown(s, U1), false, "1c not yet shown for this account");
    F.rememberFoundingPlansShown(s, U1);
    t.eq([F.foundingPlansShown(s, U1), F.foundingPlansAutoOpen(ready(holder, { shown: F.foundingPlansShown(s, U1) }))], [true, false], "1d once it has opened, it is remembered and does not open by itself again");
    F.rememberFoundingPlansShown(s, U1);
    t.eq(JSON.parse(s.getItem(F.FOUNDING_PLANS_SHOWN_KEY)), [U1], "1e remembered once per account (no duplicates)");
    t.eq(F.foundingPlansShown(s, U2), false, "1f another account on the same phone is its own account");
    t.eq(F.paywallPlanOrder(offerPkgs).map(([p]) => p), ["founding_annual", "monthly"], "1g Founding annual is the first plan, then Monthly");
    for (const [k, v] of [["askedFor", null], ["askedFor", U2], ["planKnown", false], ["inApp", false], ["storeBilling", false], ["userId", null], ["status", null]])
      t.eq(F.foundingPlansAutoOpen(ready(holder, { [k]: v })), false, `1h not before every part is in: ${k}=${JSON.stringify(v)}`);
  }

  // ── 2. Not founding: no change ───────────────────────────────────────────────────────────────────
  {
    const nobody = await status(fakeAdmin({ email: NOBODY, position: null, seats: 50 }));
    const unconfirmed = await status(fakeAdmin({ email: HOLDER, position: 36, confirmedByLink: false }));
    t.eq([nobody.founding.available, unconfirmed.founding.available], [false, false], "2a the server: no founding price once 50 seats are held, nor before the address is confirmed");
    t.eq([F.foundingPlansAutoOpen(ready(nobody)), F.foundingPlansAutoOpen(ready(unconfirmed))], [false, false], "2b …so nothing opens by itself for either");
    t.eq(F.paywallPlanOrder(regularPkgs).map(([p]) => p), ["monthly", "annual"], "2c the plans stay in their old order: Monthly, then Annual");
    t.eq(F.foundingPlansAutoOpen(ready({ paid: false })), false, "2d an answer without a founding part opens nothing");
  }

  // ── 3. Already paid: never opens ─────────────────────────────────────────────────────────────────
  {
    for (const [provider, plan_key] of [["app_store", "founding_annual"], ["play_store", "founding_annual"], ["stripe", "founding_annual"], ["stripe", "annual"]]) {
      const st = await status(fakeAdmin({ email: HOLDER, position: 36, subscriptions: [{ user_id: U1, provider, status: "active", plan_key, current_period_end: LATER, provider_subscription_id: "x" }] }));
      t.eq([st.paid, st.founding.available, F.foundingPlansAutoOpen(ready(st))], [true, false, false], `3a paid through ${provider} (${plan_key}): the server offers nothing and it never opens`);
    }
    const regular = await status(fakeAdmin({ email: HOLDER, position: 36, subscriptions: [{ user_id: U1, provider: "app_store", status: "active", plan_key: "monthly", current_period_end: LATER, provider_subscription_id: "x" }] }));
    t.ok(regular.paid === true && regular.founding.held_on_regular_plan && F.foundingPlansAutoOpen(ready(regular)) === false, "3b a household offered founding but on a regular store plan (the founding switch) is paying: never opens");
    t.eq(F.foundingPlansAutoOpen(ready({ paid: true, founding: { available: true } })), false, "3c even an answer that said both: paid wins");
    t.eq(F.foundingPlansAutoOpen(ready({ paid: false, web_attention: true, founding: { available: true } })), false, "3d a web subscription the store must not sell on top of: never opens");
  }

  // ── 4. Closed once: does not reopen on its own ───────────────────────────────────────────────────
  {
    const APP = read("src", "App.jsx");
    const out = APP.slice(APP.indexOf("  const signOut = async ()=>{"), APP.indexOf("  const signOut = async ()=>{") + 700);
    t.ok(/k !== STAMP_KEY && k !== FOUNDING_PLANS_SHOWN_KEY\)\.forEach\(k => localStorage\.removeItem\(k\)\)/.test(out), "4a signing out keeps the marker: signing back in is the same account");
    t.ok(F.FOUNDING_PLANS_SHOWN_KEY.startsWith("flourish_"), "4b deleting the account (clearAllUserLocal, every flourish_ key) clears it with everything else");
    t.eq([F.foundingPlansShown(blocked, U1), F.foundingPlansShown(null, U1)], [false, false], "4c storage blocked or missing reads as not shown…");
    F.rememberFoundingPlansShown(blocked, U1); F.rememberFoundingPlansShown(null, U1);
    const fx = APP.slice(APP.indexOf("  const foundingOpenedRef = useRef(new Set());"), APP.indexOf("  const foundingOpenedRef = useRef(new Set());") + 900);
    t.ok(/const shown = !!user\?\.id && \(foundingOpenedRef\.current\.has\(user\.id\) \|\| foundingPlansShown\(store, user\.id\)\);/.test(fx) && /foundingOpenedRef\.current\.add\(user\.id\);/.test(fx),
      "4d …so the app also remembers it for the session: with storage blocked it still opens at most once per session");
    t.ok(!/setPaywallUp\(false\)|onClose/.test(fx), "4e closing it changes nothing in the marker: once opened is once");
    const s = memStorage(); s.setItem(F.FOUNDING_PLANS_SHOWN_KEY, "not json");
    t.eq(F.foundingPlansShown(s, U1), false, "4f a damaged marker reads as not shown (and is rewritten)");
    F.rememberFoundingPlansShown(s, U1);
    t.eq(F.foundingPlansShown(s, U1), true, "4g …rewritten");
  }

  // ── 5. The wiring and the words ──────────────────────────────────────────────────────────────────
  {
    const APP = read("src", "App.jsx");
    const close = APP.indexOf("useEffect(()=>{ if(!storeBilling || storeEntitled===true) setPaywallUp(false); },[storeBilling, storeEntitled]);");
    const auto = APP.indexOf("  const foundingOpenedRef = useRef(new Set());");
    t.ok(close > 0 && auto > close && auto - close < 1200, "5a the founding opening is declared straight after the entitlement close, so it has the last word when both run");
    const fx = APP.slice(auto, auto + 900);
    t.ok(/planKnown: storeEntitledNow!==null, inApp: hydrated && aiDisclosureSeen, shown \}\)\) return;/.test(fx)
      && /\},\[storeBilling, user\?\.id, storeAskedFor, storeStatus, storeEntitledNow, hydrated, aiDisclosureSeen\]\);/.test(fx),
      "5b it waits for this account's answer, its plan, its data and Apple's AI disclosure (5.1.2), and nothing else");
    t.ok(/if\(!onboarded\)return <><Onboarding\n/.test(APP) && /onCount=\{\(event,detail\)=>signalOnboarding\(event,\{detail,userId:user\?\.id\}\)\}\/>\{storePaywallOverlay\}<\/>;/.test(APP),
      "5c it shows over onboarding too: a new founding account is asked straight away");
    t.ok(/return <><FirstVisitScreen /.test(APP) && /signalOnboarding\("first_number_shown",[^\n]*\}\}\/>\{storePaywallOverlay\}<\/>;/.test(APP), "5d …and over the first-number screen");
    t.ok(APP.indexOf("const storePaywallOverlay =") < APP.indexOf("if(!user && !appData?.demo)return <AuthScreen"), "5e the overlay is built before the early returns that use it");
    const sp = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("function Paywall("));
    t.ok(/const cards = pkgs \? paywallPlanOrder\(pkgs\)\.map\(/.test(sp) && /data-selected=\{plan==="founding_annual"\?"":undefined\}/.test(sp), "5f the paywall lists the plans in that order and marks Founding annual as the chosen plan");
    t.ok(/<button onClick=\{\(\)=>doBuy\(plan,pkg\)\}/.test(sp) && /purchasePackage: \(p\)=>purchases\.purchasePackage\(\{ aPackage: p \}\)/.test(sp), "5g one tap on its button opens the store's own sheet");
    t.ok(/if\(r\.outcome==="paid" && onClose\) onClose\(\);/.test(sp), "5h a confirmed purchase closes it (in the trial the entitlement close never fired)");
    t.ok(/\{onClose&&<div style=\{\{display:"flex",justifyContent:"flex-end"\}\}><button aria-label="Close" onClick=\{onClose\}/.test(sp) && /minWidth:LAYOUT\.minTap,minHeight:LAYOUT\.minTap/.test(sp),
      "5i the close button is always there, at full tap size (Apple: a visible way out)");
    t.ok(/priceString: p\.product\.priceString/.test(sp) && /\{storeDisclosure\(platform\)\}/.test(sp), "5j prices are the store's own strings, and the approved disclosure stays under the plans");
    const lib = read("src", "lib", "foundingPlans.js");
    const strings = [...lib.replace(/\/\/.*$/gm, "").matchAll(/"([^"\n]*)"/g)].map((m) => m[1]).filter((x) => / /.test(x));
    t.eq(strings, [], "5k the library carries no words for the screen: the plans screen keeps only its approved lines");
    t.ok(!/\[WORDS/.test(sp), "5l the paywall itself holds no placeholder: words still to come come from lib/pendingWords.js");
  }

  // ── 6. Keep the trial ──────────────────────────────────────────────────────────────────────────────
  {
    const APP = read("src", "App.jsx");
    const sp = APP.slice(APP.indexOf("function StorePaywall("), APP.indexOf("function Paywall("));
    const O = await import("../src/lib/storeOffer.js");
    const P = await import("../src/lib/pendingWords.js");
    const on = { paid: false, founding: { available: true, spots_left: 7 } };
    const show = (o) => O.trialKeepShown({ status: on, inTrial: true, closable: true, foundingCard: true, ...o });
    t.eq(show({}), true, "6a in the trial, founding offered with a count, the founding card shown, closable: the small print shows");
    t.eq([show({ inTrial: false }), show({ closable: false }), show({ foundingCard: false }), show({ status: { ...on, paid: true } }),
      show({ status: { paid: false, founding: { available: false, spots_left: 7 } } }), show({ status: null })], [false, false, false, false, false, false],
      "6b not after the trial, not without a way to close, not without the founding plan, not to a household that pays, not when founding is not offered");
    t.eq([0, 51, null, undefined, "7", 6.5].map((n) => show({ status: { paid: false, founding: { available: true, spots_left: n } } })), [false, false, false, false, false, false],
      "6c no live count to state (none, 0, past 50, not a whole number): no small print");
    t.eq([O.trialConfirmBody(6), O.trialConfirmBody(1), O.trialConfirmBody(0)], [P.pendingWords("trial-confirm-body", 6), P.pendingWords("trial-confirm-body", 1), null], "6d the body carries the count it is given");
    t.ok(/\{n\}/.test(P.PENDING_WORDS["trial-confirm-body"]) && O.trialConfirmBody(6).includes("6"), "6e …in its {n}");
    t.eq(Object.values(O.TRIAL_KEEP_COPY), ["trial-link", "trial-confirm-title", "trial-confirm-stay", "trial-confirm-leave"].map((id) => P.pendingWords(id)), "6f the link, title and buttons are the pending words, for now");
    t.ok(/const showKeepTrial = !held && !!onClose && trialKeepShown\(\{ status, inTrial, closable: !!onClose, foundingCard: cards\.some\(c=>c\.plan==="founding_annual"\) \}\);/.test(sp),
      "6g the paywall shows it by that rule");
    t.ok(/setKeepTrial\(true\);\s*askStore\("store_status"\)\.then\(s=>\{ if\(s\) onResolved\(s\); \}\)/.test(sp), "6h opening the confirm asks the server again, so the count is live");
    t.ok(/data-trial-stay="" onClick=\{\(\)=>setKeepTrial\(false\)\}/.test(sp) && /data-trial-leave="" onClick=\{\(\)=>\{ setKeepTrial\(false\); onClose\(\); \}\}/.test(sp),
      "6i stay closes the confirm only; leave closes the plans too");
    t.ok(/return pushBackHandler\(\(\)=>\{ setKeepTrial\(false\); return true; \}\);/.test(sp) && /role="alertdialog" aria-modal="true"/.test(sp), "6j Android's back key closes the confirm first; it is announced as a dialog");
    t.ok(/if\(keepTrial && !keepBody\) setKeepTrial\(false\);/.test(sp), "6k if the last spot goes while it is open, the confirm closes (its count is gone)");
    t.ok(/<StorePaywall [\s\S]{0,400}inTrial=\{trialActive\} onManage=/.test(APP), "6l the app tells the paywall whether the account is in its trial");
    t.ok(sp.indexOf("{storeDisclosure(platform)}") < sp.indexOf("data-trial-link") && sp.indexOf("data-trial-link") < sp.indexOf("PAYWALL_COPY.terms"), "6m the small print sits under the plans and the disclosure, above the three links");

    // The words still to come never ship.
    const { execFileSync } = require("child_process");
    const dir = require("./_tmp.cjs").tempDir("pendingwords");
    const guard = (target) => { try { execFileSync(process.execPath, [path.join(REPO, "scripts", "check-pending-words.mjs"), target], { stdio: "pipe" }); return 0; } catch (e) { return e.status; } };
    fs.writeFileSync(path.join(dir, "a.js"), `const x = "${P.PENDING_WORDS["trial-link"]}";`);
    const caught = guard(dir);
    fs.writeFileSync(path.join(dir, "a.js"), 'const x = "Keep my trial";');
    t.eq([caught, guard(dir)], [1, 0], "6n the guard refuses a build holding a placeholder, and passes one without");
    const toml = read("netlify.toml");
    const pkg = JSON.parse(read("package.json"));
    t.ok(/\[context\.production\]\s*\n\s*command\s*=\s*"npm run build && node scripts\/check-pending-words\.mjs dist netlify\/functions"/.test(toml), "6o the production web deploy runs it, on the site and the functions");
    t.ok(/&& node scripts\/check-pending-words\.mjs dist$/.test(pkg.scripts["build:native"]), "6p every store build runs it last");
    const srcFiles = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? srcFiles(path.join(d, e.name)) : [path.join(d, e.name)]);
    const holders = srcFiles("src").filter((f) => /\.(js|jsx)$/.test(f) && /\[WORDS:\s*[a-z0-9-]+/.test(read(f)));
    t.eq(holders, [path.join("src", "lib", "pendingWords.js")], "6q in the app, only lib/pendingWords.js holds a placeholder");
  }

  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  t.summary("foundingPlans.test");
})();
