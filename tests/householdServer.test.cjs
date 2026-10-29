// tests/householdServer.test.cjs
// -----------------------------------------------------------------------------
// COUPLE MODE ON THE SERVER (docs/product/COUPLE-MODE-SPEC.md). The real functions, signed in through the
// real getUserFromRequest, against an in-memory stand-in for Supabase and for Plaid. The database rules
// themselves (RLS, expiry, single use, two adults) are proved in a real Postgres: household.sql.test.cjs.
//   1  /api/household is absent (404) until HOUSEHOLD_ENABLED is "true", and refuses anyone not signed in
//   2  invite: consent first; the link token never comes back and only hashes reach the database; the code is
//      shown once; the email goes once, in the approved words, and never with a placeholder; 5 invites a day
//   3  join: consent first; the address is the account's own, never the body's; results map to clear codes
//   4  banks: a member reads a bank the other linked, keeps their own sync cursor, never revokes it; a
//      stranger reaches nothing; a failed household read never widens access
//   5  one subscription covers both: the partner is unlimited and paid in every app, offered nothing and sold
//      nothing; a partner's trial covers nobody; a failed read is 503, never "not paid"
//   6  status: roles only, never a name or the other's email
//   7  joins: the network goes to the database as a keyed hash only, the address is the account's own
//   8  one purchase at a time: a Stripe checkout or a store purchase holds the household; the other is refused
//   9  a household that pays twice: one is the extra, by one rule; its holder is told; ours stops renewing;
//      leaving resumes it
//  10  the coach: whatever the app sends, the request to the AI provider carries no member's name
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const crypto = require("crypto");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const HLIB_PATH = require.resolve("../netlify/functions/_lib/household.js");
const HFN_PATH = require.resolve("../netlify/functions/household.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const BILLING_PATH = require.resolve("../netlify/functions/billing.js");
const API_PATH = require.resolve("../netlify/functions/_lib/stripeApi.js");

const O = "00000000-0000-4000-8000-00000000000a", P = "00000000-0000-4000-8000-00000000000b", S = "00000000-0000-4000-8000-00000000000c";
const EMAIL = { [O]: "owner@example.test", [P]: "partner@example.test", [S]: "stranger@example.test" };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const ENDED_TRIAL = { plan: "trial", trial_started_at: "2026-09-01T00:00:00Z", trial_ends_at: "2026-09-15T00:00:00Z", founder_flag: false };
const LIVE_TRIAL = { plan: "trial", trial_started_at: new Date().toISOString(), trial_ends_at: new Date(Date.now() + 5 * 86400000).toISOString(), founder_flag: false };
const PAID = (provider = "stripe") => ({ status: "active", current_period_end: "2099-01-01T00:00:00Z", plan_key: "annual", provider, provider_customer_id: "cus_1" });

// An in-memory Supabase: tables of rows, the query shapes the functions use, rpc handlers, and auth by token.
function fakeSupabase(db, { errors = {}, rpc = {} } = {}) {
  const log = { rpc: [], reads: [], writes: [] };
  const from = (table) => {
    log.reads.push(table);
    const st = { f: [], op: "select", head: false, limit: null, payload: null, conflict: null, cols: null };
    const rows = () => (db[table] = db[table] || []);
    const hit = () => rows().filter((r) => st.f.every((f) => f(r)));
    const run = (one) => {
      if (errors[table]) return { data: null, error: errors[table], count: null };
      if (st.op === "update") { hit().forEach((r) => Object.assign(r, st.payload)); log.writes.push([table, "update", st.payload]); return { data: null, error: null }; }
      if (st.op === "delete") { const gone = hit(); db[table] = rows().filter((r) => !gone.includes(r)); log.writes.push([table, "delete"]); return { data: null, error: null }; }
      if (st.op === "upsert") {
        const keys = (st.conflict || "").split(",").filter(Boolean);
        const same = rows().find((r) => keys.length && keys.every((k) => r[k] === st.payload[k]));
        if (same) Object.assign(same, st.payload); else rows().push({ ...st.payload });
        log.writes.push([table, "upsert", st.payload]); return { data: null, error: null };
      }
      // Only the columns asked for, as PostgREST answers: a token not selected is not in the answer.
      let out = hit().map((r) => (st.cols ? Object.fromEntries(st.cols.filter((c) => c in r).map((c) => [c, r[c]])) : r));
      if (st.limit != null) out = out.slice(0, st.limit);
      if (st.head) return { data: null, error: null, count: out.length };
      if (one === "single") return out.length === 1 ? { data: { ...out[0] }, error: null } : { data: null, error: { code: "PGRST116", message: "0 rows" } };
      if (one === "maybe") return out.length > 1 ? { data: null, error: { message: "multiple rows" } } : { data: out[0] ? { ...out[0] } : null, error: null };
      return { data: out.map((r) => ({ ...r })), error: null, count: out.length };
    };
    const q = {
      select(c, opts) { if (opts && opts.head) st.head = true; if (typeof c === "string" && c.trim() !== "*") st.cols = c.split(",").map((x) => x.trim()); return q; },
      eq(k, v) { st.f.push((r) => r[k] === v); return q; },
      in(k, vs) { st.f.push((r) => vs.includes(r[k])); return q; },
      is(k, v) { st.f.push((r) => (r[k] ?? null) === v); return q; },
      gt(k, v) { st.f.push((r) => r[k] > v); return q; },
      gte(k, v) { st.f.push((r) => r[k] >= v); return q; },
      order() { return q; },
      limit(n) { st.limit = n; return q; },
      update(p) { st.op = "update"; st.payload = p; return q; },
      delete() { st.op = "delete"; return q; },
      upsert(p, o) { st.op = "upsert"; st.payload = p; st.conflict = o && o.onConflict; return Promise.resolve(run()); },
      single: () => Promise.resolve(run("single")),
      maybeSingle: () => Promise.resolve(run("maybe")),
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return q;
  };
  const client = {
    from,
    rpc: async (fn, args) => { log.rpc.push([fn, args]); return rpc[fn] ? rpc[fn](args) : { data: null, error: { code: "PGRST202", message: `function ${fn} not found` } }; },
    auth: {
      getUser: async (token) => {
        const id = String(token || "").replace(/^tok:/, "");
        return EMAIL[id] ? { data: { user: { id, email: EMAIL[id], email_confirmed_at: "2026-10-01T00:00:00Z" } }, error: null } : { data: null, error: { message: "bad token" } };
      },
      admin: { getUserById: async (id) => ({ data: { user: EMAIL[id] ? { id, email: EMAIL[id], email_confirmed_at: "2026-10-01T00:00:00Z" } : null } }) },
    },
  };
  return { client, log };
}

// A stand-in for Stripe that records every call (nothing reaches Stripe).
function fakeStripe(over = {}) {
  const calls = [];
  const post = async (p, params, opts) => {
    calls.push(["POST", p, params, opts && opts.idempotencyKey]);
    if (over.post) { const r = await over.post(p, params); if (r !== undefined) return r; }
    if (p === "/customers") return { id: "cus_new" };
    if (p === "/checkout/sessions") return { id: "cs_1", url: "https://checkout.stripe.test/cs_1" };
    return { id: p.split("/").pop() };
  };
  const get = async (p) => { calls.push(["GET", p]); if (over.get) { const r = await over.get(p); if (r !== undefined) return r; } return { data: [] }; };
  return { calls, stripePost: post, stripeGet: get, stripeDelete: async () => ({}) };
}

function load(db, opts = {}, env = {}, stripe = null) {
  const fake = fakeSupabase(db, opts);
  const keep = { HOUSEHOLD_ENABLED: "true", BILLING_ENABLED: "true", IAP_ENABLED: "true", ENFORCE_PLAN_LIMITS: "true" };
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role",
    PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", RESEND_API_KEY: "re_test_key", ...keep, ...env });
  require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => fake.client } };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: stripe
    ? { stripePost: stripe.stripePost, stripeGet: stripe.stripeGet, stripeDelete: stripe.stripeDelete }
    : { stripePost: async () => { throw new Error("stripe must not be called"); }, stripeGet: async () => ({ data: [] }), stripeDelete: async () => ({}) } };
  for (const p of [AUTH_PATH, HLIB_PATH, HFN_PATH, PLAID_PATH, BILLING_PATH]) delete require.cache[p];
  return { auth: require(AUTH_PATH), lib: require(HLIB_PATH), household: require(HFN_PATH), plaid: require(PLAID_PATH), billing: require(BILLING_PATH), log: fake.log, db };
}
const post = (who, body, extra = {}) => ({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", ...(who ? { authorization: `Bearer tok:${who}` } : {}), ...extra }, body: JSON.stringify(body) });
const call = async (fn, who, body, deps, extra) => { const r = await fn.handler(post(who, body, extra), {}, deps); return { code: r.statusCode, body: JSON.parse(r.body || "{}") }; };

// O and P share a household; S is a stranger with a bank of their own.
const coupleDb = (over = {}) => ({
  household_members: [{ household_id: "h1", user_id: O, role: "owner", joined_at: "2026-10-29T10:00:00Z" }, { household_id: "h1", user_id: P, role: "partner", joined_at: "2026-10-29T11:00:00Z" }],
  household_invites: [],
  plaid_items: [
    { id: "row-O", user_id: O, item_id: "item-O", access_token: "access-O", next_cursor: "cursor-O", institution_name: "Bank O", status: "active", created_at: "2026-10-01" },
    { id: "row-S", user_id: S, item_id: "item-S", access_token: "access-S", next_cursor: null, institution_name: "Bank S", status: "active", created_at: "2026-10-01" },
  ],
  plaid_item_cursors: [],
  profiles: [{ user_id: O, ...ENDED_TRIAL }, { user_id: P, ...ENDED_TRIAL }, { user_id: S, ...ENDED_TRIAL }],
  subscriptions: [],
  ...over,
});

(async () => {
  const t = create();
  const savedEnv = { ...process.env };
  const realFetch = global.fetch;
  const quiet = { e: console.error, w: console.warn, l: console.log };
  console.error = () => {}; console.warn = () => {}; console.log = () => {};
  const plaidCalls = [];
  global.fetch = async (url, init) => {
    const u = String(url), b = init && init.body ? JSON.parse(init.body) : {};
    plaidCalls.push({ path: u.replace(/^https:\/\/[^/]+/, ""), token: b.access_token, cursor: b.cursor || null, host: u.split("/")[2] });
    if (/\/accounts\/get$/.test(u)) return { ok: true, json: async () => ({ accounts: [{ account_id: "acc-1", name: "Chequing", type: "depository", subtype: "checking", balances: { current: 10 } }] }) };
    if (/\/transactions\/sync$/.test(u)) return { ok: true, json: async () => ({ added: [{ transaction_id: "tx-1", account_id: "acc-1", amount: 5, date: "2026-10-28", name: "Coffee" }], modified: [], removed: [], next_cursor: "next-1", has_more: false, accounts: [{ account_id: "acc-1", type: "depository" }] }) };
    if (/\/item\/remove$/.test(u)) return { ok: true, json: async () => ({ removed: true }) };
    return { ok: false, json: async () => ({ error_code: "UNEXPECTED", error_message: u }) };
  };
  try {
    // ── 1. OFF, AND SIGNED IN ONLY ──────────────────────────────────────────────────────────────────
    {
      const a = load(coupleDb(), {}, { HOUSEHOLD_ENABLED: "" });
      for (const action of ["status", "create_invite", "accept_invite", "leave", "remove_partner", "revoke_invite"]) {
        t.eq((await call(a.household, O, { action })).code, 404, `1a ${action} is absent while HOUSEHOLD_ENABLED is off`);
      }
      t.eq(a.log.reads, [], "1b …and nothing is read");
      const b = load(coupleDb(), {}, { HOUSEHOLD_ENABLED: "yes" });
      t.eq((await call(b.household, O, { action: "status" })).code, 404, "1c only exactly \"true\" switches it on");
      const c = load(coupleDb());
      t.eq((await call(c.household, null, { action: "status" })).code, 401, "1d no session: 401");
      t.eq((await call(c.household, O, { action: "nope" })).code, 400, "1e an unknown action is refused");
      const d = load({}, { errors: { household_members: { code: "42P01", message: "relation \"public.household_members\" does not exist" } } });
      t.eq((await call(d.household, O, { action: "status" })).code, 404, "1f before 0030 runs the feature is absent, so the app shows nothing");
    }

    // ── 2. INVITE ───────────────────────────────────────────────────────────────────────────────────
    {
      const sent = [];
      const deps = { fetch: async (u, init) => { sent.push([u, init]); return { ok: true }; } };
      const a = load({ household_members: [], household_invites: [] }, { rpc: { household_create_invite: (args) => ({ data: { result: "invited", household_id: "h9", invite_id: "inv-1", expires_at: "2026-11-05T12:00:00Z", created: true }, error: null }) } });
      t.eq((await call(a.household, O, { action: "create_invite", email: "partner@example.test" }, deps)).code, 400, "2a no consent: refused");
      t.eq(a.log.rpc, [], "2b …before anything is made");
      t.eq((await call(a.household, O, { action: "create_invite", email: "not-an-email", consent: true }, deps)).body.error, "invalid_email", "2c a bad address is refused");
      t.eq((await call(a.household, O, { action: "create_invite", email: " Owner@Example.test ", consent: true }, deps)).body.error, "own_email", "2d inviting yourself is refused");
      const r = await call(a.household, O, { action: "create_invite", email: " Partner@Example.TEST", consent: true }, deps);
      t.eq([r.code, r.body.invite.email, r.body.household_created], [200, "partner@example.test", true], "2e the owner invites the partner's address, cleaned");
      t.ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(r.body.invite.code), "2f the 6-character code comes back once, to show on the owner's screen");
      const args = a.log.rpc.find(([fn]) => fn === "household_create_invite")[1];
      t.eq([args.p_owner, args.p_email_key], [O, "partner@example.test"], "2g the owner is the signed-in account, the address the cleaned one");
      t.eq(args.p_code_hash, sha(r.body.invite.code), "2h only the code's SHA-256 reaches the database");
      t.ok(/^[0-9a-f]{64}$/.test(args.p_token_hash) && !JSON.stringify(r.body).includes(args.p_token_hash), "2i only the link token's hash is stored, and neither token nor hash comes back");
      // The words are approved (2026-10-29): the invite goes, to the stand-in for Resend (deps.fetch), never anywhere real.
      const mail = sent.length === 1 ? JSON.parse(sent[0][1].body) : {};
      t.eq([r.body.invite.email_sent, sent.length, sent[0] && sent[0][0], sent[0] && sent[0][1].headers["Idempotency-Key"]], [true, 1, "https://api.resend.com/emails", "household-invite:inv-1"],
        "2j the invite email is sent once, to Resend, keyed to the invite so a retry never sends twice");
      t.eq([mail.to, mail.subject], [["partner@example.test"], a.lib.INVITE_EMAIL.subject], "2k …to the partner's address, with the approved subject");
      t.ok(/\?household_invite=[A-Za-z0-9_-]{43}\b/.test(mail.text) && mail.text.includes(`${a.lib.INVITE_EMAIL.code} ${r.body.invite.code}`) && mail.text.includes(`${a.lib.INVITE_EMAIL.expires} November 5, 2026`),
        "2l …carrying the link, the code after its line, and the end date after its line");
      t.ok(!a.lib.hasPlaceholder(mail) && !/\u2014/.test(mail.text + mail.html), "2m …with no placeholder and no em dash");
      t.ok(!/owner@example|\$|balance/i.test(mail.text) && !mail.text.includes(O), "2n …and no name, no address of the owner, no account and no amount");
      const payload = a.lib.inviteEmailPayload("partner@example.test", a.lib.inviteUrl("T".repeat(43)), "ABC234", "2026-11-05T12:00:00Z");
      const pending = { ...a.lib.INVITE_EMAIL, intro: "[WORDS: household.email.intro]" };
      const withPlaceholder = a.lib.inviteEmailPayload("partner@example.test", a.lib.inviteUrl("T".repeat(43)), "ABC234", "2026-11-05T12:00:00Z", pending);
      t.eq([await a.lib.sendInviteEmail(withPlaceholder, "k1", { env: { RESEND_API_KEY: "re_x" }, fetchImpl: deps.fetch }), sent.length], [false, 1], "2o a placeholder that ever comes back stops the email");
      t.eq([await a.lib.sendInviteEmail(payload, "k2", { env: {}, fetchImpl: deps.fetch }), sent.length], [false, 1], "2p no key: not sent");
      const busy = load({ household_members: [], household_invites: Array.from({ length: 5 }, (_, i) => ({ id: `i${i}`, created_by: O, created_at: new Date().toISOString() })) },
        { rpc: { household_create_invite: () => ({ data: { result: "invited" }, error: null }) } });
      t.eq((await call(busy.household, O, { action: "create_invite", email: "partner@example.test", consent: true }, deps)).code, 429, "2q a sixth invite in a day is refused (each is an email)");
      const full = load({ household_members: [] }, { rpc: { household_create_invite: () => ({ data: { result: "household_full" }, error: null }) } });
      t.eq((await call(full.household, O, { action: "create_invite", email: "third@example.test", consent: true }, deps)).body.error, "household_full", "2r a full household: refused (2 adults)");
      let tries = 0;
      const taken = load({ household_members: [] }, { rpc: { household_create_invite: () => (++tries < 3 ? { data: { result: "code_taken" }, error: null } : { data: { result: "invited", household_id: "h1", invite_id: "i", expires_at: "2026-11-05T12:00:00Z", created: false }, error: null }) } });
      const codes = [];
      const tr = await call(taken.household, O, { action: "create_invite", email: "partner@example.test", consent: true }, deps);
      taken.log.rpc.forEach(([, x]) => codes.push(x.p_code_hash));
      t.eq([tr.code, new Set(codes).size], [200, 3], "2s a code already open elsewhere: a new one is made and tried");
      const missing = load({ household_members: [] }, { rpc: {} });
      t.eq((await call(missing.household, O, { action: "create_invite", email: "partner@example.test", consent: true }, deps)).code, 404, "2t before 0031 runs: absent, not an error page");
    }

    // ── 3. JOIN ─────────────────────────────────────────────────────────────────────────────────────
    {
      const results = ["joined", "already_member", "invalid", "expired", "used", "wrong_account", "in_another_household", "household_full", "too_many_attempts"];
      const want = { joined: 200, already_member: 200, invalid: 400, expired: 400, used: 400, wrong_account: 400, in_another_household: 409, household_full: 409, too_many_attempts: 429 };
      for (const result of results) {
        const a = load({ household_members: [] }, { rpc: { household_accept_invite: () => ({ data: { result, household_id: "h1" }, error: null }) } });
        t.eq((await call(a.household, P, { action: "accept_invite", code: "abc-234", consent: true })).code, want[result], `3a ${result} answers ${want[result]}`);
      }
      const a = load({ household_members: [] }, { rpc: { household_accept_invite: () => ({ data: { result: "joined" }, error: null }) } });
      t.eq((await call(a.household, P, { action: "accept_invite", code: "ABC234" })).body.error, "consent_required", "3b no consent: refused");
      t.eq((await call(a.household, P, { action: "accept_invite", code: "AB", consent: true })).body.error, "invalid", "3c a code of the wrong shape never reaches the database");
      t.eq(a.log.rpc.length, 0, "3d …so neither did anything above");
      await call(a.household, P, { action: "accept_invite", code: " abc-234 ", consent: true, email: "owner@example.test" });
      const [, args] = a.log.rpc[0];
      t.eq([args.p_user, args.p_email_key, args.p_code_hash, args.p_token_hash], [P, "partner@example.test", sha("ABC234"), null],
        "3e the code is matched by hash, with the ACCOUNT's own address (an address in the body is ignored)");
      const token = "x".repeat(43);
      await call(a.household, P, { action: "accept_invite", token, consent: true });
      t.eq([a.log.rpc[1][1].p_token_hash, a.log.rpc[1][1].p_code_hash], [sha(token), null], "3f a link joins by its token's hash");
    }

    // ── 4. BANKS ────────────────────────────────────────────────────────────────────────────────────
    {
      const a = load(coupleDb());
      plaidCalls.length = 0;
      const acc = await call(a.plaid, P, { action: "get_accounts", item_id: "item-O" });
      t.eq([acc.code, plaidCalls.map((c) => c.token)], [200, ["access-O"]], "4a the partner reads the accounts of the bank the owner linked");
      plaidCalls.length = 0;
      const s = await call(a.plaid, S, { action: "get_accounts", item_id: "item-O" });
      t.eq([s.code, plaidCalls.length], [400, 0], "4b a stranger reaches nothing: refused before Plaid is asked");
      t.eq((await call(a.plaid, P, { action: "get_accounts", item_id: "item-S" })).code, 400, "4c …and the partner cannot reach a stranger's bank");
      plaidCalls.length = 0;
      t.eq([(await call(a.plaid, P, { action: "remove_item", item_id: "item-O" })).code, plaidCalls.length], [400, 0], "4d only the person who linked a bank can revoke it (remove_item)");
      t.eq([(await call(a.plaid, P, { action: "delete_item", item_id: "item-O" })).code, a.db.plaid_items.length], [400, 2], "4e …or disconnect it (delete_item)");
      const list = await call(a.plaid, P, { action: "list_items" });
      t.eq(list.body.items.map((i) => [i.item_id, i.linked_by || null]), [["item-O", "partner"]], "4f the partner's list shows the owner's bank, marked linked by \"partner\"");
      t.ok(!JSON.stringify(list.body).includes("access-O"), "4g …never its token");
      const own = await call(a.plaid, O, { action: "list_items" });
      t.eq(own.body.items.map((i) => [i.item_id, i.linked_by || null]), [["item-O", null]], "4h the owner's list is their own bank, as before");
      plaidCalls.length = 0;
      await call(a.plaid, P, { action: "get_transactions", item_id: "item-O" });
      t.eq(plaidCalls.filter((c) => /sync/.test(c.path)).map((c) => c.cursor), [null], "4i the partner's first sync starts from the beginning (their own cursor)");
      t.eq([a.db.plaid_item_cursors.map((c) => [c.plaid_item_id, c.user_id, c.next_cursor]), a.db.plaid_items[0].next_cursor], [[["row-O", P, "next-1"]], "cursor-O"],
        "4j …and keeps a cursor of their own; the owner's is untouched, so neither phone takes the other's new transactions");
      plaidCalls.length = 0;
      await call(a.plaid, P, { action: "get_transactions", item_id: "item-O" });
      t.eq(plaidCalls.filter((c) => /sync/.test(c.path)).map((c) => c.cursor), ["next-1"], "4k the partner's next sync resumes from their own cursor");
      plaidCalls.length = 0;
      await call(a.plaid, O, { action: "get_transactions", item_id: "item-O" });
      t.eq([plaidCalls.filter((c) => /sync/.test(c.path)).map((c) => c.cursor), a.db.plaid_items[0].next_cursor], [["cursor-O"], "next-1"], "4l the owner syncs from plaid_items as before");
      const before = load(coupleDb(), { errors: { household_members: { code: "42P01", message: "relation does not exist" } } });
      t.eq([(await call(before.plaid, P, { action: "get_accounts", item_id: "item-O" })).code, (await call(before.plaid, O, { action: "get_accounts", item_id: "item-O" })).code], [400, 200],
        "4m before 0030 runs there are no households: own banks only, exactly as today");
      const down = load(coupleDb(), { errors: { household_members: { code: "XX000", message: "upstream connect error" } } });
      t.eq((await call(down.plaid, P, { action: "get_accounts", item_id: "item-O" })).code, 400, "4n a failed household read never widens access");
      t.eq((await call(down.plaid, O, { action: "list_items" })).body.items.map((i) => i.item_id), ["item-O"], "4o …and the owner's own list still works");
    }

    // ── 5. ONE SUBSCRIPTION COVERS BOTH ─────────────────────────────────────────────────────────────
    {
      const paidByOwner = () => coupleDb({ subscriptions: [{ user_id: O, ...PAID("app_store") }] });
      const a = load(paidByOwner());
      const plan = await a.auth.getUserPlan(P);
      t.eq([plan.unlimited, plan.covered_by, plan.status_unavailable], [true, "partner", false], "5a the owner pays in the App Store: the partner is unlimited");
      const st = await call(a.billing, P, { action: "status" });
      t.eq([st.code, st.body.paid, st.body.covered_by, st.body.manageable, st.body.founding.available], [200, true, "partner", false, false],
        "5b the website says the partner is paid, covered, with nothing to manage and no founding offer");
      const nat = await call(a.billing, P, { action: "status" }, undefined, { origin: "capacitor://localhost" });
      t.eq([nat.body.paid, nat.body.covered_by], [true, "partner"], "5c a store app asking about the web: paid too");
      const store = await call(a.billing, P, { action: "store_status" }, undefined, { origin: "capacitor://localhost" });
      t.eq([store.code, store.body.paid, store.body.covered_by, store.body.founding.available], [200, true, "partner", false], "5d the store paywall sells the partner nothing");
      const co = await call(a.billing, P, { action: "create_checkout_session", plan_key: "monthly" });
      t.eq([co.code, co.body.error, co.body.covered_by], [409, "already_subscribed", "partner"], "5e a checkout for the partner is refused: never a second charge");
      t.eq((await call(a.billing, S, { action: "status" })).body.paid, false, "5f a stranger is not covered by anyone");
      const founder = load(coupleDb({ profiles: [{ user_id: O, ...ENDED_TRIAL, founder_flag: true }, { user_id: P, ...ENDED_TRIAL }] }));
      t.eq((await founder.auth.getUserPlan(P)).covered_by, "partner", "5g a beta founder covers the partner too");
      const trial = load(coupleDb({ profiles: [{ user_id: O, ...LIVE_TRIAL }, { user_id: P, ...ENDED_TRIAL }] }));
      const tp = await trial.auth.getUserPlan(P);
      t.eq([tp.unlimited, tp.covered_by || null], [false, null], "5h the owner's trial does NOT cover the partner (a new address every 14 days is not a plan)");
      const solo = load(coupleDb({ household_members: [], subscriptions: [{ user_id: O, ...PAID() }] }));
      t.eq((await solo.auth.getUserPlan(P)).unlimited, false, "5i no household: nobody else's subscription counts");
      const blip = load(paidByOwner(), { errors: { household_members: { code: "XX000", message: "upstream connect error" } } });
      t.eq((await blip.auth.getUserPlan(P)).status_unavailable, true, "5j a failed household read is \"unavailable\", never \"not paid\"");
      t.eq((await call(blip.billing, P, { action: "status" })).code, 503, "5k …billing status answers 503, and the app retries");
      t.eq((await call(blip.billing, O, { action: "status" })).body.paid, true, "5l the payer's own status never depends on the household read");
      const pre = load(coupleDb({ subscriptions: [] }), { errors: { household_members: { code: "PGRST205", message: "Could not find the table in the schema cache" } } });
      t.eq([(await pre.auth.getUserPlan(P)).unlimited, (await pre.auth.getUserPlan(P)).status_unavailable], [false, false], "5m before 0030 runs: exactly today's answer");
    }

    // ── 6. STATUS: ROLES ONLY ───────────────────────────────────────────────────────────────────────
    {
      const db = coupleDb({ subscriptions: [{ user_id: O, ...PAID() }, { user_id: P, ...PAID("play_store") }] });
      const a = load(db);
      const sp = await call(a.household, P, { action: "status" });
      t.eq(sp.body.household.members.map((m) => [m.role, m.you]), [["partner", true], ["owner", false]], "6a the partner sees two roles, themselves first");
      t.ok(!/owner@example|partner@example|00000000-0000-4000-8000-00000000000a/.test(JSON.stringify(sp.body)), "6b …no name, no address and no account id of the other");
      t.eq(sp.body.household.invite, null, "6c only the owner sees the open invite");
      // The owner pays on the web, the partner in Google Play: the store's we cannot stop, ours we can, so the
      // owner's web subscription is the extra one (rule: _lib/household.js extraPayer; section 9).
      t.eq([sp.body.household.billing.paid_by, sp.body.household.billing.your_extra], ["both", null], "6d both pay, one on the web and one in Google Play: the partner (Google Play) is not told to cancel");
      const so2 = await call(a.household, O, { action: "status" });
      t.eq([so2.body.household.billing.paid_by, so2.body.household.billing.your_extra], ["both", "stripe"], "6d2 …the owner is told theirs (the website's) is the extra one: one of them cancels, never both");
      db.household_invites.push({ household_id: "h1", email_key: "partner@example.test", expires_at: "2099-01-01T00:00:00Z", used_at: null, revoked_at: null, created_at: "2026-10-29" });
      db.household_members = db.household_members.filter((m) => m.user_id === O);
      const so = await call(a.household, O, { action: "status" });
      t.eq([so.body.household.role, so.body.household.invite.email], ["owner", "partner@example.test"], "6e the owner sees their open invite, to the address they typed");
      t.ok(!/code|token|hash/.test(JSON.stringify(so.body.household.invite)), "6f …never its code, link or hash again");
      const none = load({ household_members: [] });
      t.eq((await call(none.household, S, { action: "status" })).body, { enabled: true, household: null }, "6g no household: enabled, nothing else");
      for (const [action, fn, res, want] of [["leave", "household_leave", { result: "left", remaining: 1 }, 200], ["leave", "household_leave", { result: "not_member" }, 409],
        ["remove_partner", "household_remove_partner", { result: "removed" }, 200], ["remove_partner", "household_remove_partner", { result: "not_owner" }, 409],
        ["revoke_invite", "household_revoke_invite", { result: "revoked" }, 200]]) {
        const b = load({ household_members: [] }, { rpc: { [fn]: () => ({ data: res, error: null }) } });
        const r = await call(b.household, P, { action });
        t.eq([r.code, b.log.rpc[0][1].p_user || b.log.rpc[0][1].p_owner], [want, P], `6h ${action} → ${res.result}: ${want}, for the signed-in account`);
      }
    }

    // ── 7. JOINS: THE NETWORK AS A KEYED HASH ONLY (audit H2) ───────────────────────────────────────
    {
      const a = load({ household_members: [] }, { rpc: { household_accept_invite: () => ({ data: { result: "invalid" }, error: null }) } });
      const ip = (v) => (v ? { "x-nf-client-connection-ip": v } : {});
      for (const v of ["203.0.113.7", "203.0.113.7", "198.51.100.9", null, null]) await call(a.household, P, { action: "accept_invite", code: "ABC234", consent: true }, undefined, ip(v));
      const keys = a.log.rpc.map(([, x]) => x.p_net_key);
      t.ok(keys.every((k) => /^v2\/household-net\/[A-Za-z0-9_-]{20,}$/.test(k)), "7a every join sends the database the network as a keyed hash");
      t.ok(!JSON.stringify(a.log.rpc).includes("203.0.113.7") && !JSON.stringify(a.log.rpc).includes("198.51.100.9"), "7b …never the IP address itself");
      t.eq([keys[0] === keys[1], keys[0] !== keys[2], keys[3] === keys[4], keys[3] !== keys[0]], [true, true, true, true],
        "7c the same network counts together, another network apart, and requests with no address share one bucket (never no limit)");
      t.eq(a.log.rpc.map(([, x]) => x.p_email_key), Array(5).fill("partner@example.test"), "7d the code is looked up only among invites to the account's own confirmed address");
    }

    // ── 8. ONE PURCHASE AT A TIME (audit H5) ────────────────────────────────────────────────────────
    {
      const env = { STRIPE_PRICE_MONTHLY_CAD: "price_monthly" };
      const hold = (result) => ({ household_hold_purchase: (args) => ({ data: { result }, error: null }) });
      const sp1 = fakeStripe();
      const busy = load(coupleDb(), { rpc: hold("held_by_partner") }, env, sp1);
      const r1 = await call(busy.billing, O, { action: "create_checkout_session", plan_key: "monthly" });
      t.eq([r1.code, r1.body.error, sp1.calls.filter(([, p]) => p === "/checkout/sessions").length], [409, "purchase_in_progress", 0], "8a the partner is buying (any platform): the owner's checkout is refused and no checkout is made");
      t.eq(busy.log.rpc.find(([fn]) => fn === "household_hold_purchase")[1], { p_user: O, p_provider: "stripe", p_ttl: "32 minutes" }, "8b …the hold asked for is this account's, for Stripe, for 32 minutes");
      const sp2 = fakeStripe();
      const free = load(coupleDb(), { rpc: hold("held") }, env, sp2);
      const before = Math.floor(Date.now() / 1000);
      const r2 = await call(free.billing, O, { action: "create_checkout_session", plan_key: "monthly" });
      const session = sp2.calls.find(([, p]) => p === "/checkout/sessions");
      t.eq([r2.code, !!session], [200, true], "8c holding the household, the owner's checkout is made");
      t.ok(session && session[2].expires_at >= before + 31 * 60 && session[2].expires_at <= before + 31 * 60 + 5, "8d …and it ends after 31 minutes, before the hold does (32), so it cannot complete once the other may buy");
      const sp3 = fakeStripe();
      const solo = load(coupleDb({ household_members: [] }), { rpc: hold("no_household") }, env, sp3);
      await call(solo.billing, S, { action: "create_checkout_session", plan_key: "monthly" });
      t.ok(!("expires_at" in sp3.calls.find(([, p]) => p === "/checkout/sessions")[2]), "8e no household: the checkout is exactly as before (no shortened life)");
      const broken = load(coupleDb(), { rpc: { household_hold_purchase: () => ({ data: null, error: { code: "XX000", message: "upstream" } }) } }, env, fakeStripe());
      t.eq((await call(broken.billing, O, { action: "create_checkout_session", plan_key: "monthly" })).code, 503, "8f a hold that cannot be taken: nothing is sold (503)");
      const before0031 = load(coupleDb(), { rpc: {} }, env, fakeStripe());
      t.eq((await call(before0031.billing, O, { action: "create_checkout_session", plan_key: "monthly" })).code, 200, "8g before 0031 runs there is no household to hold: checkout as today");
      const notMember = load(coupleDb({ household_members: [] }), { rpc: { household_hold_purchase: () => { throw new Error("must not be asked"); } } }, env, fakeStripe());
      t.eq([(await call(notMember.billing, S, { action: "create_checkout_session", plan_key: "monthly" })).code, notMember.log.rpc.length], [200, 0], "8g2 someone in no household is never held: no hold is even asked for");
      const nat = { origin: "capacitor://localhost" };
      const sh = load(coupleDb(), { rpc: hold("held") });
      t.eq((await call(sh.billing, P, { action: "store_hold", platform: "android" }, undefined, nat)).body, { held: true }, "8h the store app holds the household before it opens the purchase sheet");
      t.eq(sh.log.rpc.find(([fn]) => fn === "household_hold_purchase")[1].p_provider, "play_store", "8i …named for its store");
      const sb = load(coupleDb(), { rpc: hold("held_by_partner") });
      t.eq((await call(sb.billing, P, { action: "store_hold", platform: "ios" }, undefined, nat)).body, { held: false, paid: false, reason: "partner_buying" }, "8j the other member is buying: no sheet");
      const sc = load(coupleDb({ subscriptions: [{ user_id: O, ...PAID() }] }), { rpc: hold("held") });
      const covered = await call(sc.billing, P, { action: "store_hold" }, undefined, nat);
      t.eq([covered.body.held, covered.body.paid, covered.body.covered_by, sc.log.rpc.length], [false, true, "partner", 0], "8k already covered by the other member: no sheet, and nothing held");
      const blip = load(coupleDb(), { errors: { household_members: { code: "XX000", message: "upstream" } } });
      t.eq((await call(blip.billing, P, { action: "store_hold" }, undefined, nat)).code, 503, "8l a household read that fails sells nothing (503)");
      const SB = await import("../src/lib/storeBilling.js");
      const bought = [];
      const deps = (hold) => ({ serverStatus: async () => ({ paid: false }), serverHold: async () => hold, purchasePackage: async (p) => { bought.push(p); }, serverSync: async () => ({ paid: true }), sleep: async () => {} });
      t.eq([(await SB.buy(deps({ held: false, paid: false, reason: "partner_buying" }), "pkg")).outcome, (await SB.buy(deps(null), "pkg")).outcome, (await SB.buy(deps({ held: false, paid: true }), "pkg")).outcome, bought.length],
        ["failed", "failed", "already_paid", 0], "8m the app opens no store sheet while the other buys, with no answer, or when already covered");
      t.eq([(await SB.buy(deps({ held: true }), "pkg")).outcome, bought], ["paid", ["pkg"]], "8n …and opens it once held");
    }

    // ── 9. A HOUSEHOLD THAT PAYS TWICE (audit H5) ───────────────────────────────────────────────────
    {
      const L = load(coupleDb()).lib;
      const who = (role, provider, plan_key = "annual") => ({ user_id: role, role, provider, plan_key });
      t.eq([
        L.extraPayer([who("owner", "stripe"), who("partner", "stripe")]).role,
        L.extraPayer([who("owner", "stripe"), who("partner", "app_store")]).role,
        L.extraPayer([who("owner", "app_store"), who("partner", "stripe")]).role,
        L.extraPayer([who("owner", "stripe", "founding_annual"), who("partner", "play_store")]).role,
        L.extraPayer([who("owner", "play_store"), who("partner", "stripe", "founding_annual")]).role,
        L.extraPayer([who("owner", "app_store"), who("partner", "play_store")]).role,
        L.extraPayer([who("owner", "stripe")]),
      ], ["partner", "owner", "partner", "partner", "owner", "partner", null],
        "9a one rule picks the extra one: a founding price is kept, then a store's over ours (we can stop ours), then the owner's");
      const subP = { user_id: P, ...PAID(), provider_subscription_id: "sub_P", cancel_at_period_end: false };
      const db = coupleDb({ subscriptions: [{ user_id: O, ...PAID(), provider_subscription_id: "sub_O" }, subP] });
      const st = fakeStripe();
      const a = load(db, {}, {}, st);
      const sp = await call(a.household, P, { action: "status" }, { stripePost: st.stripePost });
      const so = await call(a.household, O, { action: "status" }, { stripePost: st.stripePost });
      t.eq([sp.body.household.billing.your_extra, so.body.household.billing.your_extra], ["stripe", null], "9b both pay on the web: the partner is told theirs is the extra one; the owner is not");
      const ended = st.calls.filter(([m, p]) => m === "POST" && p === "/subscriptions/sub_P");
      t.eq(ended.map(([, , params]) => params), [{ cancel_at_period_end: true, metadata: { flourish_household_extra: "h1" } }],
        "9c …and ours stops renewing: set to end at the end of the period it is paid for, marked as the household's extra");
      t.ok(!st.calls.some(([, p]) => p === "/subscriptions/sub_O"), "9d the owner's, the one kept, is never touched");
      t.eq([db.subscriptions.find((r) => r.user_id === P).support_flag, db.subscriptions.find((r) => r.user_id === O).support_flag || null], ["household_two_paid", null], "9e the extra one's row is flagged for support");
      subP.cancel_at_period_end = true;
      const n = st.calls.length;
      await call(a.household, P, { action: "status" }, { stripePost: st.stripePost });
      t.eq(st.calls.length, n, "9f asked again: nothing more is sent to Stripe (already set to end)");
      const mixed = coupleDb({ subscriptions: [{ user_id: O, ...PAID(), provider_subscription_id: "sub_O2" }, { user_id: P, ...PAID("app_store") }] });
      const st2 = fakeStripe();
      const b = load(mixed, {}, {}, st2);
      await call(b.household, O, { action: "status" }, { stripePost: st2.stripePost });
      t.eq(st2.calls.map(([, p, params]) => [p, params.cancel_at_period_end]), [["/subscriptions/sub_O2", true]], "9g the web and the App Store: ours (the web's) is the one set to end");
      const fstore = coupleDb({ subscriptions: [{ user_id: O, ...PAID(), plan_key: "founding_annual", provider_subscription_id: "sub_F" }, { user_id: P, ...PAID("play_store") }] });
      const st3 = fakeStripe();
      const c = load(fstore, {}, {}, st3);
      const pc = await call(c.household, P, { action: "status" }, { stripePost: st3.stripePost });
      t.eq([pc.body.household.billing.your_extra, st3.calls.length], ["play_store", 0], "9h a founding price on the web is kept: the Google Play one is the extra, its holder is told where to cancel, and nothing is sent to Stripe");
      // Joining with a subscription of one's own: reconciled at once.
      const st4 = fakeStripe();
      const j = load(coupleDb({ subscriptions: [{ user_id: O, ...PAID(), provider_subscription_id: "sub_O4" }, { user_id: P, ...PAID(), provider_subscription_id: "sub_P4" }] }),
        { rpc: { household_accept_invite: () => ({ data: { result: "joined", household_id: "h1" }, error: null }) } }, {}, st4);
      await call(j.household, P, { action: "accept_invite", code: "ABC234", consent: true }, { stripePost: st4.stripePost });
      t.eq(st4.calls.map(([, p]) => p), ["/subscriptions/sub_P4"], "9i a partner who joins already paying on the web: theirs is set to end straight away");
      // Leaving: ours, set to end as the extra, is resumed; one the person cancelled themselves is left alone.
      const st5 = fakeStripe({ get: async (p) => (p === "/subscriptions/sub_P" ? { id: "sub_P", status: "active", cancel_at_period_end: true, metadata: { flourish_household_extra: "h1" } }
        : p === "/subscriptions/sub_O" ? { id: "sub_O", status: "active", cancel_at_period_end: true, metadata: {} } : undefined) });
      const db5 = coupleDb({ subscriptions: [{ user_id: O, ...PAID(), provider_subscription_id: "sub_O", cancel_at_period_end: true }, { user_id: P, ...PAID(), provider_subscription_id: "sub_P", cancel_at_period_end: true, support_flag: "household_two_paid" }] });
      const l = load(db5, { rpc: { household_leave: () => ({ data: { result: "left", remaining: 1 }, error: null }) } }, {}, st5);
      await call(l.household, P, { action: "leave" }, { stripePost: st5.stripePost, stripeGet: st5.stripeGet });
      t.eq(st5.calls.filter(([m]) => m === "POST").map(([, p, params]) => [p, params]), [["/subscriptions/sub_P", { cancel_at_period_end: false, metadata: { flourish_household_extra: "" } }]],
        "9j leaving, the partner's subscription we had set to end is resumed; the owner's own cancellation is left as they chose");
      t.eq(db5.subscriptions.find((r) => r.user_id === P).support_flag, null, "9k …and its support flag is cleared");
      const st6 = fakeStripe({ get: async () => ({ id: "sub_P", status: "active", cancel_at_period_end: true, metadata: { flourish_household_extra: "h1" } }) });
      const rm = load(coupleDb({ subscriptions: [{ user_id: P, ...PAID(), provider_subscription_id: "sub_P", cancel_at_period_end: true }] }),
        { rpc: { household_remove_partner: () => ({ data: { result: "removed", partner: P }, error: null }) } }, {}, st6);
      await call(rm.household, O, { action: "remove_partner" }, { stripePost: st6.stripePost, stripeGet: st6.stripeGet });
      t.eq(st6.calls.filter(([m]) => m === "POST").map(([, p]) => p), ["/subscriptions/sub_P"], "9l removing the partner resumes theirs too");
      const src = (f) => require("fs").readFileSync(path.join(REPO, "netlify", "functions", f), "utf8");
      t.ok(/takeSeat\(admin, user_id, "stripe", sessionSubId \|\| null\);\n[\s\S]{0,400}await reconcileHouseholdBilling\(admin, user_id\);/.test(src("stripe-webhook.js"))
        && /isLiveStripeStatus\(object\.status\)\) await reconcileHouseholdBilling/.test(src("stripe-webhook.js")), "9m Stripe's webhook reconciles after a paid checkout and a subscription that became live");
      t.ok(/if \(r\.paid\) await reconcileHouseholdBilling\(admin, userId\);/.test(src("revenuecat-webhook.js")) && /if \(state\.paid\) await reconcileHouseholdBilling\(admin, user_id\);/.test(src("billing.js")),
        "9n …and so do a store purchase reaching the server and the app's store sync");
      t.ok(/peers\.length\) await household\.resumeHouseholdExtra\(admin, peers\)/.test(src("plaid.js")), "9o deleting an account resumes the partner's, if we had set it to end");
    }

    // ── 10. THE COACH: NO NAME REACHES THE AI PROVIDER (audit H4) ───────────────────────────────────
    {
      const COACH_PATH = require.resolve("../netlify/functions/coach.js");
      const profile = { name: "Amanda Ford", partnerName: "Jordan Lee", kids: [{ name: "Riley" }] };
      const consent = { ai_third_party_consent_at: "2026-10-01T00:00:00Z", ai_third_party_consent_revoked_at: null };
      const db = coupleDb({
        profiles: [{ user_id: O, ...ENDED_TRIAL, ...consent }, { user_id: P, ...ENDED_TRIAL, ...consent }],
        subscriptions: [{ user_id: O, ...PAID() }],
        household_data: [{ household_id: "h1", data: { core: { appData: { profile } } } }],
      });
      const rpcs = { increment_coach_usage: () => ({ data: 1, error: null }), increment_coach_usage_weekly: () => ({ data: 1, error: null }), increment_ai_usage_daily: () => ({ data: 1, error: null }) };
      const sent = [];
      const prevFetch = global.fetch;
      global.fetch = async (url, init) => {
        if (/api\.anthropic\.com/.test(String(url))) {
          sent.push(init.body);
          return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "Here is your week." }], stop_reason: "end_turn", usage: { output_tokens: 4 } }) };
        }
        return prevFetch(url, init);
      };
      try {
        const ask = async (who, type, payload) => {
          load(db, { rpc: rpcs }, { ANTHROPIC_API_KEY: "test-anthropic" });
          delete require.cache[COACH_PATH];
          return require(COACH_PATH).handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: `Bearer tok:${who}` }, body: JSON.stringify({ type, payload }) });
        };
        const names = /Amanda|Ford|Jordan|Lee\b|Riley/;
        const context = "Household: Amanda Ford (employed) and Jordan Lee; child Riley. Amanda's chequing 1234567890 at amanda@example.test.";
        const messages = [{ role: "user", content: "Should Jordan or Amanda pay Riley's camp? AMANDA thinks so." }, { role: "assistant", content: "Let's look." }, { role: "user", content: [{ type: "text", text: "jordan lee asks too" }] }];
        const r1 = await ask(P, "chat", { context, messages });
        const r2 = await ask(O, "checkin", { context, prompt: "Amanda Ford's check-in for Jordan" });
        const r3 = await ask(P, "facilitator", { context, messages: [{ role: "user", content: "Start the meeting, Jordan and Amanda." }] });
        t.eq([r1.statusCode, r2.statusCode, r3.statusCode, sent.length], [200, 200, 200, 3], "10a three coach requests, each sent to the provider once");
        t.ok(sent.every((b) => !names.test(b)), `10b with both members' names (and a child's) in the profile, the context and the messages, neither name appears in any serialized provider request`);
        const asPartner = JSON.parse(sent[0]);
        t.ok(/Should you or partner pay child 1's camp\? partner thinks so\./.test(JSON.stringify(asPartner.messages)) && /you asks too/.test(JSON.stringify(asPartner.messages)),
          "10c …roles from the asker's side: the partner asking is \"you\", the owner \"partner\"");
        t.ok(!/1234567890|amanda@example/.test(sent.join(" ")) && /••••7890/.test(sent[0]), "10d …and no email address or full account number either");
        const down = load(db, { rpc: rpcs, errors: { household_data: { code: "XX000", message: "upstream" } } }, { ANTHROPIC_API_KEY: "test-anthropic" });
        delete require.cache[COACH_PATH];
        const before = sent.length;
        const r4 = await require(COACH_PATH).handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: `Bearer tok:${P}` }, body: JSON.stringify({ type: "chat", payload: { context, messages } }) });
        t.eq([r4.statusCode, sent.length - before, !!down], [503, 0, true], "10e the names cannot be read: nothing is sent to the provider");
        const CP = await import("../src/lib/coachPrivacy.js");
        const R = require("../netlify/functions/_lib/coachRedact.js");
        const samples = ["May Day pays in May 2027", "SAM and sam and Sam-Lee", "a 30 day window for Day", "Ford's card 4111 1111 1111 1111"];
        const nm = (p) => CP.householdNames(p);
        t.eq(samples.map((x) => R.redactNames(R.redactAccountNumbers(x), R.householdNames({ name: "May Day", partnerName: "Sam Lee", kids: [{ name: "Ford" }] }))),
          samples.map((x) => CP.redactNames(CP.redactAccountNumbers(x), nm({ name: "May Day", partnerName: "Sam Lee", kids: [{ name: "Ford" }] }))),
          "10f the server's name rules give exactly the app's answers");
      } finally {
        global.fetch = prevFetch;
      }
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.stack) || e).split("\n").slice(0, 4).join(" | "));
  } finally {
    global.fetch = realFetch;
    console.error = quiet.e; console.warn = quiet.w; console.log = quiet.l;
    for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
  t.summary("householdServer.test");
})();
