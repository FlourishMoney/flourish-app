// tests/billReeval.test.cjs — healing bills stored by the OLD, looser detector.
//
// The bug being locked down: bills detected under older rules were persisted to appData.bills and
// never re-examined, so tightening the detector changed nothing for a user who had already
// connected a bank — the phantom bill survived the fix.
//
// The FIRST attempt at this fix re-ran detection and replaced the auto-detected set. An adversarial
// audit reproduced three separate ways that destroys real data, all from one root error: treating
// "not currently re-detectable" as "not a bill". appData.transactions is not a faithful mirror of
// history — the DB blob strips Plaid rows, account removal drops rows, refetch is capped at 90 days.
//
// So the contract is now: DELETE ONLY ON POSITIVE DISQUALIFICATION, and never rewrite a survivor.
// Sections 10-13 are regression tests for the specific audit findings and must not be relaxed.
"use strict";

const { create } = require("./_runner.cjs");
const t = create();

// A bill as the user typed it during onboarding: no `origin`, no `auto`. This shape is the whole
// reason isAutoDetectedBill tests the explicit stamp rather than `origin !== "manual"`.
const onboardingBill = { name: "Rent", amount: "1800.00", date: "1" };
const manualBill     = { id: "m1", name: "Hydro", amount: "95.00", date: "12", origin: "manual" };
const auto = (name, extra = {}) =>
  ({ name, amount: "20.99", date: "15", type: "fixed", freq: "monthly", auto: true, origin: "observed", ...extra });

// occurrence maps are keyed by CANONICAL merchant key
const occ = (obj) => new Map(Object.entries(obj));

(async () => {
  const { pruneDisqualifiedBills, isAutoDetectedBill, merchantKey, merchantEvidence, autoBillKeys, MIN_OCCURRENCES_TO_JUDGE } =
    await import("../src/lib/billReeval.js");
  const { detectRecurringBills, detectRecurringBillsDetailed, billCandidateExpenses, groupByMerchant, MIN_BILL_OCCURRENCES } =
    await import("../src/lib/plaidNormalize.js");

  // ── 1. what is eligible to be judged ──────────────────────────────────────────────────────────
  t.ok(isAutoDetectedBill({ auto: true }),               "1a auto:true is auto-detected");
  t.ok(isAutoDetectedBill({ origin: "observed" }),       "1b origin:observed is auto-detected");
  t.ok(!isAutoDetectedBill(manualBill),                  "1c manual bill is NOT auto-detected");
  t.ok(!isAutoDetectedBill(onboardingBill),              "1d onboarding bill is NOT auto-detected");
  t.ok(!isAutoDetectedBill(null),                        "1e null is not auto-detected");
  t.ok(!isAutoDetectedBill({ auto: false, origin: "" }), "1f explicit auto:false is not auto-detected");

  // ── 2. canonical merchant key survives the detector's own naming drift ────────────────────────
  // stripPosPrefix + the title-case fix renamed the SAME merchant, so a bill stored under the old
  // spelling must still resolve to the merchant seen in transactions.
  t.eq(merchantKey("Fpos Reid'S Dairy Company"), merchantKey("Reid's Dairy Company"),
       "2a old and new spellings resolve to one key");
  t.eq(merchantKey("FPOS REID'S DAIRY COMPANY"), merchantKey("Reid's Dairy Company"),
       "2b raw transaction name resolves to the same key");
  t.eq(merchantKey("  Netflix   Inc  "), "netflix inc", "2c whitespace collapsed and trimmed");
  t.eq(merchantKey(null), "",                            "2d null is empty, never matches");
  // The detector strips account numbers BEFORE the POS prefix when building its display name. If
  // this key did not do the same, a raw "HYDRO ONE 123456789" would never match the stored bill
  // "Hydro One", so that merchant could never reach the evidence bar and never be healed.
  t.eq(merchantKey("HYDRO ONE 123456789"), merchantKey("Hydro One"), "2e account number stripped");
  t.eq(merchantKey("POS BELL CANADA 887766"), merchantKey("Bell Canada"), "2f account number + POS prefix");
  t.eq(merchantKey("Store 24"), "store 24", "2g a short number is NOT an account number");
  {
    // End-to-end: the key derived from a RAW transaction must equal the key derived from the
    // DISPLAY NAME the detector produces for that same transaction.
    const txns = ["2026-04-09", "2026-05-09", "2026-06-09"].map((d, i) => ({
      id: `h${i}`, name: "FPOS HYDRO ONE 123456789", merchant_name: "FPOS HYDRO ONE 123456789",
      amount: 142.00, date: d, cat: "Utilities", category: ["Utilities"], pending: false,
    }));
    const detected = detectRecurringBills(txns, {});
    t.eq(detected.length, 1, "2h the detector accepts this merchant");
    t.eq(merchantKey(detected[0].name), merchantKey(txns[0].name),
         "2i display-name key === raw-transaction key (occurrences and qualified align)");
  }

  // ── 3. the reported bug: a disqualified phantom IS removed ────────────────────────────────────
  {
    const prev = [auto("Fpos Reid'S Dairy Company"), auto("Netflix")];
    const { bills, removed } = pruneDisqualifiedBills(prev, {
      occurrences: occ({ "reid's dairy company": 7, "netflix": 3 }),
      qualified: ["netflix"], minOccurrences: 3,
    });
    t.eq(bills.map(b => b.name), ["Netflix"],                     "3a phantom removed");
    t.eq(removed.map(b => b.name), ["Fpos Reid'S Dairy Company"], "3b removal is reported");
  }

  // ── 4. SAFETY: user-owned bills are never judged ──────────────────────────────────────────────
  {
    const prev = [onboardingBill, manualBill, auto("Costco Wholesale")];
    const { bills } = pruneDisqualifiedBills(prev, {
      occurrences: occ({ "rent": 9, "hydro": 9, "costco wholesale": 5 }),
      qualified: [], minOccurrences: 3,
    });
    t.eq(bills.map(b => b.name), ["Rent", "Hydro"], "4a onboarding + manual survive total disqualification");
    t.ok(bills[0] === onboardingBill,              "4b onboarding bill is the SAME object (not rebuilt)");
    t.ok(bills[1] === manualBill,                  "4c manual bill is the SAME object (not rebuilt)");
  }

  // ── 5. ABSENCE OF EVIDENCE CHANGES NOTHING — the core safety property ─────────────────────────
  {
    const prev = [auto("Netflix"), auto("Hydro One"), auto("Spotify")];
    t.eq(pruneDisqualifiedBills(prev, { occurrences: occ({}), qualified: [], minOccurrences: 3 }).removed.length,
         0, "5a no transactions at all → nothing removed");
    t.eq(pruneDisqualifiedBills(prev, { occurrences: occ({ netflix: 2 }), qualified: [], minOccurrences: 3 }).removed.length,
         0, "5b below the evidence bar → nothing removed");
    t.eq(pruneDisqualifiedBills(prev, { occurrences: occ({ netflix: 3 }), qualified: [], minOccurrences: 3 }).removed.map(b => b.name),
         ["Netflix"], "5c at the bar and rejected → removed, and ONLY that one");
  }

  // ── 6. survivors are returned untouched, in order ─────────────────────────────────────────────
  {
    const rich = auto("Hydro One", {
      amount: "212.00", nextDueDate: "2026-08-11", arrears: "40.00", freq: "biweekly",
    });
    const prev = [auto("A"), onboardingBill, rich, manualBill];
    const { bills } = pruneDisqualifiedBills(prev, {
      occurrences: occ({ a: 5, "hydro one": 5 }), qualified: ["a", "hydro one"], minOccurrences: 3,
    });
    t.eq(bills.map(b => b.name), ["A", "Rent", "Hydro One", "Hydro"], "6a order preserved exactly");
    t.ok(bills[2] === rich,                    "6b survivor is the same object");
    t.eq(bills[2].nextDueDate, "2026-08-11",   "6c nextDueDate anchor preserved");
    t.eq(bills[2].arrears, "40.00",            "6d user-authored field preserved");
    t.eq(bills[2].amount, "212.00",            "6e stored amount preserved");
  }

  // ── 7. idempotent: a second pass removes nothing more ─────────────────────────────────────────
  {
    const prev = [auto("Phantom"), auto("Netflix")];
    const args = { occurrences: occ({ phantom: 6, netflix: 3 }), qualified: ["netflix"], minOccurrences: 3 };
    const once  = pruneDisqualifiedBills(prev, args);
    const twice = pruneDisqualifiedBills(once.bills, args);
    t.eq(once.removed.length, 1,  "7a first pass removes the phantom");
    t.eq(twice.removed.length, 0, "7b second pass is a no-op → the effect cannot loop");
    t.eq(autoBillKeys(twice.bills), autoBillKeys(once.bills), "7c and the key set is stable");
  }

  // ── 8. degenerate inputs ──────────────────────────────────────────────────────────────────────
  t.eq(pruneDisqualifiedBills(undefined, {}).bills, [],   "8a undefined prev → empty");
  t.eq(pruneDisqualifiedBills(null, {}).removed, [],      "8b null prev → nothing removed");
  t.eq(pruneDisqualifiedBills([auto("X")], {}).removed, [], "8c no opts → nothing removed (safe default)");
  t.eq(pruneDisqualifiedBills([auto("")], { occurrences: occ({ "": 9 }), qualified: [] }).removed, [],
       "8d unnameable bill is never removed");
  t.eq(pruneDisqualifiedBills([auto("A")], { occurrences: { a: 5 }, qualified: new Set(), minOccurrences: 3 }).removed.length,
       1, "8e plain object + Set inputs accepted");

  // ── 9. merchantEvidence takes the MAX per canonical key, not the pooled sum ───────────────────
  // Pooling would credit a merchant with evidence the detector never saw as a single group. MAX
  // asks the honest question: did any one group the detector actually evaluated carry enough?
  {
    const m = merchantEvidence({
      "fpos reid's dairy company": [1, 2],          // one raw group, 2 rows
      "reid's dairy company":      [1, 2, 3, 4],    // another spelling, 4 rows
      "netflix":                   [1],
    });
    t.eq(m.get("reid's dairy company"), 4, "9a MAX across spellings, not 6 (the sum)");
    t.eq(m.get("netflix"), 1,              "9b other merchant counted separately");
    t.eq(merchantEvidence(null).size, 0,   "9c null input is empty, not a throw");
  }

  // ══ REGRESSION TESTS FOR THE AUDIT FINDINGS ══════════════════════════════════════════════════

  // ── 10. AUDIT: post-hydrate slim blob must not wipe the bill list ─────────────────────────────
  // buildDbBlob strips Plaid transactions but not bills. After hydrate, bills is full and
  // transactions is a residue of statement/orphaned rows. The old design deleted everything here.
  {
    const residue = [
      { name: "COSTCO WHOLESALE", amount: 212.4, date: "2026-04-11", cat: "Shopping", pending: false },
    ];
    const stored = [onboardingBill, auto("Rent Payment"), auto("Hydro One"), auto("Netflix")];
    const occurrences = merchantEvidence(groupByMerchant(billCandidateExpenses(residue, [])));
    const qualified = detectRecurringBills(residue, {}).map(b => merchantKey(b.name));
    const { bills, removed } = pruneDisqualifiedBills(stored, {
      occurrences, qualified, minOccurrences: MIN_BILL_OCCURRENCES,
    });
    t.eq(removed.length, 0,   "10a one residue transaction removes NOTHING");
    t.eq(bills.length, 4,     "10b every stored bill survives a slim hydrate");
  }

  // ── 11. AUDIT: removing a bank account must not delete its bills ──────────────────────────────
  // removeAccount drops that account's transactions but leaves its bills. Those bills simply stop
  // being re-detectable, which must not be read as disqualification.
  {
    const stored = [auto("Hydro One"), auto("Netflix")];
    const { removed } = pruneDisqualifiedBills(stored, {
      occurrences: merchantEvidence({}), qualified: [], minOccurrences: MIN_BILL_OCCURRENCES,
    });
    t.eq(removed.length, 0, "11a disconnecting the bank deletes no bills");
  }

  // ── 12. AUDIT: a direct amount edit must not be reverted ──────────────────────────────────────
  // Settings ▸ Bills writes {...b, amount} straight into appData.bills and records NO override, so
  // re-deriving the bill would overwrite the user's figure on every keystroke.
  {
    const edited = auto("Netflix", { amount: "24.50" });   // user typed this; detector says 20.99
    const { bills, removed } = pruneDisqualifiedBills([edited], {
      occurrences: occ({ netflix: 4 }), qualified: ["netflix"], minOccurrences: 3,
    });
    t.eq(removed.length, 0,          "12a a still-qualifying bill is not touched");
    t.eq(bills[0].amount, "24.50",   "12b the user's typed amount survives");
    t.ok(bills[0] === edited,        "12c the object is not rebuilt at all");
  }

  // ── 13. AUDIT: nextDueDate must not be stripped ───────────────────────────────────────────────
  // billNextDue prefers nextDueDate.getDate() over parseInt(bill.date); for weekly/biweekly an
  // absent anchor means "due today". Dropping it re-phases the bill and moves Due Soon.
  {
    const weekly = auto("Gym", { freq: "weekly", nextDueDate: "2026-07-24" });
    const { bills } = pruneDisqualifiedBills([weekly], {
      occurrences: occ({ gym: 8 }), qualified: ["gym"], minOccurrences: 3,
    });
    t.eq(bills[0].nextDueDate, "2026-07-24", "13a weekly bill keeps its cadence anchor");
  }

  // ── 15. AUDIT ROUND 2: evidence must be counted over the DETECTOR'S grouping ──────────────────
  // merchantKey canonicalises further than the detector's raw-name grouping. Counting a flat list
  // through merchantKey pools variants the detector keeps apart, so a merchant it never evaluated
  // as one group could clear the evidence bar and be deleted with nothing having disqualified it.
  {
    const rows = (name, dates) => dates.map((d, i) => ({
      id: `${name}${i}`, name, merchant_name: name, amount: 20.99, date: d,
      cat: "Entertainment", category: ["Entertainment"], pending: false,
    }));
    const txns = [
      ...rows("NETFLIX.COM",     ["2026-04-17", "2026-05-17"]),
      ...rows("POS NETFLIX.COM", ["2026-06-17", "2026-07-17"]),
    ];
    const groups = groupByMerchant(billCandidateExpenses(txns, []));
    const ev = merchantEvidence(groups);
    t.eq(ev.get("netflix.com"), 2, "15a MAX across variants, not the pooled sum of 4");
    const { admitted } = detectRecurringBillsDetailed(txns, {});
    const { removed } = pruneDisqualifiedBills([auto("Netflix.com")], {
      occurrences: ev, qualified: admitted.map(b => merchantKey(b.name)),
      minOccurrences: MIN_OCCURRENCES_TO_JUDGE,
    });
    t.eq(removed.length, 0, "15b split descriptors delete nothing");
  }

  // ── 16. AUDIT ROUND 2: the near-duplicate collapse must not read as disqualification ──────────
  // detectRecurringBills returns a DISPLAY list: "Bell" is suppressed when "Bell Mobility" is
  // listed. The suppressed merchant passed every gate, so healing must consult `admitted`.
  {
    const mk = (name, amount, dates) => dates.map((d, i) => ({
      id: `${name}${i}`, name, merchant_name: name, amount, date: d,
      cat: "Bills", category: ["Bills"], pending: false,
    }));
    const dates = ["2026-03-08", "2026-04-08", "2026-05-08", "2026-06-08", "2026-07-08"];
    const txns = [...mk("BELL MOBILITY", 95, dates), ...mk("BELL", 90, dates)];
    const { bills, admitted } = detectRecurringBillsDetailed(txns, {});
    t.ok(bills.length < admitted.length,                       "16a the collapse did suppress one");
    t.ok(admitted.some(b => merchantKey(b.name) === "bell"),   "16b but it WAS admitted by the gates");
    const ev = merchantEvidence(groupByMerchant(billCandidateExpenses(txns, [])));
    t.eq(pruneDisqualifiedBills([auto("Bell")], {
           occurrences: ev, qualified: admitted.map(b => merchantKey(b.name)),
           minOccurrences: MIN_OCCURRENCES_TO_JUDGE,
         }).removed.length, 0, "16c the suppressed bill is NOT deleted");
    // The old, wrong source would have deleted it — pin that the display list really does omit it.
    t.eq(pruneDisqualifiedBills([auto("Bell")], {
           occurrences: ev, qualified: bills.map(b => merchantKey(b.name)),
           minOccurrences: MIN_OCCURRENCES_TO_JUDGE,
         }).removed.length, 1, "16d (and that using the display list WOULD have deleted it)");
  }

  // ── 17. AUDIT ROUND 2: deleting requires stronger evidence than detecting ─────────────────────
  // A 90-day fetch shows a monthly bill only ~3 times, and the cadence test compares the MEAN
  // visible gap to a band — not monotone under truncation. A bar of 5 puts monthly bills out of
  // judging range entirely, so truncation can never delete one.
  {
    t.ok(MIN_OCCURRENCES_TO_JUDGE > MIN_BILL_OCCURRENCES,
         "17a the bar to delete is strictly higher than the bar to create");
    t.eq(MIN_OCCURRENCES_TO_JUDGE, 5, "17b and it is 5 (a monthly bill cannot reach it in 90 days)");
    const monthly = auto("Enbridge Gas");
    t.eq(pruneDisqualifiedBills([monthly], {
           occurrences: occ({ "enbridge gas": 3 }), qualified: [],
         }).removed.length, 0, "17c 3 occurrences (a truncated monthly bill) is never judged");
    t.eq(pruneDisqualifiedBills([monthly], {
           occurrences: occ({ "enbridge gas": 4 }), qualified: [],
         }).removed.length, 0, "17d nor is 4");
    t.eq(pruneDisqualifiedBills([auto("Corner Store")], {
           occurrences: occ({ "corner store": 5 }), qualified: [],
         }).removed.length, 1, "17e frequent spend at 5+ IS judged, and healed");
  }

  // ── 18. AUDIT ROUND 3: a merchant name must never resolve through Object.prototype ────────────
  // A bare `occurrences[k]` returned the Object constructor for a bill named "Constructor":
  // truthy, and `function < 5` is NaN-false, so it cleared the evidence bar against an EMPTY map
  // and was deleted with no evidence whatsoever. Likewise a plain-object accumulator made
  // groupByMerchant throw on "__proto__", taking down detection entirely.
  {
    ["Constructor", "constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"].forEach(n => {
      t.eq(pruneDisqualifiedBills([auto(n)], { occurrences: {}, qualified: [], minOccurrences: 5 }).removed.length,
           0, `18a "${n}" is not deleted against empty plain-object evidence`);
    });
    t.eq(pruneDisqualifiedBills([auto("Acme")], { occurrences: { acme: "lots" }, qualified: [], minOccurrences: 5 }).removed.length,
         0, "18b a non-numeric count is not evidence");
    t.throws(() => groupByMerchant([{ name: "__proto__", amount: 1 }]),
             "18c groupByMerchant survives a merchant named __proto__", false);
    t.throws(() => groupByMerchant([{ name: "constructor", amount: 1 }]),
             "18d groupByMerchant survives a merchant named constructor", false);
    t.eq(groupByMerchant([{ name: "__proto__", amount: 1 }])["__proto__"].length, 1,
         "18e and still groups it correctly");
  }

  // ── 14. end-to-end against the REAL detector — the user's actual screen ───────────────────────
  {
    const txns = [];
    const add = (name, amount, date, cat) =>
      txns.push({ id: `${name}-${date}`, name, merchant_name: name, amount, date, cat,
                  category: [cat], pending: false });
    // Erratic warehouse spend, three occurrences — enough to JUDGE, and the spread gate rejects it.
    add("COSTCO WHOLESALE", 212.40, "2026-04-11", "Shopping");
    add("COSTCO WHOLESALE",  47.10, "2026-05-09", "Shopping");
    add("COSTCO WHOLESALE", 389.55, "2026-06-14", "Shopping");
    // A real subscription: same amount, same day, three months.
    add("NETFLIX", 20.99, "2026-04-17", "Entertainment");
    add("NETFLIX", 20.99, "2026-05-17", "Entertainment");
    add("NETFLIX", 20.99, "2026-06-17", "Entertainment");

    const occurrences = merchantEvidence(groupByMerchant(billCandidateExpenses(txns, [])));
    const qualified = detectRecurringBills(txns, {}).map(b => merchantKey(b.name));
    t.ok(!qualified.includes("costco wholesale"), "14a real detector rejects erratic warehouse spend");
    t.ok(qualified.includes("netflix"),           "14b real detector still accepts the subscription");
    t.eq(occurrences.get("costco wholesale"), 3,  "14c Costco has enough occurrences to be judged");

    const stored = [onboardingBill, auto("Costco Wholesale", { amount: "216.35" }), auto("Netflix")];
    const { bills, removed } = pruneDisqualifiedBills(stored, {
      occurrences, qualified, minOccurrences: MIN_BILL_OCCURRENCES,
    });
    t.eq(removed.map(b => b.name), ["Costco Wholesale"], "14d healing drops only the phantom");
    t.eq(bills.map(b => b.name), ["Rent", "Netflix"],    "14e user's bill and the subscription remain");
    const total = bills.reduce((s, b) => s + parseFloat(b.amount || 0), 0);
    t.approx(total, 1820.99, 0.01, "14f Due Soon total no longer includes the phantom");
  }

  t.summary("billReeval");
})();
