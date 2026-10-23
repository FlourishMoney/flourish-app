// tests/activation.test.cjs
// -----------------------------------------------------------------------------
// ACTIVATION COUNTS, AGGREGATE ONLY (2026-10-15): netlify/functions/activation.js, src/lib/activation.js
// and migration 0019.
//   1. Each counter: data_source, safe_view_7d (within 7 days of signup only), first_meeting, returned_d1
//      and returned_d7 (day 1 and day 7 of the account's own signup only), keyed by the Toronto signup day.
//   2. Nothing that identifies a household, no amount and no free text is stored: the database is given a
//      day and a metric from a fixed list, and nothing from the request body reaches it but the metric.
//   3. Flourish's own test addresses are never counted; no session is a 401; an unknown metric is a 400.
//   4. The app sends each metric once per account (app_open once a day), never in the demo, and the
//      request body is the metric alone.
//   5. Migration 0019: a table of (day, metric, count) with no account, amount or text column; service
//      role only.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const FN = require.resolve("../netlify/functions/activation.js");
const AUTH = require.resolve("../netlify/functions/_lib/auth.js");

// Run the real handler with the auth library replaced: who is signed in, and when they signed up.
async function call({ metric = "app_open", body, user = { id: "u1", email: "alex@example.ca", created_at: "2026-10-10T16:00:00Z" }, signedIn = true, now, method = "POST", rpcError = null } = {}) {
  const rpcs = [];
  const real = require(AUTH);
  require.cache[AUTH] = { id: AUTH, filename: AUTH, loaded: true, exports: { ...real,
    getUserFromRequest: async () => (signedIn ? { user_id: user.id } : { user_id: null, error: "no_token" }),
    getAdminClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user }, error: null }) } },
      rpc: async (name, args) => { rpcs.push({ name, args }); return { data: null, error: rpcError }; } }),
  } };
  delete require.cache[FN];
  const mod = require(FN);
  const realErr = console.error; console.error = () => {};
  try {
    const res = await mod._test.handler({ httpMethod: method, headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: body !== undefined ? body : JSON.stringify({ metric }) }, {}, new Date(now));
    return { res, rpcs };
  } finally { console.error = realErr; delete require.cache[AUTH]; delete require.cache[FN]; }
}

(async () => {
  const t = create();
  const day = (n) => new Date(Date.parse("2026-10-10T16:00:00Z") + n * 86400000).toISOString();

  // ── 1. each counter ──────────────────────────────────────────────────────────────────────────
  const cases = [
    ["data_source", day(0), "data_source"], ["data_source", day(40), "data_source"],
    ["safe_view", day(0), "safe_view_7d"], ["safe_view", day(7), "safe_view_7d"], ["safe_view", day(8), null],
    ["meeting_opened", day(3), "first_meeting"],
    ["app_open", day(0), null], ["app_open", day(1), "returned_d1"], ["app_open", day(2), null], ["app_open", day(7), "returned_d7"], ["app_open", day(8), null],
  ];
  for (const [metric, now, want] of cases) {
    const { res, rpcs } = await call({ metric, now });
    t.eq([res.statusCode, res.body, rpcs.map(r => r.args.p_metric)], [204, "", want ? [want] : []],
      `1a ${metric} at ${now.slice(0, 10)}: ${want ? `adds 1 to ${want}` : "counts nothing"}, and answers 204 with no body either way`);
  }
  const late = await call({ metric: "app_open", now: "2026-10-12T03:30:00Z", user: { id: "u2", email: "x@example.ca", created_at: "2026-10-11T03:30:00Z" } });
  t.eq(late.rpcs.map(r => [r.args.p_cohort_day, r.args.p_metric]), [["2026-10-10", "returned_d1"]], "1b a signup at 11:30 pm ET on Oct 10 belongs to Oct 10, and its next evening is day 1");

  // ── 2. nothing identifying, no amount, no free text ─────────────────────────────────────────
  const noisy = await call({ now: day(1), body: JSON.stringify({ metric: "app_open", amount: 1944.22, note: "rent is due", email: "alex@example.ca", userId: "u1" }) });
  t.eq(noisy.rpcs.length, 1, "2a a request carrying an amount, a note and an address still counts once");
  t.eq(Object.keys(noisy.rpcs[0].args).sort(), ["p_cohort_day", "p_metric"], "2b …and the database is given a day and a metric, nothing else");
  t.ok(/^\d{4}-\d{2}-\d{2}$/.test(noisy.rpcs[0].args.p_cohort_day) && ["data_source", "safe_view_7d", "first_meeting", "returned_d1", "returned_d7"].includes(noisy.rpcs[0].args.p_metric),
    "2c …a date and one of the five metric names: no amount, no text, no account id");
  t.ok(!/1944|rent|alex|u1/.test(JSON.stringify(noisy.rpcs)), "2d none of the request's other values reach the database");
  t.eq(noisy.rpcs[0].name, "activation_bump", "2e …through activation_bump, the one function that changes a count");

  // ── 3. who is never counted ──────────────────────────────────────────────────────────────────
  for (const email of ["amanda@getgrowsmart.com", "Hello@GetGrowSmart.com", "qa@mail.flourishmoney.app"]) {
    const r = await call({ now: day(1), user: { id: "t", email, created_at: day(0) } });
    t.eq([r.res.statusCode, r.rpcs.length], [204, 0], `3a ${email} (a test address): nothing counted`);
  }
  t.eq((await call({ signedIn: false, now: day(1) })).res.statusCode, 401, "3b no session: 401, nothing counted");
  for (const [bad, why] of [[JSON.stringify({ metric: "purchase" }), "an unknown metric"], [JSON.stringify({}), "no metric"], ["not json", "a body that is not JSON"]]) {
    const r = await call({ body: bad, now: day(1) });
    t.eq([r.res.statusCode, r.rpcs.length], [400, 0], `3c ${why}: 400, nothing counted`);
  }
  t.eq((await call({ method: "GET", now: day(1) })).res.statusCode, 405, "3d only POST");
  t.eq((await call({ now: day(1), rpcError: { message: "relation activation_daily does not exist" } })).res.statusCode, 503,
    "3e a failed write (0019 not applied yet, the database down) answers 503, so the app keeps the signal and sends it again later");
  for (const email of ["snap@flourish.app", " SNAP@Flourish.app "]) {
    const r = await call({ now: day(1), user: { id: "s", email, created_at: day(0) } });
    t.eq([r.res.statusCode, r.rpcs.length], [204, 0], `3f the screenshot account (${email.trim()}) is never counted`);
  }
  const F = require(FN)._test;
  t.ok(F.isSampleAccount("snap@flourish.app") && !F.isSampleAccount("alex@example.ca") && !F.isSampleAccount(""), "3g the App Review account is matched by the SHA-256 of its address only; other addresses are not");
  t.ok(!/@(?!flourish\.app|getgrowsmart|flourishmoney|example)[a-z0-9.-]+\.[a-z]{2,}/i.test(fs.readFileSync(FN, "utf8").replace(/snap@flourish\.app/g, "")), "3h the review address itself is not written in the function");

  // ── 4. the app's side ────────────────────────────────────────────────────────────────────────
  const A = await import("../src/lib/activation.js");
  const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), size: () => m.size }; };
  const sent = []; const fetchOk = async (url, o) => { sent.push({ url, body: o.body, headers: o.headers }); return { ok: true, status: 204 }; };
  const sess = async () => ({ userId: "u1", jwt: "token" });
  const st = mem();
  const opts = { getSession: sess, storage: st, fetchImpl: fetchOk, apiBase: "https://flourishmoney.app", today: new Date(2026, 9, 11, 9) };
  t.eq([await A.sendActivationOnce("safe_view", opts), await A.sendActivationOnce("safe_view", opts)], [true, false], "4a a metric is sent once per account");
  t.eq(sent.map(s => [s.url, s.body]), [["https://flourishmoney.app/api/activation", '{"metric":"safe_view"}']], "4b …to our own /api/activation, with the metric as the whole body");
  t.eq(sent[0].headers.Authorization, "Bearer token", "4c …signed in");
  t.eq([await A.sendActivationOnce("app_open", opts), await A.sendActivationOnce("app_open", opts), await A.sendActivationOnce("app_open", { ...opts, today: new Date(2026, 9, 12, 9) })], [true, false, true], "4d app_open: once a day");
  // The day is Toronto's, as on the server: 22:00 in Vancouver (05:00Z next day) is already the next Toronto day.
  t.eq([A.torontoDay(new Date("2026-10-17T05:00:00Z")), A.torontoDay(new Date("2026-10-17T03:59:00Z")), A.torontoDay(new Date("2026-10-17T04:00:00Z"))], ["2026-10-17", "2026-10-16", "2026-10-17"],
    "4d2 app_open's once-a-day key is the Toronto day, the day the server counts by");
  t.eq(A.activationKey("app_open", "u9", new Date("2026-10-17T05:00:00Z")), A.activationKey("app_open", "u9", new Date("2026-10-17T16:00:00Z")),
    "4d3 …so an open at 10 pm in Vancouver and one the next morning are the same counted day, sent once");
  const sentBefore = sent.length;
  t.eq(await A.sendActivationOnce("safe_view", { ...opts, userId: "u1", getSession: async () => { throw new Error("must not be read"); } }), false, "4d4 a metric already sent is skipped before the session is read");
  t.eq(sent.length, sentBefore, "4d5 …with no request");
  sent.length = 0;
  t.eq(await A.sendActivationOnce("meeting_opened", { ...opts, demo: true }), false, "4e never in the demo");
  t.eq(await A.sendActivationOnce("meeting_opened", { ...opts, getSession: async () => null }), false, "4f never without a session");
  t.eq(await A.sendActivationOnce("purchase", opts), false, "4g never an unknown metric");
  t.eq(sent.length, 0, "4h …so none of those made a request");
  const st2 = mem();
  t.eq(await A.sendActivationOnce("data_source", { ...opts, storage: st2, fetchImpl: async () => ({ ok: false, status: 500 }) }), false, "4i a failed send is not remembered…");
  t.eq(await A.sendActivationOnce("data_source", { ...opts, storage: st2 }), true, "4j …so it is sent again next time");
  t.eq(await A.sendActivationOnce("data_source", { ...opts, storage: { getItem: () => { throw new Error("blocked"); } } }), false, "4k storage that throws (private mode): no send, no error");
  t.eq([
    A.hasDataSource({ accounts: [{ institution: "Manual", balance: 0 }] }),
    A.hasDataSource({ accounts: [{ institution: "Manual", balance: 1200, balanceEntered: true }] }),
    A.hasDataSource({ accounts: [{ institution: "Statement", balance: 0 }] }),
    A.hasDataSource({ accounts: [{ institution: "RBC", _item: "item_1" }] }),
    A.hasDataSource({ bankConnected: true, accounts: [] }),
    A.hasDataSource({ demo: true, bankConnected: true, accounts: [{ institution: "RBC" }] }),
  ], [false, true, true, true, true, false], "4l a data source: a linked bank, an imported statement or an entered balance (PR #72); the empty manual account and the demo are not");
  const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
  t.ok(/const showsSafeFigure = isVisible\('hero'\) && hasCashAccount && !_ss\.noIncome;\s+useEffect\(\(\)=>\{ if\(showsSafeFigure && !data\?\.demo\) signalActivation\("safe_view", false\); \},\[showsSafeFigure\]\);/.test(APP),
    "4m safe_view is sent only when Today is SHOWING the figure (the card on, a cash account, an income), never for \"Connect an account\" or \"Add your income\"");
  // 2026-10-23: and not when the tour's Meet step is what put the agenda on screen (tests/onboardingFirstNumber.test.cjs).
  t.ok(/useEffect\(\(\)=>\{ if\(!data\?\.demo && !tourActive\) signalActivation\("meeting_opened", false\); \},\[\]\);/.test(APP)
    && /if \(!\(user && hydratedUidRef\.current === user\.id && !appData\?\.demo\)\) return;\s+signalActivation\("app_open", false, user\.id\);\s+if \(hasDataSource\(appData\)\) signalActivation\("data_source", false, user\.id\);/.test(APP),
    "4m2 meeting_opened from the meeting agenda, app_open and data_source once the account's data has loaded; none in the demo");
  t.ok(/onNumberShown=\{\(\)=>\{ signalActivation\("safe_view", false, user\?\.id\);/.test(APP),
    "4m3 safe_view is also sent when the first-number screen shows its number (2026-10-23)");
  t.ok(/const loadSampleHousehold = \(\) => \{\s+_activationOff = true;/.test(APP) && /_activationOff = false;\s+if \(normalizeEmail\(user\.email\) === SCREENSHOT_EMAIL\)/.test(APP)
    && /const signalActivation = \(metric, demo, userId\) => \(_activationOff \? Promise\.resolve\(false\)/.test(APP), "4m3 the App Review and screenshot sample households send nothing");
  t.ok(!/posthog|mixpanel|amplitude|segment\.com|googletagmanager|gtag\(/i.test(APP + fs.readFileSync(path.join(__dirname, "..", "src", "lib", "activation.js"), "utf8")), "4n no third-party analytics");

  // ── 5. migration 0019 ────────────────────────────────────────────────────────────────────────
  const RAW = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "0019_activation_counts.sql"), "utf8");
  const SQL = RAW.replace(/--.*$/gm, " ");
  const table = SQL.slice(SQL.indexOf("create table if not exists public.activation_daily"), SQL.indexOf(");", SQL.indexOf("create table if not exists public.activation_daily")));
  const cols = [...table.matchAll(/^\s+([a-z_]+)\s+(date|text|integer)/gm)].map(m => `${m[1]} ${m[2]}`);
  t.eq(cols, ["cohort_day date", "metric text", "count integer"], "5a the table holds a day, a metric and a count: no account, no amount, no text");
  t.ok(/metric\s+text\s+not null check \(metric in \('data_source', 'safe_view_7d', 'first_meeting', 'returned_d1', 'returned_d7'\)\)/.test(table), "5b …and the metric can only be one of the five names");
  t.ok(/alter table public\.activation_daily enable row level security;/.test(SQL) && /revoke all on table public\.activation_daily from anon, authenticated;/.test(SQL)
    && /^[ \t]*--[ \t]*grants:[ \t]*service_role only[ \t]*$/im.test(RAW), "5c RLS on, nothing for anon or authenticated, marked service role only");
  for (const f of ["activation_bump(date, text)", "activation_counts(date, date)"]) {
    const e = f.replace(/[()]/g, "\\$&");
    t.ok(new RegExp(`revoke all on function public\\.${e} from public, anon, authenticated;`).test(SQL) && new RegExp(`grant execute on function public\\.${e} to service_role;`).test(SQL), `5d explicit grants: ${f}, service role only`);
  }
  const rep = SQL.slice(SQL.indexOf("function public.activation_counts("), SQL.indexOf("$$;", SQL.indexOf("function public.activation_counts(")));
  t.ok(/returns table \(cohort_day date, accounts_created integer, data_source integer, safe_view_7d integer,\s+first_meeting integer, returned_d1 integer, returned_d7 integer\)/.test(SQL), "5e the report returns a day and six counts");
  t.ok(/from auth\.users u\s+where u\.email_confirmed_at is not null\s+and lower\(coalesce\(u\.email, ''\)\) !~ '@\(\[a-z0-9-\]\+\\\.\)\*\(getgrowsmart\\\.com\|flourishmoney\\\.app\)\$'/.test(rep),
    "5f accounts created comes from Supabase Auth: confirmed accounts only, test addresses left out (an address is only matched, never returned)");
  t.ok(/<> 'snap@flourish\.app'/.test(rep) && /encode\(extensions\.digest\(lower\(trim\(coalesce\(u\.email, ''\)\)\), 'sha256'\), 'hex'\) <> 'af552e5b3f4529120915257ae8073ff990043c65e6163630d694fe2b6516dc7b'/.test(rep),
    "5g …and the screenshot and App Review accounts left out (the review account by hash only)");
  t.ok(!/NOTHING HERE IDENTIFIES/.test(RAW) && /Small cohorts can still be matched/.test(RAW) && /close estimates/.test(RAW), "5h the migration claims no more than it does: no account id is stored, small cohorts can be matched, the counts are estimates");
  t.summary("activation.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
