/**
 * Flourish Money — founding link sweep
 * netlify/functions/founding-link-sweep.js
 *
 * Scheduled every 15 minutes (netlify.toml). Sends each founding household its founding link email
 * (_lib/foundingLinkEmail.js), once.
 *
 * OFF UNLESS BOTH FLAGS ARE EXACTLY "true":
 *   BILLING_ENABLED      the checkout the email links to is open (netlify/functions/billing.js);
 *   FOUNDING_LINK_EMAIL  Amanda says send. Set it on billing day, after the smoke purchase
 *                        (docs/ops/BILLING-DAY-OCT-26.md). Unset it and the next run sends nothing.
 * Either one unset: the run reads nothing, sends nothing and writes nothing.
 *
 * WHO. A waitlist row holding a founding number (from 1 up; 0025 can issue numbers past 50), not a test row, not unsubscribed, not sent before,
 * with a consent version that covers one of the two founding emails, or a recorded personal relationship (a
 * pre-2026-10-01 founding holder, 2026-10-25: the founding link email, never the launch email) (foundingEmailKindFor,
 * _lib/waitlistConsent.js): the founding link email for versions that asked for updates (founding number 1
 * to 50); the CANADA LAUNCH email for pre-2026-10-01 rows (any number, or none: it names no number, price or
 * link), and only while OPEN_SIGNUP is also exactly "true" (Amanda's decision: October 26 with signup open is
 * the launch those rows asked about). That launch email is the one email those rows ever get. Without
 * OPEN_SIGNUP they are not even asked for. Not sent before
 * (metadata.founding_link is empty). Then, per row, the same lookup billing uses
 * (waitlist_founding_number_for_email, migration 0025: real holders only, the void and test numbers left out) must still return that row's own number: an
 * ended number, a test row or an unreadable lookup (0016 not applied) sends nothing. Lowest number first.
 *
 * RECORDED. After Resend accepts a message, the row's metadata gains founding_link: { sent_at,
 * consent_version, position, kind }. That is the record of what was sent under which consent, and what stops a
 * second send. The write is filtered on founding_link still being empty, and Resend's Idempotency-Key
 * (founding-link/<row id>) covers a retry inside its window. A record that cannot be written stops the run.
 *
 * CAPS. At most PER_RUN_CAP sends a run, nothing new started after RUN_BUDGET_MS (Netlify stops a scheduled
 * function at 30 s), and at most DAILY_CAP in any 24 hours. The Resend plan's daily allowance is shared
 * with the welcome sweep (its own cap is 50) and with GrowSmart.
 *
 * LOGS: counts only. Never an address, a row id or a key.
 *
 * Env: BILLING_ENABLED, FOUNDING_LINK_EMAIL, OPEN_SIGNUP (the launch email), SUPABASE_URL, SUPABASE_SECRET_KEY, RESEND_API_KEY,
 * WAITLIST_UNSUBSCRIBE_SECRET (optional; see _lib/waitlistUnsubscribe.js).
 */
"use strict";

const { sendFoundingLinkEmail } = require("./_lib/foundingLinkEmail");
const { mayEmailWaitlistRow, foundingEmailKindFor, consentBasisOf, FOUNDING_LINK_CONSENT_VERSIONS, LAUNCH_EMAIL_CONSENT_VERSIONS, CANADA_LAUNCH_KIND } = require("./_lib/waitlistConsent");
const { normalizeEmail, isFoundingPosition, FOUNDING_COHORT_LIMIT } = require("./_lib/foundingCohort");

const PER_RUN_CAP = 10;
const RUN_BUDGET_MS = 20000;
const DAILY_CAP = 40;
const READ_TIMEOUT_MS = 3000;
const WRITE_TIMEOUT_MS = 3000;

const flagOn = (name) => process.env[name] === "true";

async function fetchWithDeadline(url, opts, ms, label) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error(`[founding-link] ${label} failed`, aborted ? "timeout" : "no_status");
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

const authHeaders = (key) => ({ "apikey": key, "Authorization": `Bearer ${key}`, "Accept": "application/json" });

// How many founding link emails went out in the last 24 hours, or null.
async function countSentSince(supabaseUrl, key, sinceIso) {
  const url = `${supabaseUrl}/rest/v1/waitlist?select=id&limit=1&metadata->founding_link->>sent_at=gte.${encodeURIComponent(sinceIso)}`;
  const res = await fetchWithDeadline(url, { headers: { ...authHeaders(key), "Prefer": "count=exact" } }, READ_TIMEOUT_MS, "daily count");
  if (!res) return null;
  if (!res.ok) { console.error("[founding-link] daily count failed", res.status); return null; }
  const range = res.headers && typeof res.headers.get === "function" ? res.headers.get("content-range") : null;
  const m = range && /\/(\d+)\s*$/.exec(range);
  if (!m) { console.error("[founding-link] daily count failed", "no_count_header"); return null; }
  return Number(m[1]);
}

// The rows still owed their email, lowest founding number first, or null.
// The consent versions asked for: the founding link email's, plus the pre-2026-10-01 version, always: those rows
// can hold the founding link email by a recorded personal relationship (2026-10-25), with or without signup open,
// and their launch email still needs signup open. Every row is decided again on its own (foundingEmailKindFor).
const versionsFor = () => [...FOUNDING_LINK_CONSENT_VERSIONS, ...LAUNCH_EMAIL_CONSENT_VERSIONS];

async function selectOwed(supabaseUrl, key, limit, launched = false) {
  const url = `${supabaseUrl}/rest/v1/waitlist`
    + `?select=id,email,founding_position,is_test,unsubscribed_at,consent_version,metadata`
    // A founding number (from 1 up, 0025), or (signup open) a pre-2026-10-01 row, number or not.
    + (launched
      ? `&or=(and(founding_position.gte.1,founding_position.lte.${FOUNDING_COHORT_LIMIT}),consent_version.in.(${LAUNCH_EMAIL_CONSENT_VERSIONS.map(encodeURIComponent).join(",")}))`
      : `&founding_position=gte.1&founding_position=lte.${FOUNDING_COHORT_LIMIT}`)
    + `&is_test=is.false`
    + `&unsubscribed_at=is.null`
    // Only the consent versions whose words asked for updates (waitlistConsent.js). Checked again per row.
    + `&consent_version=in.(${versionsFor().map(encodeURIComponent).join(",")})`
    + `&metadata->founding_link=is.null`
    + `&order=founding_position.asc.nullslast`
    + `&limit=${limit}`;
  const res = await fetchWithDeadline(url, { headers: authHeaders(key) }, READ_TIMEOUT_MS, "select");
  if (!res) return null;
  if (!res.ok) { console.error("[founding-link] select failed", res.status); return null; }
  try {
    const rows = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    console.error("[founding-link] select failed", "unparseable");
    return null;
  }
}

// Billing's own answer for this address: the founding number it holds, or null. undefined when the lookup
// itself failed, which stops the run (0025 not applied, or Supabase unreachable).
async function honouredNumber(supabaseUrl, key, email) {
  const res = await fetchWithDeadline(`${supabaseUrl}/rest/v1/rpc/waitlist_founding_number_for_email`, {
    method: "POST",
    headers: { ...authHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify({ p_email: normalizeEmail(email) }),
  }, READ_TIMEOUT_MS, "lookup");
  if (!res) return undefined;
  if (!res.ok) { console.error("[founding-link] lookup failed", res.status); return undefined; }
  try {
    const n = await res.json();
    return isFoundingPosition(n) ? n : null;
  } catch {
    console.error("[founding-link] lookup failed", "unparseable");
    return undefined;
  }
}

// The record of the send, on the row. Only where none is there yet.
async function recordSent(supabaseUrl, key, row, sentAtIso, kind) {
  const metadata = { ...(row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {}),
    founding_link: { sent_at: sentAtIso, consent_version: row.consent_version, position: row.founding_position, kind,
      // The basis it went out under, when it is not the consent version's own words (a personal relationship).
      ...(consentBasisOf(row) ? { consent_basis: consentBasisOf(row) } : {}) } };
  const res = await fetchWithDeadline(`${supabaseUrl}/rest/v1/waitlist?id=eq.${encodeURIComponent(row.id)}&metadata->founding_link=is.null`, {
    method: "PATCH",
    headers: { ...authHeaders(key), "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify({ metadata }),
  }, WRITE_TIMEOUT_MS, "record");
  if (!res) return false;
  if (!res.ok) { console.error("[founding-link] record failed", res.status); return false; }
  return true;
}

/**
 * One run. Options exist so the caps can be exercised in tests; the handler always runs the real values.
 * @returns {{skipped: string|null, considered: number, sent: number, failed: number, notHonoured: number, stoppedEarly: boolean}}
 */
async function runFoundingLinkSweep(opts = {}) {
  const startedAt = opts.now != null ? opts.now : Date.now();
  const clock = opts.clock || Date.now;
  const budgetMs = opts.budgetMs != null ? opts.budgetMs : RUN_BUDGET_MS;
  const perRunCap = opts.perRunCap != null ? opts.perRunCap : PER_RUN_CAP;
  const dailyCap = opts.dailyCap != null ? opts.dailyCap : DAILY_CAP;
  const done = (skipped, extra) => ({ skipped, considered: 0, sent: 0, failed: 0, notHonoured: 0, stoppedEarly: false, ...extra });

  // The two switches come first: with either off, nothing is read, sent or written.
  if (!flagOn("BILLING_ENABLED")) return done("billing_off");
  if (!flagOn("FOUNDING_LINK_EMAIL")) return done("founding_link_email_off");
  if (!(process.env.RESEND_API_KEY || "").trim()) return done("no_api_key");
  // Signup open on billing day is the launch the pre-2026-10-01 rows asked to hear about.
  const launched = flagOn("OPEN_SIGNUP");

  const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!supabaseUrl || !key) {
    console.error("[founding-link] skipped", "missing_supabase_env");
    return done("missing_supabase_env");
  }

  const sentToday = await countSentSince(supabaseUrl, key, new Date(startedAt - 86400000).toISOString());
  if (sentToday === null) return done("daily_count_unreadable");
  const remaining = dailyCap - sentToday;
  if (remaining <= 0) {
    console.log("[founding-link]", JSON.stringify({ skipped: "daily_cap_reached", sent_24h: sentToday, daily_cap: dailyCap }));
    return done("daily_cap_reached");
  }

  const limit = Math.min(perRunCap, remaining);
  const rows = await selectOwed(supabaseUrl, key, limit, launched);
  if (rows === null) return done("select_failed");

  let sent = 0, failed = 0, notHonoured = 0, stoppedEarly = false, lookupDown = false, recordDown = false;
  const batch = rows.slice(0, limit);
  for (const row of batch) {
    if (clock() - startedAt >= budgetMs) { stoppedEarly = true; break; }
    if (!row || !row.email || row.is_test === true) { notHonoured++; continue; }
    const kind = foundingEmailKindFor(row, { launched });
    if (!kind || !mayEmailWaitlistRow(row, kind)) { notHonoured++; continue; }
    if (row.metadata && row.metadata.founding_link) { notHonoured++; continue; }
    // The founding link email: a founding number billing itself still honours. The launch email names none.
    if (kind !== CANADA_LAUNCH_KIND) {
      if (!isFoundingPosition(row.founding_position)) { notHonoured++; continue; }
      const honoured = await honouredNumber(supabaseUrl, key, row.email);
      if (honoured === undefined) { lookupDown = true; break; }      // fail closed: no lookup, no email
      if (honoured !== row.founding_position) { notHonoured++; continue; }
    }
    const result = await sendFoundingLinkEmail(row.email, row, { launched });
    if (!result.sent) { failed++; continue; }
    sent++;
    // A send that cannot be recorded stops the run: nothing more goes out until the record can be kept.
    // The next run retries this row, and Resend's Idempotency-Key keeps that retry from a second copy.
    if (!(await recordSent(supabaseUrl, key, row, new Date(clock()).toISOString(), kind))) { recordDown = true; break; }
  }

  // Counts only. No address, no id, no key, ever.
  console.log("[founding-link]", JSON.stringify({
    considered: batch.length, sent, failed, not_honoured: notHonoured, stopped_early: stoppedEarly,
    lookup_down: lookupDown, record_down: recordDown, sent_24h: sentToday + sent, daily_cap: dailyCap,
  }));
  return { skipped: lookupDown ? "lookup_failed" : recordDown ? "record_failed" : null, considered: batch.length, sent, failed, notHonoured, stoppedEarly };
}

exports.handler = async () => {
  const result = await runFoundingLinkSweep();
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) };
};

exports.runFoundingLinkSweep = runFoundingLinkSweep;
exports.PER_RUN_CAP = PER_RUN_CAP;
exports.RUN_BUDGET_MS = RUN_BUDGET_MS;
exports.DAILY_CAP = DAILY_CAP;
