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
  t.ok(c.merchantKey === billKey, "1d …and it is literally billReeval's function, not a second nearly-identical one");
  t.ok(!c.isUsableMerchantKey("ab") && c.isUsableMerchantKey("abc"), "1e under 3 characters is not enough to match on");

  // ── 2. Resolution order, most specific first ─────────────────────────────────────────────────
  const T = txn("t1", "Hydro One", "Shopping");
  t.eq(c.effectiveCategory(T, { t1: "Bills" }, { "hydro one": "Utilities" }), "Bills", "2a an override on this transaction wins");
  t.eq(c.effectiveCategory(T, {}, { "hydro one": "Utilities" }), "Utilities", "2b then a rule for its merchant");
  t.eq(c.effectiveCategory(T, {}, {}), "Shopping", "2c then the category it arrived with");
  t.eq(c.effectiveCategory(txn("t2", "Mystery"), {}, {}), "Other", "2d and finally Other — never undefined, which is what statement rows rendered");
  t.eq(c.effectiveCategory(null, {}, {}), "Other", "2e a missing transaction resolves rather than throwing");
  t.eq(c.effectiveCategory(txn("t3", "ab", "Shopping"), {}, { ab: "Travel" }), "Shopping", "2f a too-short merchant key is not matched");

  // ── 2b. A merchant named like an Object member is not a category ─────────────────────────────
  // merchantKey lowercases, and two Object.prototype members survive that: "__proto__" and
  // "constructor". A bare bracket read would resolve them through the prototype chain and return
  // a function as the category — on a completely EMPTY override store.
  for (const hostile of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
    t.eq(c.effectiveCategory(txn("h", hostile), {}, {}), "Other", `2p a merchant named ${hostile} resolves to Other, not to an inherited member`);
    t.eq(c.effectiveCategory({ id: hostile, name: "Shop" }, {}, {}), "Other", `2q …and neither does a transaction whose id is ${hostile}`);
  }
  t.eq(c.effectiveCategory(txn("h", "__proto__"), {}, { __proto__: "Travel" }), "Other",
    "2r …and a literal __proto__ entry in the map is not reachable either, which is what an attacker-shaped name would aim for");

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
    // Behaviour, not a grep: run the real importer and look at the row it produces. The grep that
    // used to stand here passed as long as the literal appeared anywhere in the file.
    const { rowsToImport } = await import("../src/lib/statementImport.js");
    const rows = rowsToImport(
      [{ id: "r1", date: "2026-09-01", name: "Loblaws", amount: 52.4, status: "ok" }],
      ["r1"]);
    t.eq(rows.length, 1, "5a0 the importer produced the row");
    t.eq(rows[0].cat, c.FALLBACK_CATEGORY, "5a a statement row now arrives WITH a category, not undefined");
    t.eq(c.effectiveCategory(rows[0], {}, {}), "Other", "5a2 …so it resolves to Other rather than rendering a blank chip");
    t.eq(c.effectiveCategory(rows[0], {}, c.setMerchantOverride({}, "Loblaws", "Groceries")), "Groceries",
      "5a3 …and it is correctable by merchant like anything else");
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
    t.eq(c.countMatching([txn("a", "Netflix"), txn("b", "netflix "), txn("c", "Other")], "NETFLIX"), 2, "8f counting is by merchant key");
    // The claim that matters is about the SHIPPED prompt, not about countMatching agreeing with
    // itself: recatWithSmartPrompt must count with the same key recat writes the rule with.
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    const prompt = app.slice(app.indexOf("const recatWithSmartPrompt"), app.indexOf("const recatWithSmartPrompt") + 900);
    t.ok(/merchantKey\(t\.name\) === mKeyPrompt/.test(prompt),
      "8g the apply-to-all prompt counts with merchantKey, the key the rule is written with");
    t.ok(!/\(t\.name\|\|""\)\.toLowerCase\(\)\.trim\(\) === /.test(prompt),
      "8h …and no longer with a plainer key that matched a different set than it would change");
  }


  // ── 9. A LEADING reference number must not take the merchant with it ─────────────────────────
  // The regex was /\s+\d{4,}.*$/ — the .*$ meant the FIRST run of four digits swallowed the rest
  // of the descriptor. Section 1 only ever tested a TRAILING number, which is why 2,539 green
  // assertions missed it. These are real Canadian descriptor shapes.
  {
    const cases = [
      ["POS PURCHASE 1234 LOBLAWS", "purchase loblaws"],
      ["FPOS 1234 REIDS DAIRY", "reids dairy"],
      ["PREAUTHORIZED DEBIT 1111 INSURANCE", "preauthorized debit insurance"],
      ["HYDRO ONE 123456789", "hydro one"],              // trailing still works
      ["SQ *COFFEE SHOP 4821", "coffee shop"],
    ];
    for (const [raw, expected] of cases) {
      t.eq(c.merchantKey(raw), expected, `9a ${raw} keys as ${expected}, keeping the merchant`);
      t.ok(!["purchase", "fpos", "preauthorized debit", "pos"].includes(c.merchantKey(raw)),
        `9b …and never collapses to bank noise alone`);
    }
    // The same merchant with a different reference number is the SAME key, or a rule would never
    // reach the next charge.
    t.eq(c.merchantKey("POS PURCHASE 1234 LOBLAWS"), c.merchantKey("POS PURCHASE 5678 LOBLAWS"),
      "9c two charges at one merchant with different reference numbers share a key");
  }

  // ── 10. A key with no merchant in it is not a rule ───────────────────────────────────────────
  // Length was the only guard, and "purchase" is 8 characters. A rule keyed on it would apply to
  // every POS purchase the household ever makes, and those categories feed monthlySpend, cashFlow,
  // savingsRate, emergencyFundMonths and the health score.
  {
    for (const raw of ["POS PURCHASE 1234", "PREAUTHORIZED DEBIT 1111", "INTERAC E-TRANSFER 9911", "VISA PAYMENT"]) {
      t.eq(Object.keys(c.setMerchantOverride({}, raw, "Groceries")).length, 0,
        `10a no rule is written for ${raw}, which names no merchant`);
    }
    for (const raw of ["POS PURCHASE 1234 LOBLAWS", "Loblaws", "FPOS 1234 REIDS DAIRY"]) {
      t.eq(Object.keys(c.setMerchantOverride({}, raw, "Groceries")).length, 1, `10b …but one IS written for ${raw}`);
    }
    t.ok(!c.hasMerchantToken("purchase") && c.hasMerchantToken("purchase loblaws"), "10c the test is for a merchant-specific token, not for length");
    // A generic key that somehow reached storage is not matched either.
    t.eq(c.effectiveCategory({ id: "x", name: "POS PURCHASE 9999" }, {}, { purchase: "Groceries" }), "Other",
      "10d …and a generic key already in storage does not resolve, so an old bad rule stops applying");
  }

  // ── 11. A rule can be removed, and the UI can do it ──────────────────────────────────────────
  {
    const rules = c.setMerchantOverride({}, "Loblaws", "Groceries");
    t.eq(Object.keys(c.clearMerchantOverride(rules, "LOBLAWS")).length, 0, "11a clearing is case-insensitive");
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    t.ok(/clearMerchantOverride\(rules, recatTxn\.name\)/.test(app), "11b …and the sheet calls it, so a bad rule can be undone without editing storage");
    t.ok(/Remove rule/.test(app), "11c …behind a visible control");
    // The prompt must name the thing the rule changes.
    t.ok(/merchantKey\(applyAllPrompt\.txn\.name\)/.test(app),
      "11d the apply-to-all prompt names the merchant KEY, not the raw descriptor it does not match on");
  }


  // ── 12. A deny-list of single WORDS cannot do this job ───────────────────────────────────────
  // Each of these contains a token that is not itself bank noise — "atm", "sent", "sale",
  // "advance", "fee" — so the word-level guard accepted every one. A household recategorising a
  // single $200 cash withdrawal as Groceries would then permanently recategorise every ATM
  // withdrawal they ever make.
  {
    for (const key of ["atm withdrawal", "abm withdrawal", "pre authorized payment",
                       "interac e-transfer sent", "send e-tfr", "point of sale purchase",
                       "cash advance", "nsf fee", "overdraft fee", "pos purchase", "bill payment"]) {
      t.ok(!c.isUsableMerchantKey(key), `12a "${key}" names no merchant and cannot become a rule`);
      t.eq(Object.keys(c.setMerchantOverride({}, key, "Groceries")).length, 0, `12b …and writing one is refused`);
    }
    for (const key of ["purchase loblaws", "atm withdrawal metro", "loblaws", "hydro one", "reids dairy"]) {
      t.ok(c.isUsableMerchantKey(key), `12c "${key}" does name a merchant`);
    }
    t.eq(c.stripBankingPhrases("interac e-transfer sent"), "", "12d the phrase is removed whole, not word by word");
    t.eq(c.stripBankingPhrases("atm withdrawal metro"), "metro", "12e …leaving whatever names the merchant");
    t.eq(c.stripBankingPhrases("one stop shop"), "one stop shop", "12f …and an ordinary name survives intact");
  }

  // ── 13. A forward-applying rule is never written without asking ──────────────────────────────
  {
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
    const recat = app.slice(app.indexOf("const recat = (txn, newCat"), app.indexOf("const recatWithSmartPrompt"));
    t.ok(/if \(applyToAll\) \{/.test(recat), "13a recat writes a merchant rule only on an explicit apply-to-all");
    t.ok(!/others <= 1/.test(recat), "13b …and no longer writes one silently when nothing else matches");
    const prompt = app.slice(app.indexOf("const recatWithSmartPrompt"), app.indexOf("const recatWithSmartPrompt") + 1200);
    t.ok(/isUsableMerchantKey\(mKeyPrompt\)/.test(prompt), "13c the prompt is shown whenever a rule COULD be written…");
    t.ok(!/otherSameMerchant\.length > 0/.test(prompt), "13d …not only when other transactions already match");
  }

  t.summary("categoryOverrides.test");
})();
