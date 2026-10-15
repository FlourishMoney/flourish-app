// tests/foundingConfirm.test.cjs
// -----------------------------------------------------------------------------
// "SEND ME A CONFIRMATION LINK" FOR AN OLDER ACCOUNT HOLDING A FOUNDING ADDRESS (billing day, round 4).
//
// The founding price needs an address the household confirmed from our link (app_metadata
// email_confirmation = "link"). Accounts made before that marker had no way to get it. Now the checkout screen
// offers one tap to email a confirmation link; clicking it (and pressing the button) sets the marker. Pinned:
//   1. the link: signed, 24 hours, tied to the account's CURRENT address, carrying no address;
//   2. who is offered it: confirmed but not by link, holding a founding spot; never a founder, an ended
//      founding subscription, an account already verified, or an address with no spot;
//   3. billing.js: the status says so; the send action is for those accounts only, at most 3 in 24 hours, and
//      refuses when it cannot count (fails closed); billing off is a 404 as before;
//   4. founding-confirm.js: GET changes nothing; POST sets "link" and keeps the rest of app_metadata; an
//      expired, forged or stale link changes nothing; nothing is logged but fixed words;
//   5. end to end: after the click the founding price is offered;
//   6. the checkout screen's words.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BLOBS_PATH = require.resolve("@netlify/blobs", { paths: [path.join(REPO, "netlify", "functions")] });
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const CONFIRM_FN = require.resolve("../netlify/functions/founding-confirm.js");
const F = require("../netlify/functions/_lib/foundingConfirm.js");
const cohort = require("../netlify/functions/_lib/foundingCohort.js");
const KEY_NAME = ["RESEND", "API", "KEY"].join("_");

const UID = "2f6c1e9a-4b7d-4c2e-9a1b-3d5e7f9a1c2b";
const HOLDER = "older.household@example.test";
const OLD = { id: UID, email: HOLDER, email_confirmed_at: "2026-09-20T00:00:00Z", app_metadata: { provider: "email", providers: ["email"] } };

// A fake admin client: the founding lookup (HOLDER holds #4), profiles, subscriptions, and Auth.
function fakeAdmin(state) {
  return {
    from: (table) => { const q = { select() { return q; }, eq() { return q; }, async upsert() { return { error: null }; },
      async maybeSingle() { return { data: table === "profiles" ? { founder_flag: !!state.founder } : (table === "subscriptions" ? state.sub || null : null), error: null }; } }; return q; },
    rpc: async (name, args) => ({ data: name === "waitlist_founding_position_for_email" && args.p_email === HOLDER ? 4 : null, error: null }),
    auth: { admin: {
      getUserById: async () => ({ data: { user: state.user }, error: null }),
      updateUserById: async (id, attrs) => { state.updates.push({ id, attrs }); state.user = { ...state.user, ...attrs }; return { data: { user: state.user }, error: null }; },
    } },
  };
}
const memStore = () => { const m = new Map(); return { m, async get(k) { return m.has(k) ? m.get(k) : null; }, async setJSON(k, v) { m.set(k, v); } }; };

function load(modPath, state, { blobs = memStore() } = {}) {
  for (const p of [modPath, AUTH_PATH, API_PATH, BLOBS_PATH]) delete require.cache[p];
  const real = require("../netlify/functions/_lib/auth.js");
  require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: UID, error: null }), getAdminClient: () => fakeAdmin(state) };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripePost: async () => ({ id: "x", url: "https://stripe.test/pay" }) } };
  require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true,
    exports: { getStore: () => { if (!blobs) throw new Error("no blobs here"); return blobs; } } };
  const mod = require(modPath);
  for (const p of [modPath, AUTH_PATH, API_PATH, BLOBS_PATH]) delete require.cache[p];
  return mod;
}

(async () => {
  const t = create();
  const saved = { ...process.env };
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  delete process.env.FOUNDING_CONFIRM_SECRET;
  const NOW = Date.parse("2026-10-26T15:00:00Z");

  // ── 1. the link ─────────────────────────────────────────────────────────────────────────────────
  {
    const url = F.confirmUrl(UID, HOLDER, NOW);
    const q = Object.fromEntries(new URL(url).searchParams);
    t.eq([new URL(url).origin + new URL(url).pathname, Object.keys(q).join(",")], ["https://flourishmoney.app/api/founding-confirm", "u,x,t"], "1a flourishmoney.app/api/founding-confirm?u&x&t");
    t.ok(!url.includes("@") && !url.toLowerCase().includes("older"), "1b it carries no address");
    t.eq(Number(q.x) - Math.floor(NOW / 1000), 24 * 3600, "1c it lasts 24 hours");
    t.eq(F.checkConfirm(q, HOLDER, NOW + 60000), "ok", "1d the link checks out for its own account and address");
    t.eq(F.checkConfirm(q, "  Older.Household@Example.TEST ", NOW + 60000), "ok", "1e case and spaces in the address do not matter");
    t.eq(F.checkConfirm(q, HOLDER, NOW + 24 * 3600 * 1000 + 1000), "expired", "1f after 24 hours: expired");
    t.eq(F.checkConfirm(q, "someone.new@example.test", NOW), "invalid", "1g the account's address changed since: invalid");
    t.eq(F.checkConfirm({ ...q, u: "00000000-0000-4000-8000-000000000000" }, HOLDER, NOW), "invalid", "1h another account id: invalid");
    t.eq(F.checkConfirm({ ...q, x: String(Number(q.x) + 3600) }, HOLDER, NOW), "invalid", "1i a stretched expiry: invalid");
    t.eq(F.checkConfirm({ ...q, t: q.t.slice(0, -2) + "AA" }, HOLDER, NOW), "invalid", "1j a forged signature: invalid");
    t.eq([F.checkConfirm({}, HOLDER, NOW), F.checkConfirm({ ...q, u: "not-a-uuid" }, HOLDER, NOW)], ["invalid", "invalid"], "1k anything malformed: invalid");
    const sk = process.env.SUPABASE_SECRET_KEY; delete process.env.SUPABASE_SECRET_KEY;
    t.eq(F.confirmUrl(UID, HOLDER, NOW), null, "1l no secret: no link");
    process.env.SUPABASE_SECRET_KEY = sk;
    t.ok(F.confirmSecret() && F.confirmSecret() !== process.env.SUPABASE_SECRET_KEY, "1m the signing key is derived, never the Supabase key itself");
  }

  // ── 2. who is offered it ────────────────────────────────────────────────────────────────────────
  {
    const need = (user, extra = {}) => cohort.foundingConfirmNeeded(fakeAdmin({ user, updates: [], ...extra }), UID, user);
    t.eq(await need(OLD), true, "2a an older account (confirmed, no marker) holding a founding address: offered");
    t.eq(await need({ ...OLD, app_metadata: { email_confirmation: "auto" } }), true, "2b …and an auto-confirmed one");
    t.eq(await need({ ...OLD, app_metadata: { email_confirmation: "link" } }), false, "2c already verified by link: not offered (it has the price)");
    t.eq(await need({ ...OLD, email: "no.spot@example.test" }), false, "2d an address with no founding spot: not offered");
    t.eq(await need(OLD, { founder: true }), false, "2e a beta founder: not offered (it has the price)");
    t.eq(await need(OLD, { sub: { founding_ended_at: "2026-11-01T00:00:00Z" } }), false, "2f a founding subscription that ended: not offered (ended is final)");
    t.eq(await need({ ...OLD, email_confirmed_at: null }), false, "2g an unconfirmed address: not offered");
  }

  // ── 3. billing.js ───────────────────────────────────────────────────────────────────────────────
  const post = (b) => ({ httpMethod: "POST", headers: {}, body: JSON.stringify(b) });
  async function billingRun(user, actions, { blobs, billing = true, resendOk = true } = {}) {
    process.env.BILLING_ENABLED = billing ? "true" : ""; if (!billing) delete process.env.BILLING_ENABLED;
    process.env[KEY_NAME] = "re_TESTONLY_notarealkey";
    const state = { user, updates: [] }, sends = [], logs = [];
    const b = load(BILLING_PATH, state, { blobs });
    const realFetch = global.fetch, quiet = { log: console.log, error: console.error };
    global.fetch = async (url, o = {}) => { if (String(url).includes("api.resend.com")) { sends.push({ headers: o.headers, body: JSON.parse(o.body) }); return { ok: resendOk, status: resendOk ? 200 : 500 }; } throw new Error("network blocked"); };
    console.log = (...a) => logs.push(a.join(" ")); console.error = (...a) => logs.push(a.join(" "));
    const out = [];
    try { for (const a of actions) { const r = await b.handler(post({ action: a })); out.push({ code: r.statusCode, body: JSON.parse(r.body) }); } }
    finally { global.fetch = realFetch; console.log = quiet.log; console.error = quiet.error; }
    return { out, sends, logs, state };
  }
  {
    const st = await billingRun(OLD, ["status"]);
    t.eq([st.out[0].body.founding.available, st.out[0].body.founding.confirmEmail], [false, true], "3a status: no founding price yet, and offered a confirmation link");
    const linked = await billingRun({ ...OLD, app_metadata: { email_confirmation: "link" } }, ["status"]);
    t.eq([linked.out[0].body.founding.available, linked.out[0].body.founding.confirmEmail], [true, false], "3b a verified account: the price, no link needed");
    const blobs = memStore();
    const r = await billingRun(OLD, ["send_founding_confirmation", "send_founding_confirmation", "send_founding_confirmation", "send_founding_confirmation"], { blobs });
    t.eq(r.out.map(o => o.code), [200, 200, 200, 429], "3c three links in 24 hours, then refused");
    t.eq(r.sends.length, 3, "3d …three emails sent, not four");
    const mail = r.sends[0].body;
    t.eq([mail.to, mail.subject], [[HOLDER], "Confirm your email address for your founding price"], "3e to the account's own address");
    t.ok(/founding-confirm\//.test(r.sends[0].headers["Idempotency-Key"]), "3f with an Idempotency-Key of its own");
    const link = mail.text.match(/Confirm it here: (\S+)/)[1];
    t.eq(F.checkConfirm(Object.fromEntries(new URL(link).searchParams), HOLDER), "ok", "3g the emailed link is a valid one for this account");
    t.ok(!r.logs.join("\n").includes(HOLDER) && !r.logs.join("\n").includes(UID), "3h no log line holds the address or the account id");
    const notNeeded = await billingRun({ ...OLD, app_metadata: { email_confirmation: "link" } }, ["send_founding_confirmation"]);
    t.eq([notNeeded.out[0].code, notNeeded.sends.length], [409, 0], "3i an account that doesn't need one: refused, nothing sent");
    const noStore = await billingRun(OLD, ["send_founding_confirmation"], { blobs: null });
    t.eq([noStore.out[0].code, noStore.out[0].body.error, noStore.sends.length], [503, "store_unavailable", 0], "3j the counter cannot be read: refused (fails closed), nothing sent");
    const failed = await billingRun(OLD, ["send_founding_confirmation"], { resendOk: false });
    t.eq(failed.out[0].code, 502, "3k Resend refuses: says so");
    const off = await billingRun(OLD, ["status", "send_founding_confirmation"], { billing: false });
    t.eq(off.out.map(o => o.code), [404, 404], "3l billing off: 404 to both, as before");
  }

  // ── 4. founding-confirm.js ──────────────────────────────────────────────────────────────────────
  async function confirmRun(method, q, user = OLD) {
    const state = { user, updates: [] }, logs = [];
    const fn = load(CONFIRM_FN, state);
    const quiet = { log: console.log, error: console.error };
    console.log = (...a) => logs.push(a.join(" ")); console.error = (...a) => logs.push(a.join(" "));
    try { const r = await fn.handler({ httpMethod: method, queryStringParameters: q, headers: {} }); return { r, state, logs }; }
    finally { console.log = quiet.log; console.error = quiet.error; }
  }
  const q = Object.fromEntries(new URL(F.confirmUrl(UID, HOLDER)).searchParams);
  {
    const get = await confirmRun("GET", q);
    t.eq([get.r.statusCode, get.state.updates.length], [200, 0], "4a GET: a page, and nothing changed (mail scanners open links)");
    t.ok(get.r.body.includes("Confirm your email address") && get.r.body.includes('method="post"') && get.r.body.includes("Confirm my email address"), "4b …with one button that POSTs");
    t.eq(get.r.headers["Cache-Control"], "no-store", "4c not cached");
    const done = await confirmRun("POST", q);
    t.eq([done.r.statusCode, done.state.updates.length], [200, 1], "4d POST: confirmed");
    t.eq(done.state.updates[0].attrs, { app_metadata: { provider: "email", providers: ["email"], email_confirmation: "link" } }, "4e …sets \"link\" and keeps the rest of app_metadata");
    t.ok(done.r.body.includes("Email address confirmed"), "4f …and says so");
    for (const [why, qq, user, code] of [
      ["expired", { ...q, x: String(Math.floor(Date.now() / 1000) - 10), t: F.confirmToken(UID, HOLDER, Math.floor(Date.now() / 1000) - 10) }, OLD, 410],
      ["forged", { ...q, t: "AAAA" }, OLD, 400],
      ["the address changed since", q, { ...OLD, email: "someone.new@example.test" }, 400],
      ["malformed", { u: "x", x: "1", t: "y" }, OLD, 400],
    ]) {
      const bad = await confirmRun("POST", qq, user);
      t.eq([bad.r.statusCode, bad.state.updates.length], [code, 0], `4g ${why}: nothing changed`);
    }
    const all = (await confirmRun("POST", q)).logs.join("\n");
    t.ok(!all.includes(UID) && !all.includes(HOLDER) && !all.includes(q.t), "4h no log line holds the account id, the address or the signature");
    const toml = fs.readFileSync(path.join(REPO, "netlify.toml"), "utf8");
    t.ok(/from\s+= "\/api\/founding-confirm"\s*\n\s*to\s+= "\/\.netlify\/functions\/founding-confirm"/.test(toml), "4i /api/founding-confirm is routed");
  }

  // ── 5. end to end: the click unlocks the founding price ────────────────────────────────────────
  {
    const before = await cohort.mayBuyFoundingPrice(fakeAdmin({ user: OLD, updates: [] }), UID, OLD);
    const done = await confirmRun("POST", q);
    const after = await cohort.mayBuyFoundingPrice(fakeAdmin({ user: done.state.user, updates: [] }), UID, done.state.user);
    t.eq([before, after], [false, true], "5a before the click: no founding price; after it: offered");
  }

  // ── 6. the checkout screen ──────────────────────────────────────────────────────────────────────
  {
    const vis = await import("../src/lib/billingVisibility.js");
    t.eq({ ...vis.FOUNDING_CONFIRM_COPY }, {
      title: "Your founding spot",
      body: "This account's email address holds a founding spot on the waitlist. To get the founding price, confirm the address from a link we email to it.",
      button: "Send me a confirmation link",
      sending: "Sending…",
      sent: "Sent. The link is in your inbox and works for 24 hours. After you confirm, come back to this screen.",
      limited: "A link was sent recently. Check your inbox, or ask again tomorrow.",
      failed: "Couldn't send the link. Try again in a moment.",
    }, "6a the words, exactly");
    const on = { enabled: true, paid: false, founding: { available: false, confirmEmail: true, cohortLimit: 50 } };
    t.eq([vis.foundingConfirmOffered(on), vis.foundingConfirmOffered({ ...on, paid: true }), vis.foundingConfirmOffered({ ...on, founding: { ...on.founding, confirmEmail: false } }), vis.foundingConfirmOffered(null)],
      [true, false, false, false], "6b offered only when the server says so, and not to a paying household");
    t.eq([200, 429, 409, 503, 502].map(vis.foundingConfirmResult), ["sent", "limited", "failed", "failed", "failed"], "6c the answer after the tap");
    const L = await import("../src/lib/foundingLink.js");
    t.eq(L.foundingLinkNotice(on), null, "6d the founding link's \"matched to the waitlist address\" line gives way to the card");
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const screen = APP.slice(APP.indexOf("function UpgradeScreen("), APP.indexOf("function Paywall("));
    t.ok(/body: JSON\.stringify\(\{action:"send_founding_confirmation"\}\)/.test(screen) && /\{foundingConfirmOffered\(status\)&&\(/.test(screen) && /minHeight:44/.test(screen),
      "6e the checkout screen asks billing.js, shows the card only when offered, and its button is a full tap target");
    const { loadApp, textOf, describe } = require("./_renderApp.cjs");
    let A = {};
    try { A = loadApp(["UpgradeScreen"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A.UpgradeScreen) {
      const show = (status) => textOf(A.render(A.h(A.UpgradeScreen, { status, mode: "plans", notice: null, onClose: () => {} })));
      const withCard = show(on);
      t.ok(withCard.includes(vis.FOUNDING_CONFIRM_COPY.body) && withCard.includes("Send me a confirmation link") && withCard.includes("$99.99 a year"),
        "6e2 rendered: the card, its button, and the regular plans below it");
      t.ok(!show({ ...on, founding: { available: true, confirmEmail: false, cohortLimit: 50 } }).includes("Send me a confirmation link"), "6e3 …and no card when the price is already offered");
    }
    const email = F.confirmEmailParagraphs("https://flourishmoney.app/api/founding-confirm?u=x&x=1&t=y");
    t.eq(email, [
      "You asked to confirm this email address for your flourish account, so the founding price can be matched to it.",
      "Confirm it here: https://flourishmoney.app/api/founding-confirm?u=x&x=1&t=y",
      "The link works for 24 hours. If you didn't ask for it, ignore this email and nothing changes.",
      "Amanda, founder of Flourish",
    ], "6f the email's words, exactly");
  }

  process.env = saved;
  t.summary("foundingConfirm.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
