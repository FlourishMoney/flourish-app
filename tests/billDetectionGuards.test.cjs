// tests/billDetectionGuards.test.cjs
// -----------------------------------------------------------------------------
// Sprint D — three live correctness bugs seen on Today with real Scotiabank data.
//
// BUG 2: grocery/retail merchants were detected as recurring bills. "Costco" and
//   "Fpos Reid'S Dairy Company $8.79" appeared in Upcoming Bills, Due Soon showed $2,315,
//   Safe-to-Spend collapsed to $0 and a false "projected overdraft" fired. Three causes:
//     a) DETECT_BILL_CATS contained "Shopping" (Costco lands there) despite the comment
//        saying "not groceries, dining, etc."
//     b) only 2 occurrences were required → ONE gap → the "every gap in band" check was
//        trivially satisfied, so two Costco trips ~30d apart read as a monthly bill
//     c) amount spread was COMPUTED but only used to LABEL fixed/variable — nothing ever
//        required consistency, so $8.79 and $250 was admitted as a "variable bill"
//
// BUG 1: "Costco due in -19 days". Three sites did `parseInt(bill.date) - today` on two
//   days-of-month. On the 22nd a bill due the 3rd gives -19 — and because the SELECTION used
//   the same arithmetic, `-19 <= 2` was true, so every past-due bill was picked as most urgent.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const pn = await import("../src/lib/plaidNormalize.js");
  const { daysUntilDueDay } = await import("../src/lib/financialCalculations.js");
  const { detectRecurringBills, titleCaseBillName, stripPosPrefix,
          MIN_BILL_OCCURRENCES, BILL_SPREAD_MAX_KEYWORD, BILL_SPREAD_MAX_CATEGORY } = pn;
  const t = create();

  const tx = (name, amount, date, cat) => ({ id:`${name}-${date}`, name, amount, date, cat, pending:false });
  const names = (bills) => bills.map(b => b.name).sort().join(", ");

  // ── The thresholds are explicit, not magic numbers ────────────────────────────────────────────
  t.eq(MIN_BILL_OCCURRENCES, 3, "a bill needs 3 occurrences (3 ⇒ 2 gaps that must agree; 2 ⇒ 1 gap, trivially 'regular')");
  t.eq(BILL_SPREAD_MAX_CATEGORY, 0.40, "category-only evidence requires tight amounts (≤40% spread)");
  t.eq(BILL_SPREAD_MAX_KEYWORD, 1.20, "a recognised biller may swing seasonally (≤120% spread)");

  // ══ BUG 2 — grocery/retail is NOT a bill ═════════════════════════════════════════════════════
  {
    // Costco: frequent, ~monthly spacing, wildly varying amounts — the exact production case.
    const costco = [
      tx("COSTCO WHOLESALE", 8.79,  "2026-05-03", "Shopping"),
      tx("COSTCO WHOLESALE", 243.10,"2026-06-02", "Shopping"),
      tx("COSTCO WHOLESALE", 96.40, "2026-07-03", "Shopping"),
    ];
    t.eq(detectRecurringBills(costco).length, 0,
         "Costco with 3 near-monthly visits is NOT a bill — 'Shopping' is no longer a bill category " +
         "AND the amounts are far too erratic. This is what put $2,315 into Due Soon.");

    // The dairy company from the screenshot.
    const dairy = [
      tx("FPOS REID'S DAIRY COMPANY", 8.79,  "2026-05-06", "Groceries"),
      tx("FPOS REID'S DAIRY COMPANY", 31.20, "2026-06-05", "Groceries"),
      tx("FPOS REID'S DAIRY COMPANY", 12.05, "2026-07-06", "Groceries"),
    ];
    t.eq(detectRecurringBills(dairy).length, 0, "a dairy/grocery merchant is never a bill, however regular");

    // Varying spend is rejected in EVERY category — it is the amount spread that disqualifies it,
    // not the category. (Categories were briefly removed to fix Costco; that was measured to break
    // real subscriptions — see the subscription block below — so the spread gate does the work.)
    for (const cat of ["Shopping", "Gas & Transport", "Entertainment", "Groceries", "Coffee & Dining"]) {
      const list = [
        tx(`SOME ${cat} MERCHANT`, 20,  "2026-05-04", cat),
        tx(`SOME ${cat} MERCHANT`, 140, "2026-06-03", cat),
        tx(`SOME ${cat} MERCHANT`, 65,  "2026-07-04", cat),
      ];
      t.eq(detectRecurringBills(list).length, 0, `${cat}: wildly varying amounts are rejected by the spread gate`);
    }

    // Fuel: real fill-ups vary and are rejected.
    const fuel = [
      tx("PETRO CANADA", 45, "2026-05-04", "Gas & Transport"),
      tx("PETRO CANADA", 62, "2026-06-04", "Gas & Transport"),
      tx("PETRO CANADA", 88, "2026-07-04", "Gas & Transport"),
    ];
    t.eq(detectRecurringBills(fuel).length, 0, "fuel fill-ups ($45/$62/$88, spread 0.66) exceed the 0.40 category bound");
  }

  // ══ REAL SUBSCRIPTIONS MUST STILL DETECT — the check that reverted the category removal ═══════
  // Measured: removing Entertainment/Gas & Transport silently broke every subscription NOT in
  // BILL_KEYWORDS (HBO Max, DAZN, Audible, PlayStation Plus, transit passes). The keyword list only
  // covers the best-known billers, so the CATEGORY path carries the long tail.
  {
    const sub = (name, amount, cat) => [
      tx(name, amount, "2026-05-04", cat), tx(name, amount, "2026-06-04", cat), tx(name, amount, "2026-07-04", cat),
    ];
    // Keyword-covered streamers.
    for (const [n, a] of [["NETFLIX.COM",20.99],["SPOTIFY",11.99],["AMAZON PRIME VIDEO",3.38],["DISNEY PLUS",11.99]]) {
      t.eq(detectRecurringBills(sub(n, a, "Entertainment")).length, 1, `${n} is detected (keyword + consistent amount)`);
    }
    // NOT keyword-covered — these are the ones the category removal broke.
    for (const [n, a] of [["HBO MAX",18.99],["DAZN",24.99],["AUDIBLE",16.95],["PLAYSTATION PLUS",11.29]]) {
      t.eq(detectRecurringBills(sub(n, a, "Entertainment")).length, 1,
           `${n} is detected via the Entertainment CATEGORY — no keyword matches it, so removing the ` +
           `category would have silently dropped this real subscription`);
    }
    // Gas & Transport holds legitimately recurring items too.
    t.eq(detectRecurringBills(sub("PRESTO TRANSIT", 156, "Gas & Transport")).length, 1,
         "a consistent monthly transit pass IS a bill — Gas & Transport is not inherently discretionary");
    t.eq(detectRecurringBills(sub("INTACT INSURANCE", 142, "Gas & Transport")).length, 1,
         "auto insurance posted to Gas & Transport is a bill");
  }

  // ── A REAL bill IS still detected ─────────────────────────────────────────────────────────────
  {
    const netflix = [
      tx("NETFLIX.COM", 20.99, "2026-05-04", "Entertainment"),   // category excluded, but KEYWORD matches
      tx("NETFLIX.COM", 20.99, "2026-06-04", "Entertainment"),
      tx("NETFLIX.COM", 20.99, "2026-07-04", "Entertainment"),
    ];
    const got = detectRecurringBills(netflix);
    t.eq(got.length, 1, "Netflix (consistent amount, monthly) IS still a bill — via the keyword list");
    t.eq(got[0].freq, "monthly", "…with the right cadence");
    t.eq(got[0].type, "fixed", "…and classified fixed (spread ≈ 0)");

    const rent = [
      tx("PROPERTY MGMT RENT", 1850, "2026-05-01", "Home"),
      tx("PROPERTY MGMT RENT", 1850, "2026-06-01", "Home"),
      tx("PROPERTY MGMT RENT", 1850, "2026-07-01", "Home"),
    ];
    t.eq(detectRecurringBills(rent).length, 1, "rent (Home, identical amount) IS a bill");

    // A genuinely VARIABLE utility must survive the new gate.
    const hydro = [
      tx("TORONTO HYDRO", 82,  "2026-05-12", "Utilities"),
      tx("TORONTO HYDRO", 141, "2026-06-12", "Utilities"),
      tx("TORONTO HYDRO", 118, "2026-07-12", "Utilities"),
    ];
    const h = detectRecurringBills(hydro);
    t.eq(h.length, 1, "hydro still qualifies despite seasonal swing — the keyword bound is deliberately lenient");
    t.eq(h[0].type, "variable", "…and is correctly LABELLED variable (the label survives; it just no longer admits)");
  }

  // ── BUG 2b — two occurrences no longer qualify ────────────────────────────────────────────────
  {
    const twice = [
      tx("NETFLIX.COM", 20.99, "2026-06-04", "Entertainment"),
      tx("NETFLIX.COM", 20.99, "2026-07-04", "Entertainment"),
    ];
    t.eq(detectRecurringBills(twice).length, 0,
         "2 occurrences is a single gap — not enough to establish a cadence, even for a real biller");
    const thrice = [...twice, tx("NETFLIX.COM", 20.99, "2026-08-04", "Entertainment")];
    t.eq(detectRecurringBills(thrice).length, 1, "…a 3rd occurrence establishes it");
  }

  // ── BUG 2c — spread gates ADMISSION, not just the label ───────────────────────────────────────
  {
    // Same merchant, same dates, same category — only the amounts differ.
    const dates = ["2026-05-10","2026-06-10","2026-07-10"];
    const steady  = dates.map((d,i) => tx("CITY WATER UTILITY", [60,64,62][i], d, "Utilities"));
    const erratic = dates.map((d,i) => tx("CITY WATER UTILITY", [12,300,45][i], d, "Utilities"));
    t.eq(detectRecurringBills(steady).length, 1, "a Utilities merchant with steady amounts is admitted");
    t.eq(detectRecurringBills(erratic).length, 0,
         "the SAME merchant/cadence/category with erratic amounts is REJECTED — spread now gates " +
         "admission. Previously this was admitted and merely labelled 'variable'.");
  }

  // ── Merchant name normalisation ───────────────────────────────────────────────────────────────
  t.eq(titleCaseBillName("REID'S DAIRY"), "Reid's Dairy", "apostrophe no longer capitalises: Reid'S → Reid's");
  t.eq(stripPosPrefix("FPOS REID'S DAIRY COMPANY"), "REID'S DAIRY COMPANY", "the FPOS terminal prefix is stripped");
  t.eq(titleCaseBillName(stripPosPrefix("FPOS REID'S DAIRY COMPANY")), "Reid's Dairy Company",
       "end to end: 'Fpos Reid'S Dairy Company' → 'Reid's Dairy Company'");
  t.eq(stripPosPrefix("SQ *COFFEE BAR"), "COFFEE BAR", "Square's SQ* prefix is stripped");
  t.eq(stripPosPrefix("NETFLIX.COM"), "NETFLIX.COM", "a normal merchant name is untouched");
  t.eq(stripPosPrefix(""), "", "empty input never throws");

  // ══ BUG 1 — days until a day-of-month due date is never negative ══════════════════════════════
  {
    const jul22 = new Date(2026, 6, 22, 12, 0, 0);   // the 22nd
    t.eq(daysUntilDueDay(3, jul22), 12,
         "a bill due the 3rd, viewed on the 22nd, is 12 days away (rolls to Aug 3) — NOT -19, which " +
         "is what the raw `parseInt(date) - today` produced on the live Today screen");
    t.ok(daysUntilDueDay(3, jul22) > 2,
         "…so `<= 2` is FALSE and it is no longer mis-selected as the urgent bill (the selection used " +
         "the same broken arithmetic, so -19 <= 2 was true for every past-due bill)");
    t.eq(daysUntilDueDay(25, jul22), 3, "a bill due the 25th is 3 days away");
    t.eq(daysUntilDueDay(22, jul22), 0, "a bill due today is 0 days away");
    t.eq(daysUntilDueDay(23, jul22), 1, "a bill due tomorrow is 1 day away");

    // Never negative, for every day-of-month, in any month.
    for (const d of [1,5,15,28,31]) {
      for (const m of [0,1,3,6,11]) {
        const today = new Date(2026, m, 22, 12, 0, 0);
        const n = daysUntilDueDay(d, today);
        t.ok(n !== null && n >= 0, `day ${d} in month ${m}: days-until is never negative (got ${n})`);
      }
    }
    // Month-length clamping, including a leap February.
    t.eq(daysUntilDueDay(31, new Date(2026, 1, 10, 12, 0, 0)), 18, "day 31 clamps to Feb 28 (2026) → 18 days");
    t.eq(daysUntilDueDay(31, new Date(2028, 1, 10, 12, 0, 0)), 19, "day 31 clamps to Feb 29 (leap 2028) → 19 days");
    t.eq(daysUntilDueDay("15", jul22), null === null ? daysUntilDueDay(15, jul22) : 0, "a string day parses like a number");
    t.eq(daysUntilDueDay(null, jul22), null, "an undatable bill returns null rather than a bogus number");
    t.eq(daysUntilDueDay("abc", jul22), null, "…and so does a non-numeric date");
  }

  t.summary("billDetectionGuards.test");
})();
