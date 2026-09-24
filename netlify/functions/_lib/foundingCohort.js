// netlify/functions/_lib/foundingCohort.js
// -----------------------------------------------------------------------------
// HOW MANY FOUNDING SUBSCRIPTIONS THERE ARE, AND WHETHER THERE IS ROOM.
//
// THE SERVER COUNTS. The client is never told the number of slots taken and never decides
// eligibility: it asks, and it is told yes or no. A client that decided this could show the
// founding price to anyone, and the price id it maps to is server-side only anyway.
//
// The count is of LOCKED rows — plan_key 'founding_annual' with founding_locked_at set. The
// webhook clears that stamp when a subscription is deleted, so a household that leaves frees the
// slot it held, which is what "locked in while you stay subscribed" means.
//
// FAILS CLOSED. If the count cannot be established — the subscriptions table is not applied yet,
// the read errored — there is no room. Offering a price we cannot honour is worse than not
// offering it: the checkout would refuse it a moment later.
// -----------------------------------------------------------------------------
"use strict";

// The size of the founding cohort. One place. See docs/ops/BILLING-SETUP.md.
const FOUNDING_COHORT_LIMIT = 50;

function foundingSlotsOpen(takenCount) {
  if (!Number.isFinite(takenCount) || takenCount < 0) return false;
  return takenCount < FOUNDING_COHORT_LIMIT;
}

// null when the count could not be established, which foundingSlotsOpen treats as "no room".
async function countFoundingSubscriptions(admin) {
  try {
    const { data, error } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("plan_key", "founding_annual")
      .not("founding_locked_at", "is", null);
    if (error || !Array.isArray(data)) return null;
    return data.length;
  } catch {
    return null;
  }
}

module.exports = { FOUNDING_COHORT_LIMIT, foundingSlotsOpen, countFoundingSubscriptions };
