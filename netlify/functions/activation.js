/**
 * Flourish — activation counts, aggregate only
 * netlify/functions/activation.js   (POST /api/activation)
 *
 * The app tells the server that something happened for the signed-in account, once:
 *   {"metric": "data_source"}     the household added a bank, a statement or a balance it entered
 *   {"metric": "safe_view"}       Today showed its safe-to-spend figure
 *   {"metric": "meeting_opened"}  the household opened a money meeting
 *   {"metric": "app_open"}        the app was opened today
 * and the server adds 1 to ONE counter in public.activation_daily (migration 0019), keyed by the account's
 * signup day in Toronto time ("cohort day"):
 *   data_source    -> data_source
 *   safe_view      -> safe_view_7d, only within 7 days of the account being created
 *   meeting_opened -> first_meeting
 *   app_open       -> returned_d1 on the day after signup, returned_d7 seven days after; other days nothing
 *
 * NOTHING ELSE IS KEPT. Not the account id, the address, an amount, a device, an IP or any text: the
 * request body is one metric name from the list above, and the stored row is a day, a metric and a
 * count. The account is looked up only to check it is signed in, to read its signup day, and to leave
 * out Flourish's own test addresses. No third-party analytics.
 *
 * Answers 204 with no body whether or not a counter moved, so the answer says nothing about the account.
 * 401 without a valid session, 400 for anything that is not one of the four metrics, 405 for not POST.
 * The app sends each metric once per account (app_open once per day): see src/lib/activation.js.
 *
 * Env: SUPABASE_URL, SUPABASE_SECRET_KEY (service role, server only). No new variable.
 */

"use strict";

const { getUserFromRequest, getAdminClient } = require("./_lib/auth");
const { corsHeadersFor } = require("./_lib/cors");

// Flourish's own test addresses (Amanda, 2026-10-14). The same two domains as migration 0019's report;
// PR #69 adds the shared helper (_lib/foundingCohort.js isTestEmail) and this can use it once merged.
const TEST_EMAIL_DOMAINS = ["getgrowsmart.com", "flourishmoney.app"];
function isTestEmail(email) {
  const addr = typeof email === "string" ? email.replace(/\s+/g, "").toLowerCase() : "";
  const at = addr.lastIndexOf("@");
  if (at < 1) return false;
  const domain = addr.slice(at + 1);
  return TEST_EMAIL_DOMAINS.some(d => domain === d || domain.endsWith("." + d));
}

const METRICS = ["data_source", "safe_view", "meeting_opened", "app_open"];
const DAY_MS = 24 * 60 * 60 * 1000;

// A date's day in Toronto, as "YYYY-MM-DD".
function torontoDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
// Whole days from one "YYYY-MM-DD" to another.
function daysBetween(fromDay, toDay) {
  return Math.round((Date.parse(`${toDay}T12:00:00Z`) - Date.parse(`${fromDay}T12:00:00Z`)) / DAY_MS);
}

// The counter a signal moves for an account created at createdAt, seen at now; or null for none.
function counterFor(metric, createdAt, now) {
  const created = new Date(createdAt);
  if (!Number.isFinite(created.getTime())) return null;
  const age = daysBetween(torontoDay(created), torontoDay(now));
  if (age < 0) return null;
  if (metric === "data_source") return "data_source";
  if (metric === "meeting_opened") return "first_meeting";
  if (metric === "safe_view") return now.getTime() - created.getTime() <= 7 * DAY_MS ? "safe_view_7d" : null;
  if (metric === "app_open") return age === 1 ? "returned_d1" : age === 7 ? "returned_d7" : null;
  return null;
}

async function handler(event, _context, now = new Date()) {
  const CORS = { ...corsHeadersFor(event), "Cache-Control": "no-store" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };

  let metric = null;
  try { const b = JSON.parse(event.body || "{}"); metric = b && typeof b.metric === "string" ? b.metric : null; } catch { /* not JSON */ }
  if (!METRICS.includes(metric)) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "unknown_metric" }) };

  const { user_id } = await getUserFromRequest(event);
  if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "unauthorized" }) };

  const done = { statusCode: 204, headers: CORS, body: "" };
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(user_id);
    const user = !error && data && data.user;
    if (!user || isTestEmail(user.email)) return done;
    const counter = counterFor(metric, user.created_at, now);
    if (!counter) return done;
    const { error: bumpError } = await admin.rpc("activation_bump", { p_cohort_day: torontoDay(new Date(user.created_at)), p_metric: counter });
    if (bumpError) console.error("[activation] bump failed", counter);
  } catch {
    console.error("[activation] failed");
  }
  return done;
}

exports.handler = (event, context) => handler(event, context);
exports._test = { handler, counterFor, torontoDay, isTestEmail, METRICS, TEST_EMAIL_DOMAINS };
