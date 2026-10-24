// netlify/functions/_lib/planGate.js
// -----------------------------------------------------------------------------
// NO FREE PLAN (founder's decision, 2026-10-23: "Yes, drop the free plan. 14 days free, then Plus.").
//
// After the 14-day trial ends, or when a subscription lapses, a household has no plan, and every paid API
// answers "plan required" until it subscribes: the coach (every type), What-If's explanation, and Plaid
// (linking a bank and reading it). The SERVER decides, because the iOS and Android apps run the code bundled
// inside them (capacitor.config.json has no server.url) and an installed 1.0 or 1.1 build still believes in
// the free plan. Whatever an old build shows, it gets nothing paid from here.
//
// WHO HAS A PLAN is the one rule in _lib/planRules.js deriveEntitlement, read by _lib/auth.js getUserPlan: a
// founder, a paid profile (plus or pro), an unexpired trial, a paid subscription from any provider (Stripe,
// the App Store, Google Play) and, from migration 0029, an account inside its 30 days from go-live. This file
// only turns that answer into a refusal; it never decides who is paying.
//
// WHAT STAYS OPEN, plan or no plan, so nobody is trapped: signing in and out, the billing calls (status,
// checkout, the Stripe portal, the store sync), consent changes, listing and disconnecting banks, deleting the
// account, recording a meeting's own answers (the household's data, not a paid service), and the live demo,
// which needs no account and calls none of this.
//
// A PLAN WE COULD NOT READ IS NOT "NO PLAN". getUserPlan answers known: false when the profiles read fails;
// that is a 503 ("try again"), never a 402, so a paying household is never shown the paywall, or refused as
// unpaid, because the database blinked. It is never an open door either: nothing paid runs on an unknown plan.
//
// Nothing here applies while ENFORCE_PLAN_LIMITS is off (the same flag every plan check already sits behind;
// production has it set to "true").
// -----------------------------------------------------------------------------
"use strict";

// The words a refused call carries. An old store build may show a server message, so it names no price, no
// website and no way to pay (Apple 3.1.1, Google Play's payments policy). NOT APPROVED: a placeholder until the
// founder's words are in (the brief's item 5); tests/planRequired.test.cjs holds it to those rules.
const PLAN_REQUIRED_MESSAGE = "[WORDS: plan required, server]";
const PLAN_UNKNOWN_MESSAGE = "[WORDS: plan check unavailable, server]";

// Plaid actions that cost money or read a bank for a plan's features. Everything else in plaid.js stays open:
// list_items, delete_item, remove_item, collapse_duplicate_items (each only lists or removes) and delete_account.
const PLAID_PLAN_ACTIONS = Object.freeze([
  "create_link_token", "exchange_token", "migrate_items",
  "get_accounts", "get_transactions", "get_investments", "get_liabilities", "enrich_transactions",
]);

/**
 * Whether a paid call may go ahead.
 * @param {object} a
 * @param {boolean} a.enforce    ENFORCE_PLAN_LIMITS
 * @param {object}  a.plan       getUserPlan's answer: { known, unlimited, ... }
 * @returns {{allowed: boolean, status: number|null, error: string|null, message: string|null}}
 */
function decidePlanAccess({ enforce, plan }) {
  if (!enforce) return { allowed: true, status: null, error: null, message: null };
  if (!plan || plan.known === false) return { allowed: false, status: 503, error: "plan_unavailable", message: PLAN_UNKNOWN_MESSAGE };
  if (plan.unlimited === true) return { allowed: true, status: null, error: null, message: null };
  return { allowed: false, status: 402, error: "plan_required", message: PLAN_REQUIRED_MESSAGE };
}

// The response for a refusal, in the shape every function here already returns.
function planRefusal(verdict, headers) {
  return { statusCode: verdict.status, headers, body: JSON.stringify({ error: verdict.error, message: verdict.message }) };
}

module.exports = { PLAN_REQUIRED_MESSAGE, PLAN_UNKNOWN_MESSAGE, PLAID_PLAN_ACTIONS, decidePlanAccess, planRefusal };
