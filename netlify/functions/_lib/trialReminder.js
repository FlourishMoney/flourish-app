// netlify/functions/_lib/trialReminder.js
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST, ITEM 3: ONE REMINDER, 3 DAYS BEFORE THE FIRST CHARGE, FOR APPLE AND GOOGLE TRIALS (Amanda, 2026-11-10).
//   stores    from the trial end RevenueCat reports (our subscriptions row, status "trialing"), swept every hour
//             (trial-reminder-sweep.js); the amount is the plan's price, the same as pricing.js
//   website   NONE FROM US. Stripe's own trial reminder (sent 7 days before a trial ends) stays on, because the card
//             networks require a reminder before a trial converts (docs/ops/TRIAL-PLAN-FIRST-CONSOLES.md). A Stripe
//             trial is never sent ours: this file refuses the provider and the platform.
// Sender hello@flourishmoney.app, the mailing address in the footer, and a one-click unsubscribe (RFC 8058 headers).
// It says the date and amount of the first charge and exactly how to cancel on that platform.
//
// NEVER MORE THAN ONE PER TRIAL. Each trial has one row in trial_reminders (migration 0046), keyed by its provider and
// its subscription: the row is claimed before the send, and a trial whose row says sent is never sent again. A claim
// whose send never finished (the function stopped) may be taken again after 15 minutes, never sooner.
// Nothing is sent while a line is a placeholder, or to an account that unsubscribed, or for a trial already cancelled.
// Nothing here logs an email address, an amount or an account id.
// -----------------------------------------------------------------------------
"use strict";

const crypto = require("crypto");
const { unsubscribeSecret } = require("./waitlistUnsubscribe");
const { emailHtml } = require("./emailLayout");
const { SENDER_LINE, sendEmail } = require("./newsletter");
const { trialEmailWords } = require("./trialWords");
const { holdsPendingWords } = require("./pendingWords");

const REMINDER_DAYS_BEFORE = 3;
const DAY_MS = 86400000;
const RECLAIM_MS = 15 * 60 * 1000;
const FROM = "flourish <hello@flourishmoney.app>";
const REPLY_TO = "hello@flourishmoney.app";
const BASE = "https://flourishmoney.app/api/trial-reminder";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The store plans' prices, as src/lib/pricing.js has them (tests/trialReminder.test.cjs holds the two together).
const STORE_PRICES = Object.freeze({ monthly: "$11.99 CAD", annual: "$99.99 CAD", founding_annual: "$79.99 CAD" });

// The sweep's window: from 3 days before the trial ends until 1 day before (an hourly sweep sends it in its first hour;
// an outage of up to two days still sends it late rather than not at all, and it is never sent in the last day).
function reminderDue(trialEndMs, nowMs) {
  return Number.isFinite(trialEndMs) && nowMs >= trialEndMs - REMINDER_DAYS_BEFORE * DAY_MS && nowMs < trialEndMs - DAY_MS;
}

const sign = (userId, secret) => crypto.createHmac("sha256", secret).update(`trial-reminder/unsubscribe/v1/${userId}`).digest("base64url");
function reminderUnsubscribeLink(userId, secret = unsubscribeSecret()) {
  if (!secret || !UUID.test(String(userId))) return null;
  return `${BASE}?do=unsubscribe&u=${encodeURIComponent(userId)}&t=${sign(userId, secret)}`;
}
function checkReminderUnsubscribe(userId, token, secret = unsubscribeSecret()) {
  if (!secret || !UUID.test(String(userId))) return false;
  const a = Buffer.from(sign(userId, secret)), b = Buffer.from(String(token || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** "November 27, 2026", in Pacific time: the earliest calendar day anywhere in Canada for that moment, so a date in the
 * email is never later than the person's own (review round: Toronto's could be a day late in British Columbia). */
function reminderDateLabel(ms) {
  return new Date(ms).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Vancouver" });
}
// As the plans screen states them (src/lib/trialPlanFirst.js trialDates): on an iPhone the first charge may come 24 hours
// early, and "cancel before" is the day before the trial ends, everywhere.
function reminderDates(platform, trialEndMs) {
  const dayBefore = trialEndMs - 86400000;
  return { charge: reminderDateLabel(platform === "ios" ? dayBefore : trialEndMs), cancelBy: reminderDateLabel(dayBefore) };
}

/** The email, or null when it cannot carry a working unsubscribe link, or for anything but "ios" | "android". */
function reminderEmail({ to, userId, platform, trialEndMs, amount }) {
  if (platform !== "ios" && platform !== "android") return null;   // a website trial: Stripe's own reminder
  const unsub = reminderUnsubscribeLink(userId);
  if (!unsub || !to || !amount) return null;
  const { charge: date, cancelBy } = reminderDates(platform, trialEndMs);
  const cancel = platform === "ios" ? "trialfirst-email-cancel-ios" : "trialfirst-email-cancel-android";
  const subject = trialEmailWords("trialfirst-email-subject", { date });
  const paragraphs = [
    trialEmailWords("trialfirst-email-lead", { date }),
    trialEmailWords("trialfirst-email-charge", { amount, date }),
    trialEmailWords(cancel, { date: cancelBy }),
    trialEmailWords("trialfirst-email-keep"),
    trialEmailWords("trialfirst-email-why"),
  ];
  const footer = [SENDER_LINE, `Unsubscribe in one click: ${unsub}`];
  return {
    from: FROM,
    reply_to: REPLY_TO,
    to: [to],
    subject,
    text: [...paragraphs, ...footer].join("\n\n"),
    html: emailHtml({ title: subject, paragraphs, footer, unsubscribeUrl: unsub }),
    headers: { "List-Unsubscribe": `<${unsub}>, <mailto:hello@flourishmoney.app?subject=unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

// Claim this trial's one reminder: "claimed" (send it now), "done" (already sent), "busy" (another send is under way),
// or "error". The insert is the lock; a claim left unsent for 15 minutes may be taken over, once.
async function claimReminder(admin, { provider, ref, userId, trialEndMs, now }) {
  const row = { provider, subscription_ref: ref, user_id: userId, trial_end: new Date(trialEndMs).toISOString(), claimed_at: new Date(now).toISOString(), sent_at: null };
  const ins = await admin.from("trial_reminders").insert(row);
  if (!ins.error) return "claimed";
  if (ins.error.code !== "23505") return "error";
  const { data: cur, error } = await admin.from("trial_reminders").select("sent_at, claimed_at").eq("provider", provider).eq("subscription_ref", ref).maybeSingle();
  if (error || !cur) return "error";
  if (cur.sent_at) return "done";
  if (Date.parse(cur.claimed_at) > now - RECLAIM_MS) return "busy";
  const { data: took, error: upErr } = await admin.from("trial_reminders").update({ claimed_at: row.claimed_at })
    .eq("provider", provider).eq("subscription_ref", ref).eq("claimed_at", cur.claimed_at).select("subscription_ref");
  if (upErr) return "error";
  return took && took.length ? "claimed" : "busy";
}

/**
 * Send this trial's one reminder, if it is due to anyone. Returns { sent, reason }:
 *   sent        the email went
 *   reasons     words_pending, unsubscribed, no_email, no_link, already_sent, in_progress, read_failed, send_failed
 * send_failed leaves the claim unsent, so a retry (Stripe's, or the next sweep) can send it after 15 minutes.
 */
async function sendTrialReminder(admin, { provider, ref, userId, trialEndMs, platform, amount, now = Date.now(), send = sendEmail }) {
  if (provider !== "app_store" && provider !== "play_store") return { sent: false, reason: "not_a_store_trial" };   // Stripe sends its own
  if (!UUID.test(String(userId)) || !ref) return { sent: false, reason: "no_account" };
  const { data: out, error: outErr } = await admin.from("trial_reminder_optouts").select("user_id").eq("user_id", userId).maybeSingle();
  if (outErr) return { sent: false, reason: "read_failed" };
  if (out) return { sent: false, reason: "unsubscribed" };
  let email = null;
  try { const { data } = await admin.auth.admin.getUserById(userId); email = data && data.user ? data.user.email : null; }
  catch { return { sent: false, reason: "read_failed" }; }
  if (!email) return { sent: false, reason: "no_email" };
  const payload = reminderEmail({ to: email, userId, platform, trialEndMs, amount });
  if (!payload) return { sent: false, reason: "no_link" };
  if (holdsPendingWords(payload)) return { sent: false, reason: "words_pending" };   // words still to come: nobody gets them
  const claim = await claimReminder(admin, { provider, ref, userId, trialEndMs, now });
  if (claim === "done") return { sent: false, reason: "already_sent" };
  if (claim === "busy") return { sent: false, reason: "in_progress" };
  if (claim === "error") return { sent: false, reason: "read_failed" };
  const ok = await send(payload, `trial-reminder/${provider}/${ref}`);
  if (!ok) {
    // The claim is let go at once (review round, M1), so Stripe's retry, or the next sweep, can send it.
    const { error: relErr } = await admin.from("trial_reminders").update({ claimed_at: new Date(0).toISOString() }).eq("provider", provider).eq("subscription_ref", ref);
    if (relErr) console.error("[trial-reminder] claim not released");
    return { sent: false, reason: "send_failed" };
  }
  const { error: doneErr } = await admin.from("trial_reminders").update({ sent_at: new Date(now).toISOString() }).eq("provider", provider).eq("subscription_ref", ref);
  if (doneErr) console.error("[trial-reminder] sent, but not recorded"); // the idempotency key keeps Resend from sending it twice
  return { sent: true, reason: null };
}

module.exports = { REMINDER_DAYS_BEFORE, STORE_PRICES, RECLAIM_MS, reminderDue, reminderUnsubscribeLink, checkReminderUnsubscribe, reminderDateLabel, reminderDates,
  reminderEmail, claimReminder, sendTrialReminder };
