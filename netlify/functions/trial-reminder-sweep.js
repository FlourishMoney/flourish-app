// netlify/functions/trial-reminder-sweep.js   (scheduled hourly, netlify.toml)
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST, ITEM 3, THE STORES: the reminder 3 days before the first charge for a trial bought on an iPhone or
// with Google Play. RevenueCat reports the trial's end (our subscriptions row: status "trialing", current_period_end),
// and this sends each trial's one reminder in its window (_lib/trialReminder.js reminderDue): never for a trial already
// cancelled (cancel_at_period_end), never twice. The website's comes from Stripe's trial_will_end (stripe-webhook.js).
// Runs with the switch on or off (review round, M4): a store trial already running when the switch goes off still gets
// its reminder. With no store trial anywhere (today) it reads one empty list and sends nothing.
// Stops starting sends at 20 seconds (Netlify stops it at 30).
// -----------------------------------------------------------------------------
"use strict";

const { getAdminClient } = require("./_lib/auth");
const { reminderDue, sendTrialReminder, STORE_PRICES } = require("./_lib/trialReminder");

const BUDGET_MS = 20000;

async function sweep({ admin, now = Date.now(), clock = Date.now, send } = {}) {
  const started = clock();
  const { data: rows, error } = await admin.from("subscriptions")
    .select("user_id, provider, status, plan_key, current_period_end, cancel_at_period_end")
    .in("provider", ["app_store", "play_store"]).eq("status", "trialing");
  if (error) { console.error("[trial-reminder-sweep] read failed"); return { read: false, sent: 0, skipped: 0 }; }
  let sent = 0, skipped = 0;
  for (const row of rows || []) {
    if (clock() - started > BUDGET_MS) break;
    const end = Date.parse(row.current_period_end || "");
    const amount = STORE_PRICES[row.plan_key];
    if (!reminderDue(end, now) || row.cancel_at_period_end || !amount) { skipped++; continue; }
    const r = await sendTrialReminder(admin, { provider: row.provider, ref: `${row.user_id}:${row.plan_key}`, userId: row.user_id, trialEndMs: end,
      platform: row.provider === "app_store" ? "ios" : "android", amount, now, ...(send ? { send } : {}) });
    if (r.sent) sent++; else skipped++;
  }
  return { read: true, sent, skipped };
}

exports.handler = async () => {
  let admin;
  try { admin = getAdminClient(); } catch { console.error("[trial-reminder-sweep] admin client"); return { statusCode: 500, body: "{}" }; }
  const out = await sweep({ admin });
  return { statusCode: 200, body: JSON.stringify(out) };
};
exports._test = { sweep };
