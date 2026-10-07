// tests/foundingBilling.test.cjs
// -----------------------------------------------------------------------------
// BILLING HONOURS THE WAITLIST FOUNDING POSITIONS (Amanda's decision, 2026-10-06).
//
// The founding price ($79.99 a year plus tax) is sold only to a confirmed account whose email matches a
// waitlist row that is not a test row and holds founding position 1 to 50. Everyone else is offered the
// regular prices ($11.99 a month, $99.99 a year). The server decides; the client sends a plan key.
//
// What this pins:
//   1. position 50 gets the founding price; position 51 (the first after the cohort) does not
//   2. a test row never takes a spot, even one that still carries a position
//   3. email case and whitespace do not matter, on either side
//   4. a household that joins and never pays does not free its spot
//   5. the server decides: nothing the client sends changes the answer
//   6. it fails closed: no lookup, no confirmed email, no founding price — the regular prices remain
//   7. the 0016 lookup in SQL: same rules, service role only, the check row marked by hash
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const SQL = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "0016_waitlist_founding_billing.sql"), "utf8");

// The 0016 lookup, as the SQL defines it: whitespace stripped and lower-cased on both sides, a blank
// address matches nothing, test rows are skipped, and only positions 1..50 count.
const norm = (e) => String(e == null ? "" : e).replace(/\s+/g, "").toLowerCase();
function lookup(rows, email) {
  if (!norm(email)) return null;
  const hits = rows.filter(r => norm(r.email) === norm(email) && !r.is_test
    && Number.isInteger(r.founding_position) && r.founding_position >= 1 && r.founding_position <= 50);
  return hits.length ? Math.min(...hits.map(r => r.founding_position)) : null;
}

function fakeAdmin(state) {
  const from = (table) => {
    const q = {
      _f: [],
      select() { return q; },
      eq(col, val) { q._f.push(r => r[col] === val); return q; },
      async maybeSingle() { return { data: (state.rows[table] || []).find(r => q._f.every(fn => fn(r))) || null, error: null }; },
      async upsert(row) { (state.writes = state.writes || []).push({ table, row }); return { error: null }; },
    };
    return q;
  };
  const rpc = async (name, args) => {
    state.rpcCalls.push({ name, args });
    if (state.rpcError) return { data: null, error: { message: state.rpcError } };
    if (name !== "waitlist_founding_position_for_email") return { data: null, error: { message: "no such function" } };
    return { data: lookup(state.rows.waitlist || [], args.p_email), error: null };
  };
  return { from, rpc, auth: { admin: { getUserById: async () => ({ data: { user: state.user } }) } } };
}

function loadBilling(state, stripeLog) {
  delete require.cache[BILLING_PATH];
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
  const mod = require(BILLING_PATH);
  delete require.cache[BILLING_PATH];
  return mod;
}

const post = (body) => ({ httpMethod: "POST", headers: {}, body: JSON.stringify(body) });
const CONFIRMED = "2026-10-01T00:00:00Z";
// 60 households joined: positions 1..50, then null, as the 0014 trigger numbers them.
const sixty = () => Array.from({ length: 60 }, (_, i) => ({
  email: `h${i + 1}@example.test`, is_test: false, founding_position: i < 50 ? i + 1 : null,
}));

// One account asks: what is it offered, and what does each checkout charge?
async function asAccount(t, { rows, user, rpcError, extra = {} }) {
  const state = { rows: { waitlist: rows, subscriptions: [] }, user, rpcError, rpcCalls: [] };
  const stripe = [];
  const billing = loadBilling(state, stripe);
  const status = JSON.parse((await billing.handler(post({ action: "status", ...extra }))).body);
  const checkout = {};
  for (const plan_key of ["founding_annual", "annual", "monthly"]) {
    const before = stripe.length;
    const res = await billing.handler(post({ action: "create_checkout_session", plan_key, ...extra }));
    const session = stripe.slice(before).find(c => c.p === "/checkout/sessions");
    checkout[plan_key] = { status: res.statusCode, price: session ? session.params.line_items[0].price : null };
  }
  return { status, checkout, state };
}

(async () => {
  const t = create();
  const savedEnv = { ...process.env };
  process.env.BILLING_ENABLED = "true";
  process.env.STRIPE_PRICE_MONTHLY_CAD = "price_monthly_1199";
  process.env.STRIPE_PRICE_ANNUAL_CAD = "price_annual_9999";
  process.env.STRIPE_PRICE_FOUNDING_ANNUAL_CAD = "price_founding_7999";
  const cohort = require("../netlify/functions/_lib/foundingCohort.js");

  const regular = (r, tag) => {
    t.eq(r.checkout.annual.status, 200, `${tag}: the regular annual checkout opens`);
    t.eq(r.checkout.annual.price, "price_annual_9999", `${tag}: …at the regular annual price ($99.99)`);
    t.eq(r.checkout.monthly.price, "price_monthly_1199", `${tag}: …and monthly at $11.99`);
  };

  // ── 1. position 50 gets it; 51 does not ──────────────────────────────────────────────────────
  {
    const r50 = await asAccount(t, { rows: sixty(), user: { email: "h50@example.test", email_confirmed_at: CONFIRMED } });
    t.eq(r50.status.founding.available, true, "1a waitlist position 50 is offered the founding price");
    t.eq(r50.checkout.founding_annual.status, 200, "1b …its founding checkout opens");
    t.eq(r50.checkout.founding_annual.price, "price_founding_7999", "1c …at the founding price ($79.99)");
    regular(r50, "1d #50");

    const r1 = await asAccount(t, { rows: sixty(), user: { email: "h1@example.test", email_confirmed_at: CONFIRMED } });
    t.eq(r1.checkout.founding_annual.price, "price_founding_7999", "1e position 1 gets it too");

    const r51 = await asAccount(t, { rows: sixty(), user: { email: "h51@example.test", email_confirmed_at: CONFIRMED } });
    t.eq(r51.status.founding.available, false, "1f position 51 (the first household after the cohort) is not offered it");
    t.eq(r51.checkout.founding_annual.status, 403, "1g …and its founding checkout is refused");
    t.eq(r51.checkout.founding_annual.price, null, "1h …before Stripe is asked for a session");
    regular(r51, "1i #51");

    const none = await asAccount(t, { rows: sixty(), user: { email: "never-joined@example.test", email_confirmed_at: CONFIRMED } });
    t.eq(none.status.founding.available, false, "1j an account not on the waitlist is not offered it");
    regular(none, "1k not on the waitlist");

    // A stored 51 cannot exist (0014's check), but if a lookup ever returned one it is still not founding.
    t.eq(cohort.isFoundingPosition(51), false, "1l 51 is never a founding position");
    t.eq(cohort.isFoundingPosition(0), false, "1m …nor 0");
    t.eq(cohort.isFoundingPosition(50.5), false, "1n …nor a fraction");
  }

  // ── 2. a test row never takes a spot ─────────────────────────────────────────────────────────
  {
    // The check row joined first. Marked as a test row it has no position, and the 50 after it hold 1..50.
    const rows = [{ email: "check-row@example.test", is_test: true, founding_position: null }, ...sixty()];
    const tr = await asAccount(t, { rows, user: { email: "check-row@example.test", email_confirmed_at: CONFIRMED } });
    t.eq(tr.status.founding.available, false, "2a a test row is never offered the founding price");
    t.eq(tr.checkout.founding_annual.status, 403, "2b …and cannot buy it");
    regular(tr, "2c test row");
    const last = await asAccount(t, { rows, user: { email: "h50@example.test", email_confirmed_at: CONFIRMED } });
    t.eq(last.checkout.founding_annual.price, "price_founding_7999", "2d the test row did not push #50 out of the cohort");

    // A row marked as a test row AFTER it was numbered still holds its number until start() runs again.
    // The lookup skips it anyway.
    const late = [{ email: "late-test@example.test", is_test: true, founding_position: 3 }];
    const lt = await asAccount(t, { rows: late, user: { email: "late-test@example.test", email_confirmed_at: CONFIRMED } });
    t.eq(lt.status.founding.available, false, "2e a test row still carrying a position is not offered it");
    t.eq(lt.checkout.founding_annual.status, 403, "2f …and cannot buy it");
  }

  // ── 3. email case and whitespace do not matter ──────────────────────────────────────────────
  {
    const rows = [
      { email: "  Alex.Rivera@Example.CA ", is_test: false, founding_position: 7 },
      { email: "jordan@example.ca", is_test: false, founding_position: 8 },
    ];
    for (const [stored, account, tag] of [
      [0, "alex.rivera@example.ca", "3a a mixed-case, padded waitlist row matches a lower-case account"],
      [1, "  JORDAN@Example.CA\t", "3b a lower-case waitlist row matches a mixed-case, padded account"],
    ]) {
      const r = await asAccount(t, { rows, user: { email: account, email_confirmed_at: CONFIRMED } });
      t.eq(r.checkout.founding_annual.price, "price_founding_7999", tag);
      t.eq(r.state.rpcCalls[0].args.p_email, stored === 0 ? "alex.rivera@example.ca" : "jordan@example.ca",
        `${tag.slice(0, 2)}2 …and the address the server asks about is normalised before it is sent`);
    }
    t.eq(cohort.normalizeEmail(" A b@C.d\n"), "ab@c.d", "3c whitespace anywhere and case are dropped");
    const other = await asAccount(t, { rows, user: { email: "alex.rivera@example.com", email_confirmed_at: CONFIRMED } });
    t.eq(other.status.founding.available, false, "3d …but a different address is still a different address");
  }

  // ── 4. joining and never paying does not free a spot ─────────────────────────────────────────
  {
    // Nobody has paid at all, and 49 of the 50 never will. #51 is still outside, #50 still inside.
    const r51 = await asAccount(t, { rows: sixty(), user: { email: "h51@example.test", email_confirmed_at: CONFIRMED } });
    t.eq(r51.state.rows.subscriptions.length, 0, "4a no household has paid");
    t.eq(r51.status.founding.available, false, "4b #51 still is not offered the founding price: unpaid spots are not freed");
    const r60 = await asAccount(t, { rows: sixty(), user: { email: "h60@example.test", email_confirmed_at: CONFIRMED } });
    t.eq(r60.checkout.founding_annual.status, 403, "4c …nor is #60");
    const src = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "_lib", "foundingCohort.js"), "utf8");
    t.ok(!/subscriptions/.test(src.replace(/\/\/.*$/gm, "")), "4d the rule never counts paid subscriptions");
  }

  // ── 5. the server decides ────────────────────────────────────────────────────────────────────
  {
    const extra = { founding: true, available: true, founding_position: 1, position: 1, email: "h1@example.test",
      price: "price_founding_7999", price_id: "price_founding_7999", amount: 7999 };
    const r = await asAccount(t, { rows: sixty(), user: { email: "h51@example.test", email_confirmed_at: CONFIRMED }, extra });
    t.eq(r.status.founding.available, false, "5a a client claiming a position, an email or a price is not believed");
    t.eq(r.checkout.founding_annual.status, 403, "5b …and cannot buy the founding price with it");
    t.eq(r.checkout.annual.price, "price_annual_9999", "5c …and a client-sent price id is never used");
    t.ok(r.state.rpcCalls.every(c => c.args.p_email === "h51@example.test"),
      "5d the lookup always asks about the account's own email, never one from the request");
    t.eq(Object.keys(r.status.founding).sort().join(","), "available,cohortLimit",
      "5e the client is told yes or no and the cohort size, never a position or a count");
  }

  // ── 6. fails closed ──────────────────────────────────────────────────────────────────────────
  {
    const err = await asAccount(t, { rows: sixty(), rpcError: "function does not exist", user: { email: "h1@example.test", email_confirmed_at: CONFIRMED } });
    t.eq(err.status.founding.available, false, "6a a failed lookup (0016 not applied) offers no founding price");
    t.eq(err.checkout.founding_annual.status, 403, "6b …and refuses it at checkout");
    regular(err, "6c failed lookup");

    const unconfirmed = await asAccount(t, { rows: sixty(), user: { email: "h1@example.test", email_confirmed_at: null } });
    t.eq(unconfirmed.status.founding.available, false, "6d an unconfirmed email cannot claim a household's place");
    t.eq(unconfirmed.state.rpcCalls.length, 0, "6e …and is not even looked up");

    const noEmail = await asAccount(t, { rows: sixty(), user: { email: "", email_confirmed_at: CONFIRMED } });
    t.eq(noEmail.status.founding.available, false, "6f an account with no email is not offered it");
    const noUser = await asAccount(t, { rows: sixty(), user: null });
    t.eq(noUser.status.founding.available, false, "6g …nor one Supabase Auth cannot find");

    // The beta founder flag no longer unlocks the founding price on its own: only a waitlist position does.
    const billingSrc = fs.readFileSync(BILLING_PATH, "utf8");
    t.ok(!/founder_flag/.test(billingSrc), "6h billing.js no longer reads profiles.founder_flag for the founding price");
  }

  // ── 7. the SQL lookup (0016) ─────────────────────────────────────────────────────────────────
  {
    t.ok(/create or replace function public\.waitlist_founding_position_for_email\(p_email text\)/.test(SQL), "7a 0016 defines the lookup billing calls");
    const fn = SQL.slice(SQL.indexOf("create or replace function"), SQL.indexOf("$$;"));
    t.ok(/lower\(regexp_replace\(w\.email, '\\s\+', '', 'g'\)\) = lower\(regexp_replace\(coalesce\(p_email, ''\), '\\s\+', '', 'g'\)\)/.test(fn),
      "7b it ignores case and whitespace on both sides");
    t.ok(/and not w\.is_test/.test(fn), "7c it skips test rows");
    t.ok(/w\.founding_position between 1 and 50/.test(fn), "7d it returns only positions 1 to 50");
    t.ok(/security invoker/.test(fn), "7e it runs as the caller");
    t.ok(/revoke all on function public\.waitlist_founding_position_for_email\(text\) from public, anon, authenticated;/.test(SQL)
      && /grant execute on function public\.waitlist_founding_position_for_email\(text\) to service_role;/.test(SQL),
      "7f only the service role may call it");
    t.ok(/set is_test = true, founding_position = null/.test(SQL) && /md5\(lower\(regexp_replace\(email/.test(SQL),
      "7g the 2026-10-06 check row is marked as a test row, matched by hash");
    t.ok(!/@/.test(SQL.replace(/^\s*--.*$/gm, "")), "7h no email address is written in the SQL");
  }

  process.env = savedEnv;
  t.summary("foundingBilling.test");
})();
