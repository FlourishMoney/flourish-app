// netlify/functions/_lib/trialPlanFirst.js
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST (Amanda, 2026-11-10): the usual app-store trial. A new person picks a plan on day one with Apple,
// Google or Stripe, gets 14 days free there, and is charged automatically unless they cancel. It replaces the no-card
// 14-day account trial for NEW accounts only (_lib/planRules.js trialPlanFirstSince, accountTrialApplies).
//
// OFF BY DEFAULT. Nothing changes until Netlify has both TRIAL_PLAN_FIRST="true" and TRIAL_PLAN_FIRST_SINCE (the
// time it goes on, ISO 8601). The store builds learn the switch from the server (the billing status calls, and
// GET /api/trial-plan-first before sign-in), so switching it needs no new upload.
//
// What the status calls tell the app, only while it is on (off, the key is absent and every answer is as before):
//   trial_plan_first: { on: true, trial_days: 14, account_trial, web_trial_eligible?, trialing, trial_ends }
//     account_trial       this account keeps the 14-day account trial (made before the switch's time)
//     web_trial_eligible  the website only: this account has never had a subscription, so Stripe Checkout starts
//                         with 14 days free. A store app asks its own store (RevenueCat), never this.
//     trialing, trial_ends  the household's subscription is in its store or Stripe trial, and when it ends
// -----------------------------------------------------------------------------
"use strict";

const { trialPlanFirstSince, accountTrialApplies, isPaidSubscription } = require("./planRules");

const TRIAL_PLAN_FIRST_DAYS = 14;

const trialPlanFirstOn = () => trialPlanFirstSince() !== null;

// Has this account never had a subscription of any kind? A row made only to hold the Stripe customer (billing.js
// ensureCustomer) has no subscription id and no status. Anything else has had one, and gets no web trial.
function webTrialEligibleRow(row) {
  return !row || (!row.provider_subscription_id && !row.status);
}

/**
 * The status calls' trial_plan_first answer, or null while the switch is off. `row` is the subscriptions row the
 * caller read (with provider_subscription_id and status). A profile read that fails is { unavailable: true }: the
 * caller answers 503, never a guess about a trial.
 */
async function trialPlanFirstState(admin, user_id, { row = null, web = false, now = Date.now() } = {}) {
  const since = trialPlanFirstSince();
  if (since === null) return null;
  const { data: prof, error } = await admin.from("profiles").select("trial_started_at, trial_ends_at").eq("user_id", user_id).maybeSingle();
  if (error) return { unavailable: true };
  const trialing = !!row && row.status === "trialing" && isPaidSubscription(row, now);
  const out = {
    on: true,
    trial_days: TRIAL_PLAN_FIRST_DAYS,
    account_trial: accountTrialApplies(prof, since),
    trialing,
    trial_ends: trialing && row.current_period_end ? row.current_period_end : null,
  };
  if (web) out.web_trial_eligible = webTrialEligibleRow(row);
  return out;
}

module.exports = { TRIAL_PLAN_FIRST_DAYS, trialPlanFirstOn, webTrialEligibleRow, trialPlanFirstState };
