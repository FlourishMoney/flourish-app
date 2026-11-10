// tests/netWorthPrivate.test.cjs
// -----------------------------------------------------------------------------
// NET WORTH BEHIND PLUS, PRIVATE BY DEFAULT BETWEEN PARTNERS (Amanda, 2026-11-10; migration 0045, networth.js,
// plaid.js get_investments and Link's products, src/lib/netWorthAccess.js, src/lib/netWorthPlus.js viewerNetWorth, and
// the screens in src/App.jsx).
//   1  the server: 404 while off, Plus checked (403, 503), entries validated, only one's own changed
//   2  private by default: a partner gets only what was shared; all_shared only when everything is
//   3  an RDSP (or anything that could reveal a health or disability fact) is never shared by default
//   4  a household total only when every part is shared and real; otherwise each sees only their own
//   5  leaving: the leaver's entries go with them; the one who stays sees none of them
//   6  Plaid: holdings only for Plus (no call at all without it), a partner's bank only for its shared accounts, and
//      Investments asked at Link as a consented product, billed only once Plus calls it
//   7  the app: the five modes; every net worth surface locked without Plus; every balance still listed
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const PLUS_PATH = require.resolve("../netlify/functions/_lib/plusAddon.js");
const LIM_PATH = require.resolve("../netlify/functions/_lib/bankLimits.js");
const NW_PATH = require.resolve("../netlify/functions/networth.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const REPO = path.join(__dirname, "..");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const future = new Date(Date.now() + 20 * 86400000).toISOString();
let uuidN = 0;

function makeDb({ plus = [A, B], partner = true, failPlus = false } = {}) {
  const state = { rows: { plaid_items: [], household_members: [], plus_addon_subscriptions: [], net_worth_entries: [], net_worth_shares: [], plaid_account_owners: [] }, reads: [] };
  if (partner) state.rows.household_members.push({ user_id: A, household_id: "h1", role: "owner" }, { user_id: B, household_id: "h1", role: "partner" });
  for (const u of plus) state.rows.plus_addon_subscriptions.push({ user_id: u, provider: "stripe", plan_key: "plus_monthly", status: "active", product_id: "price_pm", current_period_end: future });
  const from = (table) => {
    state.reads.push(table);
    const q = {
      f: [], sel: null,
      select() { return q; }, eq(c, v) { q.f.push((r) => r[c] === v); return q; }, in(c, vs) { q.f.push((r) => vs.includes(r[c])); return q; }, not() { return q; },
      _err() { return table === "plus_addon_subscriptions" && failPlus ? { code: "57014" } : null; },
      _hits() { return (state.rows[table] || []).filter((r) => q.f.every((f) => f(r))); },
      async maybeSingle() { const e = q._err(); return e ? { data: null, error: e } : { data: q._hits()[0] || null, error: null }; },
      async single() { const h = q._hits()[0]; return h ? { data: h, error: null } : { data: null, error: { message: "none" } }; },
      then(res, rej) { const e = q._err(); return Promise.resolve(e ? { data: null, error: e } : { data: q._hits(), error: null }).then(res, rej); },
      insert(row) { const r = { id: `00000000-0000-4000-8000-${String(++uuidN).padStart(12, "0")}`, ...row }; state.rows[table].push(r); return { select: async () => ({ data: [r], error: null }) }; },
      async upsert(row, opts) {
        const keys = (opts && opts.onConflict ? opts.onConflict.split(",") : ["user_id"]);
        const rows = state.rows[table] = state.rows[table] || [];
        const i = rows.findIndex((r) => keys.every((k) => r[k] === row[k]));
        if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ ...row }); return { error: null };
      },
      update(p) { const u = { f: [], eq(c, v) { u.f.push((r) => r[c] === v); return u; }, async select() { const hit = (state.rows[table] || []).filter((r) => u.f.every((f) => f(r))); hit.forEach((r) => Object.assign(r, p)); return { data: hit.map((r) => ({ id: r.id })), error: null }; } }; return u; },
      delete() { const d = { f: [], eq(c, v) { d.f.push((r) => r[c] === v); return d; }, then(res, rej) { state.rows[table] = (state.rows[table] || []).filter((r) => !d.f.every((f) => f(r))); return Promise.resolve({ error: null }).then(res, rej); } }; return d; },
    };
    return q;
  };
  return { state, admin: { from, rpc: async () => ({ data: null, error: null }), auth: { admin: {} } } };
}

function load(db, user) {
  for (const p of [AUTH_PATH, PLUS_PATH, LIM_PATH, NW_PATH, PLAID_PATH]) delete require.cache[p];
  const real = require(AUTH_PATH);
  require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => db.admin, getUserFromRequest: async () => ({ user_id: user, error: null }), getUserPlan: async () => ({ plan: "plus", unlimited: true, status_unavailable: false }) };
  return { nw: require(NW_PATH), plaid: require(PLAID_PATH) };
}
const post = async (fn, body) => {
  const r = await fn.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify(body) });
  let b = null; try { b = JSON.parse(r.body); } catch { b = null; }
  return { status: r.statusCode, body: b };
};

(async () => {
  const t = create();
  const saved = { ...process.env };
  const quiet = { e: console.error, w: console.warn }; console.error = () => {}; console.warn = () => {};
  const realFetch = global.fetch;
  const plaidCalls = [];
  global.fetch = async (url, init) => {
    plaidCalls.push({ url: String(url).replace(/^https:\/\/[^/]+/, ""), body: init && init.body ? JSON.parse(init.body) : null });
    if (/investments\/holdings\/get/.test(url)) return { ok: true, status: 200, json: async () => ({ accounts: [{ account_id: "b-rrsp" }, { account_id: "b-rdsp" }], securities: [{ security_id: "s1", name: "Fund", ticker_symbol: "XEQT", close_price: 30, iso_currency_code: "CAD" }],
      holdings: [{ account_id: "b-rrsp", security_id: "s1", quantity: 10, institution_value: 300 }, { account_id: "b-rdsp", security_id: "s1", quantity: 5, institution_value: 150 }] }) };
    if (/link\/token\/create/.test(url)) return { ok: true, status: 200, json: async () => ({ link_token: "link-sandbox-x" }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  for (const k of Object.keys(process.env)) if (/^PLUS_ENABLED$|^HOUSEHOLD_ENABLED$|^STRIPE_PRICE_|^ENFORCE_PLAN_LIMITS$/.test(k)) delete process.env[k];
  Object.assign(process.env, { PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox", HOUSEHOLD_ENABLED: "true",
    STRIPE_PRICE_MONTHLY_CAD: "price_m", STRIPE_PRICE_ANNUAL_CAD: "price_a", STRIPE_PRICE_FOUNDING_ANNUAL_CAD: "price_f", STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_pm", STRIPE_PRICE_PLUS_ANNUAL_CAD: "price_pa" });
  const N = await import("../src/lib/netWorthPlus.js");
  const X = await import("../src/lib/netWorthAccess.js");

  try {
    // ── 1. The server ──────────────────────────────────────────────────────────────────────────────
    {
      const off = makeDb();
      const r0 = await post(load(off, A).nw, { action: "list" });
      t.eq([r0.status, off.state.reads.length], [404, 0], "1a PLUS_ENABLED off: 404, nothing read");
      process.env.PLUS_ENABLED = "true";
      const noPlus = makeDb({ plus: [] });
      t.eq((await post(load(noPlus, A).nw, { action: "list" })).status, 403, "1b no Plus: 403 plus_required, nothing of net worth returned");
      const fail = makeDb({ failPlus: true });
      t.eq((await post(load(fail, A).nw, { action: "list" })).status, 503, "1c the plan read fails: 503, never 'no Plus', never data");
      const db = makeDb();
      const { nw } = load(db, A);
      const bad = await Promise.all([{ kind: "boat", value: 1, currency: "CAD" }, { kind: "home", value: -1, currency: "CAD" }, { kind: "home", value: "lots", currency: "CAD" }, { kind: "home", value: 1, currency: "EUR" }].map((e) => post(nw, { action: "save_entry", ...e })));
      t.eq(bad.map((r) => r.status), [400, 400, 400, 400], "1d another kind, a negative figure, a word, another currency: refused");
      const ok = await post(nw, { action: "save_entry", kind: "home", label: "House", value: 450000.5, currency: "CAD" });
      const row = db.state.rows.net_worth_entries[0];
      t.eq([ok.status, row.user_id, row.value_cents, row.currency, row.shared], [200, A, 45000050, "CAD", false], "1e an entry is saved in its owner's name, to the cent, in its currency, NOT shared");
      const theirs = { id: "11111111-2222-4333-8444-555555555555", user_id: B, kind: "car", label: "B's car", value_cents: 100, currency: "CAD", shared: false };
      db.state.rows.net_worth_entries.push(theirs);
      const steal = await post(nw, { action: "save_entry", id: theirs.id, kind: "car", value: 1, currency: "CAD", shared: true });
      await post(nw, { action: "delete_entry", id: theirs.id });
      t.eq([steal.status, theirs.shared, db.state.rows.net_worth_entries.includes(theirs)], [404, false, true], "1f nobody can change, share or delete another person's entry");
      db.state.rows.plaid_account_owners.push({ user_id: B, account_id: "b-rrsp" });
      t.eq((await post(nw, { action: "set_share", account_id: "b-rrsp", shared: true })).status, 403, "1g nobody can share an account they did not link");
    }

    // ── 2 and 3. Private by default; an RDSP never shared by default ─────────────────────────────
    {
      const db = makeDb();
      db.state.rows.plaid_account_owners.push({ user_id: B, account_id: "b-rrsp" }, { user_id: B, account_id: "b-rdsp" });
      db.state.rows.net_worth_entries.push({ id: "eb000000-0000-4000-8000-000000000001", user_id: B, kind: "pension", label: "Work pension", value_cents: 6100000, currency: "CAD", shared: false });
      const forA = load(db, A).nw;
      let l = await post(forA, { action: "list" });
      t.eq([l.body.partner.entries, l.body.partner.shared_accounts, l.body.partner.all_shared], [[], [], false], "2a nothing shared yet: the partner sees no entry, no account, and only that not everything is shared");
      t.ok(!JSON.stringify(l.body.partner).includes("Work pension") && !JSON.stringify(l.body.partner).includes("6100000"), "2b …and nothing about what is private: no label, no figure, no count");
      const forB = load(db, B).nw;
      await post(forB, { action: "set_share", account_id: "b-rrsp", shared: true });
      l = await post(load(db, A).nw, { action: "list" });
      t.eq([l.body.partner.shared_accounts, l.body.partner.all_shared], [["b-rrsp"], false], "2c B shares the RRSP: A sees that account; the RDSP and the pension stay private");
      t.ok(!l.body.partner.shared_accounts.includes("b-rdsp"), "3a the RDSP is not shared by default (no row means not shared)");
      await post(load(db, B).nw, { action: "set_share", account_id: "b-rdsp", shared: true });
      await post(load(db, B).nw, { action: "save_entry", id: "eb000000-0000-4000-8000-000000000001", kind: "pension", label: "Work pension", value: 61000, currency: "CAD", shared: true });
      l = await post(load(db, A).nw, { action: "list" });
      t.eq([l.body.partner.all_shared, l.body.partner.entries.length], [true, 1], "2d once B has shared every account and entry: all_shared, and A sees them");
      t.ok(N.isSensitiveAccount({ subtype: "rdsp" }) && N.isSensitiveAccount({ subtype: "hsa" }) && !N.isSensitiveAccount({ subtype: "rrsp" }), "3b an RDSP or HSA is marked as one that can reveal a health or disability fact");
    }

    // ── 4. A household total only when every part is shared and real ────────────────────────────────
    {
      const owners = { "item-a": "me", "item-b": "partner" };
      const ownerOf = X.ownerOfFrom(owners);
      const data = { profile: { country: "CA" }, accounts: [
        { id: "a-chq", name: "A chequing", type: "depository", subtype: "checking", balance: 1000, currency: "CAD", _item: "item-a" },
        { id: "b-rrsp", name: "B RRSP", type: "investment", subtype: "rrsp", balance: 5000, currency: "CAD", _item: "item-b" },
        { id: "b-rdsp", name: "B RDSP", type: "investment", subtype: "rdsp", balance: 700, currency: "CAD", _item: "item-b" },
      ], debts: [{ id: "d1", name: "Car loan", balance: 2000 }] };
      const mine = { entries: [{ id: "e-a1", kind: "home", label: "House", value_cents: 30000000, currency: "CAD", shared: false }], shared_accounts: [] };
      const priv = N.viewerNetWorth({ data, list: { mine, partner: { entries: [], shared_accounts: [], all_shared: false } }, ownerOf });
      t.eq([priv.showing, priv.mine.map((p) => p.id).sort(), priv.partner.length, priv.household.map((p) => p.id)], ["mine", ["a-chq", "e-a1"], 0, ["d1"]], "4a nothing shared: A sees their own, none of B's, and the household's typed debt");
      t.eq(priv.totals, [{ currency: "CAD", assetsCents: 30100000, debtsCents: 0, netCents: 30100000 }], "4b …and the total is A's own only, never with B's private accounts in it");
      t.ok(!JSON.stringify(priv).includes("B RDSP") && !JSON.stringify(priv).includes("B RRSP"), "4c B's private accounts are in nothing A's screen gets");
      const some = N.viewerNetWorth({ data, list: { mine, partner: { entries: [], shared_accounts: ["b-rrsp"], all_shared: false } }, ownerOf });
      t.eq([some.showing, some.partner.map((p) => p.id), some.totals[0].netCents], ["mine", ["b-rrsp"], 30100000], "4d B shared one account: A sees it listed, and still only their own total (not every part is shared)");
      const all = N.viewerNetWorth({ data, list: { mine, partner: { entries: [], shared_accounts: ["b-rrsp", "b-rdsp"], all_shared: true } }, ownerOf });
      t.eq([all.showing, all.totals], ["household", [{ currency: "CAD", assetsCents: 30670000, debtsCents: -200000, netCents: 30470000 }]], "4e B shared everything and every part is real: the household total, to the cent");
      const unreal = N.viewerNetWorth({ data: { ...data, accounts: [...data.accounts, { id: "a-x", name: "A other", type: "depository", balance: null, currency: "CAD", _item: "item-a" }] }, list: { mine, partner: { entries: [], shared_accounts: ["b-rrsp", "b-rdsp"], all_shared: true } }, ownerOf });
      t.eq([unreal.showing, unreal.totals], ["mine", null], "4f everything shared but one part not real: no household total, and A's own has no total either (that part is A's)");
      const unknown = N.viewerNetWorth({ data: { ...data, accounts: [...data.accounts, { id: "z", name: "?", type: "depository", balance: 5, currency: "CAD", _item: "item-z" }] }, list: { mine, partner: { entries: [], shared_accounts: ["b-rrsp", "b-rdsp"], all_shared: true } }, ownerOf });
      t.eq([unknown.showing, [...unknown.mine, ...unknown.partner, ...unknown.household].some((p) => p.id === "z")], ["mine", false], "4g an account from a bank this device can't place is never shown, and no household total while it is there");
      t.eq([N.viewerNetWorth({ data, list: undefined, ownerOf }).totals, N.viewerNetWorth({ data, list: undefined, ownerOf }).mine.length], [null, 0], "4h the list not loaded: nothing shown, nothing totalled (fails closed)");
      const alone = N.viewerNetWorth({ data: { ...data, accounts: [data.accounts[0]] }, list: { mine, partner: null }, ownerOf });
      t.eq([alone.showing, alone.totals[0].netCents], ["household", 29900000], "4i no partner: the household is this person, everything counts");
      const v = N.viewerNetWorth({ data, list: { mine, partner: { entries: [], shared_accounts: ["b-rdsp"], all_shared: false } }, ownerOf });
      t.eq(v.partner.find((p) => p.id === "b-rdsp").sensitive, true, "3c a shared RDSP is still marked sensitive on the screen");
    }

    // ── 5. Leaving ────────────────────────────────────────────────────────────────────────────────
    {
      const db = makeDb();
      db.state.rows.net_worth_entries.push({ id: "e-b1", user_id: B, kind: "pension", label: "P", value_cents: 100, currency: "CAD", shared: true });
      db.state.rows.net_worth_shares.push({ user_id: B, account_id: "b-rrsp", shared: true });
      t.eq((await post(load(db, A).nw, { action: "list" })).body.partner.entries.length, 1, "5a in one household: A sees what B shared");
      db.state.rows.household_members = [];   // B leaves (0031 household_leave: the memberships go)
      const after = await post(load(db, A).nw, { action: "list" });
      const leaver = await post(load(db, B).nw, { action: "list" });
      t.eq([after.body.partner, leaver.body.mine.entries.map((e) => e.id), leaver.body.mine.shared_accounts], [null, ["e-b1"], ["b-rrsp"]], "5b after the leave: the one who stays sees nothing of B's; B's entries and choices go with B");
    }

    // ── 6. Plaid ──────────────────────────────────────────────────────────────────────────────────
    {
      const db = makeDb({ plus: [] });
      db.state.rows.plaid_items.push({ user_id: A, item_id: "item-a", access_token: "access-sandbox-a", status: "active", id: 1 }, { user_id: B, item_id: "item-b", access_token: "access-sandbox-b", status: "active", id: 2 });
      plaidCalls.length = 0;
      const r = await post(load(db, A).plaid, { action: "get_investments", item_id: "item-a" });
      t.eq([r.body.holdings, r.body.plus_mode, plaidCalls.filter((c) => /investments/.test(c.url)).length], [[], true, 0], "6a no Plus: no holdings and no call to Plaid's Investments at all");
      const plusDb = makeDb();
      plusDb.state.rows.plaid_items.push(...db.state.rows.plaid_items);
      plaidCalls.length = 0;
      const own = await post(load(plusDb, B).plaid, { action: "get_investments", item_id: "item-b" });
      t.eq([own.body.holdings.length, own.body.plus_mode], [2, true], "6b Plus, one's own bank: every holding, marked for this device only (plus_mode)");
      const partnerNone = await post(load(plusDb, A).plaid, { action: "get_investments", item_id: "item-b" });
      t.eq(partnerNone.body.holdings, [], "6c Plus, the partner's bank, nothing shared: no holdings");
      plusDb.state.rows.net_worth_shares.push({ user_id: B, account_id: "b-rrsp", shared: true });
      const partnerSome = await post(load(plusDb, A).plaid, { action: "get_investments", item_id: "item-b" });
      t.eq(partnerSome.body.holdings.map((h) => h.account_id), ["b-rrsp"], "6d …the RRSP shared: only its holdings; the RDSP's never");
      plaidCalls.length = 0;
      await post(load(plusDb, A).plaid, { action: "create_link_token", country: "CA" });
      const lt = (plaidCalls.find((c) => /link\/token\/create/.test(c.url)) || {}).body || {};
      t.eq([lt.optional_products, lt.additional_consented_products], [["liabilities"], ["investments"]], "6e Link asks for Investments as a consented product, which Plaid bills only from the first holdings call (Plus only)");
      delete process.env.PLUS_ENABLED;
      plaidCalls.length = 0;
      await post(load(makeDb(), A).plaid, { action: "create_link_token", country: "CA" });
      const lt0 = (plaidCalls.find((c) => /link\/token\/create/.test(c.url)) || {}).body || {};
      const legacyDb = makeDb(); legacyDb.state.rows.plaid_items.push(...db.state.rows.plaid_items);
      const legacy = await post(load(legacyDb, A).plaid, { action: "get_investments", item_id: "item-a" });
      t.eq([lt0.optional_products, lt0.additional_consented_products, legacy.body.plus_mode, legacy.body.holdings.length], [["investments", "liabilities"], undefined, undefined, 2], "6f PLUS_ENABLED off: Link and holdings exactly as today");
      process.env.PLUS_ENABLED = "true";
    }

    // ── 7. The app ────────────────────────────────────────────────────────────────────────────────
    {
      t.eq([undefined, null, { status: 404 }, { status: 503 }, { status: 200, body: { enabled: true, plus: false } }, { status: 200, body: { enabled: true, plus: true } }, { status: 200, body: {} }].map((r) => X.netWorthMode(r)),
        ["pending", "unavailable", "today", "unavailable", "locked", "plus", "unavailable"], "7a the server's answer to the five modes");
      t.eq([X.netWorthMode(null, "plus"), X.netWorthMode(null, "today"), X.netWorthMode(null, "locked")], ["plus", "today", "unavailable"], "7b offline: the last 'today' or 'plus' this device had is kept; 'locked' never becomes a figure");
      t.eq(["today", "plus", "locked", "unavailable", "pending"].map(X.showsNetWorth), [true, true, false, false, false], "7c a figure only in 'today' or 'plus'");
      const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
      const today = app.slice(app.indexOf("{/* ── NET WORTH SPARKLINE"), app.indexOf("{/* ── INVESTMENT PORTFOLIO"));
      t.ok(/\{!nwShow \? <NetWorthLocked mode=\{nwState\.mode\}/.test(today), "7d Today's net worth card: the locked state first, whenever it may not show a figure");
      t.ok(/!nwShow\s*\? \{label:"Net worth",value:netWorthWords\(/.test(app), "7e Today's small net worth tile: words, never a figure, without Plus");
      t.ok(/isVisible\('investments'\) && !nwShow && [^\n]*isInvestmentAccount/.test(app) && /isVisible\('investments'\) && nwState\.mode === "today" && \(data\.investments\?\.length > 0\)/.test(app), "7f the investments card: locked without Plus, as before only while Plus is off");
      t.ok(/const nwLocked = !showsNetWorth\(nwState\.mode\);/.test(app) && /\(nwLocked \? allItems\.filter\(item=>item\.type!=="investment"\) : allItems\)\.map/.test(app) && /explainNetWorth&&!nwLocked&&/.test(app), "7g Goals' Net Worth tab locked: no total and no investments, but every bank, card and loan balance still listed");
      t.ok(/if \(nwState\.mode === "plus"\) return <>[\s\S]{0,300}<NetWorthPlusScreen /.test(app), "7h with Plus: the Net Worth tab is net worth with Plus");
      t.ok(/\{!nwShowW \? <div data-wrapped-networth-locked/.test(app) && /nwStateW\.mode==="today"\?\[\{label:"Invested"/.test(app), "7i Wrapped: the locked state and no 'Invested' without Plus");
      t.ok(/if \(plusMode\) \{[\s\S]{0,400}setPlusHoldings\(allHoldings\);[\s\S]{0,200}investments, \.\.\.rest/.test(app), "7j the sync keeps Plus holdings on this device and clears any copy from the shared blob");
    }
  } finally {
    console.error = quiet.e; console.warn = quiet.w; global.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  t.summary("netWorthPrivate.test");
})();
