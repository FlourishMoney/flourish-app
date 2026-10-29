// tests/onboardingFirstNumber.test.cjs
// -----------------------------------------------------------------------------
// THE FIRST NUMBER (onboarding, 2026-10-23), the parts a browser cannot see. The walk itself, both paths, is
// tests/onboardingFirstNumber.browser.test.cjs.
//   1. The first-number words (src/lib/firstNumber.js): W5, W6, W2 word for word; the sentence names only the
//      parts in the number, by their approved names.
//   2. "When is your next payday?" (W1) feeds the income schedule (src/lib/incomeSchedule.js): weekly and every
//      two weeks are phased from the entered date, not counted from today; real deposits still win.
//   3. The counts, server side (netlify/functions/_lib/onboardingCounts.js, activation.js): fixed lists only, the
//      time buckets from signup and from first sign-in, test accounts never counted, 503 until 0028 runs.
//   4. The counts, app side (src/lib/onboardingCounts.js): steps and the first number once, bank attempts each
//      time, never in the demo, no amount or name in the body.
//   5. Migration 0028: counts only, service role only. Not run here.
//   6. The screens' source: the approved words, the flow, and what is gone.
//   7. The country is the device's (src/lib/deviceCountry.js): a Canadian time zone is Canada; else a US time
//      zone or a US region is the US; else Canada. It is what Plaid's institution search is asked for.
//   8. Province, status and kids are left unset: federal content only, no couple framing, no child benefits.
//   9. The tour's Today step names only the parts in the number, from the same module as the first number.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const FN = require.resolve("../netlify/functions/activation.js");
const AUTH = require.resolve("../netlify/functions/_lib/auth.js");

const W1 = "When is your next payday?", W1_HELP = "Pick the date your next pay lands.";
const W2 = "The spending buffer starts after flourish has enough of your transactions to calculate it.";
const W3 = "From the numbers you entered. A linked bank can keep them up to date.";
const W4 = "Your bank wasn't connected. You can try again or enter your numbers yourself.";
const W6 = "Here's your number.";
const W7 = "Bills accounted for";

// The real activation handler with the auth library replaced (as tests/activation.test.cjs does).
async function call({ body, user = { id: "u1", email: "alex@example.ca", created_at: "2026-10-23T14:00:00Z" }, now = "2026-10-23T14:01:30Z", rpcError = null } = {}) {
  const rpcs = [];
  const real = require(AUTH);
  require.cache[AUTH] = { id: AUTH, filename: AUTH, loaded: true, exports: { ...real,
    getUserFromRequest: async () => ({ user_id: user.id }),
    getAdminClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user }, error: null }) } },
      rpc: async (name, args) => { rpcs.push({ name, args }); return { data: null, error: rpcError }; } }),
  } };
  delete require.cache[FN];
  const mod = require(FN);
  const realErr = console.error; console.error = () => {};
  try {
    const res = await mod._test.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" }, body: JSON.stringify(body) }, {}, new Date(now));
    return { res, rpcs };
  } finally { console.error = realErr; delete require.cache[AUTH]; delete require.cache[FN]; }
}

(async () => {
  const t = create();

  // ── 1. the first-number words ────────────────────────────────────────────────────────────────
  const F = await import("../src/lib/firstNumber.js");
  t.eq([F.FIRST_NUMBER_HEADLINE, F.BUFFER_PENDING_LINE], [W6, W2], "1a W6 and W2, character for character");
  t.eq([F.firstNumberGreeting(""), F.firstNumberGreeting("  "), F.firstNumberGreeting(undefined), F.firstNumberGreeting("Sam")], ["Welcome", "Welcome", "Welcome", "Welcome, Sam"],
    "1b with no name the greeting is \"Welcome\" (W5); a name given in Settings still greets by name");
  const ss = (o) => ({ upcomingBills: 0, debtPayments: 0, safetyBuf: 0, savingsAlloc: 0, ...o });
  t.eq(F.firstNumberSentence(ss({ upcomingBills: 1400, debtPayments: 90, safetyBuf: 120, savingsAlloc: 300 })),
    "Bills due before payday, minimum debt payments, a spending buffer and a savings amount are accounted for.", "1c every part: all four approved names, then \"are accounted for.\"");
  t.eq(F.firstNumberSentence(ss({ upcomingBills: 1400, savingsAlloc: 76 })), "Bills due before payday and a savings amount are accounted for.", "1d no debt and no buffer: neither is named");
  t.eq(F.firstNumberSentence(ss({ safetyBuf: 148, savingsAlloc: 167 })), "A spending buffer and a savings amount are accounted for.", "1e a sentence that starts on a lower-case name is capitalised");
  t.eq(F.firstNumberSentence(ss({ debtPayments: 90 })), "Minimum debt payments are accounted for.", "1f a single plural part reads with \"are\"");
  t.eq([F.firstNumberSentence(ss({ savingsAlloc: 76 })), F.firstNumberSentence(ss({ safetyBuf: 40 })), F.firstNumberSentence(ss({}))], [null, null, null],
    "1g a single singular part would need \"is\" (not an approved word), and no parts says nothing: no sentence");
  t.eq(F.firstNumberSentence(ss({ upcomingBills: -5, debtPayments: NaN })), null, "1h a part at or below 0 is not in the number");
  t.eq(F.bufferPending({ transactions: [] }, ss({})), true, "1i W2 when the buffer is $0 and there are no transactions yet");
  t.eq(F.bufferPending({ transactions: [{ id: 1 }] }, ss({})), false, "1j …not once there are transactions (the buffer is then the household's own spending)");
  t.eq(F.bufferPending({ transactions: [] }, ss({ safetyBuf: 50 })), false, "1k …not when there is a buffer");
  t.eq(F.bufferPending({ transactions: [], forecastEdits: { dailySpend: 0 } }, ss({})), false, "1l …not when the household set its own daily spending");

  // ── 2. W1 feeds the income schedule ─────────────────────────────────────────────────────────
  const S = await import("../src/lib/incomeSchedule.js");
  const today = new Date(2026, 9, 23, 9);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dates = (inc, txns = [], days = 40) => S.depositDatesFor(inc, 2100, txns, today, days).map(ymd);
  const bi = { label: "Job", amount: 2100, freq: "biweekly" };
  t.eq(dates(bi), ["2026-11-06", "2026-11-20"], "2a before: no history and no date counts from today (today + 14), \"estimated\"");
  t.eq(dates({ ...bi, nextPayDate: "2026-10-30" }), ["2026-10-30", "2026-11-13", "2026-11-27"], "2b every two weeks with an entered next payday: that date, then every 14 days");
  t.eq(dates({ ...bi, freq: "weekly", nextPayDate: "2026-10-28" }, [], 21), ["2026-10-28", "2026-11-04", "2026-11-11"], "2c weekly: the same, every 7 days");
  t.eq(dates({ ...bi, nextPayDate: "2026-10-02" }), ["2026-10-30", "2026-11-13", "2026-11-27"], "2d a date that has passed keeps its phase, a whole cycle at a time");
  t.eq(dates({ ...bi, nextPayDate: "2026-10-23" }), ["2026-11-06", "2026-11-20"], "2e a payday of today is in the balance already: the next is a cycle on");
  t.eq(S.isDepositToday([{ ...bi, nextPayDate: "2026-10-23" }], [], today), true, "2f …and today is payday");
  t.eq(S.isDepositToday([{ ...bi, nextPayDate: "2026-10-30" }], [], today), false, "2g a payday a week away is not today");
  t.eq([S.depositConfidence({ ...bi, nextPayDate: "2026-10-30" }, 2100, []), S.depositConfidence(bi, 2100, [])], ["high", "estimated"], "2h an entered payday is known, not estimated");
  const chain = [-3, -17, -31, -45].map((n) => { const d = new Date(today); d.setDate(d.getDate() + n); return { date: ymd(d), name: "ACME PAYROLL", amount: -2100, category: "INCOME" }; });
  t.eq(dates({ ...bi, nextPayDate: "2026-10-30" }, chain), ["2026-11-03", "2026-11-17", "2026-12-01"], "2i real deposits win over the entered date once there is a chain of them");
  t.eq([S.enteredNextPayDate({ nextPayDate: "2026-02-30" }), S.enteredNextPayDate({ nextPayDate: "soon" }), S.enteredNextPayDate({})], [null, null, null], "2j a date that is not a date is ignored");
  const monthly = { ...bi, freq: "monthly", anchorDay: 15, nextPayDate: "2026-10-30" };
  t.eq(dates(monthly, [], 60), ["2026-11-15", "2026-12-15"], "2k monthly keeps its day-of-month: an entered date does not move it");
  t.eq(dates({ ...bi, freq: "semimonthly", anchorDay: 30 }, [], 40), ["2026-10-30", "2026-11-15", "2026-11-30"], "2l twice a month: the entered date's day (30) and its pair (the 15th), as Settings does");

  // ── 3. the counts, server side ─────────────────────────────────────────────────────────────
  const C = require("../netlify/functions/_lib/onboardingCounts.js");
  t.eq([0, 59999, 60000, 119999, 120000, 179999, 180000, 9e9].map(C.timeBucket), ["under_60", "under_60", "60_120", "60_120", "120_180", "120_180", "over_180", "over_180"], "3a the buckets: under 60 s, 60 to 120, 120 to 180, over 180");
  t.eq([C.timeBucket(-1), C.timeBucket(NaN)], [null, null], "3b no bucket for a negative or missing time");
  const now = new Date("2026-10-23T14:01:30Z");
  t.eq(C.onboardingRows({ metric: "first_number_shown", mode: "manual", fromSigninMs: 70000 }, "2026-10-23T14:00:00Z", now),
    [{ event: "first_number_shown", detail: "manual:signup:60_120" }, { event: "first_number_shown", detail: "manual:signin:60_120" }], "3c the first number: from signup (read by the server) and from first sign-in");
  t.eq(C.onboardingRows({ metric: "first_number_shown", mode: "linked" }, "2026-10-23T13:55:00Z", now), [{ event: "first_number_shown", detail: "linked:signup:over_180" }], "3d without a sign-in time, the signup row alone");
  t.eq(C.onboardingRows({ metric: "first_number_shown", mode: "linked", fromSigninMs: 91 * 86400000 }, "2026-10-23T14:00:00Z", now).length, 1, "3e a sign-in time over 90 days is not a first session's, and is dropped");
  t.eq(C.onboardingRows({ metric: "onboarding_step_completed", detail: "income" }, null, now), [{ event: "onboarding_step_completed", detail: "income" }], "3f a step");
  t.eq(C.BANK_LINK_EVENTS.map((m) => C.onboardingRows({ metric: m }, null, now)[0]), C.BANK_LINK_EVENTS.map((event) => ({ event, detail: "" })), "3g each bank link outcome, with no detail");
  t.eq([C.onboardingRows({ metric: "onboarding_step_completed", detail: "about_you" }, null, now), C.onboardingRows({ metric: "first_number_shown", mode: "guess" }, null, now), C.onboardingRows({ metric: "safe_view" }, null, now)],
    [null, null, null], "3h a step, mode or event outside the fixed lists is refused");

  const fn = await call({ body: { metric: "first_number_shown", mode: "manual", fromSigninMs: 70000, amount: 2100, email: "alex@example.ca", name: "Rent" } });
  t.eq([fn.res.statusCode, fn.rpcs.map((r) => [r.name, r.args])], [204, [
    ["onboarding_bump", { p_cohort_day: "2026-10-23", p_event: "first_number_shown", p_detail: "manual:signup:60_120" }],
    ["onboarding_bump", { p_cohort_day: "2026-10-23", p_event: "first_number_shown", p_detail: "manual:signin:60_120" }]]],
    "3i the handler adds 1 to each row by Toronto signup day, and nothing else from the body reaches the database");
  const step = await call({ body: { metric: "onboarding_step_completed", detail: "bills" } });
  t.eq(step.rpcs.map((r) => [r.name, r.args.p_event, r.args.p_detail]), [["onboarding_bump", "onboarding_step_completed", "bills"]], "3j a step, through the handler");
  const bad = await call({ body: { metric: "onboarding_step_completed", detail: "credit" } });
  t.eq([bad.res.statusCode, bad.rpcs.length], [400, 0], "3k an unknown step is a 400, and nothing is read or written");
  const before = await call({ body: { metric: "bank_link_started" }, rpcError: { message: "function public.onboarding_bump does not exist" } });
  t.eq(before.res.statusCode, 503, "3l before 0028 runs the bump fails and the answer is 503 (the app ignores it)");
  for (const email of ["qa@flourishmoney.app", "snap@flourish.app"]) {
    const r = await call({ body: { metric: "bank_link_completed" }, user: { id: "u2", email, created_at: "2026-10-23T14:00:00Z" } });
    t.eq([r.res.statusCode, r.rpcs.length], [204, 0], `3m ${email}: Flourish's own accounts are never counted`);
  }
  const old = await call({ body: { metric: "safe_view" } });
  t.eq(old.rpcs.map((r) => r.name), ["activation_bump"], "3n the activation metrics are unchanged");

  // ── 4. the counts, app side ────────────────────────────────────────────────────────────────
  const A = await import("../src/lib/onboardingCounts.js");
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const sent = []; const fetchOk = async (url, o) => { sent.push({ url, body: JSON.parse(o.body), auth: o.headers.Authorization }); return { ok: true, status: 204 }; };
  const st = mem();
  const opts = { getSession: async () => ({ userId: "u1", jwt: "jwt" }), storage: st, fetchImpl: fetchOk, apiBase: "https://flourishmoney.app", userId: "u1" };
  A.noteFirstSignin("u1", { storage: st, now: 1000 });
  A.noteFirstSignin("u1", { storage: st, now: 5000 });
  t.eq(A.msSinceFirstSignin("u1", { storage: st, now: 91000 }), 90000, "4a the first sign-in on this device is kept once and never moves");
  t.eq([await A.sendOnboardingCount("onboarding_step_completed", { ...opts, detail: "welcome" }), await A.sendOnboardingCount("onboarding_step_completed", { ...opts, detail: "welcome" }),
    await A.sendOnboardingCount("onboarding_step_completed", { ...opts, detail: "bank" })], [true, false, true], "4b each step once per account");
  t.eq([await A.sendOnboardingCount("bank_link_started", opts), await A.sendOnboardingCount("bank_link_started", opts), await A.sendOnboardingCount("bank_link_cancelled", opts)], [true, true, true], "4c every bank link attempt counts");
  t.eq([await A.sendOnboardingCount("first_number_shown", { ...opts, mode: "linked", now: 61000 }), await A.sendOnboardingCount("first_number_shown", { ...opts, mode: "linked", now: 62000 })], [true, false], "4d the first number once");
  t.eq(sent.map((s) => s.body), [{ metric: "onboarding_step_completed", detail: "welcome" }, { metric: "onboarding_step_completed", detail: "bank" },
    { metric: "bank_link_started" }, { metric: "bank_link_started" }, { metric: "bank_link_cancelled" }, { metric: "first_number_shown", mode: "linked", fromSigninMs: 60000 }],
    "4e the bodies: the event, its step or mode, and the time since sign-in; no amount, name, address or id");
  t.ok(sent.every((s) => s.url === "https://flourishmoney.app/api/activation" && s.auth === "Bearer jwt"), "4f to our own /api/activation, signed in");
  t.eq([await A.sendOnboardingCount("bank_link_started", { ...opts, demo: true }), await A.sendOnboardingCount("bank_link_started", { ...opts, getSession: async () => null }),
    await A.sendOnboardingCount("onboarding_step_completed", { ...opts, detail: "about_you" }), await A.sendOnboardingCount("first_number_shown", { ...opts, mode: "guess", userId: "u9" })],
    [false, false, false, false], "4g never in the demo, never without a session, never outside the fixed lists");
  const st2 = mem();
  t.eq([await A.sendOnboardingCount("onboarding_step_completed", { ...opts, storage: st2, detail: "debts", fetchImpl: async () => ({ ok: false, status: 503 }) }),
    await A.sendOnboardingCount("onboarding_step_completed", { ...opts, storage: st2, detail: "debts" })], [false, true], "4h a refused send (0028 not run yet) is not remembered, so it goes again later");
  t.eq(await A.sendOnboardingCount("bank_link_started", { ...opts, fetchImpl: async () => { throw new Error("offline"); } }), false, "4i offline: no error, nothing changes");

  // ── 5. migration 0028 ──────────────────────────────────────────────────────────────────────
  const files = fs.readdirSync(path.join(ROOT, "supabase", "migrations")).filter((f) => /^\d{4}_/.test(f)).sort();
  t.eq(files.filter((f) => f >= "0028"), ["0028_onboarding_counts.sql", "0029_founding_seats.sql"], "5a 0028 is in place, and only 0029 (the founding seats, 2026-10-29) came after it");
  const sql = read("supabase", "migrations", "0028_onboarding_counts.sql");
  const table = sql.slice(sql.indexOf("create table if not exists public.onboarding_counts"), sql.indexOf("alter table public.onboarding_counts"));
  t.eq([...table.matchAll(/^\s+(\w+)\s+(date|text|integer)\b/gm)].map((m) => m[1]), ["cohort_day", "event", "detail", "count"], "5b four columns: day, event, detail, count; no account id, amount or free text");
  t.ok(/detail in \('welcome', 'bank', 'balance', 'income', 'bills', 'debts'\)/.test(table) && /\^\(manual\|linked\):\(signup\|signin\):\(under_60\|60_120\|120_180\|over_180\)\$/.test(table)
    && /'bank_link_cancelled'\) and detail = ''/.test(table), "5c the database itself refuses any step, mode or bucket outside the fixed lists");
  t.ok(/enable row level security/.test(sql) && /revoke all on table public\.onboarding_counts from anon, authenticated;/.test(sql) && /-- grants: service_role only/.test(sql), "5d RLS on; the Data API roles cannot read or write it");
  t.ok(/revoke all on function public\.onboarding_bump\(date, text, text\) from public, anon, authenticated;/.test(sql) && /revoke all on function public\.onboarding_counts_report\(date, date\) from public, anon, authenticated;/.test(sql),
    "5e …nor call either function");
  t.ok(/NOT APPLIED/.test(sql) && /UNTIL THIS IS APPLIED, nothing is counted/.test(sql) && /-- drop table if exists public\.onboarding_counts;/.test(sql), "5f marked not applied, safe before it runs, with a rollback");
  t.ok(!/security definer/i.test(sql), "5g no security definer function");

  // ── 6. the screens' source ─────────────────────────────────────────────────────────────────
  const app = read("src", "App.jsx");
  const ob = app.slice(app.indexOf("function Onboarding({"), app.indexOf("\nfunction ", app.indexOf("function Onboarding({") + 30));
  t.ok(ob.includes(`>${W1}</label>`) && ob.includes(W1_HELP), "6a W1 and its helper on the paycheque screen");
  t.ok(/const PAYDAY_FREQS = \["weekly", ?"biweekly", ?"semimonthly"\]/.test(ob.replace(/\s+/g, " ").replace(/" ,/g, "\",")) || /PAYDAY_FREQS\s*=\s*\[\s*"weekly"\s*,\s*"biweekly"\s*,\s*"semimonthly"\s*\]/.test(ob),
    "6b …for weekly, every two weeks and twice a month");
  t.ok(/onClick=\{\(\)=>done\("income",3\)\} disabled=\{[^}]*\|\| incomes\.some\(payDateMissing\)\}/.test(ob), "6c Continue waits for it");
  t.ok(!/About you/.test(ob) && !/Your credit score|credit-score/i.test(ob.replace(/\/\/[^\n]*|\{\/\*[\s\S]*?\*\/\}/g, "")), "6d no About you screen and no credit-score screen in onboarding");
  t.ok(/sourceTypes:\["employment"\]/.test(ob) && /data-income-type-toggle/.test(ob) && /aria-expanded=/.test(ob), "6e Employment by default; the type grid collapsed behind a toggle");
  t.ok(ob.includes(W4) && /label="Try again"/.test(ob) && /label="Enter it myself" onClick=\{\(\)=>\{ setBankOutcome\(null\); skipBank\(\); \}\}/.test(ob), "6f W4 with \"Try again\" and \"Enter it myself\"");
  const code = ob.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  t.ok(!/\bReady\b/.test(code), "6g the bank button never says \"Ready\" (outside comments, the word is not in onboarding at all)");
  t.ok(/usePlaidLinkSDK\(linkToken, ?onPlaidSuccess, ?onPlaidExit\)/.test(ob) && /onExitRef\.current\(err \|\| null, meta\)/.test(app), "6h Plaid's exit (cancel or error) reaches onboarding");
  t.ok(/detectIncomeFromTxns\(incomeEvidence\(/.test(ob) && /detectRecurringBills\(/.test(ob) && /autoDetected:true/.test(ob), "6i a linked bank pre-fills pay and bills from the existing detection");
  t.ok(/!findAnchor\(inc, ?num\(inc\.amount\), ?bankTxns\)/.test(ob), "6j W1 is asked only when the deposits do not show payday");
  t.ok(app.includes(W3) && !app.includes("Estimate · Based on your setup") && !/overspending by/.test(app), "6k W3; the estimate card and its overspending line are gone");
  t.ok(!app.includes("You're covered. Here's your breathing room.") && /FIRST_NUMBER_HEADLINE/.test(app) && /firstNumberGreeting\(data\.profile\?\.name\)/.test(app), "6l W6 and W5 on the first-number screen");
  t.ok(read("src", "lib", "decisionEngine.js").includes(`"${W7}"`) && !read("src", "lib", "decisionEngine.js").includes("Bills covered"), "6m W7 on Today");
  t.ok(/!tourActive&&showSetupChecklist\(/.test(app) && /tourActive=\{tourShown\}/.test(app), "6n \"Getting set up\" waits for the tour to end");
  t.ok(/if\(!data\?\.demo && !tourActive\) signalActivation\("meeting_opened"/.test(app), "6o the tour's Meet step is not a meeting opened");
  t.ok(/signalOnboarding\("first_number_shown",\{mode:appData\.bankConnected\?"linked":"manual"/.test(app), "6p first_number_shown by mode");
  t.ok(/function confirmedFromApp\(user\)\{ return !!\(user && user\.user_metadata && user\.user_metadata\.signup_platform === "app"\); \}/.test(app), "6q the confirmation link: an app signup keeps \"Open Flourish and sign in.\"");
  t.ok(/signup_platform: isNativeRequest\(event\) \? "app" : "web"/.test(read("netlify", "functions", "beta.js")), "6r the signup is labelled by where it was made");
  // The Welcome screen stays: its consent line covers more than the signup card's.
  t.ok(/consent to data processing per PIPEDA \(CA\) and US privacy laws\./.test(ob) && /onClick=\{\(\)=>done\("welcome",1\)\}/.test(ob) && ob.includes("Get Started →"), "6s the Welcome screen and its data-processing consent stay (the signup card's consent covers Terms and Privacy only)");

  // ── 7. the device's country ────────────────────────────────────────────────────────────────
  const D = await import("../src/lib/deviceCountry.js");
  t.eq(["en-US", "en-CA", "fr-CA", "en", "zh-Hant-TW", "en_US", "es-419", "", null].map(D.regionOf), ["US", "CA", "CA", null, "TW", "US", "419", null, null], "7a the region of a language tag");
  t.eq(["America/New_York", "America/Los_Angeles", "America/Phoenix", "Pacific/Honolulu", "America/Indiana/Indianapolis", "US/Eastern", "America/Toronto", "America/Vancouver", "America/Edmonton", "America/Halifax", "Europe/Paris", "UTC", ""].map(D.isUsTimeZone),
    [true, true, true, true, true, true, false, false, false, false, false, false, false], "7b US time zones, and Canadian and other ones");
  t.eq(["America/Toronto", "America/Montreal", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Regina", "America/Halifax", "America/St_Johns", "America/Whitehorse", "America/Iqaluit", "Canada/Eastern", "America/New_York", "America/Detroit", "Europe/London", ""].map(D.isCanadianTimeZone),
    [true, true, true, true, true, true, true, true, true, true, true, false, false, false, false], "7b2 Canadian time zones (the provinces, the territories, the old Canada/* names), and not US or other ones");
  const dc = (languages, timeZone) => D.deviceCountry({ languages, timeZone });
  t.eq([dc(["en-CA"], "America/Toronto"), dc(["fr-CA", "en-US"], "America/Montreal"), dc(["en"], "America/Vancouver"), dc(["fr-FR"], "Europe/Paris"), dc([], "UTC"), dc([null, ""], null)],
    ["CA", "CA", "CA", "CA", "CA", "CA"], "7c a Canadian (or any non-US) region and time zone: Canada; the first language that names a region decides");
  t.eq([dc(["en-US"], "America/New_York"), dc(["en-US"], "Europe/London"), dc(["es-MX", "en"], "America/Chicago"), dc(["en"], "America/Denver")], ["US", "US", "US", "US"], "7d a US region, or a US time zone: the United States");
  t.eq([dc(["en-US"], "America/Toronto"), dc(["en-US"], "America/Vancouver"), dc(["en-US", "en"], "Canada/Pacific")], ["CA", "CA", "CA"],
    "7e a Canadian time zone wins over a US language region (desktop browsers in Canada often report en-US)");
  t.eq([dc(["en-CA"], "America/New_York"), dc(["fr-CA"], "America/Chicago")], ["US", "US"], "7e2 …and a US time zone is the US whatever the language");
  t.eq(dc(["en", "en-CA"], "America/Toronto"), "CA", "7f a language with no region is passed over for the next one that has one");
  t.ok(/const \[p,setP\]=useState\(\(\)=>\{ const country=deviceCountry\(\); return \{name:"",country,province:"",partnerName:""/.test(ob),
    "7g onboarding starts from the device's country, with the province, status and kids left unset");
  t.ok(/callPlaid\("create_link_token",\{country:p\.country,/.test(ob), "7h …and that country is what Plaid's institution search is asked for");
  t.ok(/<select aria-label="Country" defaultValue=\{data\.profile\?\.country\|\|"CA"\}/.test(app), "7i Settings still changes it");

  // ── 8. province, status and kids unset ─────────────────────────────────────────────────────
  const { loadApp, textOf } = require("./_renderApp.cjs");
  let R = {};
  try { R = loadApp(["getPersonalizedTaxCredits", "Paywall", "Goals", "CC"]); } catch (e) { t.ok(false, `App.jsx bundles: ${e && e.message}`); }
  const PROVINCIAL = /Ontario|Trillium|Quebec|Alberta|Saskatchewan|Atlantic|Manitoba|British Columbia|New York|Illinois|Minnesota|NYC/;
  const CHILD = /Child Benefit|CCB|Child Tax Credit|Child Care|Childcare|RESP|Dependent Care|WIC/i;
  const tipsOf = (profile) => R.getPersonalizedTaxCredits(profile).map((x) => `${x.title} ${x.body}`).join("\n");
  for (const country of ["CA", "US"]) {
    const unset = tipsOf({ country, province: "", lifeStages: [country === "US" ? "w2" : "t4"] });
    t.ok(unset.length > 0 && !PROVINCIAL.test(unset), `8a ${country}, province unset: federal tax tips only, none for any province or state`);
    t.ok(!CHILD.test(unset), `8b ${country}, kids unset: no child-benefit tip`);
  }
  const split = (status) => /Spousal Income Splitting/.test(tipsOf({ country: "CA", province: "", status, lifeStages: ["t4"], partnerLifeStages: ["selfemployed"] }));
  t.eq([split(undefined), split("single"), split("couple")], [false, false, true], "8c status unset: no couple tip (it shows for a couple, as today)");
  t.ok(/Trillium/.test(tipsOf({ country: "CA", province: "ON", lifeStages: ["t4"] })) && /Solidarity/.test(tipsOf({ country: "CA", province: "QC", lifeStages: ["t4"] })),
    "8d once a province is set, its own tips come back, as today");
  t.ok(/Canada Child Benefit/.test(tipsOf({ country: "CA", province: "", hasKids: true, lifeStages: ["t4"] })), "8e once kids are set, the child benefits come back");
  const renderText = (el) => { try { return textOf(R.render(el)); } catch (e) { return `RENDER FAILED ${e && e.message}`; } };
  const noop = () => {};
  const goalsData = (profile) => ({ profile, incomes: [], bills: [], debts: [], accounts: [], transactions: [], goals: [] });
  const benefitsText = (profile) => renderText(R.h(R.Goals, { data: goalsData(profile), initialTab: "tax", onUpgrade: noop, setScreen: noop, setAppData: noop }));
  const caUnset = benefitsText({ country: "CA", province: "", lifeStages: ["t4"] });
  t.ok(/Canada Workers Benefit/.test(caUnset) && !/Trillium/.test(caUnset) && !/Canada Child Benefit/.test(caUnset), `8f Goals > Tax with nothing set: the federal benefits, no Ontario Trillium Benefit, no Canada Child Benefit (${caUnset.slice(0, 60)}…)`);
  const caSet = benefitsText({ country: "CA", province: "ON", hasKids: true, lifeStages: ["t4"] });
  t.ok(/Trillium/.test(caSet) && /Canada Child Benefit/.test(caSet), "8g …and with Ontario and kids set in Settings, both are listed, as today");
  const usUnset = benefitsText({ country: "US", province: "", lifeStages: ["w2"] });
  t.ok(/Earned Income Tax Credit/.test(usUnset) && !/Child Tax Credit/.test(usUnset) && !/WIC Program/.test(usUnset), "8h US with nothing set: no Child Tax Credit or WIC entry");
  const paywall = (province) => renderText(R.h(R.Paywall, { onClose: noop, onPromoValid: noop, country: "CA", province }));
  t.ok(!/Trillium/.test(paywall("")) && /CCB, Canada Groceries and Essentials Benefit, RRSP, TFSA, FHSA/.test(paywall("")) && /Trillium, RRSP/.test(paywall("ON")), "8i the paywall names Trillium only to Ontario");
  t.ok(/const isCouple=data\.profile\?\.status==="couple"\|\|data\.profile\?\.status==="cohabit";/.test(app) && /\{\(data\.profile\?\.status==="couple"\|\|data\.profile\?\.status==="cohabit"\) && \(/.test(app),
    "8k unset status is not a couple: Meet and the partner-name field in Family Settings");
  t.ok(/const province  = profile\?\.province  \|\| "";/.test(app) && /const defaultProvince = "";/.test(app) && /value=\{data\.profile\?\.province\|\|""\}/.test(app) && /\{!data\.profile\?\.province&&<option value="" disabled><\/option>\}/.test(app),
    "8l no Ontario fallback in the tax engine; a country change in Settings leaves the province to pick; the picker shows none picked");
  t.ok(/- Province \$\{prov\|\|"unknown"\}\$\{prov\?/.test(app) && /- State \$\{prov\|\|"unknown"\}\$\{prov\?/.test(app), "8m the coach is told the province or state is unknown, with no provincial or state tax claim");

  // ── 9. the tour's Today step ───────────────────────────────────────────────────────────────
  const T = await import("../src/lib/tour.js");
  const all = ss({ upcomingBills: 1400, debtPayments: 90, safetyBuf: 120, savingsAlloc: 300 });
  t.eq(T.todayStepBody(all), T.TOUR_STEPS[0].body, "9a with all four parts, the step reads as before, word for word");
  t.eq(T.todayStepBody(ss({ upcomingBills: 1400, savingsAlloc: 76 })),
    "Your number. What's safe to spend until payday, after bills due before payday and a savings amount are accounted for. Tap it to see the math.", "9b only the parts in the number");
  t.eq([T.todayStepBody(ss({ savingsAlloc: 76 })), T.todayStepBody(ss({}))], ["Your number. What's safe to spend until payday. Tap it to see the math.", "Your number. What's safe to spend until payday. Tap it to see the math."],
    "9c the same rule as the first number when there is no plural form: no clause");
  for (const parts of [{ upcomingBills: 1 }, { debtPayments: 1, safetyBuf: 1 }, { safetyBuf: 1, savingsAlloc: 1 }, all]) {
    const clause = F.accountedForClause(ss(parts));
    t.ok(T.todayStepBody(ss(parts)).includes(clause) && F.firstNumberSentence(ss(parts)).toLowerCase() === `${clause}.`.toLowerCase(), `9d the tour and the first number name the same parts (${Object.keys(parts).join(", ")})`);
  }
  t.eq([T.stepBody(T.TOUR_STEPS[1], all), T.stepBody(T.TOUR_STEPS[4], null)], [T.TOUR_STEPS[1].body, T.TOUR_STEPS[4].body], "9e the other steps are unchanged");
  t.ok(/\{stepBody\(step, step\.target==="today"&&dataWithHousehold \? SafeSpendEngine\.calculate\(dataWithHousehold\) : null\)\}/.test(app), "9f the tour renders the step from this household's number");

  t.summary("onboardingFirstNumber.test");
})();
