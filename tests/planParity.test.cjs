// tests/planParity.test.cjs
// -----------------------------------------------------------------------------
// THE TWO COPIES OF THE PLAN RULE MUST AGREE.
//
// The entitlement rule exists twice on purpose: src/lib/planFromProfile.js for the client (ESM)
// and netlify/functions/_lib/planRules.js for the Netlify functions (CommonJS, bundled alone).
// Both files say the duplication is safe "because tests/planParity.test.cjs holds them together".
// Until this file existed, that sentence was the only thing holding them together.
//
// Drift here is not cosmetic. The client decides what the screen offers; the server decides what
// the Coach actually serves. If they disagree, a household is told one thing and given another —
// and the direction nobody notices is the one where the client says premium and the server says
// free, because it reads as the Coach being broken.
//
// The matrix is every shape a profiles row is actually in: the four plan values in the wild, the
// founder flag in each of its truthy/falsy spellings, and trial dates before, around and after
// "now", including a row whose trial_ends_at is unparseable.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");

const NOW = Date.parse("2026-09-23T12:00:00Z");
const at = (days) => new Date(NOW + days * 86400000).toISOString();

(async () => {
  const t = create();
  const client = await import(path.join(__dirname, "..", "src", "lib", "planFromProfile.js"));
  const server = require("../netlify/functions/_lib/planRules.js");

  // Both must actually export the rule; a renamed export would otherwise "agree" vacuously.
  t.ok(typeof client.derivePlan === "function", "1a the client exports derivePlan");
  t.ok(typeof server.derivePlan === "function", "1b the server exports derivePlan");
  t.ok(typeof client.isUnlimitedProfile === "function" && typeof server.isUnlimitedProfile === "function",
    "1c …and both export isUnlimitedProfile");
  t.eq(server.TRIAL_DAYS, client.TRIAL_DAYS, "1d the trial length is the same number on both sides");

  const rows = [];
  for (const plan of [null, undefined, "", "free", "trial", "plus", "pro", "beta_founder", "premium", "TRIAL"])
    for (const founder_flag of [true, false, null, undefined, "t"])
      for (const trial_started_at of [null, at(-30), at(-14), at(-5), at(1)])
        for (const trial_ends_at of [null, at(-1), at(0.5), at(30), "not-a-date"])
          rows.push({ plan, founder_flag, trial_started_at, trial_ends_at });

  const disagree = [];
  for (const row of rows) {
    for (const now of [NOW, NOW - 86400000, NOW + 30 * 86400000]) {
      const a = client.derivePlan(row, now), b = server.derivePlan(row, now);
      if (a !== b) disagree.push(`derivePlan(${JSON.stringify(row)}, ${now}): client=${a} server=${b}`);
      const ua = client.isUnlimitedProfile(row, now), ub = server.isUnlimitedProfile(row, now);
      if (ua !== ub) disagree.push(`isUnlimitedProfile(${JSON.stringify(row)}, ${now}): client=${ua} server=${ub}`);
      const ta = client.trialEndsAtMs(row), tb = server.trialEndsAtMs(row);
      if (ta !== tb) disagree.push(`trialEndsAtMs(${JSON.stringify(row)}): client=${ta} server=${tb}`);
    }
  }
  t.eq(disagree.slice(0, 3).join(" | ") || "(none)", "(none)",
    `2a the two copies answer identically for every profile row (${rows.length} rows x 3 clocks)`);
  t.ok(rows.length >= 500, `2b …across a matrix worth having (${rows.length} rows)`);

  // A row with no profile at all, which is what a failed read looks like.
  for (const empty of [null, undefined, {}]) {
    t.eq(client.derivePlan(empty, NOW), server.derivePlan(empty, NOW),
      `3a both answer the same for a missing profile row (${JSON.stringify(empty) || "undefined"})`);
  }

  // The server adds the subscription half. It must never CHANGE the profile half: a founder stays
  // a founder, a live trial stays a trial, and only a free profile can be lifted by a payment.
  const paid = { status: "active", current_period_end: at(300) };
  for (const row of rows) {
    const fromProfile = server.derivePlan(row, NOW);
    const ent = server.deriveEntitlement(row, paid, NOW);
    if (fromProfile !== "free" && ent.plan !== fromProfile)
      disagree.push(`deriveEntitlement changed ${fromProfile} into ${ent.plan}`);
    if (fromProfile === "free" && ent.plan !== "premium")
      disagree.push(`a paid free profile became ${ent.plan}, not premium`);
  }
  t.eq(disagree.slice(0, 3).join(" | ") || "(none)", "(none)",
    "4a a paid subscription only ever ADDS to the profile answer, never replaces it");

  t.summary("planParity.test");
})();
