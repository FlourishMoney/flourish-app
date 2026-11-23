// netlify/functions/trial-reminder-sweep.js   (scheduled hourly, netlify.toml)
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST, ITEM 3, THE STORES: the reminder 3 days before the first charge for a trial bought on an iPhone or
// with Google Play. RevenueCat reports the trial's end (our subscriptions row: status "trialing", current_period_end),
// and this sends each trial's one reminder in its window (_lib/trialReminder.js reminderDue): never for a trial already
// cancelled (cancel_at_period_end), never twice. A website trial gets Stripe's own reminder (7 days before), never ours.
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
  // THE ONES STILL OWED, SOONEST FIRST (review of 2026-11-22, P3-10). The run has 20 seconds. Walking every trial in
  // the order the database happened to return them, and re-checking one by one the reminders already sent, could use
  // the whole run on trials that need nothing and never reach one that does. So: only the trials in their window, the
  // one ending soonest first, and the reminders already sent are read once (100 at a time) and skipped without a call
  // each. If that read fails, each trial is checked on its own as before (sendTrialReminder never sends twice).
  const refOf = (row) => `${row.user_id}:${row.plan_key}`;
  const due = [];
  for (const row of rows || []) {
    const end = Date.parse(row.current_period_end || "");
    if (!reminderDue(end, now) || row.cancel_at_period_end || !STORE_PRICES[row.plan_key]) { skipped++; continue; }
    due.push(row);
  }
  due.sort((a, b) => Date.parse(a.current_period_end) - Date.parse(b.current_period_end));
  const alreadySent = new Set();
  try {
    for (let i = 0; i < due.length; i += 100) {
      const { data, error: readErr } = await admin.from("trial_reminders").select("provider, subscription_ref, sent_at")
        .in("subscription_ref", due.slice(i, i + 100).map(refOf));
      if (readErr || !Array.isArray(data)) break;
      for (const d of data) if (d && d.sent_at) alreadySent.add(`${d.provider}/${d.subscription_ref}`);
    }
  } catch { /* each trial is checked on its own below */ }
  for (const row of due) {
    if (alreadySent.has(`${row.provider}/${refOf(row)}`)) { skipped++; continue; }
    if (clock() - started > BUDGET_MS) break;
    const end = Date.parse(row.current_period_end || "");
    const amount = STORE_PRICES[row.plan_key];
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
