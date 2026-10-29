// tests/householdServer.test.cjs
// -----------------------------------------------------------------------------
// COUPLE MODE ON THE SERVER (docs/product/COUPLE-MODE-SPEC.md). The real functions, signed in through the
// real getUserFromRequest, against an in-memory stand-in for Supabase and for Plaid. The database rules
// themselves (RLS, expiry, single use, two adults) are proved in a real Postgres: household.sql.test.cjs.
//   1  /api/household is absent (404) until HOUSEHOLD_ENABLED is "true", and refuses anyone not signed in
//   2  invite: consent first; the link token never comes back and only hashes reach the database; the code is
//      shown once; the email is never sent while its words are placeholders; 5 invites a day
//   3  join: consent first; the address is the account's own, never the body's; results map to clear codes
//   4  banks: a member reads a bank the other linked, keeps their own sync cursor, never revokes it; a
//      stranger reaches nothing; a failed household read never widens access
//   5  one subscription covers both: the partner is unlimited and paid in every app, offered nothing and sold
//      nothing; a partner's trial covers nobody; a failed read is 503, never "not paid"
//   6  status: roles only, never a name or the other's email
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

function load(db, opts = {}, env = {}) {
  const fake = fakeSupabase(db, opts);
  const keep = { HOUSEHOLD_ENABLED: "true", BILLING_ENABLED: "true", IAP_ENABLED: "true", ENFORCE_PLAN_LIMITS: "true" };
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role",
    PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", RESEND_API_KEY: "re_test_key", ...keep, ...env });
  require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => fake.client } };
  require.cache[API_PATH] = { id: API_PATH, filename: API_PATH, loaded: true, exports: { stripePost: async () => { throw new Error("stripe must not be called"); }, stripeGet: async () => ({ data: [] }), stripeDelete: async () => ({}) } };
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
      t.eq([r.body.invite.email_sent, sent.length], [false, 0], "2j the email is not sent while its words are placeholders, even with a key");
      const payload = a.lib.inviteEmailPayload("partner@example.test", a.lib.inviteUrl("T".repeat(43)), "ABC234", "2026-11-05T12:00:00Z");
      t.ok(a.lib.hasPlaceholder(payload), "2k (the email still carries [WORDS: …] placeholders)");
      t.eq(payload.text.includes("https://flourishmoney.app/?household_invite=" + "T".repeat(43)) && payload.text.includes("ABC234"), true, "2l the email carries the link and the code");
      t.ok(!/Owner|owner@example|\$|balance/i.test(payload.text.replace(/\[WORDS:[^\]]*\]/g, "")), "2m …and no name, no address of the owner and no amount");
      const words = Object.fromEntries(Object.entries(a.lib.INVITE_EMAIL).map(([k, v]) => [k, Array.isArray(v) ? ["Footer"] : "Approved"]));
      const approved = a.lib.inviteEmailPayload("partner@example.test", a.lib.inviteUrl("T".repeat(43)), "ABC234", "2026-11-05T12:00:00Z", words);
      t.eq(await a.lib.sendInviteEmail(approved, "k1", { env: { RESEND_API_KEY: "re_x" }, fetchImpl: deps.fetch }), true, "2n with approved words and a key, it is sent (to Resend)");
      t.eq([sent.length, sent[0][0]], [1, "https://api.resend.com/emails"], "2o …once, to Resend");
      t.eq(await a.lib.sendInviteEmail(approved, "k2", { env: {}, fetchImpl: deps.fetch }), false, "2p no key: not sent");
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
      t.eq([sp.body.household.billing.paid_by, sp.body.household.billing.your_extra], ["both", "play_store"], "6d both pay: the partner is told theirs (Google Play) is extra, so they can cancel it");
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
