// tests/freeV1Bank.test.cjs
// -----------------------------------------------------------------------------
// FREE V1 ON THE WEBSITE: NO BANK ON FREE, ENFORCED BY THE SERVER (2026-11-23).
//
// The free plan connects no bank from the website. The iPhone and Android apps keep today's rule (one bank) until
// their next builds are live, because their bundled screens ask for a bank before the store trial and cannot be
// changed by a deploy. This runs the REAL plaid.js, with Supabase and Plaid stubbed, for these households:
//   ended        account trial over, nothing paid               Free
//   newFree      opened after the plans-first switch, no plan   Free from the first minute (production today)
//   trial        inside its 14-day account trial                unlimited
//   stripeTrial  a Stripe subscription still in its 14 days     unlimited
//   paid         a Stripe subscription, active                  unlimited
//   founder      founder_flag                                   unlimited
//   gift, cover  a running gift year, a partner's paid plan     unlimited (the server's own answer)
//   unread       the plan could not be read                     exactly as today: the link opens, the exchange is 503
// and checks, for the website and both store apps:
//   1  a new bank link: refused before Plaid opens for Free on the website, with the server's word slot
//   2  a reconnect (update mode) is never refused: a bank already connected keeps working
//   3  the store apps: a new link goes on to Plaid, as today
//   4  the exchange: 0 banks on Free on the website, 1 in the store apps (today's answer, word for word)
//   5  the old-bank import (migrate_items): 0 on Free on the website, 1 in the store apps
//   6  ENFORCE_PLAN_LIMITS off: nothing is refused (as today)
//   7  the rule itself: which requests are the website's
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const FREE_BANKS_PATH = require.resolve("../netlify/functions/_lib/freeBanks.js");
const { freeServerWords } = require("../netlify/functions/_lib/freeWords.js");

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const IOS = "capacitor://localhost", ANDROID = "https://localhost", WEB = "https://flourishmoney.app";
const STORE_ORIGINS = [[IOS, "iOS"], [ANDROID, "Android"]];
const TODAY_ONE_BANK = "Connecting more than one bank is a Plus feature. Upgrade to add unlimited banks.";
const TODAY_ONE_BANK_MIGRATE = "Free plan supports one bank. Upgrade to Plus to add more.";
const SERVER_LINE = freeServerWords("free-server-bank");
const SINCE = iso(Date.now() - 10 * DAY);

const ended = { plan: "trial", trial_started_at: iso(Date.now() - 40 * DAY), trial_ends_at: iso(Date.now() - 26 * DAY), founder_flag: false };
const HOUSEHOLDS = {
  ended:       { profile: ended, sub: null, free: true },
  newFree:     { profile: { plan: "trial", trial_started_at: iso(Date.now() - DAY), trial_ends_at: iso(Date.now() + 13 * DAY), founder_flag: false }, sub: null, free: true, tpf: true },
  trial:       { profile: { plan: "trial", trial_started_at: iso(Date.now() - 3 * DAY), trial_ends_at: iso(Date.now() + 11 * DAY), founder_flag: false }, sub: null },
  stripeTrial: { profile: ended, sub: { status: "trialing", current_period_end: iso(Date.now() + 9 * DAY), plan_key: "annual", provider: "stripe" }, tpf: true },
  paid:        { profile: ended, sub: { status: "active", current_period_end: iso(Date.now() + 300 * DAY), plan_key: "annual", provider: "stripe" } },
  founder:     { profile: { plan: "free", trial_started_at: null, trial_ends_at: null, founder_flag: true }, sub: null },
  gift:        { profile: ended, sub: null, plan: { plan: "free", unlimited: true, paid: false, status_unavailable: false, covered_by: "gift" } },
  cover:       { profile: ended, sub: null, plan: { plan: "free", unlimited: true, paid: false, status_unavailable: false, covered_by: "household" } },
  unread:      { profile: ended, sub: null, plan: { plan: "free", unlimited: false, paid: false, status_unavailable: true } },
};
const UNLIMITED = ["trial", "stripeTrial", "paid", "founder", "gift", "cover"];

// A fake Supabase holding one household and `banks` connected banks.
function fakeSupabase(h, banks) {
  const calls = { writes: [] };
  const rows = {
    profiles: [{ user_id: "u1", ...h.profile }],
    subscriptions: h.sub ? [{ user_id: "u1", ...h.sub }] : [],
    plaid_items: Array.from({ length: banks }, (_, i) => ({ user_id: "u1", item_id: `it${i + 1}`, status: "active", access_token: `access-${i + 1}`, institution_name: "Old Bank" })),
  };
  const client = {
    from(table) {
      const q = {
        _f: [], _head: false,
        select(_c, opts) { if (opts && opts.head) q._head = true; return q; },
        eq(col, val) { q._f.push((r) => r[col] === val); return q; },
        in(col, vals) { q._f.push((r) => vals.includes(r[col])); return q; },
        neq(col, val) { q._f.push((r) => r[col] !== val); return q; },
        order() { return q; }, limit() { return q; },
        upsert(v) { calls.writes.push([table, "upsert", v]); q._stop = true; return q; },
        insert(v) { calls.writes.push([table, "insert", v]); q._stop = true; return q; },
        update(v) { calls.writes.push([table, "update", v]); q._stop = true; return q; },
        delete() { calls.writes.push([table, "delete"]); q._stop = true; return q; },
        _rows() { return (rows[table] || []).filter((r) => q._f.every((f) => f(r))); },
        async maybeSingle() { return q._stop ? { data: null, error: { message: "test stops here" } } : { data: q._rows()[0] || null, error: null }; },
        async single() { return q.maybeSingle(); },
        then(res, rej) {
          const out = q._stop ? { data: null, error: { message: "test stops here" } }
            : q._head ? { count: q._rows().length, error: null } : { data: q._rows(), error: null };
          return Promise.resolve(out).then(res, rej);
        },
      };
      return q;
    },
    async rpc(name) {
      if (name === "gift_cover") return { data: null, error: { code: "PGRST202", message: "Could not find the function public.gift_cover(p_now, p_user) in the schema cache" } };
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
    auth: { admin: {} },
  };
  return { client, calls };
}

function load(h, { banks = 0, enforce = true } = {}) {
  const fake = fakeSupabase(h, banks);
  for (const k of ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE"]) delete process.env[k];
  Object.assign(process.env, {
    SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role", ENFORCE_PLAN_LIMITS: enforce ? "true" : "",
    PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox",
  });
  if (h.tpf) Object.assign(process.env, { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE });
  require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => fake.client } };
  for (const p of [AUTH_PATH, PLAID_PATH, FREE_BANKS_PATH]) delete require.cache[p];
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}netlify${path.sep}functions${path.sep}_lib${path.sep}planRules`)) delete require.cache[k];
  const auth = require(AUTH_PATH);
  auth.getUserFromRequest = async () => ({ user_id: "u1", error: null });
  if (h.plan) auth.getUserPlan = async () => ({ ...h.plan });
  return { plaid: require(PLAID_PATH), calls: fake.calls };
}

// Plaid's three endpoints answer; anything else is blocked. Every URL asked is recorded.
const outside = [];
const realFetch = global.fetch;
global.fetch = async (url) => {
  const u = String(url);
  outside.push(u);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  if (/\/link\/token\/create$/.test(u)) return ok({ link_token: "link-sandbox-test", expiration: iso(Date.now() + 3600e3) });
  if (/\/item\/public_token\/exchange$/.test(u)) return ok({ access_token: "access-new", item_id: "it-new" });
  if (/\/item\/get$/.test(u)) return ok({ item: { item_id: "it-legacy", institution_id: "ins_1" } });
  throw new Error("network blocked in test");
};
const asked = (before, rx) => outside.slice(before).some((u) => rx.test(u));

const call = (mod, origin, body) => mod.plaid.handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" }, body: JSON.stringify(body) });
const json = (res) => { try { return JSON.parse(res.body || "{}"); } catch { return {}; } };

(async () => {
  const t = create();
  const saved = { ...process.env };
  const quiet = console.log, quietErr = console.error, quietWarn = console.warn;
  console.log = () => {}; console.error = () => {}; console.warn = () => {};
  try {
    // ── 1. a new bank link from the website ─────────────────────────────────────────────────────────
    for (const [who, h] of Object.entries(HOUSEHOLDS)) {
      const mod = load(h);
      const before = outside.length;
      const res = await call(mod, WEB, { action: "create_link_token", country: "CA", user_id: "u1" });
      const toPlaid = asked(before, /\/link\/token\/create$/);
      if (h.free) {
        t.eq([res.statusCode, json(res).error, toPlaid], [402, "plan_limit", false], `1a website, ${who} (Free): a new bank is refused before Plaid opens`);
        t.eq(json(res).message, SERVER_LINE, `1b website, ${who}: …with the server's word slot, word for word`);
      } else {
        t.eq([res.statusCode, toPlaid], [200, true], `1c website, ${who}: a new bank link goes on to Plaid, as today`);
      }
    }

    // ── 2. a reconnect (Plaid's update mode) is never refused: a bank already connected keeps working ──
    for (const who of ["ended", "newFree"]) {
      const mod = load(HOUSEHOLDS[who], { banks: 1 });
      const before = outside.length;
      const res = await call(mod, WEB, { action: "create_link_token", country: "CA", item_id: "it1" });
      t.eq([res.statusCode, asked(before, /\/link\/token\/create$/)], [200, true], `2a website, ${who} (Free), a reconnect of a bank already held goes on to Plaid`);
    }

    // ── 3. the store apps: a new link goes on to Plaid, as today ─────────────────────────────────────
    for (const [origin, name] of STORE_ORIGINS) {
      for (const who of ["ended", "newFree", "paid"]) {
        const mod = load(HOUSEHOLDS[who]);
        const before = outside.length;
        const res = await call(mod, origin, { action: "create_link_token", country: "CA", user_id: "u1" });
        t.eq([res.statusCode, asked(before, /\/link\/token\/create$/)], [200, true], `3a ${name}, ${who}: a new bank link goes on to Plaid, as today`);
      }
    }

    // ── 4. the exchange ────────────────────────────────────────────────────────────────────────────
    for (const [who, h] of Object.entries(HOUSEHOLDS)) {
      for (const banks of [0, 1]) {
        // the website
        let mod = load(h, { banks });
        let before = outside.length;
        let res = await call(mod, WEB, { action: "exchange_token", public_token: "public-sandbox-1" });
        let toPlaid = asked(before, /\/item\/public_token\/exchange$/);
        if (who === "unread") t.eq([res.statusCode, toPlaid], [503, false], `4a website, unread plan, ${banks} bank(s): 503 before Plaid, as today`);
        else if (h.free) {
          t.eq([res.statusCode, json(res).error, toPlaid], [402, "plan_limit", false], `4b website, ${who} (Free), ${banks} bank(s): refused before Plaid`);
          t.eq(json(res).message, SERVER_LINE, `4c website, ${who}, ${banks} bank(s): …with the server's word slot`);
        } else t.eq([res.statusCode !== 402 && res.statusCode !== 503, toPlaid], [true, true], `4d website, ${who}, ${banks} bank(s): goes on to Plaid`);
        // the store apps: exactly today's answers
        for (const [origin, name] of STORE_ORIGINS) {
          mod = load(h, { banks });
          before = outside.length;
          res = await call(mod, origin, { action: "exchange_token", public_token: "public-sandbox-1" });
          toPlaid = asked(before, /\/item\/public_token\/exchange$/);
          if (who === "unread") t.eq([res.statusCode, toPlaid], [503, false], `4e ${name}, unread plan, ${banks} bank(s): 503, as today`);
          else if (h.free && banks >= 1) t.eq([res.statusCode, json(res).message, toPlaid], [402, TODAY_ONE_BANK, false], `4f ${name}, ${who} (Free), one bank already: a second is refused with today's words`);
          else t.eq([res.statusCode !== 402, toPlaid], [true, true], `4g ${name}, ${who}, ${banks} bank(s): goes on to Plaid, as today`);
        }
      }
    }

    // ── 5. the old-bank import (migrate_items) ─────────────────────────────────────────────────────
    const migrate = async (origin, h, banks) => {
      const mod = load(h, { banks });
      const res = await call(mod, origin, { action: "migrate_items", tokens: [{ token: "access-legacy", institution_name: "Legacy Bank" }] });
      const b = json(res);
      const failures = Array.isArray(b.failures) ? b.failures : [];
      return { res, failures, wrote: mod.calls.writes.some(([table]) => table === "plaid_items") };
    };
    for (const who of ["ended", "newFree"]) {
      const web = await migrate(WEB, HOUSEHOLDS[who], 0);
      t.eq([web.failures.map((f) => f.error), web.failures.map((f) => f.message), web.wrote], [["plan_limit"], [SERVER_LINE], false],
        `5a website, ${who} (Free), no bank yet: the old bank is not imported, with the server's word slot`);
      for (const [origin, name] of STORE_ORIGINS) {
        const app = await migrate(origin, HOUSEHOLDS[who], 0);
        t.ok(!app.failures.some((f) => f.error === "plan_limit") && app.wrote, `5b ${name}, ${who} (Free), no bank yet: imported, as today`);
        const second = await migrate(origin, HOUSEHOLDS[who], 1);
        t.eq(second.failures.map((f) => [f.error, f.message]), [["plan_limit", TODAY_ONE_BANK_MIGRATE]], `5c ${name}, ${who}, one bank already: refused with today's words`);
      }
    }
    for (const who of UNLIMITED) {
      const web = await migrate(WEB, HOUSEHOLDS[who], 0);
      t.ok(!web.failures.some((f) => f.error === "plan_limit") && web.wrote, `5d website, ${who}: the old bank is imported, as today`);
    }

    // ── 6. ENFORCE_PLAN_LIMITS off: nothing refused, as today ──────────────────────────────────────
    {
      let mod = load(HOUSEHOLDS.newFree, { enforce: false });
      let before = outside.length;
      let res = await call(mod, WEB, { action: "create_link_token", country: "CA", user_id: "u1" });
      t.eq([res.statusCode, asked(before, /\/link\/token\/create$/)], [200, true], "6a limits off: a Free website link goes on to Plaid");
      mod = load(HOUSEHOLDS.newFree, { enforce: false, banks: 3 });
      before = outside.length;
      res = await call(mod, WEB, { action: "exchange_token", public_token: "public-sandbox-1" });
      t.ok(res.statusCode !== 402 && asked(before, /\/item\/public_token\/exchange$/), "6b limits off: the exchange goes on to Plaid");
    }

    // ── 7. the rule: which requests are the website's ─────────────────────────────────────────────
    delete require.cache[FREE_BANKS_PATH];
    const { freeBankCap } = require(FREE_BANKS_PATH);
    const ev = (origin) => ({ headers: origin === undefined ? {} : { origin } });
    t.eq([freeBankCap(ev(WEB)), freeBankCap(ev(IOS)), freeBankCap(ev(ANDROID)), freeBankCap(ev(undefined)), freeBankCap(ev("http://localhost:5173")), freeBankCap({ headers: { Origin: IOS } })],
      [0, 1, 1, 0, 0, 1], "7a Free connects 0 banks from the website (or no origin), 1 from either store app");
  } finally {
    console.log = quiet; console.error = quietErr; console.warn = quietWarn;
    global.fetch = realFetch;
    process.env = saved;
  }
  t.summary("freeV1Bank.test");
})();
