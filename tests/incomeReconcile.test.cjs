// tests/incomeReconcile.test.cjs
// -----------------------------------------------------------------------------
// Sprint D Fix — Option B: bank-detected pay wins, but ASKS first.
//
// THE DEFECT: the sync did
//     const hasRealIncome = (prev.incomes||[]).some(i => parseFloat(i.amount||0) > 0);
//     if (!detectedIncome || hasRealIncome) return prev.incomes;
// Onboarding REQUIRES an income before you can continue, so hasRealIncome was permanently true and
// bank-detected pay was discarded forever. The forecast ran on the onboarding guess ($2,600 biweekly)
// while the bank said otherwise, and every Sprint A/B detector's output was computed then thrown away.
//
// THE RULE NOW: the user's figure keeps driving the forecast until THEY accept a correction. Prompt
// only on a meaningful difference; never re-prompt for a detection they already declined.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { shouldPromptIncome, applyDetectedIncome, incomeDifferences, primaryIncome,
          detectionSignature, cadenceLabel, AMOUNT_TOLERANCE } = await import("../src/lib/incomeReconcile.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const t = create();

  // Amanda's real state: onboarding said $2,600 biweekly.
  const onboardingIncomes = [{ id:1, label:"Salary", amount:"2600", freq:"biweekly", type:"employment" }];
  // detectIncomeFromTxns output shape (the STRONG detector — per-deposit median + detectCadence).
  const det = (perDeposit, freq, anchorDay=null, extra={}) =>
    ({ perDeposit, freq, anchorDay, label:"ACME PAYROLL", isVariable:false, ...extra });

  // ── 1. Detected differs MATERIALLY → prompt ────────────────────────────────────────────────────
  {
    const r = shouldPromptIncome({ detected: det(2000, "biweekly"), currentIncomes: onboardingIncomes });
    t.eq(r.prompt, true,
         "bank says $2,000/2wk but the plan says $2,600 → PROMPT. Under the old guard this detection " +
         "was silently discarded and the forecast kept the onboarding guess forever.");
    t.eq(r.reasons.includes("amount"), true, "…flagged as an amount difference");
    t.eq(r.suggestion.detected.amount, 2000, "…the card shows the bank's figure");
    t.eq(r.suggestion.current.amount, 2600, "…alongside the user's current figure");
  }

  // A different CADENCE alone is material, even at the same amount.
  {
    const r = shouldPromptIncome({ detected: det(2600, "monthly"), currentIncomes: onboardingIncomes });
    t.eq(r.prompt, true, "same amount but monthly vs biweekly → PROMPT (a 2.17x forecast error)");
    t.eq(r.reasons.includes("cadence"), true, "…flagged as a cadence difference");
  }

  // A moved payday is material for calendar-anchored pay.
  {
    const cur = [{ id:1, amount:"5000", freq:"monthly", anchorDay:1 }];
    const r = shouldPromptIncome({ detected: det(5000, "monthly", 25), currentIncomes: cur });
    t.eq(r.prompt, true, "same amount and cadence but payday moved 1st → 25th → PROMPT");
    t.eq(r.reasons.includes("payday"), true, "…flagged as a payday difference");
  }

  // ── 2. Within threshold → NO prompt (don't nag on rounding noise) ─────────────────────────────
  {
    t.eq(shouldPromptIncome({ detected: det(2600, "biweekly"), currentIncomes: onboardingIncomes }).prompt, false,
         "an exact match never prompts");
    t.eq(shouldPromptIncome({ detected: det(2650, "biweekly"), currentIncomes: onboardingIncomes }).prompt, false,
         "$2,650 vs $2,600 is under the 5% tolerance — variable-pay noise, not news");
    t.eq(shouldPromptIncome({ detected: det(2600, "biweekly"), currentIncomes: onboardingIncomes }).reason,
         "within-tolerance", "…and the reason says so");
    // Just over the line DOES prompt.
    t.eq(shouldPromptIncome({ detected: det(2800, "biweekly"), currentIncomes: onboardingIncomes }).prompt, true,
         "$2,800 vs $2,600 (7.7%) is over tolerance → prompt");
    t.eq(AMOUNT_TOLERANCE, 0.05, "the tolerance is an explicit 5%, not a magic number");
    // A payday drift within 2 days is weekend shifting, not a move.
    const cur = [{ id:1, amount:"5000", freq:"monthly", anchorDay:15 }];
    t.eq(shouldPromptIncome({ detected: det(5000, "monthly", 16), currentIncomes: cur }).prompt, false,
         "payday 15 → 16 is inside the 2-day tolerance (weekend shift), no prompt");
  }

  // ── 3. No detection → nothing changes ─────────────────────────────────────────────────────────
  {
    t.eq(shouldPromptIncome({ detected: null, currentIncomes: onboardingIncomes }).prompt, false,
         "no detection → no prompt");
    t.eq(shouldPromptIncome({ detected: det(0, "biweekly"), currentIncomes: onboardingIncomes }).prompt, false,
         "a zero-amount detection is not a detection");
    t.eq(applyDetectedIncome(onboardingIncomes, null), onboardingIncomes,
         "…and the onboarding income is returned untouched");
  }

  // No CURRENT income → the caller adopts directly; there is nothing to reconcile.
  t.eq(shouldPromptIncome({ detected: det(2000, "biweekly"), currentIncomes: [] }).reason, "no-current-income",
       "with no user income there is nothing to overwrite — direct adoption, no card");

  // ── 4. ACCEPT → income replaced, forecast recomputes ──────────────────────────────────────────
  {
    const r = shouldPromptIncome({ detected: det(2000, "biweekly"), currentIncomes: onboardingIncomes });
    const next = applyDetectedIncome(onboardingIncomes, r.suggestion);
    t.eq(next.length, 1, "the income list keeps its shape");
    t.eq(next[0].amount, "2000", "the amount is replaced with the bank's per-deposit figure");
    t.eq(next[0].freq, "biweekly", "the cadence comes from the detector");
    t.eq(next[0].id, 1, "identity (id) is preserved — we patch, not recreate");
    t.eq(next[0].label, "Salary", "…and the user's label is kept");
    t.eq(next[0].autoDetected, true, "…flagged as bank-derived");

    // The forecast actually moves.
    const mk = (incomes) => ({
      accounts:[{id:"chq",name:"Chq",type:"depository",subtype:"checking",balance:1000}],
      incomes, bills:[], debts:[], transactions:[],
    });
    const TODAY = new Date(2026, 6, 22, 12, 0, 0);
    const before = ForecastEngine.generate(mk(onboardingIncomes), 30, null, TODAY).forecast.reduce((s,d)=>s+d.income,0);
    const after  = ForecastEngine.generate(mk(next), 30, null, TODAY).forecast.reduce((s,d)=>s+d.income,0);
    t.eq(before, 5200, "before: the forecast projects the onboarding $2,600 x2");
    t.eq(after, 4000, "after accepting: it projects the bank's $2,000 x2 — the forecast RECOMPUTES");
    t.ok(before !== after, "…and the two genuinely differ (the whole point of the fix)");
  }

  // Accepting only touches the PRIMARY income; a side income is untouched.
  {
    const multi = [
      { id:1, label:"Salary", amount:"2600", freq:"biweekly" },
      { id:2, label:"Side gig", amount:"400", freq:"monthly" },
    ];
    const r = shouldPromptIncome({ detected: det(2000, "biweekly"), currentIncomes: multi });
    const next = applyDetectedIncome(multi, r.suggestion);
    t.eq(next.find(i=>i.id===1).amount, "2000", "the largest income (the paycheque) is corrected");
    t.eq(next.find(i=>i.id===2).amount, "400", "the side income is left completely alone");
    t.eq(primaryIncome(multi).inc.id, 1, "primaryIncome picks the largest, not merely the first");
  }

  // ── 5. DECLINE → income unchanged, and NO re-prompt for the same detection ────────────────────
  {
    const detection = det(2000, "biweekly");
    const r = shouldPromptIncome({ detected: detection, currentIncomes: onboardingIncomes });
    t.eq(r.prompt, true, "first time: prompt");
    const dismissed = r.signature;

    // "Keep mine": income untouched…
    t.eq(onboardingIncomes[0].amount, "2600", "declining leaves the user's figure exactly as it was");

    // …and the SAME detection never nags again.
    const again = shouldPromptIncome({ detected: detection, currentIncomes: onboardingIncomes, dismissedSignature: dismissed });
    t.eq(again.prompt, false, "the same detection does NOT re-prompt after 'Keep mine' — no nagging");
    t.eq(again.reason, "dismissed", "…and the reason records why");

    // A MATERIALLY DIFFERENT detection later IS allowed to prompt again.
    const changed = shouldPromptIncome({ detected: det(3100, "biweekly"), currentIncomes: onboardingIncomes, dismissedSignature: dismissed });
    t.eq(changed.prompt, true, "a genuinely different detection later DOES prompt — declining isn't permanent");
    t.ok(changed.signature !== dismissed, "…because its signature differs");

    // Signature is stable for the same detection.
    t.eq(detectionSignature(det(2000,"biweekly")), detectionSignature(det(2000,"biweekly")),
         "the signature is stable for identical detections");
  }

  // ── Copy helpers ──────────────────────────────────────────────────────────────────────────────
  t.eq(cadenceLabel("biweekly"), "every 2 weeks", "cadence reads in plain language");
  t.eq(cadenceLabel("monthly"), "every month", "…for monthly too");
  t.eq(cadenceLabel(null), "regularly", "…and degrades gracefully when unknown");

  // ── Malformed input never throws ──────────────────────────────────────────────────────────────
  t.eq(shouldPromptIncome({}).prompt, false, "empty args → no prompt, no throw");
  t.eq(shouldPromptIncome().prompt, false, "no args → no prompt, no throw");
  t.eq(incomeDifferences(null, null).length, 0, "null comparison → no differences");
  t.eq(primaryIncome([{ amount:"0" }, { amount:"" }]), null, "incomes with no real amount → no primary");
  // A currency-formatted user amount must PARSE (not read as 0/NaN, which would make primaryIncome
  // null and wrongly report "no-current-income" instead of comparing).
  {
    const r = shouldPromptIncome({ detected: det(2000,"biweekly"), currentIncomes: [{ amount:"$2,600", freq:"biweekly" }] });
    t.eq(r.reason, "differs", "a currency-formatted amount is compared, not treated as missing income");
    t.eq(r.suggestion.current.amount, 2600, "…and '$2,600' parses to 2600 for the comparison and the card");
    t.eq(shouldPromptIncome({ detected: det(2600,"biweekly"), currentIncomes: [{ amount:"$2,600", freq:"biweekly" }] }).prompt,
         false, "…so an equal currency-formatted amount correctly does NOT prompt");
  }

  t.summary("incomeReconcile.test");
})();
