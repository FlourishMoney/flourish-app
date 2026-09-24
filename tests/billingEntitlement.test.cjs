// tests/billingEntitlement.test.cjs
// -----------------------------------------------------------------------------
// THE SUBSCRIPTION ROW DECIDES WHO IS PAID — AND IT CANNOT TAKE ANYTHING AWAY.
//
// Before billing, "paid" had no server-side meaning: profiles.plan only ever said
// 'plus' because a human typed it. From 2026-10-26 the subscriptions row written by
// the Stripe webhook is the authority. This file pins the two halves of that:
//   • a paid subscription grants unlimited to an account the profile calls free
//   • it never downgrades anyone the profile already entitles (founder, live trial)
// and that the existing trial rule and the 2-a-week free coach limit are untouched.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const {
  derivePlan, isUnlimitedProfile, deriveEntitlement, isPaidSubscription, SUBSCRIPTION_PAID_STATUSES,
} = require("../netlify/functions/_lib/planRules.js");

const NOW = Date.parse("2026-11-01T00:00:00Z");
const FUTURE = "2026-12-01T00:00:00Z";
const PAST = "2026-10-01T00:00:00Z";
const sub = (status, end = FUTURE) => ({ status, current_period_end: end });

(async () => {
  const t = create();

  // ── 1. A paid subscription grants ────────────────────────────────────────────────────────────
  t.eq(deriveEntitlement({ plan: "free" }, sub("active"), NOW).plan, "premium", "1a active subscription makes a free profile premium");
  t.eq(deriveEntitlement({ plan: "free" }, sub("trialing"), NOW).plan, "premium", "1b so does a Stripe trialing subscription");
  t.ok(deriveEntitlement({ plan: "free" }, sub("active"), NOW).unlimited, "1c …and that is unlimited");
  t.eq(deriveEntitlement({ plan: "trial", trial_ends_at: PAST }, sub("active"), NOW).plan, "premium",
    "1d an expired trial plus a paid subscription is premium, which is the whole conversion path");

  // ── 2. Everything else does not ──────────────────────────────────────────────────────────────
  for (const status of ["past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
    t.eq(deriveEntitlement({ plan: "free" }, sub(status), NOW).plan, "free", `2 ${status} does not grant access`);
  }
  t.eq(deriveEntitlement({ plan: "free" }, null, NOW).plan, "free", "2g no subscription row at all is free");
  t.eq(deriveEntitlement({ plan: "free" }, sub("active", PAST), NOW).plan, "free",
    "2h an 'active' row whose period has ENDED is not paid — that is a webhook we never received, not a licence");
  t.ok(isPaidSubscription(sub("active", null), NOW), "2i …but a paid status with no period yet is trusted, since status is all there is");
  t.eq(SUBSCRIPTION_PAID_STATUSES.join(","), "active,trialing", "2j exactly two statuses count as paid");

  // ── 3. It can only ADD ───────────────────────────────────────────────────────────────────────
  t.eq(deriveEntitlement({ founder_flag: true }, null, NOW).plan, "beta_founder", "3a a founder with no subscription stays a founder");
  t.eq(deriveEntitlement({ founder_flag: true }, sub("canceled"), NOW).plan, "beta_founder", "3b …and a cancelled subscription does not demote them");
  t.eq(deriveEntitlement({ plan: "trial", trial_ends_at: FUTURE }, sub("active"), NOW).plan, "trial",
    "3c paying early keeps the live trial, so nobody loses trial days by converting");
  t.ok(deriveEntitlement({ plan: "trial", trial_ends_at: FUTURE }, sub("active"), NOW).paidSubscription,
    "3d …while still recording that they are paying");

  // ── 4. The profile rule itself is untouched ──────────────────────────────────────────────────
  // deriveEntitlement must not have changed any answer derivePlan gives, because the client's copy
  // (src/lib/planFromProfile.js) has no subscription and planParity holds the two together.
  for (const [label, profile, expected] of [
    ["founder", { founder_flag: true }, "beta_founder"],
    ["plus", { plan: "plus" }, "premium"],
    ["live trial", { plan: "trial", trial_ends_at: FUTURE }, "trial"],
    ["expired trial", { plan: "trial", trial_ends_at: PAST }, "free"],
    ["trial with no dates", { plan: "trial" }, "free"],
    ["nothing", {}, "free"],
  ]) {
    t.eq(derivePlan(profile, NOW), expected, `4 derivePlan still answers ${expected} for ${label}`);
    t.eq(deriveEntitlement(profile, null, NOW).plan, expected, `4 …and so does deriveEntitlement with no subscription (${label})`);
  }
  t.eq(isUnlimitedProfile({ plan: "trial", trial_ends_at: FUTURE }, NOW), true, "4g isUnlimitedProfile still exported and working");

  // ── 5. The free coach limit is still 2 a week ────────────────────────────────────────────────
  const limits = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "_lib", "coachLimits.js"), "utf8");
  t.ok(/FREE_CHAT_WEEKLY\s*=\s*2\b/.test(limits), "5a the free limit is still 2 a week (DECISIONS.md item 2)");
  t.ok(!/subscription/i.test(limits), "5b …and billing did not reach into the limit rule");

  // ── 6. auth.js reads the subscription, and fails to FREE ─────────────────────────────────────
  const auth = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "_lib", "auth.js"), "utf8");
  t.ok(/from\("subscriptions"\)/.test(auth), "6a getUserPlan reads the subscriptions row");
  t.ok(/deriveEntitlement\(/.test(auth), "6b …and combines it with the profile through planRules");
  t.ok(/maybeSingle\(\)/.test(auth), "6c …tolerating no row");
  const subBlock = auth.slice(auth.indexOf('from("subscriptions")') - 700, auth.indexOf('from("subscriptions")') + 700);
  t.ok(/try\s*{/.test(subBlock) && /catch/.test(subBlock),
    "6d …inside a try/catch, so a subscriptions table that is not applied yet cannot break sign-in");

  t.summary("billingEntitlement.test");
})();
