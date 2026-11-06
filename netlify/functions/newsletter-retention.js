/**
 * Flourish — the newsletter's retention
 * netlify/functions/newsletter-retention.js   (scheduled daily, netlify.toml)
 *
 * The approved privacy words (2026-11-05): the record of consent and unsubscribe is kept for three years after the unsubscribe.
 * This deletes those at three years, and a sign-up never confirmed within 30 days, which never joined the list.
 * Touches only newsletter_subscribers. Until migration 0037 has run, the delete fails and is logged.
 */
"use strict";
const { getAdminClient } = require("./_lib/auth");

const DAY_MS = 24 * 60 * 60 * 1000;
const UNCONFIRMED_DAYS = 30;

// Three calendar years, not 1,095 days: the words say years.
function threeYearsBefore(now) {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - 3);
  return d.toISOString();
}

async function sweep(admin, now = new Date()) {
  const { error: oldErr } = await admin.from("newsletter_subscribers").delete().lt("unsubscribed_at", threeYearsBefore(now));
  const { error: unconfirmedErr } = await admin.from("newsletter_subscribers").delete()
    .is("confirmed_at", null).is("unsubscribed_at", null).lt("consented_at", new Date(now.getTime() - UNCONFIRMED_DAYS * DAY_MS).toISOString());
  if (oldErr || unconfirmedErr) console.error("[newsletter-retention] failed");
  return !oldErr && !unconfirmedErr;
}

exports.handler = async () => {
  try { await sweep(getAdminClient()); } catch { console.error("[newsletter-retention] failed"); }
  return { statusCode: 200, body: "" };
};
exports._test = { sweep, threeYearsBefore };
