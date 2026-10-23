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
 *   meeting_opened -> first_meeting (the household opened the money meeting agenda; not that it was held)
 *   app_open       -> returned_d1 on the day after signup, returned_d7 seven days after; other days nothing
 *
 * NO ACCOUNT ID IS STORED. Not the account id, the address, an amount, a device, an IP or any text: the
 * request body is one metric name from the list above, and the stored row is a day, a metric and a
 * count. The account is looked up only to check it is signed in, to read its signup day, and to leave
 * out Flourish's own test addresses and the App Review and screenshot accounts. Small cohorts can still
 * be matched to the few accounts created that day, so the report is for Flourish, never published. The
 * counts are close estimates: the app sends each metric once per device, so they can exceed accounts
 * created. No third-party analytics.
 *
 * Answers 204 with no body whether or not a counter moved, so the answer says nothing about the account;
 * 503 when the counter could not be written (migration 0019 not applied, the database down), so the app
 * keeps the signal and sends it again later instead of losing it.
 * 401 without a valid session, 400 for anything that is not one of the four metrics, 405 for not POST.
 * The app sends each metric once per account (app_open once per day): see src/lib/activation.js.
 *
 * Env: SUPABASE_URL, SUPABASE_SECRET_KEY (service role, server only). No new variable.
 */

"use strict";

const { getUserFromRequest, getAdminClient } = require("./_lib/auth");
const { corsHeadersFor } = require("./_lib/cors");
// Onboarding counts (2026-10-23): the steps, the first number and the bank link, into public.onboarding_counts
// (migration 0028) through onboarding_bump. Until 0028 runs the bump fails, the answer is 503, and the app carries
// on exactly as before: no count is ever load-bearing.
const { ONBOARDING_EVENTS, onboardingRows } = require("./_lib/onboardingCounts");

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

// The screenshot account by its address, and the App Review account by the SHA-256 of its address only
// (src/lib/sampleHouseholdAccount.js; the review address is never written in this repository).
const SCREENSHOT_EMAIL = "snap@flourish.app";
const REVIEW_ACCOUNT_SHA256 = "af552e5b3f4529120915257ae8073ff990043c65e6163630d694fe2b6516dc7b";
function isSampleAccount(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  if (e === SCREENSHOT_EMAIL) return true;
  return require("crypto").createHash("sha256").update(e).digest("hex") === REVIEW_ACCOUNT_SHA256;
}
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

  let metric = null, body = null;
  try { body = JSON.parse(event.body || "{}"); metric = body && typeof body.metric === "string" ? body.metric : null; } catch { /* not JSON */ }
  const onboarding = ONBOARDING_EVENTS.includes(metric);
  if (!METRICS.includes(metric) && !onboarding) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "unknown_metric" }) };
  // An onboarding event with a detail, mode or time outside the fixed lists is refused before anything is read.
  if (onboarding && onboardingRows(body, now.toISOString(), now) === null) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "unknown_metric" }) };

  const { user_id } = await getUserFromRequest(event);
  if (!user_id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "unauthorized" }) };

  const done = { statusCode: 204, headers: CORS, body: "" };
  const retryLater = { statusCode: 503, headers: CORS, body: JSON.stringify({ error: "unavailable" }) };
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(user_id);
    if (error) { console.error("[activation] account read failed"); return retryLater; }
    const user = data && data.user;
    if (!user || isTestEmail(user.email) || isSampleAccount(user.email)) return done;
    if (onboarding) {
      const cohortDay = torontoDay(new Date(user.created_at));
      for (const row of onboardingRows(body, user.created_at, now)) {
        const { error: bumpError } = await admin.rpc("onboarding_bump", { p_cohort_day: cohortDay, p_event: row.event, p_detail: row.detail });
        if (bumpError) { console.error("[activation] onboarding bump failed", row.event); return retryLater; }
      }
      return done;
    }
    const counter = counterFor(metric, user.created_at, now);
    if (!counter) return done;
    const { error: bumpError } = await admin.rpc("activation_bump", { p_cohort_day: torontoDay(new Date(user.created_at)), p_metric: counter });
    if (bumpError) { console.error("[activation] bump failed", counter); return retryLater; }
  } catch {
    console.error("[activation] failed");
    return retryLater;
  }
  return done;
}

exports.handler = (event, context) => handler(event, context);
exports._test = { handler, counterFor, torontoDay, isTestEmail, isSampleAccount, METRICS, TEST_EMAIL_DOMAINS, ONBOARDING_EVENTS };
