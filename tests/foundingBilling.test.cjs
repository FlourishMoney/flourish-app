// tests/foundingBilling.test.cjs
// -----------------------------------------------------------------------------
// WHO MAY BUY THE FOUNDING PRICE (Amanda's decision, 2026-10-06; rules of 2026-10-07).
//
// The founding price ($79.99 a year plus tax, "for as long as you stay subscribed") is sold to:
//   • a beta tester flagged as a founder (profiles.founder_flag), outside the 50; or
//   • a confirmed account whose email holds waitlist number 1 to 50, on a row that is not a test row;
// and never to an account, or a waitlist number, whose founding subscription has ended. Everyone else is
// offered the regular prices ($11.99 a month, $99.99 a year). The server decides; the client sends a
// plan key.
//
// What this pins:
//   1. number 50 gets the founding price; 51 (the first after the cohort) does not
//   2. a test row never takes a spot, even one that still carries a number
//   3. email case and whitespace do not matter, on either side
//   4. a household that joins and never pays does not free its spot
//   5. the server decides: nothing the client sends changes the answer
//   6. it fails closed: no lookup, no confirmed email, no founding price — the regular prices remain
//   7. the 0016 SQL: same rules, service role only, the check row marked by hash and nothing else
//   8. cancel and return: an active founding subscription renews at $79.99; once one has ended the
//      household is offered regular prices only; its number is never given to anyone else
//   9. beta founders keep the founding price, take no waitlist spot and change nobody's number
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const HOOK_PATH = require.resolve("../netlify/functions/stripe-webhook.js");
const SQL = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "0016_waitlist_founding_billing.sql"), "utf8");

// The address key the SQL uses (waitlist_email_key, 0014): whitespace stripped and lower-cased.
const norm = (e) => String(e == null ? "" : e).replace(/\s+/g, "").toLowerCase();

// The database, as far as billing and the webhook see it. waitlist rows carry their number; the ledger
// (0014) records every number ever issued, by address key, with ended_at (0016). Built from the rows'
// numbers, as start() and the trigger build it.
function makeState({ waitlist = [], profiles = [], subscriptions = [], user, rpcError, endError } = {}) {
  const ledger = {};
  for (const r of waitlist) if (Number.isInteger(r.founding_position)) ledger[norm(r.email)] = { position: r.founding_position, ended_at: r.ended_at || null };
  return { rows: { waitlist, profiles, subscriptions, billing_events: [] }, ledger, user, rpcError, endError, rpcCalls: [], writes: [] };
}

// waitlist_founding_position_for_email, as 0016 defines it.
function lookup(state, email) {
  const k = norm(email);
  if (!k) return null;
  const l = state.ledger[k];
  if (!l || l.ended_at || l.position < 1 || l.position > 50) return null;
  const row = state.rows.waitlist.find(r => norm(r.email) === k && r.founding_position === l.position);
  return row && !row.is_test ? l.position : null;
}

function fakeAdmin(state) {
  const from = (table) => {
    const q = {
      _f: [],
      select() { return q; },
      eq(col, val) { q._f.push(r => r[col] === val); return q; },
      _rows() { return (state.rows[table] = state.rows[table] || []).filter(r => q._f.every(fn => fn(r))); },
      async maybeSingle() {
        if (state.readError && state.readError[table]) return { data: null, error: { message: state.readError[table] } };
        return { data: q._rows()[0] || null, error: null };
      },
      insert(row) {
        const rows = (state.rows[table] = state.rows[table] || []);
        const pk = table === "billing_events" ? "event_id" : "user_id";
        const dup = rows.some(r => r[pk] === row[pk]);
        if (!dup) rows.push({ ...row });
        return { select: async () => ({ data: dup ? [] : [{ ...row }], error: null }) };
      },
      async upsert(row) {
        const rows = (state.rows[table] = state.rows[table] || []);
        state.writes.push({ table, op: "upsert", row });
        const i = rows.findIndex(r => r.user_id === row.user_id);
        if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ ...row });
        return { error: null };
      },
      update(patch) {
        return {
          eq: async (col, val) => {
            const rows = (state.rows[table] = state.rows[table] || []);
            state.writes.push({ table, op: "update", patch, where: { [col]: val } });
            rows.forEach(r => { if (r[col] === val) Object.assign(r, patch); });
            return { error: null };
          },
        };
      },
    };
    return q;
  };
  const rpc = async (name, args) => {
    state.rpcCalls.push({ name, args });
    if (name === "waitlist_founding_position_for_email") {
      if (state.rpcError) return { data: null, error: { message: state.rpcError } };
      return { data: lookup(state, args.p_email), error: null };
    }
    if (name === "waitlist_founding_mark_ended") {
      if (state.endError) return { data: null, error: { message: state.endError } };
      const l = state.ledger[norm(args.p_email)];
      if (!l || l.ended_at) return { data: 0, error: null };
      l.ended_at = "2026-11-01T00:00:00Z";
      return { data: 1, error: null };
    }
    return { data: null, error: { message: "no such function" } };
  };
  return { from, rpc, auth: { admin: { getUserById: async () => ({ data: { user: state.user }, error: null }) } } };
}

function load(modPath, state, stripeLog = []) {
  delete require.cache[modPath];
  delete require.cache[AUTH_PATH];
  delete require.cache[API_PATH];
  const real = require("../netlify/functions/_lib/auth.js");
  require.cache[AUTH_PATH].exports = {
    ...real,
    getUserFromRequest: async () => ({ user_id: "u1", error: null }),
    getAdminClient: () => fakeAdmin(state),
  };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: {
    stripePost: async (p, params) => {
      stripeLog.push({ p, params });
      return p === "/customers" ? { id: "cus_1" } : { id: "cs_1", url: "https://stripe.test/pay" };
    },
  } };
  const mod = require(modPath);
  delete require.cache[modPath];
  return mod;
}

const post = (body, headers = {}) => ({ httpMethod: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const CONFIRMED = "2026-10-01T00:00:00Z";
const acct = (email, confirmed = CONFIRMED) => ({ email, email_confirmed_at: confirmed });
// 60 households joined: numbers 1..50, then null, as start() and the trigger number them.
const sixty = () => Array.from({ length: 60 }, (_, i) => ({
  email: `h${i + 1}@example.test`, is_test: false, founding_position: i < 50 ? i + 1 : null,
}));
const numbersOf = (rows) => JSON.stringify(rows.map(r => [r.email, r.founding_position]));

// One account asks: what is it offered, and what does each checkout charge?
async function asAccount(opts) {
  const state = opts.state || makeState(opts);
  const stripe = [];
  const billing = load(BILLING_PATH, state, stripe);
  const status = JSON.parse((await billing.handler(post({ action: "status", ...(opts.extra || {}) }))).body);
  const checkout = {};
  for (const plan_key of ["founding_annual", "annual", "monthly"]) {
    const before = stripe.length;
    const res = await billing.handler(post({ action: "create_checkout_session", plan_key, ...(opts.extra || {}) }));
    const session = stripe.slice(before).find(c => c.p === "/checkout/sessions");
    checkout[plan_key] = { status: res.statusCode, price: session ? session.params.line_items[0].price : null };
  }
  return { status, checkout, state };
}

// A signed Stripe event to the webhook.
const T = Math.floor(Date.parse("2026-11-01T10:00:00Z") / 1000);
const sub = (status, plan_key = "founding_annual", price = "price_founding_7999") => ({
  id: "sub_f1", customer: "cus_f1", status,
  metadata: { user_id: "u1", plan_key },
  current_period_end: Math.floor(Date.parse("2027-11-01T10:00:00Z") / 1000),
  items: { data: [{ price: { id: price } }] },
});
async function deliver(state, id, type, object, created = T) {
  const hook = load(HOOK_PATH, state);
  const body = JSON.stringify({ id, created, type, data: { object } });
  return hook.handler(post(body, { "stripe-signature": signPayload(body, "whsec_founding_test") }));
}

(async () => {
  const t = create();
  const savedEnv = { ...process.env };
  process.env.BILLING_ENABLED = "true";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_founding_test";
  process.env.STRIPE_PRICE_MONTHLY_CAD = "price_monthly_1199";
  process.env.STRIPE_PRICE_ANNUAL_CAD = "price_annual_9999";
  process.env.STRIPE_PRICE_FOUNDING_ANNUAL_CAD = "price_founding_7999";
  const cohort = require("../netlify/functions/_lib/foundingCohort.js");

  const regular = (r, tag) => {
    t.eq(r.checkout.annual.status, 200, `${tag}: the regular annual checkout opens`);
    t.eq(r.checkout.annual.price, "price_annual_9999", `${tag}: …at the regular annual price ($99.99)`);
    t.eq(r.checkout.monthly.price, "price_monthly_1199", `${tag}: …and monthly at $11.99`);
  };
  const founding = (r, tag) => {
    t.eq(r.status.founding.available, true, `${tag}: offered the founding price`);
    t.eq(r.checkout.founding_annual.price, "price_founding_7999", `${tag}: …and its founding checkout is $79.99`);
  };
  const notFounding = (r, tag) => {
    t.eq(r.status.founding.available, false, `${tag}: not offered the founding price`);
    t.eq([r.checkout.founding_annual.status, r.checkout.founding_annual.price], [403, null], `${tag}: …its founding checkout is refused before Stripe is asked`);
    regular(r, tag);
  };

  // ── 1. number 50 gets it; 51 does not ────────────────────────────────────────────────────────
  {
    founding(await asAccount({ waitlist: sixty(), user: acct("h50@example.test") }), "1a #50");
    regular(await asAccount({ waitlist: sixty(), user: acct("h50@example.test") }), "1b #50");
    founding(await asAccount({ waitlist: sixty(), user: acct("h1@example.test") }), "1c #1");
    notFounding(await asAccount({ waitlist: sixty(), user: acct("h51@example.test") }), "1d #51");
    notFounding(await asAccount({ waitlist: sixty(), user: acct("never-joined@example.test") }), "1e not on the waitlist");
    t.eq([cohort.isFoundingPosition(51), cohort.isFoundingPosition(0), cohort.isFoundingPosition(50.5)], [false, false, false],
      "1f 51, 0 and fractions are never founding numbers");
  }

  // ── 2. a test row never takes a spot ─────────────────────────────────────────────────────────
  {
    const rows = [{ email: "check-row@example.test", is_test: true, founding_position: null }, ...sixty()];
    notFounding(await asAccount({ waitlist: rows, user: acct("check-row@example.test") }), "2a a test row");
    founding(await asAccount({ waitlist: rows, user: acct("h50@example.test") }), "2b #50 behind a test row");
    // Marked as a test row AFTER it was numbered: it keeps the number (numbers never shift); the lookup skips it.
    notFounding(await asAccount({ waitlist: [{ email: "late-test@example.test", is_test: true, founding_position: 3 }], user: acct("late-test@example.test") }),
      "2c a test row still holding a number");
  }

  // ── 3. email case and whitespace do not matter ──────────────────────────────────────────────
  {
    const rows = [
      { email: "  Alex.Rivera@Example.CA ", is_test: false, founding_position: 7 },
      { email: "jordan@example.ca", is_test: false, founding_position: 8 },
    ];
    const a = await asAccount({ waitlist: rows, user: acct("alex.rivera@example.ca") });
    founding(a, "3a a mixed-case, padded waitlist row and a lower-case account");
    const j = await asAccount({ waitlist: rows, user: acct("  JORDAN@Example.CA\t") });
    founding(j, "3b a lower-case waitlist row and a mixed-case, padded account");
    t.eq(j.state.rpcCalls.find(c => c.name === "waitlist_founding_position_for_email").args.p_email, "jordan@example.ca",
      "3c the address is normalised before it is sent");
    t.eq(cohort.normalizeEmail(" A b@C.d\n"), "ab@c.d", "3d whitespace anywhere and case are dropped");
    notFounding(await asAccount({ waitlist: rows, user: acct("alex.rivera@example.com") }), "3e a different address");
  }

  // ── 4. joining and never paying does not free a spot ─────────────────────────────────────────
  {
    const r51 = await asAccount({ waitlist: sixty(), user: acct("h51@example.test") });
    t.eq(r51.state.rows.subscriptions.filter(x => x.status).length, 0, "4a no household has paid (the only rows are Stripe customer stubs from opening checkouts)");
    notFounding(r51, "4b #51 while 50 households have not paid");
    notFounding(await asAccount({ waitlist: sixty(), user: acct("h60@example.test") }), "4c #60");
    const src = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "_lib", "foundingCohort.js"), "utf8").replace(/\/\/.*$/gm, "");
    t.ok(!/\bcount\b|count=|\.length/.test(src) && /\.from\("subscriptions"\)\.select\("founding_ended_at"\)\.eq\("user_id", user_id\)\.maybeSingle\(\)/.test(src),
      "4d the rule never counts subscriptions: it reads only this account's own row");
  }

  // ── 5. the server decides ────────────────────────────────────────────────────────────────────
  {
    const extra = { founding: true, available: true, founding_position: 1, position: 1, email: "h1@example.test",
      founder_flag: true, price: "price_founding_7999", price_id: "price_founding_7999", amount: 7999 };
    const r = await asAccount({ waitlist: sixty(), user: acct("h51@example.test"), extra });
    notFounding(r, "5a a client claiming a number, an email, the flag or a price");
    t.ok(r.state.rpcCalls.every(c => c.args.p_email === "h51@example.test"), "5b the lookup always asks about the account's own email");
    t.eq(Object.keys(r.status.founding).sort().join(","), "available,cohortLimit", "5c the client is told yes or no and the cohort size, never a number or a count");
  }

  // ── 6. fails closed ──────────────────────────────────────────────────────────────────────────
  {
    notFounding(await asAccount({ waitlist: sixty(), rpcError: "function does not exist", user: acct("h1@example.test") }), "6a a failed lookup (0016 not applied)");
    const unconfirmed = await asAccount({ waitlist: sixty(), user: acct("h1@example.test", null) });
    notFounding(unconfirmed, "6b an unconfirmed email");
    t.eq(unconfirmed.state.rpcCalls.length, 0, "6c …which is not even looked up");
    notFounding(await asAccount({ waitlist: sixty(), user: acct("") }), "6d an account with no email");
    notFounding(await asAccount({ waitlist: sixty(), user: null }), "6e an account Supabase Auth cannot find");
    const unread = makeState({ waitlist: sixty(), user: acct("h1@example.test"), profiles: [{ user_id: "u1", founder_flag: true }] });
    unread.readError = { subscriptions: "column subscriptions.founding_ended_at does not exist" };
    notFounding(await asAccount({ state: unread }), "6f the ended marker cannot be read (0016 not applied): not even a flagged founder");
  }

  // ── 7. the 0016 SQL ──────────────────────────────────────────────────────────────────────────
  {
    t.ok(/create or replace function public\.waitlist_founding_position_for_email\(p_email text\)/.test(SQL), "7a 0016 defines the lookup billing calls");
    const fn = SQL.slice(SQL.indexOf("create or replace function public.waitlist_founding_position_for_email"), SQL.indexOf("$$;", SQL.indexOf("waitlist_founding_position_for_email")));
    t.ok(/where l\.email_key = public\.waitlist_email_key\(p_email\)/.test(fn) && /public\.waitlist_email_key\(w\.email\) = l\.email_key/.test(fn),
      "7b it matches by the address key, which ignores case and whitespace on both sides");
    t.ok(/and not w\.is_test/.test(fn), "7c it skips test rows");
    t.ok(/and l\.ended_at is null/.test(fn), "7d it skips a number whose founding subscription has ended");
    t.ok(/l\.position between 1 and 50/.test(fn) && /w\.founding_position = l\.position/.test(fn), "7e only numbers 1 to 50, still held by that waitlist row");
    for (const f of ["waitlist_founding_position_for_email", "waitlist_founding_mark_ended"]) {
      t.ok(new RegExp(`revoke all on function public\\.${f}\\(text\\) from public, anon, authenticated;`).test(SQL)
        && new RegExp(`grant execute on function public\\.${f}\\(text\\) to service_role;`).test(SQL), `7f only the service role may call ${f}`);
    }
    const marks = SQL.replace(/^\s*--.*$/gm, "").match(/update public\.waitlist\s[\s\S]*?;/g) || [];
    t.eq(marks.length, 1, "7g 0016 marks exactly one waitlist row");
    t.ok(/set is_test = true/.test(marks[0] || "") && /waitlist_email_key\(email\) = '492b64bcf0c6bfd2ca952ecbb02c25b9'/.test(marks[0] || ""),
      "7h …the 2026-10-06 check row, matched by hash");
    t.eq((SQL.match(/'[0-9a-f]{32}'/g) || []).length, 1, "7i …and no other row is named, by hash or otherwise");
    t.ok(!/@/.test(SQL.replace(/^\s*--.*$/gm, "")), "7j no email address is written in the SQL");
  }

  // ── 8. cancel and return ─────────────────────────────────────────────────────────────────────
  {
    // (a) An active founding subscription renews at $79.99: the renewal changes nothing about the price.
    const state = makeState({ waitlist: sixty(), user: acct("h50@example.test") });
    await deliver(state, "evt_co", "checkout.session.completed",
      { customer: "cus_f1", subscription: "sub_f1", metadata: { user_id: "u1", plan_key: "founding_annual" } }, T - 3600);
    const locked = state.rows.subscriptions[0].founding_locked_at;
    t.ok(!!locked && state.rows.subscriptions[0].plan_key === "founding_annual", "8a a founding checkout starts the founding lock");
    const renewal = { ...sub("active"), current_period_end: Math.floor(Date.parse("2028-11-01T10:00:00Z") / 1000) };
    const rr = await deliver(state, "evt_renew", "customer.subscription.updated", renewal, T + 365 * 86400);
    const row = state.rows.subscriptions[0];
    t.eq([rr.statusCode, row.status, row.plan_key, row.price_id], [200, "active", "founding_annual", "price_founding_7999"],
      "8b an active founding subscription renews on the founding price ($79.99)");
    t.eq([row.founding_locked_at, row.founding_ended_at ?? null], [locked, null], "8c …the lock stays, and nothing is marked ended");
    t.eq(state.rpcCalls.filter(c => c.name === "waitlist_founding_mark_ended").length, 0, "8d …and the waitlist number is untouched");
    for (const s of ["past_due", "unpaid"]) {
      const st = makeState({ waitlist: sixty(), user: acct("h50@example.test") });
      await deliver(st, `evt_${s}`, "customer.subscription.updated", sub(s));
      t.eq(st.rows.subscriptions[0].founding_ended_at ?? null, null, `8e a ${s} founding subscription has not ended: Stripe is still collecting`);
    }

    // (b) It ends.
    const del = await deliver(state, "evt_end", "customer.subscription.deleted", sub("canceled"), T + 400 * 86400);
    t.eq(del.statusCode, 200, "8f the end is processed");
    t.eq([row.status, row.founding_locked_at], ["canceled", null], "8g the subscription is canceled and the lock is cleared");
    const endedAt = row.founding_ended_at;
    t.ok(!!endedAt, "8h the account is marked: a founding subscription ended");
    t.eq(state.rpcCalls.filter(c => c.name === "waitlist_founding_mark_ended").map(c => c.args.p_email), ["h50@example.test"],
      "8i …and so is the account's waitlist number, by the account's own email");
    t.eq(state.ledger["h50@example.test"].position, 50, "8j the number stays issued to that household");

    // (c) It returns: regular prices only.
    notFounding(await asAccount({ state }), "8k the same account coming back");

    // An updated event that says canceled ends it too; the first end is the one that is kept.
    const st2 = makeState({ waitlist: sixty(), user: acct("h7@example.test") });
    await deliver(st2, "evt_upd_cancel", "customer.subscription.updated", sub("canceled"));
    t.ok(!!st2.rows.subscriptions[0].founding_ended_at, "8l a customer.subscription.updated with status canceled ends it too");
    const first = st2.rows.subscriptions[0].founding_ended_at;
    await deliver(st2, "evt_del_later", "customer.subscription.deleted", sub("canceled"), T + 60);
    t.eq(st2.rows.subscriptions[0].founding_ended_at, first, "8m a later end event does not move the first end");

    // A regular subscription ending marks nothing.
    const st3 = makeState({ waitlist: sixty(), user: acct("h8@example.test") });
    await deliver(st3, "evt_annual_end", "customer.subscription.deleted", sub("canceled", "annual", "price_annual_9999"));
    t.eq([st3.rows.subscriptions[0].founding_ended_at ?? null, st3.rpcCalls.length], [null, 0], "8n an annual subscription ending marks nothing");
    founding(await asAccount({ state: st3 }), "8o …so a #8 who tried annual first can still buy founding");

    // The account deleted and re-created with the same email: no subscriptions row, but the number remembers.
    const fresh = makeState({ waitlist: sixty(), user: acct("h50@example.test") });
    fresh.ledger["h50@example.test"].ended_at = endedAt;
    notFounding(await asAccount({ state: fresh }), "8p a new account on an email whose founding subscription ended");

    // (d) The spot is never reassigned.
    const before = numbersOf(state.rows.waitlist);
    notFounding(await asAccount({ state: { ...state, user: acct("h51@example.test") } }), "8q #51 after #50's founding subscription ended");
    t.eq(numbersOf(state.rows.waitlist), before, "8r nobody's number changed when #50's subscription ended");
    t.ok(Object.values(state.ledger).filter(l => l.position === 50).length === 1, "8s number 50 is still held by one household, the one it was issued to");

    // A failure to mark the waitlist number is a 5xx, so Stripe retries until it is recorded.
    const st4 = makeState({ waitlist: sixty(), user: acct("h9@example.test"), endError: "connection reset" });
    const fail = await deliver(st4, "evt_end_fail", "customer.subscription.deleted", sub("canceled"));
    t.eq(fail.statusCode, 500, "8t if the waitlist number cannot be marked, Stripe is asked to retry");
    t.eq(st4.rows.billing_events.find(e => e.event_id === "evt_end_fail").status, "failed", "8u …and the event is recorded as failed, so the retry runs it again");
    t.ok(!!st4.rows.subscriptions[0].founding_ended_at, "8v …while the account itself is already marked");
  }

  // ── 9. beta founders ─────────────────────────────────────────────────────────────────────────
  {
    const flagged = (user = acct("tester@example.test"), extra = {}) =>
      makeState({ waitlist: sixty(), profiles: [{ user_id: "u1", founder_flag: true }], user, ...extra });
    const r = await asAccount({ state: flagged() });
    founding(r, "9a a flagged beta tester with no waitlist row");
    regular(r, "9b a flagged beta tester");
    t.eq(r.state.rpcCalls.length, 0, "9c …decided without asking the waitlist at all: outside the 50");
    founding(await asAccount({ state: flagged(acct("tester@example.test", null)) }), "9d the flag is the account's, so it needs no waitlist email");

    const s = flagged();
    const before = numbersOf(s.rows.waitlist), ledgerBefore = JSON.stringify(s.ledger);
    await asAccount({ state: s });
    await deliver(s, "evt_tester_co", "checkout.session.completed",
      { customer: "cus_t", subscription: "sub_t", metadata: { user_id: "u1", plan_key: "founding_annual" } });
    t.eq(numbersOf(s.rows.waitlist), before, "9e a flagged tester buying the founding price changes nobody's waitlist number");
    t.eq(JSON.stringify(s.ledger), ledgerBefore, "9f …and uses up no number");
    founding(await asAccount({ waitlist: s.rows.waitlist, user: acct("h50@example.test") }), "9g #50 still has the founding price beside the tester");
    notFounding(await asAccount({ waitlist: s.rows.waitlist, user: acct("h51@example.test") }), "9h …and #51 still does not");

    // Ended is final for a beta founder too.
    const ended = flagged(acct("tester@example.test"), { subscriptions: [{ user_id: "u1", status: "canceled", founding_ended_at: "2026-12-01T00:00:00Z" }] });
    notFounding(await asAccount({ state: ended }), "9i a flagged tester whose founding subscription ended");
    const unflagged = makeState({ waitlist: sixty(), profiles: [{ user_id: "u1", founder_flag: false }], user: acct("tester@example.test") });
    notFounding(await asAccount({ state: unflagged }), "9j an unflagged tester not in the 50");
  }

  process.env = savedEnv;
  t.summary("foundingBilling.test");
})();
