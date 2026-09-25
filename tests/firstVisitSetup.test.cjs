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

  // ── 3. one of the two is enough to compute from ──────────────────────────────────────────────
  t.eq(safeToSpendView(brandNew, { hasCashAccount: true, hasIncome: false }).needsSetup, false,
    "3a a linked bank alone is data, so the number is computed");
  t.eq(safeToSpendView(brandNew, { hasCashAccount: false, hasIncome: true }).needsSetup, false,
    "3b so is an entered income");

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

  t.summary("firstVisitSetup.test");
})();
