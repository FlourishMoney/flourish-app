// tests/demoFixtureUS.test.cjs
// -----------------------------------------------------------------------------
// The landing page's Canada / United States toggle used to tag the waitlist row and nothing else: a
// visitor who picked "United States" and opened the preview saw chequing accounts, a Visa card, the
// Canada Child Benefit and the Ontario Trillium Benefit. Three things are pinned here.
//
// 1. THE US FIXTURE IS PHASE-STABLE, to the same standard as the Canadian one. Twelve dates spread
//    across a month, both month ends, a 28-day February, a leap February and a year boundary must all
//    produce ONE signature, or a screenshot is not reproducible and the demo is a different app
//    depending on the day.
//
// 2. IT IS A DIFFERENT HOUSEHOLD, not the Canadian one with the words swapped. Different balance,
//    different pay, different spending, a different debt shape — and no Canadian artefact anywhere
//    in it (nor any American one in the Canadian fixture).
//
// 3. THE TOGGLE ACTUALLY SELECTS IT. The wiring from the landing-page control through to
//    buildDemoState is scanned in App.jsx, so a future refactor cannot quietly send US visitors back
//    to Canadian data while every unit test still passes.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { suggestedDailyView } = await import("../src/lib/suggestedDaily.js");
  const { nextFutureDeposit, daysToNextFutureDeposit } = await import("../src/lib/incomeSchedule.js");
  const { todayKnowItem } = await import("../src/lib/todayPriorities.js");
  const { FinancialCalcEngine } = await import("../src/lib/financialCalculations.js");
  const F = await import("../src/lib/demoFixture.js");
  const t = create();

  const snapFor = (d, cc) => ({
    profile: F.demoProfileFor(cc), accounts: F.demoAccountsFor(cc), debts: F.demoDebtsFor(cc),
    incomes: F.buildDemoIncomes(d, cc), bills: F.buildDemoBills(d, cc),
    transactions: F.buildDemoTxns(d, cc), bankConnected: true, demo: true,
  });
  const sigFor = (d, cc) => {
    const snap = snapFor(d, cc);
    const ss = SafeSpendEngine.calculate(snap, d);
    const v = safeToSpendView(ss);
    const p = suggestedDailyView(v.headline, snap.incomes, snap.transactions, d);
    const nd = nextFutureDeposit(snap.incomes, snap.transactions, d);
    const days = daysToNextFutureDeposit(snap.incomes, snap.transactions, d);
    return [v.headlineText, p.dailyText, nd && nd.amount, nd && nd.sourceLabel, days,
            ss.upcomingBills, ss.safetyBuf, ss.savingsAlloc, v.balanceText].join("|");
  };

  // Mid-month, two month ends (30- and 31-day), two month starts, a 28-day February and its end, a
  // leap February, and both sides of a year boundary.
  const DATES = ["2026-09-16", "2026-09-22", "2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01",
                 "2026-02-01", "2026-02-27", "2026-02-28", "2028-02-29", "2026-12-31", "2027-01-01"];
  t.eq(DATES.length, 12, "0a the stability check spans twelve dates");

  // ── 1. Phase stability ─────────────────────────────────────────────────────────────────────────
  const usSigs = new Set(DATES.map(s => sigFor(new Date(`${s}T12:00:00`), "US")));
  t.eq(usSigs.size, 1, `1a the US fixture yields IDENTICAL figures on all ${DATES.length} dates`);
  t.eq([...usSigs][0], "$2,415|$172|2465|Full-time Job|13|142|565|250|$3,672",
    "1b …and that signature is the published US demo: $2,415 safe, $172/day, a $2,465 paycheck 13 days out, $3,672 balance, $142 of committed bills");

  // The Canadian one must be unaffected by the refactor that made the fixture country-keyed.
  const caSigs = new Set(DATES.map(s => sigFor(new Date(`${s}T12:00:00`), "CA")));
  t.eq(caSigs.size, 1, "1c the CA fixture is still stable across the same twelve dates");
  t.eq([...caSigs][0], "$1,944|$138|2840|Full-time Job|13|65|435|291|$3,083",
    "1d …and its published signature is UNCHANGED by the country-keying");

  // ── 2. The five-row breakdown, and a populated "one thing to know" ────────────────────────────
  {
    const d = new Date("2026-09-16T12:00:00");
    const snap = snapFor(d, "US");
    const ss = SafeSpendEngine.calculate(snap, d);
    const v = safeToSpendView(ss);
    t.eq(v.rows.length, 5, "2a the US breakdown has five rows (balance + four deductions), not a bare balance");
    t.eq(v.rows.map(r => r.value).join(" "), "$3,672 $142 $300 $565 $250",
      "2b …the exact displayed rows: $3,672 balance, $142 bills, $300 debt minimums, $565 buffer, $250 savings");
    t.eq(v.headlineText, "$2,415", "2c …and the headline they reconcile to");
    const rowSum = v.rows.reduce((s, r) => s + (r.kind === "balance" ? r.display : -r.display), 0);
    t.eq(rowSum, v.headline, "2d …the five displayed rows sum EXACTLY to the displayed headline");
    t.eq(ss.soonBills.length, 1, "2e exactly one bill sits inside the reservation window");
    t.eq(ss.soonBills[0].name, "Electric", "2f …and it is Electric — a US utility, not 'Hydro'");
    t.ok(!!todayKnowItem({ overdraftImmediate: null, sevenDayOverdraft: null, nextBill: ss.soonBills[0] }),
      "2g …so Today's \"one thing to know\" line has something to say");
    t.eq(ss.baseCurrency, "USD", "2h the US demo is priced in USD");
    t.eq(SafeSpendEngine.calculate(snapFor(d, "CA"), d).baseCurrency, "CAD", "2i …and the CA demo in CAD");
    t.eq(ss.excludedForeignCash, 0, "2j no US cash is excluded as foreign — every account carries an explicit currency");
  }

  // ── 3. A different household, not a relabelled copy ───────────────────────────────────────────
  {
    const d = new Date("2026-09-16T12:00:00");
    const ca = snapFor(d, "CA"), us = snapFor(d, "US");
    const cash = s => s.accounts.filter(a => a.type === "checking" || a.type === "savings").reduce((n, a) => n + a.balance, 0);
    t.ok(cash(ca) !== cash(us), "3a the two households hold different amounts of cash");
    t.ok(ca.incomes[0].amount !== us.incomes[0].amount, "3b …are paid different amounts");
    t.ok(FinancialCalcEngine.avgDailySpend(ca, d) !== FinancialCalcEngine.avgDailySpend(us, d), "3c …and spend differently");
    t.ok([...caSigs][0] !== [...usSigs][0], "3d …so every derived figure differs too");
    t.eq(us.debts.map(x => x.name).join(", "), "Chase Sapphire, Federal Student Loan",
      "3e the US debt shape is American — a federal student loan, not a car loan");
    t.eq(us.incomes[1].type, "gig", "3f the US second income is gig work, NOT an invented US child benefit (there is no monthly federal one)");
    t.eq(us.profile.lifeStages.join(","), "w2", "3g …and the life stage is w2, the code getPersonalizedTaxCredits and the coach prompt read");
    t.eq(ca.profile.lifeStages.join(","), "t4", "3h …where Canada stays t4");

    const blob = s => JSON.stringify(s);
    const CANADIANISMS = /chequing|cheque|paycheque|TFSA|RRSP|FHSA|RESP|Canada|Canadian|CCB|Trillium|CRA|GST|HST|Loblaws|Tim Hortons|LCBO|Hydro One|Rexall|Bell Canada|Questrade|CAD/i;
    const AMERICANISMS = /401\(k\)|Roth IRA|Chase|Fidelity|Kroger|Walgreens|Chevron|Duke Energy|Verizon|Trader Joe|USD/i;
    t.eq((blob(us).match(CANADIANISMS) || [""])[0], "", "3i NOTHING Canadian survives anywhere in the US fixture");
    t.eq((blob(ca).match(AMERICANISMS) || [""])[0], "", "3j …and nothing American leaks into the Canadian one");
  }

  // ── 4. Fixture selection is safe by construction ──────────────────────────────────────────────
  t.eq(F.demoFixtureFor("US").country, "US", "4a 'US' selects the US fixture");
  t.eq(F.demoFixtureFor("us").country, "US", "4b …case-insensitively");
  t.eq(F.demoFixtureFor(" US ").country, "US", "4c …tolerating whitespace");
  t.eq(F.demoFixtureFor("CA").country, "CA", "4d 'CA' selects the Canadian fixture");
  t.eq(F.demoFixtureFor(undefined).country, "CA", "4e an absent country falls back to CA, the app's own default profile country");
  t.eq(F.demoFixtureFor("ZZ").country, "CA", "4f …and so does an unknown one — never silently to the US, whose tax rules differ");
  t.eq(F.DEMO_COUNTRIES.join(","), "CA,US", "4g the fixture table advertises exactly the countries it has");
  t.eq(F.buildDemoIncomes(new Date("2026-09-16T12:00:00")).length, 2, "4h the builders still default to CA for existing callers");

  // Every payroll row must pay the fixture's OWN declared income, or findAnchor stops matching and the
  // demo silently drops onto forecastEngine's fallback path (truth-fix item 8's original defect).
  for (const cc of ["CA", "US"]) {
    const d = new Date("2026-09-16T12:00:00");
    const snap = snapFor(d, cc);
    const pays = snap.transactions.filter(x => x.name === "Payroll Deposit").map(x => -x.amount);
    t.eq(pays.length, 3, `4i-${cc} three payroll deposits anchor the biweekly cadence`);
    t.eq([...new Set(pays)].join(","), String(Number(snap.incomes[0].amount)),
      `4j-${cc} …and every one pays exactly the declared income, so the ANCHOR path is exercised`);
  }

  // ── 5. THE TOGGLE IS WIRED. A source scan, because buildDemoState lives in App.jsx. ────────────
  // Without this, every assertion above could keep passing while the landing page quietly handed
  // every visitor the Canadian household again.
  {
    const fs = require("fs"), path = require("path");
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    t.ok(/function buildDemoState\(country = "CA"\)/.test(app),
      "5a buildDemoState takes a country");
    t.ok(/demoProfileFor\(cc\)/.test(app) && /demoAccountsFor\(cc\)/.test(app) && /demoDebtsFor\(cc\)/.test(app),
      "5b …and builds the profile, accounts and debts from the selected fixture, not from a hard-coded Canadian literal");
    t.ok(/buildDemoIncomes\(new Date\(\), cc\)/.test(app) && /buildDemoBills\(new Date\(\), cc\)/.test(app) && /buildDemoTxns\(new Date\(\), cc\)/.test(app),
      "5c …and passes the country to every builder");
    t.eq((app.match(/MOCK_ACCOUNTS(_US)?\s*=/g) || []).join(","), "",
      "5d the old hard-coded account arrays are gone — including the unreferenced MOCK_ACCOUNTS_US, which was the Canadian balances under American names");
    t.ok(/onTryDemo\(waitlistCountry\)/.test(app),
      "5e the landing page's demo button passes the CHOSEN country, not nothing");
    t.eq((app.match(/onTryDemo\(waitlistCountry\)/g) || []).length, 2,
      "5f …at both of its demo entry points (web and the iOS shell)");
    t.ok(/onTryDemo=\{\(country\)=>\{ const dd=buildDemoState\(country\);/.test(app),
      "5g and the handler feeds that country straight into buildDemoState");
    t.ok(/onComplete\(buildDemoState\(p\.country\)\)/.test(app),
      "5h onboarding's Try Demo uses the country the user just picked in that flow");
    t.ok(/buildDemoState\(appData\?\.profile\?\.country\)/.test(app),
      "5i and a signed-in user's empty-dashboard CTA uses their own profile country");
    // The guard must not be able to pass vacuously: if nobody calls buildDemoState with an argument,
    // every check above is inspecting text that no longer exists.
    t.ok((app.match(/buildDemoState\([^)]/g) || []).length >= 3,
      "5j …at least three call sites actually pass a country");
  }

  t.summary("demoFixtureUS.test");
})();
