// netlify/functions/_lib/planRules.js
// -----------------------------------------------------------------------------
// The SERVER's copy of the rule that turns a profiles row into an entitlement.
//
// It is a copy, and that is deliberate: a Netlify function is CommonJS and bundled on its own, so
// it cannot import the client's ESM src/lib/planFromProfile.js without depending on how the
// bundler resolves a cross-tree dynamic import. Two small files are safer than one clever one.
//
// The tripwire that makes the duplication safe: tests/planParity.test.cjs runs THIS file and the
// client's over the same matrix of rows and times, and fails if they ever disagree. Change one,
// change the other, or the gate stops you.
//
// THE RULE, in order:
//   founder_flag true            -> unlimited
//   plan "plus" or "pro"         -> unlimited
//   plan "trial", not yet ended  -> unlimited
//   anything else                -> free
//
// When a trial ends: trial_ends_at if the row has one, otherwise trial_started_at + 14 days (rows
// created before migration 0007 have no trial_ends_at, and their trials must not move). A row on
// plan "trial" with no dates at all is not on trial.
// -----------------------------------------------------------------------------

"use strict";

const TRIAL_DAYS = 14;
const TRIAL_MS = TRIAL_DAYS * 86400000;

function _time(v) {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function trialEndsAtMs(profile) {
  if (!profile) return null;
  const explicit = _time(profile.trial_ends_at);
  if (explicit !== null) return explicit;
  const started = _time(profile.trial_started_at);
  return started === null ? null : started + TRIAL_MS;
}

// TRIAL_PLAN_FIRST (2026-11-10, Amanda): the usual app-store trial. A new person picks a plan on day one with Apple,
// Google or Stripe and gets 14 days free there; there is no account trial for them. Off unless TRIAL_PLAN_FIRST is
// exactly "true" AND TRIAL_PLAN_FIRST_SINCE is a time: only an account whose own trial started at or after that time
// is "new". Anything else (unset, a typo, no time) is today's rule exactly. Read per call, so the switch is an
// environment change, not a deploy. Returns the time in ms, or null when off.
// The time must be a full one, with hours, minutes and a zone ("2026-11-20T15:00:00Z"): a date alone ("2026-11-20") is
// midnight UTC, hours before the switch, and would take the account trial from everyone who signed up in between.
const SINCE_RX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
function trialPlanFirstSince(env = process.env) {
  if (!env || env.TRIAL_PLAN_FIRST !== "true") return null;
  const raw = String(env.TRIAL_PLAN_FIRST_SINCE || "").trim();
  if (!SINCE_RX.test(raw)) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}
// Does this row keep the 14-day account trial? Every row does while the switch is off, and every row from before the
// switch's time does: someone mid-trial keeps it to its end, unchanged (item 2). A row with no start keeps the old rule.
// An account given a longer trial on purpose (the tester free month, 0039, sets trial_ends_at past the 14 days) keeps it:
// that was granted, not the default.
function accountTrialApplies(profile, planFirstSince) {
  if (planFirstSince == null) return true;
  const started = _time(profile && profile.trial_started_at);
  if (started === null || started < planFirstSince) return true;
  const ends = _time(profile && profile.trial_ends_at);
  return ends !== null && ends - started > TRIAL_MS + 3600000;
}

// "beta_founder" | "premium" | "trial" | "free" — the same four answers the client derives.
function derivePlan(profile, now = Date.now(), { planFirstSince = trialPlanFirstSince() } = {}) {
  if (!profile) return "free";
  if (profile.founder_flag) return "beta_founder";
  const plan = profile.plan;
  if (plan === "plus" || plan === "pro") return "premium";
  if (plan === "trial" && accountTrialApplies(profile, planFirstSince)) {
    const ends = trialEndsAtMs(profile);
    const t = now instanceof Date ? now.getTime() : now;
    if (ends !== null && t < ends) return "trial";
  }
  return "free";
}

function isUnlimitedProfile(profile, now = Date.now()) {
  const p = derivePlan(profile, now);
  return p === "beta_founder" || p === "premium" || p === "trial";
}


// ── THE SUBSCRIPTION, from 2026-10-26 ────────────────────────────────────────────────────────────
// Everything above answers from the profiles row alone, and that stays true: it is the half the
// client also computes, and tests/planParity.test.cjs holds the two copies together. A subscription
// is server-only knowledge — the client has no row for it and must never be asked.
//
// WHICH STATUSES COUNT AS PAID. Stripe's own lifecycle has eight values; only these two mean the
// household currently has what it paid for:
const SUBSCRIPTION_PAID_STATUSES = Object.freeze(["active", "trialing"]);
//
// BILLING GRACE (Amanda's decision, 2026-11-23, after the real-world proof, step 1A.4). past_due means a renewal
// charge failed and Stripe is retrying. Until that day it was "deliberately not here": access ended at the first
// failed charge, the conservative reading while nobody had decided on a grace period. The decision is now made, and
// it is the stores' own idea of a grace period: ACCESS STAYS WHILE STRIPE IS RETRYING, and ends when Stripe cancels
// the subscription or marks it unpaid (both arrive as the subscription's new status).
//   isPaidSubscription   "does the household have access?"   active, trialing, or in grace
//   isPaidInFull         "is this period paid for?"          active or trialing only. Asked where money, not access,
//                        is the question: which of two paying members' plans is the extra one, where a gift year
//                        starts, whether a household is "paying twice", and the paid-to date the apps are told.
//   inBillingGrace       past_due, on a Stripe row, inside the period Stripe is trying to collect for.
// A store's row is never given this grace: Apple and Google run their own and report it as a live purchase.
// HOW LONG it lasts is Stripe's setting (Billing, "Manage failed payments": the retry window, and what happens when
// every retry fails). If that setting is "leave the subscription past due", grace runs to the end of the unpaid
// period: for an annual plan, a year. It must be "cancel the subscription" or "mark as unpaid".
const SUBSCRIPTION_GRACE_STATUSES = Object.freeze(["past_due"]);
//
// current_period_end is checked as well as status. An 'active' row whose period ended is a webhook
// we never received, and trusting status alone would hand out the product on a delivery failure.
//
// NO PERIOD END ON THE ROW (review of 2026-11-22, P2-02). A row a checkout wrote before Stripe could be asked for the
// period has none until the next subscription event, and used to count as paid for as long as no event arrived: for
// ever, if the cancellation was the event that went missing. It now counts for the one billing period the checkout
// paid for (a month, or a year for the annual plans and for a row with no plan key), plus the three days Stripe keeps
// retrying a webhook, measured from the last word Stripe gave on that row (last_event_at, else updated_at). The same
// reasoning as the line above: past that point a renewal would have set the period, so silence is a webhook we never
// received. A caller that did not read those dates gets the old answer (status alone), and so does a store row: the
// stores always give an end. The status read fills the real end in from Stripe (_lib/stripeLive.js fillMissingPeriod).
const NO_PERIOD_GRACE_MS = 3 * 86400000;
const NO_PERIOD_MS = Object.freeze({ monthly: 31 * 86400000, annual: 366 * 86400000 });
function impliedPeriodEndMs(sub) {
  if (!sub || STORE_PROVIDERS.includes(sub.provider)) return null;
  const from = _time(sub.last_event_at) !== null ? _time(sub.last_event_at) : _time(sub.updated_at);
  if (from === null) return null;
  return from + (sub.plan_key === "monthly" ? NO_PERIOD_MS.monthly : NO_PERIOD_MS.annual) + NO_PERIOD_GRACE_MS;
}
// Has the period this row names not ended yet? (The period check both questions share.)
function periodNotOver(sub, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : now;
  const end = _time(sub.current_period_end);
  if (end === null) {
    const implied = impliedPeriodEndMs(sub);
    return implied === null ? true : t < implied;   // no dates read: status is all we have
  }
  return t < end;
}
function isPaidInFull(sub, now = Date.now()) {
  if (!sub || !SUBSCRIPTION_PAID_STATUSES.includes(sub.status)) return false;
  return periodNotOver(sub, now);
}
function inBillingGrace(sub, now = Date.now()) {
  if (!sub || !SUBSCRIPTION_GRACE_STATUSES.includes(sub.status)) return false;
  if (STORE_PROVIDERS.includes(sub.provider)) return false;
  return periodNotOver(sub, now);
}
function isPaidSubscription(sub, now = Date.now()) {
  return isPaidInFull(sub, now) || inBillingGrace(sub, now);
}

// WHERE A SUBSCRIPTION ROW CAME FROM (migration 0020). 'stripe' is the website; the other two are the
// stores, through RevenueCat (_lib/storeSubscriptions.js). A row with no provider predates 0020: Stripe.
const STORE_PROVIDERS = Object.freeze(["app_store", "play_store"]);
const isStoreRow = (sub) => !!sub && STORE_PROVIDERS.includes(sub.provider);

// The whole entitlement answer: the profile rule above, plus the subscription.
//
// A paid subscription can only ADD. It never downgrades someone the profile already entitles —
// a founder stays a founder, and an unexpired trial stays a trial even after the card is charged,
// so nobody loses trial days by paying early.
//
// ONE ANSWER FOR THE WEB AND THE STORE APPS (founder's decisions, 2026-10-20). There is no separate rule
// for a request from the iOS or Android app: the 14-day account trial (the only trial: no store trial, no
// intro offer), then the free plan's limits, unless the household is a founder, a beta founder, or has a
// paid subscription, bought on the web (Stripe) or in a store (RevenueCat). The subscription row is the
// same one either way. From 1.1 the same plans are sold in the apps, so a web subscription counting there
// is clean under Apple 3.1.3(b) (multiplatform services). tests/nativeTrialLimits.test.cjs holds the
// platforms to one answer.
function deriveEntitlement(profile, subscription, now = Date.now()) {
  const fromProfile = derivePlan(profile, now);
  if (fromProfile !== "free") {
    return { plan: fromProfile, unlimited: true, paidSubscription: isPaidSubscription(subscription, now) };
  }
  if (isPaidSubscription(subscription, now)) {
    return { plan: "premium", unlimited: true, paidSubscription: true };
  }
  return { plan: "free", unlimited: false, paidSubscription: false };
}

// THE ROW THAT ONLY HOLDS THE STRIPE CUSTOMER (real-world proof, 2026-11-23, step 1A.2). The website's checkout makes
// the household's subscriptions row before anything is bought, to remember the Stripe customer (billing.js
// ensureCustomer). It writes no status, so the DATABASE gives the row the column's default, "incomplete" (migration
// 0009): the same word Stripe uses for a first payment still pending. Read as that, the row made a person who opened
// checkout once and left look subscribed for ever: the website answered "already subscribed", a store app would not
// sell to them, and their 14 days free were gone.
// It is told apart by what no real subscription lacks: it names no subscription, no plan, and no event was ever
// written on it. Every reader of the row's status reads those three with it; a reader that left one out still gets
// the right answer from the others.
const CUSTOMER_ONLY_STATUS = "incomplete";
function isCustomerOnlyRow(row) {
  return !!row && (row.provider || "stripe") === "stripe" && row.status === CUSTOMER_ONLY_STATUS
    && !row.provider_subscription_id && !row.plan_key && !row.last_event_at;
}

module.exports = {
  TRIAL_DAYS, TRIAL_MS, trialEndsAtMs, derivePlan, isUnlimitedProfile, trialPlanFirstSince, accountTrialApplies,
  SUBSCRIPTION_PAID_STATUSES, isPaidSubscription, impliedPeriodEndMs, deriveEntitlement, STORE_PROVIDERS, isStoreRow,
  isCustomerOnlyRow, SUBSCRIPTION_GRACE_STATUSES, isPaidInFull, inBillingGrace,
};
