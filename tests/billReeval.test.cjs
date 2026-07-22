// tests/billReeval.test.cjs — healing bills stored by the OLD, looser detector.
//
// The bug: bills detected under older rules were persisted to appData.bills and never re-examined,
// so tightening the detector changed nothing for a user who had already connected a bank.
//
// This fix has been through three adversarial audit rounds and two redesigns. The history matters,
// because each section below exists to stop a specific reproduced failure:
//
//   attempt 1  re-ran detection and REPLACED the auto-detected set. Nine defects, four data-loss.
//              Root error: treating "not currently re-detectable" as "not a bill", when
//              appData.transactions is not a faithful mirror of history (the DB blob strips Plaid
//              rows, account removal drops rows, a refetch is capped at 90 days).
//   attempt 2  prune-only, gated on an occurrence count. Safe, but a count bar cannot distinguish
//              the detector's four rejection reasons, so it had to be set high enough (5) to
//              suppress the least trustworthy one — and then almost nothing was ever judged.
//   attempt 3  prune on the ONE gate that survives a truncated window: amount spread.
//
// CONTRACT: delete only on a positive spread rejection; never rewrite or re-add a survivor.
"use strict";

const { create } = require("./_runner.cjs");
const t = create();

// A bill as the user typed it during onboarding: no `origin`, no `auto`. This shape is the whole
// reason isAutoDetectedBill tests the explicit stamp rather than `origin !== "manual"`.
const onboardingBill = { name: "Rent", amount: "1800.00", date: "1" };
const manualBill     = { id: "m1", name: "Hydro", amount: "95.00", date: "12", origin: "manual" };
const auto = (name, extra = {}) =>
  ({ name, amount: "20.99", date: "15", type: "fixed", freq: "monthly", auto: true, origin: "observed", ...extra });

// A verdict map keyed by CANONICAL merchant key. `rej` builds a rejecting verdict, `ok` a passing one.
const vmap = (obj) => new Map(Object.entries(obj));
const rej  = (n = 4) => ({ n, spread: 1.50, limit: 0.40, isKeyword: false, rejected: true });
const ok   = (n = 4) => ({ n, spread: 0.05, limit: 0.40, isKeyword: false, rejected: false });

// Build transactions for one merchant with the given amounts, one per month.
const txnsFor = (name, amts, cat = "Shopping") => amts.map((a, i) => ({
  id: `${name}-${i}`, name, merchant_name: name, amount: a,
  date: `2026-0${3 + i}-12`, cat, category: [cat], pending: false,
}));

(async () => {
  const { pruneDisqualifiedBills, isAutoDetectedBill, merchantKey, mergeSpreadVerdicts,
          autoBillKeys, MIN_OCCURRENCES_TO_JUDGE } = await import("../src/lib/billReeval.js");
  const { detectRecurringBills, billCandidateExpenses, groupByMerchant, billSpreadVerdicts,
          MIN_BILL_OCCURRENCES, BILL_SPREAD_MAX_KEYWORD, BILL_SPREAD_MAX_CATEGORY } =
          await import("../src/lib/plaidNormalize.js");

  // Whole-pipeline helper: transactions in, verdicts out, exactly as the app computes them.
  const verdictsFor = (txns, debts = []) =>
    mergeSpreadVerdicts(billSpreadVerdicts(groupByMerchant(billCandidateExpenses(txns, debts))));

  // ── 1. what is eligible to be judged ──────────────────────────────────────────────────────────
  t.ok(isAutoDetectedBill({ auto: true }),               "1a auto:true is auto-detected");
  t.ok(isAutoDetectedBill({ origin: "observed" }),       "1b origin:observed is auto-detected");
  t.ok(!isAutoDetectedBill(manualBill),                  "1c manual bill is NOT auto-detected");
  t.ok(!isAutoDetectedBill(onboardingBill),              "1d onboarding bill is NOT auto-detected");
  t.ok(!isAutoDetectedBill(null),                        "1e null is not auto-detected");
  t.ok(!isAutoDetectedBill({ auto: false, origin: "" }), "1f explicit auto:false is not auto-detected");

  // ── 2. canonical merchant key survives the detector's own naming drift ────────────────────────
  t.eq(merchantKey("Fpos Reid'S Dairy Company"), merchantKey("Reid's Dairy Company"),
       "2a old and new spellings resolve to one key");
  t.eq(merchantKey("FPOS REID'S DAIRY COMPANY"), merchantKey("Reid's Dairy Company"),
       "2b raw transaction name resolves to the same key");
  t.eq(merchantKey("  Netflix   Inc  "), "netflix inc", "2c whitespace collapsed and trimmed");
  t.eq(merchantKey(null), "",                            "2d null is empty, never matches");
  t.eq(merchantKey("HYDRO ONE 123456789"), merchantKey("Hydro One"), "2e account number stripped");
  t.eq(merchantKey("POS BELL CANADA 887766"), merchantKey("Bell Canada"), "2f account number + POS");
  t.eq(merchantKey("Store 24"), "store 24", "2g a short number is NOT an account number");

  // ── 3. the reported bug: an erratic phantom IS removed ────────────────────────────────────────
  {
    const prev = [auto("Fpos Reid'S Dairy Company"), auto("Netflix")];
    const { bills, removed } = pruneDisqualifiedBills(prev, {
      verdicts: vmap({ "reid's dairy company": rej(7), "netflix": ok(3) }),
    });
    t.eq(bills.map(b => b.name), ["Netflix"],                     "3a phantom removed");
    t.eq(removed.map(b => b.name), ["Fpos Reid'S Dairy Company"], "3b removal is reported");
  }

  // ── 4. SAFETY: user-owned bills are never judged ──────────────────────────────────────────────
  {
    const prev = [onboardingBill, manualBill, auto("Costco Wholesale")];
    const { bills } = pruneDisqualifiedBills(prev, {
      verdicts: vmap({ rent: rej(9), hydro: rej(9), "costco wholesale": rej(5) }),
    });
    t.eq(bills.map(b => b.name), ["Rent", "Hydro"], "4a onboarding + manual survive a total rejection");
    t.ok(bills[0] === onboardingBill,              "4b onboarding bill is the SAME object");
    t.ok(bills[1] === manualBill,                  "4c manual bill is the SAME object");
  }

  // ── 5. ABSENCE OF EVIDENCE CHANGES NOTHING — the core safety property ─────────────────────────
  // This is what makes the slim DB blob, a disconnected account and the 90-day fetch cap harmless.
  {
    const prev = [auto("Netflix"), auto("Hydro One"), auto("Spotify")];
    t.eq(pruneDisqualifiedBills(prev, { verdicts: vmap({}) }).removed.length, 0,
         "5a no verdicts at all → nothing removed");
    t.eq(pruneDisqualifiedBills(prev, {}).removed.length, 0,
         "5b no opts at all → nothing removed");
    t.eq(pruneDisqualifiedBills(prev, { verdicts: vmap({ netflix: ok() }) }).removed.length, 0,
         "5c a passing verdict removes nothing");
    t.eq(pruneDisqualifiedBills(prev, { verdicts: vmap({ netflix: rej() }) }).removed.map(b => b.name),
         ["Netflix"], "5d only the rejected merchant is removed");
    t.eq(pruneDisqualifiedBills(prev, { verdicts: vmap({ netflix: { n: 4 } }) }).removed.length, 0,
         "5e a malformed verdict (no `rejected`) is not a rejection");
  }

  // ── 6. survivors are returned untouched, in order ─────────────────────────────────────────────
  {
    const rich = auto("Hydro One", {
      amount: "212.00", nextDueDate: "2026-08-11", arrears: "40.00", freq: "biweekly",
    });
    const prev = [auto("A"), onboardingBill, rich, manualBill];
    const { bills } = pruneDisqualifiedBills(prev, { verdicts: vmap({ a: ok(), "hydro one": ok() }) });
    t.eq(bills.map(b => b.name), ["A", "Rent", "Hydro One", "Hydro"], "6a order preserved exactly");
    t.ok(bills[2] === rich,                    "6b survivor is the same object");
    t.eq(bills[2].nextDueDate, "2026-08-11",   "6c nextDueDate anchor preserved");
    t.eq(bills[2].arrears, "40.00",            "6d user-authored field preserved");
    t.eq(bills[2].amount, "212.00",            "6e stored amount preserved");
  }

  // ── 7. idempotent: a second pass removes nothing more ─────────────────────────────────────────
  {
    const prev = [auto("Phantom"), auto("Netflix")];
    const args = { verdicts: vmap({ phantom: rej(6), netflix: ok(3) }) };
    const once  = pruneDisqualifiedBills(prev, args);
    const twice = pruneDisqualifiedBills(once.bills, args);
    t.eq(once.removed.length, 1,  "7a first pass removes the phantom");
    t.eq(twice.removed.length, 0, "7b second pass is a no-op → the effect cannot loop");
    t.eq(autoBillKeys(twice.bills), autoBillKeys(once.bills), "7c key set is stable");
  }

  // ── 8. degenerate inputs ──────────────────────────────────────────────────────────────────────
  t.eq(pruneDisqualifiedBills(undefined, {}).bills, [],       "8a undefined prev → empty");
  t.eq(pruneDisqualifiedBills(null, {}).removed, [],          "8b null prev → nothing removed");
  t.eq(pruneDisqualifiedBills([auto("")], { verdicts: vmap({ "": rej() }) }).removed, [],
       "8c unnameable bill is never removed");
  t.eq(pruneDisqualifiedBills([auto("A")], { verdicts: { a: rej() } }).removed.length, 1,
       "8d a plain object of verdicts is accepted");

  // ── 9. mergeSpreadVerdicts: variants of one merchant ──────────────────────────────────────────
  // If ANY variant looks like a bill, the merchant keeps the benefit of the doubt.
  {
    const merged = mergeSpreadVerdicts(vmap({
      "netflix.com":     { n: 3, spread: 1.9, limit: 0.4, isKeyword: false, rejected: true },
      "pos netflix.com": { n: 5, spread: 0.0, limit: 0.4, isKeyword: false, rejected: false },
    }));
    t.eq(merged.get("netflix.com").rejected, false, "9a one passing variant spares the merchant");
    t.eq(merged.get("netflix.com").n, 5,            "9b n reported from the largest variant");
    const all = mergeSpreadVerdicts(vmap({
      "costco":          { n: 3, spread: 1.9, limit: 0.4, isKeyword: false, rejected: true },
      "pos costco 4471": { n: 4, spread: 2.2, limit: 0.4, isKeyword: false, rejected: true },
    }));
    t.eq(all.get("costco").rejected, true, "9c every variant rejecting DOES reject the merchant");
    t.eq(mergeSpreadVerdicts(vmap({ x: { n: 1, rejected: true } })).size, 0,
         "9d a single-row variant yields no verdict at all");
    t.eq(mergeSpreadVerdicts(null).size, 0, "9e null input is empty, not a throw");
  }

  // ══ REGRESSION TESTS FOR THE AUDIT FINDINGS ══════════════════════════════════════════════════

  // ── 10. AUDIT 1: post-hydrate slim blob must not wipe the bill list ───────────────────────────
  // buildDbBlob strips Plaid transactions but not bills. After hydrate, bills is full and
  // transactions is a residue of statement/orphaned rows. Attempt 1 deleted everything here.
  {
    const residue = txnsFor("COSTCO WHOLESALE", [212.40]);
    const stored = [onboardingBill, auto("Rent Payment"), auto("Hydro One"), auto("Netflix")];
    const { bills, removed } = pruneDisqualifiedBills(stored, { verdicts: verdictsFor(residue) });
    t.eq(removed.length, 0, "10a one residue transaction removes NOTHING");
    t.eq(bills.length, 4,   "10b every stored bill survives a slim hydrate");
  }

  // ── 11. AUDIT 1: removing a bank account must not delete its bills ────────────────────────────
  {
    const { removed } = pruneDisqualifiedBills([auto("Hydro One"), auto("Netflix")],
      { verdicts: verdictsFor([]) });
    t.eq(removed.length, 0, "11a disconnecting the bank deletes no bills");
  }

  // ── 12. AUDIT 1: a direct amount edit must not be reverted ────────────────────────────────────
  // Settings > Bills writes {...b, amount} into appData.bills and records NO override.
  {
    const edited = auto("Netflix", { amount: "24.50" });
    const { bills, removed } = pruneDisqualifiedBills([edited], { verdicts: vmap({ netflix: ok() }) });
    t.eq(removed.length, 0,        "12a a passing bill is not touched");
    t.eq(bills[0].amount, "24.50", "12b the user's typed amount survives");
    t.ok(bills[0] === edited,      "12c the object is not rebuilt at all");
  }

  // ── 13. AUDIT 1: nextDueDate must not be stripped ─────────────────────────────────────────────
  {
    const weekly = auto("Gym", { freq: "weekly", nextDueDate: "2026-07-24" });
    const { bills } = pruneDisqualifiedBills([weekly], { verdicts: vmap({ gym: ok(8) }) });
    t.eq(bills[0].nextDueDate, "2026-07-24", "13a weekly bill keeps its cadence anchor");
  }

  // ── 14. AUDIT 3: a merchant name must never resolve through Object.prototype ──────────────────
  {
    ["Constructor", "constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"].forEach(n => {
      t.eq(pruneDisqualifiedBills([auto(n)], { verdicts: {} }).removed.length, 0,
           `14a "${n}" is not deleted against an empty plain-object verdict map`);
    });
    t.throws(() => groupByMerchant([{ name: "__proto__", amount: 1 }]),
             "14b groupByMerchant survives a merchant named __proto__", false);
    t.eq(groupByMerchant([{ name: "__proto__", amount: 1 }])["__proto__"].length, 1,
         "14c and still groups it correctly");
  }

  // ══ THE SPREAD RULE ITSELF ═══════════════════════════════════════════════════════════════════

  // ── 15. deleting uses the gate that survives a truncated window ───────────────────────────────
  // A 90-day fetch shows a monthly bill ~3 times. Occurrence count and cadence both read
  // differently on 90 days than on full history; a stable amount does not.
  {
    t.eq(MIN_OCCURRENCES_TO_JUDGE, 2, "15a two rows is only what a spread needs to exist");
    t.ok(MIN_OCCURRENCES_TO_JUDGE <= MIN_BILL_OCCURRENCES,
         "15b healing no longer needs MORE occurrences than detection");
    // Identical amounts read identically from 3 occurrences or 30 — the whole point.
    const short = verdictsFor(txnsFor("ACME SUB", [12.99, 12.99, 12.99]));
    const long  = verdictsFor(txnsFor("ACME SUB", [12.99, 12.99, 12.99, 12.99, 12.99, 12.99]));
    t.eq(short.get("acme sub").rejected, false, "15c stable amounts pass on 3 occurrences");
    t.eq(long.get("acme sub").rejected,  false, "15d and on 6 — truncation changes nothing");
    t.approx(short.get("acme sub").spread, long.get("acme sub").spread, 0.001,
             "15e the spread figure itself is unchanged by truncation");
  }

  // ── 16. the two bounds, and which merchants get which ─────────────────────────────────────────
  {
    const kw  = verdictsFor(txnsFor("ENBRIDGE GAS", [180, 220, 250], "Utilities")).get("enbridge gas");
    const cat = verdictsFor(txnsFor("COSTCO WHOLESALE", [212.40, 47.10])).get("costco wholesale");
    t.eq(kw.isKeyword, true,                       "16a a recognised biller gets the keyword bound");
    t.eq(kw.limit, BILL_SPREAD_MAX_KEYWORD,        "16b which is 1.20");
    t.eq(cat.isKeyword, false,                     "16c an unrecognised merchant gets the category bound");
    t.eq(cat.limit, BILL_SPREAD_MAX_CATEGORY,      "16d which is 0.40");
  }

  // ── 17. THE LIVE CASE — the four bills from production, and Petro-Canada ──────────────────────
  // These are the merchants actually on the user's Today screen. Enbridge and Intact are REAL
  // bills and must survive; Costco and Petro-Canada are phantoms and must go.
  {
    const verdict = (name, amts, cat) => {
      const v = verdictsFor(txnsFor(name, amts, cat)).get(merchantKey(name));
      const { removed } = pruneDisqualifiedBills([auto(name)], { verdicts: verdictsFor(txnsFor(name, amts, cat)) });
      return { v, deleted: removed.length === 1 };
    };
    // REAL BILLS — must be kept.
    t.eq(verdict("ENBRIDGE GAS", [180, 220, 250], "Utilities").deleted, false,
         "17a Enbridge over a winter quarter is KEPT");
    t.eq(verdict("ENBRIDGE GAS", [80, 150, 220], "Utilities").deleted, false,
         "17b Enbridge across a full seasonal swing (spread 0.93) is still KEPT");
    t.eq(verdict("INTACT INSURANCE", [145, 145, 145], "Bills").deleted, false,
         "17c Intact Insurance at a flat premium is KEPT");
    t.eq(verdict("INTACT INSURANCE", [145, 145, 168], "Bills").deleted, false,
         "17d Intact after a mid-term premium change is KEPT");
    t.eq(verdict("KLARNA", [42, 42, 42, 42], "Shopping").deleted, false,
         "17e Klarna on one instalment plan (equal amounts) is KEPT");
    // PHANTOMS — must go.
    t.eq(verdict("COSTCO WHOLESALE", [212.40, 47.10], "Shopping").deleted, true,
         "17f Costco at two wildly different amounts is REMOVED");
    t.eq(verdict("PETRO-CANADA", [64, 88, 41, 72, 95], "Gas & Transport").deleted, true,
         "17g Petro-Canada fuel stops are REMOVED");
    t.eq(verdict("KLARNA", [42, 118, 29, 205], "Shopping").deleted, true,
         "17h Klarna across several plans of differing size IS removed");
  }

  // ── 18. how far a REAL bill must swing before it is deleted ───────────────────────────────────
  // The bound is what protects Enbridge and Intact, so pin the actual breaking point. If someone
  // later loosens BILL_SPREAD_MAX_KEYWORD, this fails and says exactly what it cost.
  {
    const deletedAt = (name, third, cat) => {
      const v = verdictsFor(txnsFor(name, [100, 100, third], cat));
      return pruneDisqualifiedBills([auto(name)], { verdicts: v }).removed.length === 1;
    };
    t.eq(deletedAt("ENBRIDGE GAS", 295, "Utilities"), false,
         "18a a keyword biller at 2.95x its usual amount is still KEPT");
    t.eq(deletedAt("ENBRIDGE GAS", 305, "Utilities"), true,
         "18b it takes ~3x before a recognised biller is judged erratic");
    t.eq(deletedAt("INTACT INSURANCE", 295, "Bills"), false,
         "18c same headroom protects the insurance premium");
    t.eq(deletedAt("SOME MERCHANT", 145, "Shopping"), false,
         "18d an unrecognised merchant tolerates 1.45x");
    t.eq(deletedAt("SOME MERCHANT", 160, "Shopping"), true,
         "18e but not 1.6x — category evidence alone demands tight amounts");
  }

  // ── 19. end-to-end through the real detector, mixed merchants in one set ──────────────────────
  {
    const txns = [
      ...txnsFor("COSTCO WHOLESALE", [212.40, 47.10, 389.55], "Shopping"),
      ...txnsFor("NETFLIX", [20.99, 20.99, 20.99], "Entertainment"),
      ...txnsFor("ENBRIDGE GAS", [180, 205, 240], "Utilities"),
    ];
    const verdicts = verdictsFor(txns);
    const qualified = detectRecurringBills(txns, {}).map(b => merchantKey(b.name));
    t.ok(!qualified.includes("costco wholesale"), "19a the detector rejects the warehouse spend");
    t.ok(qualified.includes("netflix"),           "19b and still accepts the subscription");

    const stored = [onboardingBill, auto("Costco Wholesale", { amount: "216.35" }),
                    auto("Netflix"), auto("Enbridge Gas", { amount: "205.00" })];
    const { bills, removed } = pruneDisqualifiedBills(stored, { verdicts });
    t.eq(removed.map(b => b.name), ["Costco Wholesale"], "19c only the phantom is dropped");
    t.eq(bills.map(b => b.name), ["Rent", "Netflix", "Enbridge Gas"],
         "19d the user's bill, the subscription and the utility all remain");
    const total = bills.reduce((s, b) => s + parseFloat(b.amount || 0), 0);
    t.approx(total, 2025.99, 0.01, "19e Due Soon no longer includes the phantom");
  }

  t.summary("billReeval");
})();
