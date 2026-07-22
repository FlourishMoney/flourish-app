// src/lib/incomeReconcile.js
// -----------------------------------------------------------------------------
// Bank-detected pay vs the income currently driving the forecast.
//
// THE DEFECT THIS REPLACES: the sync did
//     const hasRealIncome = (prev.incomes||[]).some(i => parseFloat(i.amount||0) > 0);
//     if (!detectedIncome || hasRealIncome) return prev.incomes;
// Onboarding REQUIRES an income amount before you can continue, so hasRealIncome was permanently
// true and bank-detected pay was always discarded. Every Sprint A/B detector (per-deposit median,
// detectCadence, modal anchorDay) computed correctly and was thrown away, leaving the forecast on
// the onboarding guess forever.
//
// THE RULE NOW: the onboarding figure keeps driving the forecast UNTIL the user accepts a detected
// correction. We never silently overwrite a number the user typed — but we also never hide that the
// bank disagrees. Prompt only on a MEANINGFUL difference, and never re-prompt for a detection the
// user already declined.
// -----------------------------------------------------------------------------

export const AMOUNT_TOLERANCE = 0.05;      // 5% — below this is rounding/variable-pay noise, not news
export const ANCHOR_TOLERANCE_DAYS = 2;    // payday drifts for weekends; only flag a real move

// Parse a user-entered amount ("$2,600" / "2600" / 2600) to a number. 0 when unusable.
function amt(v) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.abs(v) : 0;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

// The income the detection should be compared against: the LARGEST real income, i.e. the paycheque.
// (A small side income shouldn't be "corrected" by a detection of the main salary.)
export function primaryIncome(incomes) {
  const list = (Array.isArray(incomes) ? incomes : [])
    .filter(Boolean).map(i => ({ inc: i, amount: amt(i.amount) })).filter(x => x.amount > 0);
  if (!list.length) return null;
  return list.sort((a, b) => b.amount - a.amount)[0];
}

// Stable id for "this same detection". A materially different detection later yields a different
// signature and is allowed to prompt again — declining is not permanent for all future detections.
export function detectionSignature(detected) {
  if (!detected) return null;
  const a = Math.round(Number(detected.perDeposit) || 0);
  return `${a}|${detected.freq || "?"}|${detected.anchorDay ?? "?"}`;
}

// Which fields differ meaningfully? Returns an array of reason codes (empty = no meaningful change).
export function incomeDifferences(detected, currentIncomes) {
  const reasons = [];
  const p = primaryIncome(currentIncomes);
  if (!detected || !p) return reasons;
  const det = Number(detected.perDeposit) || 0;
  if (det > 0 && p.amount > 0 && Math.abs(det - p.amount) / p.amount > AMOUNT_TOLERANCE) reasons.push("amount");
  if (detected.freq && p.inc.freq && detected.freq !== p.inc.freq) reasons.push("cadence");
  // anchorDay only means something for calendar-anchored pay; a biweekly cycle isn't day-of-month based.
  if ((detected.freq === "monthly" || detected.freq === "semimonthly")) {
    const dA = parseInt(detected.anchorDay, 10), cA = parseInt(p.inc.anchorDay, 10);
    if (Number.isFinite(dA) && Number.isFinite(cA) && Math.abs(dA - cA) > ANCHOR_TOLERANCE_DAYS) reasons.push("payday");
  }
  return reasons;
}

// Decide whether to surface the reconcile card.
//   detected           — detectIncomeFromTxns output (the STRONG detector), or null
//   currentIncomes     — appData.incomes
//   dismissedSignature — signature the user already declined (appData.incomeSuggestionDismissed)
// Returns { prompt, reason, signature, suggestion } — suggestion is what the card renders.
export function shouldPromptIncome({ detected, currentIncomes, dismissedSignature = null } = {}) {
  const signature = detectionSignature(detected);
  if (!detected || !(Number(detected.perDeposit) > 0)) return { prompt: false, reason: "no-detection", signature: null, suggestion: null };
  const p = primaryIncome(currentIncomes);
  // No user income at all → the caller adopts the detection directly; nothing to reconcile.
  if (!p) return { prompt: false, reason: "no-current-income", signature, suggestion: null };
  if (dismissedSignature && dismissedSignature === signature) return { prompt: false, reason: "dismissed", signature, suggestion: null };
  const reasons = incomeDifferences(detected, currentIncomes);
  if (reasons.length === 0) return { prompt: false, reason: "within-tolerance", signature, suggestion: null };
  return {
    prompt: true, reason: "differs", signature, reasons,
    suggestion: {
      signature, reasons,
      detected: { amount: Math.round(Number(detected.perDeposit)), freq: detected.freq || null,
                  anchorDay: detected.anchorDay ?? null, label: detected.label || "Employment",
                  isVariable: !!detected.isVariable },
      current:  { amount: Math.round(p.amount), freq: p.inc.freq || null, anchorDay: p.inc.anchorDay ?? null,
                  id: p.inc.id ?? null },
    },
  };
}

// Apply an accepted suggestion: replace ONLY the primary income's money fields, preserving its
// identity (id/label/type) and every other income untouched.
export function applyDetectedIncome(incomes, suggestion) {
  if (!suggestion || !suggestion.detected) return Array.isArray(incomes) ? incomes : [];
  const list = Array.isArray(incomes) ? incomes : [];
  const p = primaryIncome(list);
  const d = suggestion.detected;
  const patch = (inc) => ({
    ...inc,
    amount: String(d.amount),
    typicalAmount: String(d.amount),
    ...(d.freq ? { freq: d.freq } : {}),
    ...(d.anchorDay != null ? { anchorDay: d.anchorDay } : {}),
    isVariable: d.isVariable,
    autoDetected: true,
  });
  if (!p) return [{ id: 1, label: d.label, type: "employment", ...patch({}) }];
  return list.map(i => (i === p.inc ? patch(i) : i));
}

// Human-readable cadence for the card copy.
export function cadenceLabel(freq) {
  return ({ weekly: "every week", biweekly: "every 2 weeks", semimonthly: "twice a month", monthly: "every month" })[freq] || "regularly";
}
