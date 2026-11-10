// netlify/functions/trial-reminder.js   (/api/trial-reminder?do=unsubscribe&u=…&t=…)
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST, ITEM 3: the reminder email's one-click unsubscribe. GET (the link) and POST (the mail app's
// List-Unsubscribe-Post one-click, RFC 8058) both record the opt-out for that account (trial_reminder_optouts, 0046)
// when the link's signature is right. The subscription itself is unchanged. Nothing is logged but an outcome.
// -----------------------------------------------------------------------------
"use strict";

const { getAdminClient } = require("./_lib/auth");
const { checkReminderUnsubscribe } = require("./_lib/trialReminder");
const { trialEmailWords } = require("./_lib/trialWords");

const page = (statusCode, text) => ({
  statusCode,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>flourish</title>`
    + `<body style="font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;line-height:1.6"><p>${String(text).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</p></body>`,
});

async function route(event, deps) {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return { statusCode: 405, body: "" };
  const q = event.queryStringParameters || {};
  if (q.do !== "unsubscribe" || !checkReminderUnsubscribe(q.u, q.t)) return page(400, trialEmailWords("trialfirst-email-link-bad"));
  try {
    const { error } = await deps.admin().from("trial_reminder_optouts").upsert({ user_id: q.u, created_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
  } catch {
    console.error("[trial-reminder] unsubscribe failed");
    return page(503, trialEmailWords("trialfirst-email-unsub-failed"));
  }
  return page(200, trialEmailWords("trialfirst-email-unsubscribed"));
}

exports.handler = (event) => route(event, { admin: getAdminClient });
exports._test = { route };
