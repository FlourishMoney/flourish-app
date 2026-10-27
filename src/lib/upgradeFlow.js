// src/lib/upgradeFlow.js
// -----------------------------------------------------------------------------
// THE TRIAL COUNTDOWN AND THE UPGRADE SCREEN'S ORDER (audit H13 and H14, 2026-10-26).
//
// H13. During the 14-day trial the website showed no countdown at all: the banner asked for !isPremium, and the
//      trial is what makes isPremium true. The desktop sidebar also called a trial household "Flourish Plus".
//      trialCountdown answers from the trial itself: on the trial, not paying, days left. The label is the one
//      the store apps already show (lib/freePlan.js trialChip), so the trial is named as the trial.
// H14. The upgrade screen listed the founding price last, selected nothing and went to Stripe on one tap.
//      upgradeChoices puts the founding price first whenever the server offers it (only then: the plans come
//      from billingVisibility.js offeredPlans, which asks the server), and the first choice is the one selected
//      when the screen opens. Nothing here changes who pays, when or how much: every amount and which plans are
//      offered still come from offeredPlans, and checkout still posts only a plan key.
//
// Pure, so it can be tested without a DOM.
// -----------------------------------------------------------------------------
import { trialChip } from "./freePlan.js";

/**
 * @param {object} o
 * @param {boolean} o.trialActive   on the trial with days left (usageLimits isTrialActive)
 * @param {number|null} o.daysLeft  usageLimits getTrialDaysLeft
 * @param {boolean} o.paid          the server says this household pays (web or store)
 * @param {boolean} o.native        a store app (it has its own chip, NativeTrialChip, and nothing to tap)
 * @returns {null | {daysLeft: number, label: string, urgent: boolean}}
 */
export function trialCountdown({ trialActive = false, daysLeft = null, paid = false, native = false } = {}) {
  if (native || paid || !trialActive) return null;
  if (!Number.isFinite(daysLeft) || daysLeft < 1) return null;
  return { daysLeft, label: trialChip(daysLeft), urgent: daysLeft <= 2 };
}

// The founding price first when it is offered, then the others in offeredPlans' own order.
export function upgradeChoices(plans = []) {
  const list = Array.isArray(plans) ? plans : [];
  return [...list.filter((p) => p.key === "founding_annual"), ...list.filter((p) => p.key !== "founding_annual")];
}

// The plan selected when the screen opens: the first choice. A key that is no longer offered falls back to it.
export function selectedChoice(choices = [], key = null) {
  if (key && choices.some((p) => p.key === key)) return key;
  return choices.length ? choices[0].key : null;
}

// The trial's end, as the upgrade screen names it ("November 9, 2026"), or null off the trial.
export function trialEndLabel(endsAtMs, { trialActive = false } = {}) {
  if (!trialActive || !Number.isFinite(endsAtMs)) return null;
  return new Date(endsAtMs).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
}

// ── WORDS ─────────────────────────────────────────────────────────────────────────────────────────────
// Approved word for word on 2026-10-27 (ChatGPT and Grok agreed); docs/product/SIGNUP-PATH-WORDS.md lists each with
// where it shows. Do not reword them here. Reused approved labels: "Close", "← Back", "Opening checkout…", the plan
// rows' own lines (offeredPlans), the founding note, and "Upgrade →" and trialChip on the countdown.
export const UPGRADE_COPY = Object.freeze({
  headline: "All of flourish, in one subscription",
  bullets: Object.freeze(["The coach, with no weekly limit", "What-If as often as you like", "More than one bank, all in one place"]),
  continue: "Review my plan",
  reviewHeading: "Check your plan",
  reviewConfirm: "Go to secure checkout",
});
// The trial line, with the server's end date in it.
export function upgradeTrialLine(endLabel) {
  return endLabel ? `Your trial ends on ${endLabel}.` : null;
}
// The review step's line about the charge, for the chosen plan's billing period.
export function reviewChargeLine(planKey) {
  return planKey === "monthly"
    ? "If you subscribe, you're charged today in CAD plus tax, then every month until you cancel. You can cancel in Settings → Manage subscription. Any trial ends when you subscribe."
    : "If you subscribe, you're charged today in CAD plus tax, then every year until you cancel. You can cancel in Settings → Manage subscription. Any trial ends when you subscribe.";
}
// Every approved line this module carries, as the words list names them (the trial line with <date>).
// lib/signupUi.js SIGNUP_COPY has the rest.
export const SIGNUP_PATH_WORDS = Object.freeze([
  UPGRADE_COPY.headline, ...UPGRADE_COPY.bullets, UPGRADE_COPY.continue,
  UPGRADE_COPY.reviewHeading, UPGRADE_COPY.reviewConfirm, "Your trial ends on <date>.",
  reviewChargeLine("monthly"), reviewChargeLine("annual"),
]);
