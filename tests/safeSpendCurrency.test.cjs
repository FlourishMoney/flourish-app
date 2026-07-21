// tests/safeSpendCurrency.test.cjs
// -----------------------------------------------------------------------------
// Sprint C Fix 1 — Safe-to-Spend must exclude foreign-currency cash (no FX conversion).
//
// SafeSpendEngine summed every cash account 1:1 regardless of currency, so a CAD+USD user saw a
// Safe-to-Spend of $2,000 while Net Worth (which already excludes foreign accounts) showed $1,000 —
// the two screens contradicted and the actionable number was the wrong one. This pins the fix:
// include only BASE-currency cash, exclude (never convert) foreign cash, surface the exclusion, and
// carry the correction into the forecast starting balance that SafeSpendEngine seeds.
//
// Frozen dates only. Fixtures carry no bills/transactions, so the seed balance is the plain base-cash
// sum and every forecast figure is exact.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const t = create();

  const TODAY = new Date(2026, 5, 15, 12, 0, 0); // Mon Jun 15 2026
  // A cash (depository) account; currency omitted → legacy default CAD.
  const cash = (id, balance, currency) => {
    const a = { id, name: id, type: "depository", subtype: "checking", balance };
    if (currency) a.currency = currency;
    return a;
  };

  // ── 1. Mixed CAD/USD, Canadian profile (base CAD) → excludes USD ────────────────────────────────
  {
    const data = {
      profile: { country: "CA" },
      accounts: [cash("cad", 1000, "CAD"), cash("usd", 1000, "USD")],
      bills: [], debts: [], transactions: [],
    };
    const r = SafeSpendEngine.calculate(data, TODAY);
    t.eq(r.baseCurrency, "CAD", "Canadian profile resolves base currency CAD");
    t.eq(r.balance, 1000,
         "base-CAD Safe-to-Spend balance is 1000 (CAD only), NOT 2000 — the USD $1,000 is excluded, " +
         "not summed 1:1. This is the exact contradiction with Net Worth the fix removes.");
    t.eq(r.excludedForeignCash, 1000, "the excluded USD cash is surfaced so the UI can disclose it");
    t.eq(r.mixedCurrencyDetected, true, "mixed-currency is flagged");
  }

  // ── 2. Mixed US profile, no explicit base (country US → base USD) → excludes CAD ─────────────────
  {
    const data = {
      profile: { country: "US" },
      accounts: [cash("usd", 1000, "USD"), cash("cad", 1000, "CAD")],
      bills: [], debts: [], transactions: [],
    };
    const r = SafeSpendEngine.calculate(data, TODAY);
    t.eq(r.baseCurrency, "USD", "US profile with no explicit base resolves base currency USD");
    t.eq(r.balance, 1000, "base-USD balance is the USD 1000; the CAD account is excluded");
    t.eq(r.excludedForeignCash, 1000, "the excluded CAD cash is surfaced");
    t.eq(r.mixedCurrencyDetected, true, "mixed-currency flagged for the US user too");
  }

  // ── 3. Explicit profile.baseCurrency override wins ──────────────────────────────────────────────
  {
    // A Canadian who elects USD as their reporting currency: USD is base, CAD excluded.
    const data = {
      profile: { country: "CA", baseCurrency: "USD" },
      accounts: [cash("usd", 700, "USD"), cash("cad", 5000, "CAD")],
      bills: [], debts: [], transactions: [],
    };
    const r = SafeSpendEngine.calculate(data, TODAY);
    t.eq(r.baseCurrency, "USD", "explicit profile.baseCurrency overrides the country default");
    t.eq(r.balance, 700, "only the USD cash counts once the override sets base USD");
    t.eq(r.excludedForeignCash, 5000, "the CAD $5,000 is excluded under the override");
  }

  // ── 4. Single-currency user — IDENTICAL to before (regression guard) ─────────────────────────────
  {
    // Explicit CAD.
    const explicit = {
      profile: { country: "CA" },
      accounts: [cash("a", 1500, "CAD"), cash("b", 500, "CAD")],
      bills: [], debts: [], transactions: [],
    };
    const rExplicit = SafeSpendEngine.calculate(explicit, TODAY);
    t.eq(rExplicit.balance, 2000, "single-currency CAD user: full sum, unchanged");
    t.eq(rExplicit.excludedForeignCash, 0, "nothing excluded for a single-currency user");
    t.eq(rExplicit.mixedCurrencyDetected, false, "no mixed-currency flag for a single-currency user");

    // Legacy/unstamped accounts (no currency field) default CAD → also unchanged.
    const legacy = {
      profile: { country: "CA" },
      accounts: [cash("a", 1500), cash("b", 500)], // no currency field
      bills: [], debts: [], transactions: [],
    };
    const rLegacy = SafeSpendEngine.calculate(legacy, TODAY);
    t.eq(rLegacy.balance, 2000, "unstamped accounts default CAD → legacy CAD user unchanged");
    t.eq(rLegacy.mixedCurrencyDetected, false, "unstamped == base, so no false mixed-currency flag");
  }

  // ── 5. Non-cash foreign accounts don't leak into the cash sum ────────────────────────────────────
  {
    const data = {
      profile: { country: "CA" },
      accounts: [
        cash("chq", 1200, "CAD"),
        { id: "inv", name: "US Brokerage", type: "investment", balance: 50000, currency: "USD" },
        { id: "cc", name: "US Card", type: "credit", balance: 800, currency: "USD" },
      ],
      bills: [], debts: [], transactions: [],
    };
    const r = SafeSpendEngine.calculate(data, TODAY);
    t.eq(r.balance, 1200,
         "the USD investment and USD credit accounts are non-cash and never enter the Safe-to-Spend " +
         "sum — balance is the CAD chequing only");
    t.eq(r.excludedForeignCash, 0,
         "excludedForeignCash counts foreign CASH only, so a foreign investment/credit account does " +
         "not inflate the disclosed exclusion figure");
  }

  // ── 6. DOWNSTREAM — the forecast starting balance is corrected too ──────────────────────────────
  {
    // The reported defect: SafeSpendEngine seeds ForecastEngine. A mixed-currency user's forecast
    // must start from the base-currency balance, not the 1:1 cross-currency sum.
    const data = {
      profile: { country: "CA" },
      accounts: [cash("cad", 1000, "CAD"), cash("usd", 1000, "USD")],
      bills: [], debts: [], transactions: [], incomes: [],
    };
    const { forecast, dataIssues } = ForecastEngine.generate(data, 10, null, TODAY);
    t.eq(dataIssues.length, 0, "clean fixture: no data-quality issues");
    t.eq(forecast[0].balance, 1000,
         "the forecast STARTS at the CAD-only $1,000, not $2,000 — the Fix 1 correction flows through " +
         "SafeSpendEngine's seed into the forecast, so both screens agree");
    t.eq(forecast[10].balance, 1000, "with no income/bills it holds at the corrected base balance");
  }

  t.summary("safeSpendCurrency.test");
})();
