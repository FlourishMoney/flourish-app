// tests/firstVisitSetup.test.cjs
// -----------------------------------------------------------------------------
// A BRAND-NEW ACCOUNT MUST NOT BE TOLD IT IS SHORT.
//
// Seen on 2026-09-26: a new account with no bank linked and no income entered showed
// "Safe until next payday: -$506" on the first screen it ever rendered — because the balance was
// $0 and a savings allocation of $506 already existed from onboarding. 0 − 506 is arithmetic, not
// a finding about anyone's money, and as a first impression it reads as an accusation.
//
// The rule: never a negative safe-to-spend that comes only from missing data. A REAL shortfall —
// someone with money who has over-committed it — must still show, because that is the number they
// need.
//
// The test is the BALANCE. Safe-to-spend is balance minus commitments, and the balance comes from
// cash accounts and nowhere else, so with no cash account it is $0 by absence rather than by fact.
// This file first asked for BOTH signals to be missing, which let the reported case straight
// through: the $506 is a savings allocation, and a savings allocation can only exist if income was
// entered, so the very household that was reported had hasIncome true and kept its negative. That
// assertion is now the opposite one, and section 3 pins the case it used to miss.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const brandNew = { balance: 0, upcomingBills: 0, debtPayments: 0, safetyBuf: 0, savingsAlloc: 506 };

  // ── 1. the reported case ─────────────────────────────────────────────────────────────────────
  const v = safeToSpendView(brandNew, { hasCashAccount: false, hasIncome: false });
  t.eq(v.needsSetup, true, "1a no bank and no income is a setup state, not a financial position");
  t.eq(v.headline, null, "1b there is no headline to show");
  t.eq(v.headlineText, null, "1c …and no headline string a surface could print by accident");
  t.eq(v.isShort, false, "1d nobody is 'short' before they have told us anything");
  t.eq(v.rows.length, 0, "1e and no breakdown rows, which is what made the number visible");
  t.ok(/connect a bank|import a statement|add your pay/i.test(v.setupPrompt || ""),
    "1f instead there is a plain next step");

  // ── 2. a real shortfall is untouched ─────────────────────────────────────────────────────────
  const real = safeToSpendView({ balance: 100, upcomingBills: 200, debtPayments: 0, safetyBuf: 0, savingsAlloc: 0 },
    { hasCashAccount: true, hasIncome: true });
  t.eq(real.isShort, true, "2a someone with $100 and $200 committed IS short");
  t.eq(real.headlineText, "-$100", "2b …and is told so, to the dollar");
  t.eq(real.needsSetup, false, "2c that is a position, not a setup state");

  // ── 3. the balance is what makes the number real ─────────────────────────────────────────────
  t.eq(safeToSpendView(brandNew, { hasCashAccount: true, hasIncome: false }).needsSetup, false,
    "3a a linked bank is a real balance, so the number is computed and shown");
  // The reported case itself: a savings allocation EXISTS only when income was entered, so the
  // household that saw "-$506" had income and no bank. Requiring both signals to be missing left
  // that household — the one in the bug report — printing its negative.
  const incomeOnly = safeToSpendView(brandNew, { hasCashAccount: false, hasIncome: true });
  t.eq(incomeOnly.needsSetup, true,
    "3b income without a bank is still no balance, so there is still no number — the reported case");
  t.eq(incomeOnly.headlineText, null, "3c …and nothing for a surface to print");
  t.ok(/connect a bank|import a statement/i.test(incomeOnly.setupPrompt || ""),
    "3d the prompt asks for the balance, which is the part that is missing");
  t.ok(!/add your pay/i.test(incomeOnly.setupPrompt || ""),
    "3e …and does not ask again for the pay they already entered");

  // ── 3b. bills and debts do not make a balance ────────────────────────────────────────────────
  // Typed-in commitments are real data, but subtracting them from a balance of zero-by-absence
  // still produces a number about nothing. The rows stay hidden with the headline.
  const committed = safeToSpendView({ balance: 0, upcomingBills: 1940, debtPayments: 120, safetyBuf: 0, savingsAlloc: 0 },
    { hasCashAccount: false, hasIncome: false });
  t.eq(committed.needsSetup, true, "3f bills and debts entered at onboarding are not a balance either");
  t.eq(committed.headlineText, null, "3g …so no -$2,060 that assumes they have nothing");
  t.eq(committed.rows.length, 0, "3h …and no breakdown rows to imply one");

  // ── 4. the old call shape still behaves as it did ────────────────────────────────────────────
  // Every other surface calls this without the setup context; none of them may change.
  const legacy = safeToSpendView(brandNew);
  t.eq(legacy.needsSetup, false, "4a no context means no setup state");
  t.eq(legacy.headlineText, "-$506", "4b …and the previous behaviour, unchanged");

  // ── 5. the screen that showed it passes the context ──────────────────────────────────────────
  const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
  const first = app.slice(app.indexOf("function FirstVisitScreen"), app.indexOf("function FirstVisitScreen") + 2000);
  t.ok(/safeToSpendView\(SafeSpendEngine\.calculate\(data\), \{/.test(first),
    "5a FirstVisitScreen passes what the household has given us");
  t.ok(/hasCashAccount:/.test(first) && /hasIncome:/.test(first), "5b …both signals");
  t.ok(/ssView\.needsSetup/.test(app), "5c and renders the prompt on that state");
  t.ok(/\{breakdownOpen&&!ssView\.needsSetup&&\(/.test(app),
    "5d the breakdown card does not render with no rows and no total — a heading over a labelled blank");
  t.ok(/const breakdownOpen = \(showBreakdown \|\| ssView\.isShort\) && !ssView\.needsSetup;/.test(app),
    "5e …and the tap that would open it cannot");
  t.ok(/\{!breakdownOpen&&!ssView\.needsSetup\?\(/.test(app),
    "5f so the primary button goes to the dashboard rather than opening nothing");
  t.ok(/\{!overdraftImmediate&&!ssView\.needsSetup&&<div/.test(app),
    "5g \"Can I afford this?\" is hidden too: Number(null) is a finite 0, so it would answer every " +
    "question against a balance it invented");
  t.ok(/hasIncome: \(data\.incomes\|\|\[\]\)\.some\(i => num\(i && i\.amount\) > 0\)/.test(app),
    "5h income is read with num(), not Number() — Number(\"$2,600\") is NaN, which read as no income");

  t.summary("firstVisitSetup.test");
})();
