// tests/forecastNaN.test.cjs
// -----------------------------------------------------------------------------
// Non-numeric input handling in the forecast path.
//
// The defect: `parseFloat(x || 0)` is a FALSE safeguard. `x || 0` catches null/undefined/"" but a
// string like "$1,200" still yields NaN, and because EVERY comparison against NaN is false, the
// resulting `running < 0` overdraft check silently reported "safe" — the engine claimed confidence
// exactly when it had none.
//
// Two properties are pinned:
//   (a) coercion — a bad value can never become NaN in a displayed figure or a boolean;
//   (b) signal   — the caller is TOLD the projection is unreliable, and `willGoNegative` never
//                  answers "safe" when the answer is actually unknown.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { parseMoney, num } = await import("../src/lib/financialCalculations.js");
  const { planNotifications } = await import("../src/lib/notificationPlanner.js");
  const t = create();

  const chq = (balance) => ([{ id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance }]);
  const allFinite = (fc) => fc.every(d => Number.isFinite(d.balance) && Number.isFinite(d.income) && Number.isFinite(d.expenses));

  // ── The parser itself ──────────────────────────────────────────────────────────────────────────
  t.eq(num(1200), 1200, "a plain number passes through");
  t.eq(num("1200"), 1200, "a numeric string parses");
  t.eq(num("$1,200"), 1200, "a currency string WITH symbol and separator parses — this is the exact " +
                            "shape that silently became NaN under parseFloat()");
  t.eq(num("$1,200.50"), 1200.5, "currency string with decimals parses");
  t.eq(num(" 1200 "), 1200, "surrounding whitespace is tolerated");
  t.eq(num("-45.20"), -45.2, "negative amounts parse");
  t.eq(num(null), 0, "null is legitimately zero");
  t.eq(num(undefined), 0, "undefined is legitimately zero");
  t.eq(num(""), 0, "empty string is legitimately zero");
  t.eq(num("abc"), 0, "non-numeric text coerces to the fallback rather than NaN");
  t.eq(num(NaN), 0, "an actual NaN number coerces to the fallback");
  t.eq(num("12abc"), 0, "a partly-numeric string does NOT silently truncate to 12 — half a number is " +
                        "its own kind of lie, so it is treated as unparseable");

  t.eq(parseMoney("$1,200").ok, true, "a parseable currency string reports ok:true — NOT a data issue");
  t.eq(parseMoney("").ok, true, "absent/empty is ok:true — legitimately zero, not corrupt");
  t.eq(parseMoney(null).ok, true, "null is ok:true");
  t.eq(parseMoney("abc").ok, false, "unparseable text reports ok:false so callers can signal");
  t.eq(parseMoney(NaN).ok, false, "NaN reports ok:false");

  // ── Baseline: clean data still projects, and says so ───────────────────────────────────────────
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const data = {
      accounts: chq(2000),
      incomes: [{ id: 1, label: "Job", amount: "1500", freq: "biweekly" }],
      bills: [{ name: "Rent", amount: "900", date: "15", freq: "monthly", type: "fixed" }],
      debts: [], transactions: [],
    };
    const r = ForecastEngine.generate(data, 30, null, today);
    t.eq(r.canProject, true, "baseline: clean data projects normally");
    t.eq(r.dataIssues.length, 0, "baseline: no data issues reported");
    t.eq(r.willGoNegative, false, "baseline: a genuinely safe forecast still reports false, not null");
    t.ok(allFinite(r.forecast), "baseline: every projected figure is finite");
  }

  // ── "$1,200" must PARSE, not be flagged ────────────────────────────────────────────────────────
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const data = {
      accounts: chq(5000),
      incomes: [{ id: 1, label: "Job", amount: "$1,200", freq: "biweekly" }],
      bills: [{ name: "Rent", amount: "$1,500", date: "15", freq: "monthly", type: "fixed" }],
      debts: [], transactions: [],
    };
    const r = ForecastEngine.generate(data, 30, null, today);
    t.eq(r.canProject, true, "a currency-formatted amount is VALID input and must not trip the warning");
    t.eq(r.dataIssues.length, 0, "…and reports no data issues");
    t.eq(r.forecast[14].income, 1200, "\"$1,200\" is read as 1200 in the projection");
    t.eq(r.forecast[5].expenses, 1500, "\"$1,500\" is read as 1500 for the bill on the 15th");
  }

  // ── (a) NaN INCOME ─────────────────────────────────────────────────────────────────────────────
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const data = {
      accounts: chq(2000),
      incomes: [{ id: 1, label: "Broken Job", amount: "not a number", freq: "biweekly" }],
      bills: [], debts: [], transactions: [],
    };
    const r = ForecastEngine.generate(data, 30, null, today);
    t.ok(allFinite(r.forecast), "NaN income never produces a NaN balance anywhere in the horizon");
    t.eq(r.canProject, false, "NaN income marks the projection as unusable");
    t.ok(r.dataIssues.some(i => /income/.test(i.field)), "…and names the income field as the culprit");
    t.eq(r.willGoNegative, null,
         "willGoNegative is NULL, not false — the user's safety is UNKNOWN, and unknown must never " +
         "be reported as safe. This is the assertion that matters most in this file.");
    t.ok(r.willGoNegative !== false,
         "explicitly: a caller checking `willGoNegative === false` to claim safety gets no such claim");
  }

  // ── (a) NaN BALANCE ────────────────────────────────────────────────────────────────────────────
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const data = {
      accounts: [{ id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance: "oops" }],
      incomes: [{ id: 1, label: "Job", amount: "1500", freq: "biweekly" }],
      bills: [], debts: [], transactions: [],
    };
    const r = ForecastEngine.generate(data, 30, null, today);
    t.ok(allFinite(r.forecast), "a corrupt account balance never yields NaN balances");
    t.eq(r.canProject, false,
         "a corrupt balance is caught by the FORECAST, even though SafeSpendEngine now coerces it to a " +
         "clean 0 upstream — each input is validated where it enters, not where it is sanitised");
    t.ok(r.dataIssues.some(i => /balance/.test(i.field)), "…and names the balance field");
    t.eq(r.willGoNegative, null, "…and refuses to answer the overdraft question");
  }

  // ── (a) NaN BILL AMOUNT — the original reported defect ─────────────────────────────────────────
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const data = {
      accounts: chq(1000),
      incomes: [],
      bills: [{ name: "Rent", amount: "twelve hundred", date: "15", freq: "monthly", type: "fixed" }],
      debts: [], transactions: [],
    };
    const r = ForecastEngine.generate(data, 60, null, today);
    t.ok(allFinite(r.forecast),
         "one unparseable bill amount no longer poisons every subsequent day — `running` is cumulative, " +
         "so a single NaN used to turn the entire remaining horizon into NaN");
    t.eq(r.canProject, false, "the bad bill amount is surfaced");
    t.ok(r.dataIssues.some(i => /bill/.test(i.field)), "…named as a bill field");
    t.eq(r.willGoNegative, null,
         "and critically the overdraft alarm does NOT report false. Under the old code `running < 0` " +
         "was false for NaN, so willGoNegative came back false — 'you're fine' from an engine that had " +
         "no idea what the numbers were.");
    t.eq(r.dataIssues.filter(i => /bill/.test(i.field)).length, 1,
         "a recurring bad bill is reported ONCE, not once per occurrence across the horizon");
  }

  // ── (b) THE SIGNAL REACHES THE CALLER ──────────────────────────────────────────────────────────
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const bad = {
      accounts: chq(50),
      incomes: [{ id: 1, label: "Job", amount: "??", freq: "biweekly" }],
      bills: [{ name: "Rent", amount: "1200", date: "12", freq: "monthly", type: "fixed" }],
      debts: [], transactions: [],
      profile: { notifications: { lowBalance: true } },
    };
    const r = ForecastEngine.generate(bad, 7, null, today);
    t.eq(r.canProject, false, "the caller receives canProject:false as an explicit, checkable field");
    t.ok(Array.isArray(r.dataIssues) && r.dataIssues.length > 0,
         "…alongside dataIssues describing WHICH fields are unreadable, so the UI can name them");
    t.ok(typeof r.dataIssues[0].field === "string" && "value" in r.dataIssues[0],
         "each issue carries {field, value} so the message can be specific rather than generic");

    // The notification planner must decline to assert a low-balance warning it cannot stand behind.
    const plans = planNotifications(bad, today);
    t.eq(plans.filter(p => p.type === "lowBalance").length, 0,
         "no lowBalance notification is scheduled from unprojectable data — a push notification is " +
         "asserted with full confidence and cannot be hedged the way an on-screen banner can");
  }

  // ── Multiple issues are all collected, and deduplicated ────────────────────────────────────────
  {
    const today = new Date(2026, 2, 10, 12, 0, 0);
    const data = {
      accounts: chq("bad"),
      incomes: [{ id: 1, label: "A", amount: "nope", freq: "biweekly" }],
      bills: [{ name: "Rent", amount: "??", date: "15", freq: "monthly", type: "fixed" }],
      debts: [], transactions: [],
    };
    const r = ForecastEngine.generate(data, 30, null, today);
    t.eq(r.canProject, false, "several corrupt inputs still mark the projection unusable");
    t.ok(r.dataIssues.length >= 3, "every distinct bad field is reported, not just the first");
    const keys = r.dataIssues.map(i => i.field + "|" + i.value);
    t.eq(keys.length, new Set(keys).size, "issues are deduplicated — no field is listed twice");
  }

  t.summary("forecastNaN.test");
})();
