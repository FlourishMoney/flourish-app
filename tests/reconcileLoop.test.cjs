// tests/reconcileLoop.test.cjs
// -----------------------------------------------------------------------------
// THE SHARED LOOP, AND PROOF THAT INCOME DID NOT MOVE.
//
// src/lib/reconcileLoop.js is incomeReconcile.js's decision shape with the income taken
// out, so bills and categories can reuse it. A refactor of the one feature that already
// worked is only safe if it is provably identical, so section 3 runs the FROZEN
// pre-refactor implementation (tests/fixtures/incomeReconcile.before.mjs, a copy of the
// module at 66e655d) and the live one over the same matrix and requires deep equality on
// every answer — not just the prompt flag, the whole returned object.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const loop = await import("../src/lib/reconcileLoop.js");
  const live = await import("../src/lib/incomeReconcile.js");
  const before = await import("./fixtures/incomeReconcile.before.mjs");
  const t = create();
  const { decidePrompt } = loop;

  // ── 1. The decision itself ───────────────────────────────────────────────────────────────────
  t.eq(decidePrompt({ signature: null, differences: ["amount"] }).reason, "no-detection", "1a no signature means nothing was detected");
  t.eq(decidePrompt({ signature: null }).signature, null, "1b …and the signature is reported as null, not as the falsy value passed in");
  t.eq(decidePrompt({ signature: "s1", differences: [] }).reason, "within-tolerance", "1c a finding with no differences is not worth a question");
  t.eq(decidePrompt({ signature: "s1", differences: ["amount"] }).prompt, true, "1d a finding with a difference is");
  t.eq(decidePrompt({ signature: "s1", differences: ["amount"] }).reasons.join(","), "amount", "1e …and it carries why");
  t.eq(decidePrompt({ signature: "s1", differences: ["amount"], dismissedSignature: "s1" }).reason, "dismissed", "1f the same finding, already declined, is not re-asked");
  t.eq(decidePrompt({ signature: "s2", differences: ["amount"], dismissedSignature: "s1" }).prompt, true,
    "1g …but a DIFFERENT finding may still ask — declining is not permanent");
  t.eq(decidePrompt({ signature: "s1", differences: ["amount"], blockedReason: "no-current-income" }).reason, "no-current-income",
    "1h a domain guard outranks the difference");
  t.eq(decidePrompt({ signature: "s1", differences: ["amount"], dismissedSignature: "s1", blockedReason: "no-current-income" }).reason, "no-current-income",
    "1i …and is checked BEFORE the dismissal, so nothing is recorded against a question that was never askable");
  t.eq(decidePrompt({ signature: "s1", differences: [null, "", "amount"] }).reasons.join(","), "amount", "1j empty reason codes are ignored");
  t.eq(decidePrompt({}).reason, "no-detection", "1k called with nothing at all, it still answers");
  t.ok(!("reasons" in decidePrompt({ signature: "s1", differences: [] })), "1l a non-prompt carries no reasons key");

  // ── 2. Remembering ───────────────────────────────────────────────────────────────────────────
  t.eq(loop.dismissalFieldFor("income"), "incomeSuggestionDismissed",
    "2a income keeps the field it already uses, so a household mid-flight is not re-asked");
  t.eq(loop.dismissalFieldFor("bills"), "billSuggestionDismissed", "2b bills have their own");
  t.eq(loop.dismissedSignatureFor({ incomeSuggestionDismissed: "sig" }, "income"), "sig", "2c a dismissal is read back");
  t.eq(loop.dismissedSignatureFor({}, "income"), null, "2d …and absent is null, not undefined");
  t.eq(JSON.stringify(loop.rememberDismissal("bills", "sig")), '{"billSuggestionDismissed":"sig"}', "2e remembering is a patch, not a write");
  t.eq(JSON.stringify(loop.clearDismissal("income")), '{"incomeSuggestionDismissed":null}', "2f accepting clears it, so a later change may ask again");
  let threw = false;
  try { loop.dismissalFieldFor("nonsense"); } catch { threw = true; }
  t.ok(threw, "2g an unknown domain throws rather than silently writing to undefined");

  // ── 3. Income is byte-for-byte what it was ───────────────────────────────────────────────────
  const DETECTED = [
    null, undefined, {},
    { perDeposit: 0 }, { perDeposit: -5, freq: "biweekly" }, { perDeposit: "abc" },
    { perDeposit: 2000, freq: "biweekly" },
    { perDeposit: 2000.4, freq: "biweekly" },
    { perDeposit: 2600, freq: "biweekly" },
    { perDeposit: 2000, freq: "monthly", anchorDay: 15 },
    { perDeposit: 2000, freq: "monthly", anchorDay: 28 },
    { perDeposit: 2000, freq: "semimonthly", anchorDay: 0 },
    { perDeposit: 2000, freq: "weekly", label: "Shifts", isVariable: true },
    { perDeposit: 2000, anchorDay: 3 },
  ];
  const CURRENT = [
    null, undefined, [], [{}], [{ amount: "0" }],
    [{ amount: "2000", freq: "biweekly", id: 1 }],
    [{ amount: "2470", freq: "biweekly", id: 1 }],
    [{ amount: "2600", freq: "monthly", id: 7, anchorDay: 15 }],
    [{ amount: "2000", freq: "monthly", id: 2, anchorDay: 1 }],
    [{ amount: "500", freq: "weekly", id: 3 }, { amount: "2000", freq: "biweekly", id: 4 }],
  ];
  const DISMISSED = [null, "2000|biweekly|?", "2600|biweekly|?", "nonsense"];

  let compared = 0, mismatches = [];
  for (const detected of DETECTED) {
    for (const currentIncomes of CURRENT) {
      for (const dismissedSignature of DISMISSED) {
        const args = { detected, currentIncomes, dismissedSignature };
        const a = JSON.stringify(before.shouldPromptIncome(args) ?? null);
        const b = JSON.stringify(live.shouldPromptIncome(args) ?? null);
        compared++;
        if (a !== b) mismatches.push(`${JSON.stringify(args)}\n  before: ${a}\n  after:  ${b}`);
      }
    }
    // the other exports too, over the same detections
    const sa = JSON.stringify(before.detectionSignature(detected) ?? null);
    const sb = JSON.stringify(live.detectionSignature(detected) ?? null);
    compared++;
    if (sa !== sb) mismatches.push(`detectionSignature(${JSON.stringify(detected)}): ${sa} vs ${sb}`);
  }
  for (const currentIncomes of CURRENT) {
    for (const detected of DETECTED) {
      const da = JSON.stringify(before.incomeDifferences(detected, currentIncomes));
      const db = JSON.stringify(live.incomeDifferences(detected, currentIncomes));
      compared++;
      if (da !== db) mismatches.push(`incomeDifferences: ${da} vs ${db}`);
      const sug = before.shouldPromptIncome({ detected, currentIncomes }).suggestion;
      const aa = JSON.stringify(before.applyDetectedIncome(currentIncomes, sug));
      const ab = JSON.stringify(live.applyDetectedIncome(currentIncomes, sug));
      compared++;
      if (aa !== ab) mismatches.push(`applyDetectedIncome: ${aa} vs ${ab}`);
    }
  }
  t.ok(compared > 700, `3a compared the frozen implementation and the live one ${compared} times`);
  t.eq(mismatches.slice(0, 2).join("\n---\n") || "(identical)", "(identical)",
    "3b every answer is identical after the refactor");

  // ── 4. …and it is genuinely going through the shared loop ────────────────────────────────────
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "incomeReconcile.js"), "utf8");
  t.ok(/import \{ decidePrompt \} from "\.\/reconcileLoop\.js"/.test(src), "4a incomeReconcile imports the shared decision");
  t.ok(/decidePrompt\(\{/.test(src), "4b …and calls it");
  t.ok(!/reason: "dismissed"/.test(src), "4c …and no longer carries its own copy of the dismissal branch");
  t.ok(!/reason: "within-tolerance"/.test(src), "4d …or the tolerance branch");

  t.summary("reconcileLoop.test");
})();
