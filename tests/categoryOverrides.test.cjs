// tests/categoryOverrides.test.cjs
// -----------------------------------------------------------------------------
// A CORRECTION THAT OUTLIVES THE ROW IT WAS MADE ON.
//
// The app already had a correction UI and a synced store; what it did not have was
// memory. flourish_cat_overrides is keyed by TRANSACTION ID, and "apply to all" stamped
// only the transactions that existed at that moment, so tomorrow's charge from the same
// merchant arrived uncorrected and the household corrected it again. Two id hazards made
// it worse: statement rows are re-numbered on every import, and they arrived with no
// category at all.
//
// Section 4 is the one that matters: a transaction that did not exist when the correction
// was made takes the corrected category.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const c = await import("../src/lib/categoryOverrides.js");
  const { merchantKey: billKey } = await import("../src/lib/billReeval.js");
  const { FinancialCalcEngine } = await import("../src/lib/financialCalculations.js");
  const t = create();
  const txn = (id, name, cat) => ({ id, name, ...(cat ? { cat } : {}) });

  // ── 1. One owner for "same merchant" ─────────────────────────────────────────────────────────
  t.eq(c.merchantKey("  NETFLIX  "), "netflix", "1a case and spacing do not make a different merchant");
  t.eq(c.merchantKey("SQ *COFFEE SHOP 4821"), "coffee shop", "1b a POS prefix and a trailing account number do not either");
  t.eq(c.merchantKey(null), "", "1c a missing name is empty, not a crash");
  t.eq(c.merchantKey("Netflix"), billKey("Netflix"), "1d …and it is literally billReeval's key, not a second nearly-identical one");
  t.ok(!c.isUsableMerchantKey("ab") && c.isUsableMerchantKey("abc"), "1e under 3 characters is not enough to match on");

  // ── 2. Resolution order, most specific first ─────────────────────────────────────────────────
  const T = txn("t1", "Hydro One", "Shopping");
  t.eq(c.effectiveCategory(T, { t1: "Bills" }, { "hydro one": "Utilities" }), "Bills", "2a an override on this transaction wins");
  t.eq(c.effectiveCategory(T, {}, { "hydro one": "Utilities" }), "Utilities", "2b then a rule for its merchant");
  t.eq(c.effectiveCategory(T, {}, {}), "Shopping", "2c then the category it arrived with");
  t.eq(c.effectiveCategory(txn("t2", "Mystery"), {}, {}), "Other", "2d and finally Other — never undefined, which is what statement rows rendered");
  t.eq(c.effectiveCategory(null, {}, {}), "Other", "2e a missing transaction resolves rather than throwing");
  t.eq(c.effectiveCategory(txn("t3", "ab", "Shopping"), {}, { ab: "Travel" }), "Shopping", "2f a too-short merchant key is not matched");

  // ── 3. The legacy flat map keeps working ─────────────────────────────────────────────────────
  // Every existing household has { [txnId]: category } in storage. It must behave identically.
  t.eq(c.effectiveCategory(T, { t1: "Bills" }), "Bills", "3a a flat map is read as per-transaction overrides");
  t.eq(JSON.stringify(c.normaliseOverrides({ t1: "Bills" })), '{"byId":{"t1":"Bills"},"byMerchant":{}}', "3b …and normalises to the split shape");
  t.eq(JSON.stringify(c.normaliseOverrides({ byMerchant: { x: "Y" } })), '{"byId":{},"byMerchant":{"x":"Y"}}', "3c the split shape passes through");
  t.eq(JSON.stringify(c.normaliseOverrides(null)), '{"byId":{},"byMerchant":{}}', "3d nothing at all is empty, not a crash");

  // ── 4. THE POINT: a transaction that did not exist yet takes the correction ──────────────────
  {
    const merchants = c.setMerchantOverride({}, "Hydro One", "Utilities");
    const tomorrow = txn("plaid_999", "HYDRO ONE", "Shopping");   // arrives later, different id, different casing
    t.eq(c.effectiveCategory(tomorrow, {}, merchants), "Utilities",
      "4a a charge that did not exist when the correction was made arrives already corrected");
    const perTxnOnly = { t1: "Utilities" };
    t.eq(c.effectiveCategory(tomorrow, perTxnOnly, {}), "Shopping",
      "4b …which a per-transaction override could never do, and did not");
    t.eq(c.effectiveCategory(txn("x", "Hydro One Ltd"), {}, merchants), "Other",
      "4c a different merchant is not swept up by it");
  }

  // ── 5. Statement rows ────────────────────────────────────────────────────────────────────────
  {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "statementImport.js"), "utf8");
    t.ok(/cat: FALLBACK_CATEGORY/.test(src), "5a a statement row now arrives with a category");
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    t.ok(/cat:'Other', pending:false/.test(app), "5b …and so does a CSV row");

    // Statement ids are re-numbered on every import (`stmt_${i}` across the merged array), so a
    // per-id override silently re-points at a different transaction. A merchant rule cannot.
    const beforeImport = txn("stmt_3", "Loblaws", "Other");
    const afterImport  = txn("stmt_7", "Loblaws", "Other");      // same charge, new id
    const byId = { stmt_3: "Groceries" };
    t.eq(c.effectiveCategory(afterImport, byId, {}), "Other", "5c a per-id correction is lost when ids are renumbered");
    const merchants = c.setMerchantOverride({}, "Loblaws", "Groceries");
    t.eq(c.effectiveCategory(beforeImport, {}, merchants), "Groceries", "5d a merchant rule survives it");
    t.eq(c.effectiveCategory(afterImport, {}, merchants), "Groceries", "5e …on both sides of the renumbering");
  }

  // ── 6. The engines resolve through it ────────────────────────────────────────────────────────
  {
    const now = new Date(), day = now.toISOString().slice(0, 10);
    const data = { transactions: [{ id: "t1", name: "Hydro One", amount: 95, cat: "Shopping", date: day }],
                   incomes: [], bills: [], debts: [], accounts: [] };
    const spend = (ov) => FinancialCalcEngine.cashFlow(data, ov, now).monthlySpend;
    t.eq(spend({}), 95, "6a with no correction the charge is discretionary spend");
    t.eq(spend({ t1: "Utilities" }), 0, "6b a legacy per-id override still moves it out of spend, exactly as before");
    t.eq(spend({ byId: {}, byMerchant: { "hydro one": "Utilities" } }), 0, "6c and a merchant rule does the same");
    t.eq(spend({ byId: { t1: "Shopping" }, byMerchant: { "hydro one": "Utilities" } }), 95, "6d per-transaction still wins inside the engine");
  }

  // ── 7. It survives a reload, and a new device ────────────────────────────────────────────────
  {
    const persistence = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "persistence.js"), "utf8");
    t.ok(/"flourish_cat_merchant_overrides"/.test(persistence),
      "7a the merchant rules are in the sync allow-list — without this they are local-only and lost on a new device");
    const sideKeysBlock = persistence.slice(persistence.indexOf("const SIDE_KEYS"), persistence.indexOf("];", persistence.indexOf("const SIDE_KEYS")));
    t.ok(/flourish_cat_overrides/.test(sideKeysBlock) && /flourish_cat_merchant_overrides/.test(sideKeysBlock),
      "7b …alongside the per-transaction ones, so a reload restores both layers");
  }

  // ── 8. Writing rules ─────────────────────────────────────────────────────────────────────────
  {
    const base = c.setMerchantOverride({}, "Netflix", "Subscriptions");
    t.eq(base.netflix, "Subscriptions", "8a a rule is stored under the shared key");
    t.eq(Object.keys(c.setMerchantOverride(base, "ab", "Travel")).length, 1, "8b a too-short name writes nothing");
    t.eq(Object.keys(c.setMerchantOverride(base, "Gym", "")).length, 1, "8c an empty category writes nothing");
    t.eq(Object.keys(c.clearMerchantOverride(base, "NETFLIX")).length, 0, "8d a rule can be removed, case-insensitively");
    t.eq(base.netflix, "Subscriptions", "8e …without mutating the map it was given");
    t.eq(c.countMatching([txn("a", "Netflix"), txn("b", "netflix "), txn("c", "Other")], "NETFLIX"), 2,
      "8f the count the prompt shows uses the same key as the rule it writes");
  }

  t.summary("categoryOverrides.test");
})();
