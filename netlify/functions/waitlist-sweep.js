/**
 * Flourish Money — waitlist welcome sweep
 * netlify/functions/waitlist-sweep.js
 *
 * Scheduled every 15 minutes (schedule lives in netlify.toml).
 *
 * WHY THIS EXISTS. The confirmation email in join_waitlist is best effort: the row is saved first, and
 * the send can fail, time out, or be skipped entirely (an insert that timed out but committed sends
 * nothing at all). A saved signup would then never get its email, and a retry cannot fix it because the
 * unique constraint turns the retry into "already joined", which also sends nothing.
 *
 * So delivery is guaranteed here instead: every row whose welcomed_at is still null eventually gets the
 * message, once. The request path stays fast and best effort; this path is the one that must not miss.
 *
 * THE SAME EMAIL. The template, the send and the welcomed_at write come from _lib/waitlistWelcome.js,
 * the same module join_waitlist uses, including the same Idempotency-Key ("waitlist-welcome/<row id>").
 * Resend de-duplicates on that key, so a row that was already emailed by the request path cannot be
 * emailed twice by this one.
 *
 * Env vars needed:
 *   SUPABASE_URL, SUPABASE_SECRET_KEY — as elsewhere.
 *   RESEND_API_KEY                    — when missing, this function does nothing at all.
 */

"use strict";

const { sendWelcomeEmail, markWelcomed, hasResendKey } = require("./_lib/waitlistWelcome");

// A row must be this old before the sweep touches it, so it never races the request path: a signup made
// seconds ago may have its email in flight right now.
const MIN_AGE_MS = 5 * 60 * 1000;

// At most this many sends per run.
const PER_RUN_CAP = 25;

// Stop STARTING new sends once this much of the run has passed. Netlify kills a scheduled function at
// 30 seconds ("Scheduled functions have a 30 second execution limit",
// docs.netlify.com/build/functions/scheduled-functions). A send started at 19.99s can take at most 5s
// (the Resend deadline) plus 3s (the welcomed_at deadline), so the run ends by ~28s at the very worst.
const RUN_BUDGET_MS = 20000;

// A ROLLING 24-HOUR CEILING, and the reason it exists: the per-run cap alone cannot bound a day. At 96
// runs a day, 25 per run is 2,400 emails, and the Resend free tier on this account is 100 a day SHARED
// with GrowSmart. This ceiling counts rows welcomed in the last 24 hours (which counts both paths,
// since both set welcomed_at) and stops the run when it is reached, so the sweep can never eat the
// whole allowance. 50 is half the tier, left for the owner to change once the split with GrowSmart is
// decided; nothing in the data tells us what that split should be.
const DAILY_CAP = 50;

// The sweep's own reads. Short: nobody is waiting, and a slow read should not eat the run budget.
const READ_TIMEOUT_MS = 3000;

// Every call here gets a deadline, for the same reason the request path's do: an unbounded wait turns
// into a killed function with no log of what it was doing. Returns null on any failure, having logged
// a fixed message and a status word. Never logs the URL (it carries the filter) or the error.
async function fetchWithDeadline(url, opts, ms, label) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error(`[waitlist-sweep] ${label} failed`, aborted ? "timeout" : "no_status");
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

function authHeaders(secretKey) {
  return { "apikey": secretKey, "Authorization": `Bearer ${secretKey}`, "Accept": "application/json" };
}

// How many rows were welcomed in the last 24 hours, from PostgREST's exact count. Returns null when the
// count cannot be read, and the caller then skips the run: without it there is no ceiling, and sending
// blind is how a free tier is exhausted.
async function countWelcomedSince(supabaseUrl, secretKey, sinceIso) {
  const url = `${supabaseUrl}/rest/v1/waitlist?select=id&limit=1&welcomed_at=gte.${encodeURIComponent(sinceIso)}`;
  const res = await fetchWithDeadline(url, { headers: { ...authHeaders(secretKey), "Prefer": "count=exact" } }, READ_TIMEOUT_MS, "daily count");
  if (!res) return null;
  if (!res.ok) {
    console.error("[waitlist-sweep] daily count failed", res.status);
    return null;
  }
  const range = (res.headers && typeof res.headers.get === "function") ? res.headers.get("content-range") : null;
  const total = range && /\/(\d+)\s*$/.exec(range);
  if (!total) {
    console.error("[waitlist-sweep] daily count failed", "no_count_header");
    return null;
  }
  return Number(total[1]);
}

// The rows waiting for their email: never welcomed, old enough not to race the request path, oldest
// first so nobody is left behind while newer signups jump the queue.
async function selectPending(supabaseUrl, secretKey, cutoffIso, limit) {
  const url = `${supabaseUrl}/rest/v1/waitlist`
    + `?select=id,email,created_at`
    + `&welcomed_at=is.null`
    + `&created_at=lt.${encodeURIComponent(cutoffIso)}`
    + `&order=created_at.asc`
    + `&limit=${limit}`;
  const res = await fetchWithDeadline(url, { headers: authHeaders(secretKey) }, READ_TIMEOUT_MS, "pending select");
  if (!res) return null;
  if (!res.ok) {
    // A 400 here is what a missing created_at or id column looks like. The counts-only check queries in
    // migration 0006 are what confirm those columns exist before this ships.
    console.error("[waitlist-sweep] pending select failed", res.status);
    return null;
  }
  try {
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    console.error("[waitlist-sweep] pending select failed", "unparseable");
    return null;
  }
}

/**
 * One sweep. Options exist so the budget and caps can be exercised in tests without waiting out the
 * real ones; the handler below always runs with the production values above.
 * @returns {{skipped: string|null, considered: number, sent: number, failed: number, stoppedEarly: boolean, remainingToday: number|null}}
 */
async function runSweep(opts = {}) {
  const startedAt = Date.now();
  const budgetMs  = opts.budgetMs  != null ? opts.budgetMs  : RUN_BUDGET_MS;
  const perRunCap = opts.perRunCap != null ? opts.perRunCap : PER_RUN_CAP;
  const dailyCap  = opts.dailyCap  != null ? opts.dailyCap  : DAILY_CAP;
  const minAgeMs  = opts.minAgeMs  != null ? opts.minAgeMs  : MIN_AGE_MS;
  const done = (skipped, extra) => ({ skipped, considered: 0, sent: 0, failed: 0, stoppedEarly: false, remainingToday: null, ...extra });

  const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
  const secretKey   = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!supabaseUrl || !secretKey) {
    console.error("[waitlist-sweep] skipped", "missing_supabase_env");
    return done("missing_supabase_env");
  }

  // No key, no work: previews, netlify dev and local runs must never email a real person.
  if (!hasResendKey()) return done("no_api_key");

  const welcomedToday = await countWelcomedSince(supabaseUrl, secretKey, new Date(startedAt - 24 * 60 * 60 * 1000).toISOString());
  if (welcomedToday === null) return done("daily_count_unreadable");
  const remainingToday = dailyCap - welcomedToday;
  if (remainingToday <= 0) {
    console.log("[waitlist-sweep]", JSON.stringify({ skipped: "daily_cap_reached", welcomed_24h: welcomedToday, daily_cap: dailyCap }));
    return done("daily_cap_reached", { remainingToday: 0 });
  }

  const limit = Math.min(perRunCap, remainingToday);
  const rows = await selectPending(supabaseUrl, secretKey, new Date(startedAt - minAgeMs).toISOString(), limit);
  if (rows === null) return done("select_failed", { remainingToday });

  let sent = 0, failed = 0, stoppedEarly = false;
  // slice() as well as the query limit: two guards on the same number, because exceeding it costs real
  // emails out of a shared daily allowance.
  const batch = rows.slice(0, limit);
  for (const row of batch) {
    if (Date.now() - startedAt >= budgetMs) { stoppedEarly = true; break; }
    if (!row || !row.email) { failed++; continue; }
    if (await sendWelcomeEmail(row.email, row.id)) {
      await markWelcomed(supabaseUrl, secretKey, row, row.email);
      sent++;
    } else {
      // sendWelcomeEmail has already logged the reason, without the address. welcomed_at stays null, so
      // the next run tries again, and the Idempotency-Key keeps a retry from double-sending.
      failed++;
    }
  }

  // Counts only. No address, no id, no key, ever.
  console.log("[waitlist-sweep]", JSON.stringify({
    considered: batch.length, sent, failed,
    stopped_early: stoppedEarly, welcomed_24h: welcomedToday, daily_cap: dailyCap,
    ms: Date.now() - startedAt,
  }));
  return { skipped: null, considered: batch.length, sent, failed, stoppedEarly, remainingToday };
}

exports.handler = async () => {
  const result = await runSweep();
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) };
};

// Exported for the tests, which exercise the budget and caps with small values rather than waiting out
// the real ones, and assert that the real ones are what this file says they are.
exports.runSweep = runSweep;
exports.MIN_AGE_MS = MIN_AGE_MS;
exports.PER_RUN_CAP = PER_RUN_CAP;
exports.RUN_BUDGET_MS = RUN_BUDGET_MS;
exports.DAILY_CAP = DAILY_CAP;
