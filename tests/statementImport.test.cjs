// tests/statementImport.test.cjs — Step 2b: statement-import validators + no-write-before-confirm.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const S = await import("../src/lib/statementImport.js");
  const { amountAppearsInSource, parseRowDate, classifyRow, reconcile, computeConfidence,
          validateStatementImport, rowsToImport, isSelectable, IMPORT_SOURCE } = S;

  // ── amountAppearsInSource ─────────────────────────────────────────────────────────────────────
  t.ok(amountAppearsInSource(12.34, "GROCERY 12.34"),          "1a plain match");
  t.ok(amountAppearsInSource(1234.56, "$1,234.56 DR"),         "1b commas + currency stripped");
  t.ok(amountAppearsInSource(-42.00, "PAYROLL 42.00 CR"),      "1c credit magnitude match");
  t.ok(amountAppearsInSource(1234, "BILL 1234 "),              "1d whole-dollar, no cents");
  t.ok(!amountAppearsInSource(12.34, "GROCERY 99.99"),         "1e absent amount fails");
  t.ok(!amountAppearsInSource(NaN, "anything"),                "1f NaN never appears");
  t.ok(!amountAppearsInSource(123, "invoice 12345"),           "1g no spurious substring match");

  // ── parseRowDate ──────────────────────────────────────────────────────────────────────────────
  t.ok(parseRowDate("2026-08-04") instanceof Date, "2a ISO date parses");
  t.eq(parseRowDate("2026-02-31"), null,            "2b impossible date rejected");
  t.eq(parseRowDate("not a date"), null,            "2c garbage rejected");

  // ── classifyRow: failures never coerce to 0 ───────────────────────────────────────────────────
  const good = { date: "2026-08-04", name: "Grocery", amount: 12.34, source: "GROCERY 12.34" };
  t.eq(classifyRow(good).status, "ok", "3a a clean row is ok");
  t.eq(classifyRow({ ...good, amount: "N/A" }).status, "failed", "3b non-numeric amount → failed");
  t.eq(classifyRow({ ...good, amount: "N/A" }).amount, null, "3c and amount is null, NOT 0");
  t.eq(classifyRow({ ...good, amount: 99.99, source: "GROCERY 12.34" }).status, "failed",
       "3d amount not in source text → failed");
  t.eq(classifyRow({ ...good, date: "nope" }).status, "failed", "3e bad date → failed");
  t.eq(classifyRow({ ...good, name: "  " }).status, "failed", "3f empty name → failed");
  {
    const r = classifyRow(good, { periodStart: parseRowDate("2026-09-01"), periodEnd: parseRowDate("2026-09-30") });
    t.eq(r.status, "questionable", "3g valid but outside period → questionable");
    t.ok(r.reasons.some(x => /outside/.test(x)), "3h with a reason");
  }
  {
    const seen = new Set();
    classifyRow(good, { seen });
    const dup = classifyRow(good, { seen });
    t.eq(dup.status, "questionable", "3i duplicate → questionable (still selectable)");
  }

  // user-edited rows: trustAmount skips the source check (a hand-corrected number is authoritative)
  t.eq(classifyRow({ date: "2026-08-04", name: "Fixed", amount: 88.00, source: "unrelated" }, { trustAmount: true }).status,
       "ok", "3j a hand-edited valid amount is accepted without a source match");
  t.eq(classifyRow({ date: "2026-08-04", name: "Fixed", amount: "still bad", source: "x" }, { trustAmount: true }).status,
       "failed", "3k but a still-non-numeric edit stays failed");

  // ── reconcile ─────────────────────────────────────────────────────────────────────────────────
  {
    const rows = [
      { status: "ok", amount: 100 }, { status: "ok", amount: 50 }, { status: "ok", amount: -30 },
    ];
    const r = reconcile(rows, { totalDebits: 150, totalCredits: 30 });
    t.ok(r.applicable && r.allOk, "4a debits/credits reconcile");
    const bad = reconcile(rows, { totalDebits: 999, totalCredits: 30 });
    t.ok(bad.applicable && !bad.allOk, "4b a wrong total breaks reconciliation");
    const bal = reconcile(rows, { openingBalance: 1000, closingBalance: 880 }); // 1000 − (100+50−30)=880
    t.ok(bal.allOk, "4c opening + rows === closing");
    t.ok(!reconcile(rows, {}).applicable, "4d no anchors → not applicable");
  }

  // ── computeConfidence ─────────────────────────────────────────────────────────────────────────
  t.eq(computeConfidence([{ status: "ok" }, { status: "ok" }], { applicable: false }).level, "high", "5a clean → high");
  t.eq(computeConfidence([{ status: "failed" }], { applicable: false }).level, "low", "5b all failed → low");
  t.eq(computeConfidence([], { applicable: false }).level, "none", "5c empty → none");
  t.eq(computeConfidence([{ status: "ok" }, { status: "failed" }], { applicable: false }).failed, 1, "5d counts failures");

  // ── validateStatementImport: end-to-end batch ────────────────────────────────────────────────
  {
    const parsed = {
      rows: [
        { date: "2026-08-02", name: "Grocery", amount: 54.20, source: "GROCERY 54.20" },
        { date: "2026-08-05", name: "Payroll", amount: -2000.00, source: "PAYROLL 2,000.00 CR" },
        { date: "2026-08-09", name: "Bad row", amount: "??", source: "??" },  // failed
      ],
      anchors: { period: { start: "2026-08-01", end: "2026-08-31" }, totalDebits: 54.20, totalCredits: 2000 },
    };
    const b = validateStatementImport(parsed);
    t.eq(b.rows.length, 3, "6a all rows returned for review (nothing dropped silently)");
    t.eq(b.rows.filter(r => r.status === "failed").length, 1, "6b one failed row flagged");
    t.eq(b.confidence.selectable, 2, "6c two selectable rows");
    t.ok(b.proceed, "6d proceed=true when something is selectable");
    t.ok(b.reconciliation.allOk, "6e batch reconciles");
    // failed parse → proceed=false → caller imports nothing
    t.eq(validateStatementImport({ rows: [{ date: "x", name: "", amount: "z" }] }).proceed, false, "6f unusable parse → proceed=false");
    t.eq(validateStatementImport({ rows: [] }).proceed, false, "6g empty parse → proceed=false");
  }

  // ── rowsToImport: the NO-WRITE-BEFORE-CONFIRM gate ───────────────────────────────────────────
  {
    const b = validateStatementImport({
      rows: [
        { date: "2026-08-02", name: "A", amount: 10, source: "A 10.00" },     // stmt_0 ok
        { date: "2026-08-03", name: "B", amount: "?", source: "?" },          // stmt_1 failed
      ], anchors: {},
    });
    // nothing selected → nothing written
    t.eq(rowsToImport(b.rows, []).length, 0, "7a no selection → no rows written");
    // selecting a valid row writes it, stamped with the source
    const out = rowsToImport(b.rows, ["stmt_0"], "acct1");
    t.eq(out.length, 1, "7b selected valid row is written");
    t.eq(out[0].source, IMPORT_SOURCE, "7c imported row stamped source=statement-import");
    t.eq(out[0].account_id, "acct1", "7d account tag applied");
    t.eq(out[0].amount, 10, "7e amount preserved exactly");
    // a failed row can never be imported, even if its id is passed
    t.throws(() => rowsToImport(b.rows, ["stmt_1"]), "7f a failed row cannot be imported");
    t.ok(!isSelectable(b.rows.find(r => r.id === "stmt_1")), "7g failed row is not selectable");
    t.ok(isSelectable(b.rows.find(r => r.id === "stmt_0")),  "7h valid row is selectable");
    t.throws(() => rowsToImport(b.rows, ["stmt_99"]), "7i unknown id rejected");
  }

  // ── Item 3: an edited row becomes user-entered data with distinct provenance ──────────────────
  {
    const original = { date: "2026-08-02", name: "Grocery", amount: 54.20, source: "GROCERY 54.20" };
    const batch = validateStatementImport({ rows: [original], anchors: {} });
    const row = batch.rows[0];

    // un-edited → verbatim-matched, no original snapshot
    const clean = rowsToImport([row], [row.id]);
    t.eq(clean[0].edited, false,             "P1 un-edited row is not marked edited");
    t.eq(clean[0].verbatimSourceMatch, true, "P2 un-edited row passed the verbatim source match");
    t.ok(!("originalExtracted" in clean[0]), "P3 un-edited row keeps no separate original");

    // user hand-corrects the amount → edited provenance, NOT a verbatim-source claim, original kept
    const edited = { ...row, amount: 45.00, edited: true }; // raw still holds the extracted 54.20
    const out = rowsToImport([edited], [edited.id]);
    t.eq(out[0].edited, true,                 "P4 edited row is marked edited");
    t.eq(out[0].verbatimSourceMatch, false,   "P5 the edited amount is NOT represented as verbatim-matched");
    t.eq(out[0].amount, 45.00,                "P6 imported amount is the user's corrected value");
    t.eq(out[0].source, IMPORT_SOURCE,        "P7 still stamped source=statement-import");
    t.eq(out[0].originalExtracted.amount, 54.20, "P8 the model's original extraction is kept for provenance");
    t.eq(out[0].originalExtracted.name, "Grocery", "P9 original name kept too");
  }

  t.summary("statementImport");
})();
