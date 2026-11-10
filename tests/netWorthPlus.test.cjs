// tests/netWorthPlus.test.cjs
// -----------------------------------------------------------------------------
// NET WORTH WITH PLUS: THE FIGURES (src/lib/netWorthPlus.js, docs/product/NET-WORTH-SPEC.md), and Today's net worth
// card without the made-up line (audit 2026-10-26, H8).
//   1  every figure keeps its currency; nothing is summed across currencies
//   2  a total only when every part is real; one part that is not, and there is no total at all
//   3  investments: registered and non-registered by the bank's own subtype; holdings are detail, never added twice
//   4  debts: linked cards and loans as the bank gives them; a card that may be counted twice blocks the total
//   5  entries for a home, a car or a pension: the household's own figure, its currency, nothing else
//   6  no estimate, no projection, and no call of any kind (no Plaid Investments call)
//   7  Today's card: no fixed line; a factual empty state; the household's own line only from two months of its figures
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const REPO = path.join(__dirname, "..");

(async () => {
  const t = create();
  const N = await import("../src/lib/netWorthPlus.js");
  const W = await import("../src/lib/netWorthWords.js");
  const CA = { country: "CA" };
  const chq = (o = {}) => ({ id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance: 1000, currency: "CAD", ...o });
  const tfsa = (o = {}) => ({ id: "tfsa", name: "TFSA", type: "investment", subtype: "tfsa", balance: 5000, currency: "CAD", ...o });
  const card = (o = {}) => ({ id: "card", name: "Visa", type: "credit", subtype: "credit card", balance: 300, currency: "CAD", mask: "1111", ...o });

  // ── 1. Currencies ──────────────────────────────────────────────────────────────────────────────
  {
    const r = N.householdNetWorth({ profile: CA, accounts: [chq(), tfsa(), card()] });
    t.eq([r.complete, r.totals], [true, [{ currency: "CAD", assetsCents: 600000, debtsCents: -30000, netCents: 570000 }]], "1a all CAD and all real: one CAD total, to the cent");
    const mixed = N.householdNetWorth({ profile: CA, accounts: [chq(), chq({ id: "usd", name: "US chequing", balance: 200, currency: "USD" })] });
    t.eq(mixed.totals, [{ currency: "CAD", assetsCents: 100000, debtsCents: 0, netCents: 100000 }, { currency: "USD", assetsCents: 20000, debtsCents: 0, netCents: 20000 }], "1b CAD and USD: a total for each, never added together and never converted");
    t.ok(!Object.keys(mixed).some((k) => /grand|combined|overall|converted/i.test(k)) && mixed.totals.every((x) => x.netCents !== 120000), "1c …and nothing anywhere is the two summed");
    t.eq(mixed.parts.map((p) => p.currency), ["CAD", "USD"], "1d each part keeps the currency it arrived in");
  }
  // ── 2. A total only when every part is real ────────────────────────────────────────────────────
  {
    t.eq([N.householdNetWorth({}).complete, N.householdNetWorth({}).totals], [false, null], "2a nothing at all: no total (and no $0 made up)");
    const noCur = N.householdNetWorth({ profile: CA, accounts: [chq(), chq({ id: "x", currency: "" })] });
    t.eq([noCur.complete, noCur.totals, noCur.problems], [false, null, ["currency_not_stated"]], "2b one account whose currency is not stated: no total for any currency");
    const noVal = N.householdNetWorth({ profile: CA, accounts: [chq(), tfsa({ balance: null })] });
    t.eq([noVal.totals, noVal.parts[1].cents, noVal.problems], [null, null, ["value_missing"]], "2c one balance missing: listed as missing, never counted as $0, and no total");
    const word = N.householdNetWorth({ profile: CA, accounts: [chq({ balance: "about 900" })] });
    t.eq(word.problems, ["value_missing"], "2d a value that is not a number is not a value");
    const over = N.householdNetWorth({ profile: CA, accounts: [chq({ balance: -50 })] });
    t.eq(over.totals[0].netCents, -5000, "2e an overdrawn account is its real negative balance, not $0");
  }
  // ── 3. Investments ─────────────────────────────────────────────────────────────────────────────
  {
    const holdings = [
      { account_id: "tfsa", id: "h1", name: "Index fund", ticker: "XEQT", quantity: 100, value: 3000, currency: "CAD" },
      { account_id: "tfsa", id: "h2", name: "US fund", ticker: "VTI", quantity: 5, value: 1400, currency: "USD" },
    ];
    const r = N.householdNetWorth({ profile: CA, accounts: [tfsa(), { id: "nr", name: "Brokerage", type: "investment", subtype: "brokerage", balance: 800, currency: "CAD" }, { id: "ira", name: "IRA", type: "investment", subtype: "ira", balance: 10, currency: "USD" }], investments: holdings });
    t.eq(r.parts.map((p) => p.registration), ["registered", "non_registered", "not_stated"], "3a TFSA registered, brokerage non-registered, anything else not stated (never guessed)");
    t.eq(r.parts[0].holdings.map((h) => [h.ticker, h.cents, h.currency]), [["XEQT", 300000, "CAD"], ["VTI", 140000, "USD"]], "3b holdings are detail under their account, each in its own currency");
    t.eq(r.totals.find((x) => x.currency === "CAD").assetsCents, 580000, "3c the account's balance counts once; its holdings are never added on top");
    t.eq(r.totals.find((x) => x.currency === "USD").assetsCents, 1000, "3d …and a USD holding inside a CAD account adds nothing to the USD total either");
  }
  // ── 4. Debts ───────────────────────────────────────────────────────────────────────────────────
  {
    const r = N.householdNetWorth({ profile: CA, accounts: [chq(), card(), { id: "mtg", name: "Mortgage", type: "loan", subtype: "mortgage", balance: 250000, currency: "CAD" }],
      debts: [{ id: "d0", name: "Visa", balance: 300, fromBank: true, account_id: "card" }, { id: "d1", name: "Car loan from Dad", balance: 4000 }] });
    t.eq(r.parts.map((p) => [p.kind, p.cents]), [["cash", 100000], ["credit", -30000], ["loan", -25000000], ["debt", -400000]], "4a the linked card and the mortgage as the bank gives them, and a debt the household entered; the card's synced debt row is the card, not a second debt");
    const twice = N.householdNetWorth({ profile: CA, accounts: [card()], debts: [{ id: "d1", name: "Visa 1111", balance: 300 }] });
    t.eq([twice.complete, twice.totals, twice.problems], [false, null, ["may_count_twice"]], "4b a debt that may be the linked card, not yet answered: no total until the household says");
    const credit = N.householdNetWorth({ profile: CA, accounts: [card({ balance: -25 })] });
    t.eq(credit.totals[0].netCents, 2500, "4c2 a card in credit (the bank's negative balance) is money the household is owed, not a debt");
    const other = N.householdNetWorth({ profile: CA, accounts: [chq(), { id: "o", name: "Something", type: "other", balance: 10, currency: "CAD" }] });
    t.eq([other.complete, other.totals, other.problems], [false, null, ["kind_not_stated"]], "4c3 an account of a type not listed is never dropped quietly: no total without it");
    const noCountry = N.householdNetWorth({ profile: {}, debts: [{ id: "d1", name: "Loan", balance: 10 }] });
    t.eq(noCountry.problems, ["currency_not_stated"], "4c a typed debt takes the household's currency only when the profile states it");
  }
  // ── 5. Entries for a home, a car or a pension ──────────────────────────────────────────────────
  {
    const r = N.householdNetWorth({ profile: CA, netWorthEntries: [{ id: "e1", kind: "home", label: "House", value: 450000, currency: "CAD", enteredAt: "2026-11-10" }, { id: "e2", kind: "pension", label: "Work pension", value: "61000", currency: "cad" }] });
    t.eq([r.complete, r.totals[0].assetsCents, r.parts[0].enteredAt], [true, 51100000, "2026-11-10"], "5a the household's own figures, in their own currency, with the date entered");
    t.eq(N.ENTRY_KINDS, ["home", "car", "pension"], "5b only a home, a car or a pension");
    const bad = N.householdNetWorth({ profile: CA, netWorthEntries: [{ kind: "boat", value: 10, currency: "CAD" }, { kind: "car", value: -5, currency: "CAD" }, { kind: "car", value: 5 }, { kind: "car", value: 5, currency: "EUR" }] });
    t.eq([bad.totals, bad.problems.sort()], [null, ["currency_not_stated", "kind_not_allowed", "value_missing"]], "5c another kind, a negative or missing figure, a currency not given or not offered: no total");
  }
  // ── 6. No estimate, no projection, no call ─────────────────────────────────────────────────────
  {
    const src = fs.readFileSync(path.join(REPO, "src", "lib", "netWorthPlus.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    t.ok(!/fetch\(|callPlaid|XMLHttpRequest|sendBeacon|\/api\/|investments\/|holdings\/get/.test(src), "6a no call of any kind: holdings are only what the existing sync already fetched");
    t.ok(!/Math\.pow|\*\*|rate|growth|project|forecast|estimate|assum|gain/i.test(src), "6b no rate, growth, projection, estimate or gain anywhere in the figures");
    const r = N.householdNetWorth({ profile: CA, accounts: [tfsa()] });
    t.eq(Object.keys(r).sort(), ["complete", "currencies", "parts", "problems", "totals"], "6c the answer is the parts and their sums, nothing more");
  }
  // ── 7. Today's card ────────────────────────────────────────────────────────────────────────────
  {
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(!/\[-4200,-3800,-3100,-2600,-1900/.test(app) && !/const spark\s*=/.test(app), "7a the fixed line [-4200 … net worth] is gone");
    const card7 = app.slice(app.indexOf("{/* ── NET WORTH SPARKLINE"), app.indexOf("{/* ── INVESTMENT PORTFOLIO"));
    t.ok(/\{!nwHasData \? <div>/.test(card7) && /netWorthWords\("networth-empty-title"\)/.test(card7) && /netWorthWords\("networth-empty-body"\)/.test(card7), "7b nothing entered or linked: the empty state, with no figure");
    t.ok(/const nwHasData = netWorthRows\(data\)\.rows\.length > 0;/.test(app), "7c …decided by the same rows the figure is the sum of");
    t.ok(/nwHistory\.length > 1\s*\? <NetWorthSparkline history=\{nwHistory\}/.test(card7) && /netWorthWords\("networth-trend-not-yet"\)/.test(card7), "7d a line only from two months of the household's own figures; before that, the words say so");
    t.ok(!/month:"·"/.test(card7) && !/<polyline/.test(card7), "7e no placeholder months and no line drawn from anything else");
    t.ok(W.NET_WORTH_WORDS["networth-empty-body"].startsWith("[WORDS:"), "7f its words are placeholders until approved (the production and store builds refuse them)");
  }
  t.summary("netWorthPlus.test");
})();
