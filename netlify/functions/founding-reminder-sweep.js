/**
 * Flourish Money — founding reminder sweep
 * netlify/functions/founding-reminder-sweep.js
 *
 * Scheduled every 15 minutes (netlify.toml). The approved 30-day plan's two founding reminders
 * (_lib/foundingReminderEmail.js): a reminder from October 29, 10:00 Toronto time, and a last call from
 * November 2, 10:00, sent until November 9. Outside those windows a run does nothing.
 *
 * OFF UNLESS BOTH FLAGS ARE EXACTLY "true":
 *   BILLING_ENABLED      the checkout the reminder links to is open (netlify/functions/billing.js);
 *   FOUNDING_REMINDERS   Amanda says send, once the reminder words are approved (docs/ops/BILLING-DAY-OCT-26.md).
 *                        Unset it and the next run sends nothing.
 * Either one unset: the run reads nothing, sends nothing and writes nothing.
 *
 * WHO. A founding household that got the founding link email and has not paid:
 *   • worded consent only (2026-10-01, 2026-10-05, 2026-10-06), through the shared rule (mayEmailWaitlistRow):
 *     never a pre-2026-10-01 row (their one email is the Canada launch email), never an unsubscribed one;
 *   • founding number 1 to 50, not a test row, and billing's own lookup still honours that number;
 *   • its founding link email was sent (metadata.founding_link.kind is "founding_link") at least 48 hours ago,
 *     and, for the last call, any reminder at least 48 hours ago;
 *   • no reminder of this kind sent before (metadata.founding_reminders[kind] is empty);
 *   • HAS NOT PAID: no Flourish account with this address has ever had a Stripe subscription
 *     (public.subscriptions with a provider_subscription_id, any status). A household that paid with
 *     another address cannot hold the founding price, so it is the founding price's own address that counts.
 * Anything that cannot be read (the founding lookup, the subscriptions, an account) stops the run before
 * anything is sent: fail closed.
 *
 * RECORDED. After Resend accepts a message, the row's metadata gains founding_reminders[kind]:
 * { sent_at, consent_version }. The write is filtered on that entry still being empty, and Resend's
 * Idempotency-Key (founding-reminder/<kind>/<row id>) covers a retry. A record that cannot be written stops
 * the run. One email per row per reminder.
 *
 * CAPS. At most PER_RUN_CAP sends a run, nothing new started after RUN_BUDGET_MS, and at most DAILY_CAP in
 * any 24 hours (shared Resend allowance: the welcome sweep, the founding link sweep, GrowSmart).
 *
 * LOGS: counts only. Never an address, a row id or a key.
 *
 * Env: BILLING_ENABLED, FOUNDING_REMINDERS, SUPABASE_URL, SUPABASE_SECRET_KEY, RESEND_API_KEY,
 * WAITLIST_UNSUBSCRIBE_SECRET (optional; see _lib/waitlistUnsubscribe.js).
 */
"use strict";

const { sendFoundingReminder, dueKind, MIN_GAP_MS } = require("./_lib/foundingReminderEmail");
const { mayEmailWaitlistRow, FOUNDING_LINK_CONSENT_VERSIONS } = require("./_lib/waitlistConsent");
const { normalizeEmail, isFoundingPosition, FOUNDING_COHORT_LIMIT } = require("./_lib/foundingCohort");

const PER_RUN_CAP = 10;
const RUN_BUDGET_MS = 20000;
const DAILY_CAP = 40;
const READ_TIMEOUT_MS = 3000;
const WRITE_TIMEOUT_MS = 3000;
// More paying accounts than this and the paid check would not finish inside a run: the run sends nothing.
const PAID_LOOKUP_CAP = 300;
const PAID_LOOKUP_PARALLEL = 10;

const flagOn = (name) => process.env[name] === "true";

async function fetchWithDeadline(url, opts, ms, label) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error(`[founding-reminder] ${label} failed`, aborted ? "timeout" : "no_status");
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

const authHeaders = (key) => ({ "apikey": key, "Authorization": `Bearer ${key}`, "Accept": "application/json" });
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// How many reminders of this kind went out in the last 24 hours, or null.
async function countSentSince(supabaseUrl, key, kind, sinceIso) {
  const url = `${supabaseUrl}/rest/v1/waitlist?select=id&limit=1&metadata->founding_reminders->${kind}->>sent_at=gte.${encodeURIComponent(sinceIso)}`;
  const res = await fetchWithDeadline(url, { headers: { ...authHeaders(key), "Prefer": "count=exact" } }, READ_TIMEOUT_MS, "daily count");
  if (!res) return null;
  if (!res.ok) { console.error("[founding-reminder] daily count failed", res.status); return null; }
  const range = res.headers && typeof res.headers.get === "function" ? res.headers.get("content-range") : null;
  const m = range && /\/(\d+)\s*$/.exec(range);
  if (!m) { console.error("[founding-reminder] daily count failed", "no_count_header"); return null; }
  return Number(m[1]);
}

// The founding households sent their founding link email and not yet this reminder, lowest number first, or null.
async function selectOwed(supabaseUrl, key, kind) {
  const url = `${supabaseUrl}/rest/v1/waitlist`
    + `?select=id,email,founding_position,is_test,unsubscribed_at,consent_version,metadata`
    + `&founding_position=gte.1&founding_position=lte.${FOUNDING_COHORT_LIMIT}`
    + `&is_test=is.false`
    + `&unsubscribed_at=is.null`
    // Worded consent only (waitlistConsent.js). Checked again per row.
    + `&consent_version=in.(${FOUNDING_LINK_CONSENT_VERSIONS.map(encodeURIComponent).join(",")})`
    + `&metadata->founding_link->>kind=eq.founding_link`
    + `&metadata->founding_reminders->${kind}=is.null`
    + `&order=founding_position.asc`
    + `&limit=${FOUNDING_COHORT_LIMIT}`;
  const res = await fetchWithDeadline(url, { headers: authHeaders(key) }, READ_TIMEOUT_MS, "select");
  if (!res) return null;
  if (!res.ok) { console.error("[founding-reminder] select failed", res.status); return null; }
  try {
    const rows = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    console.error("[founding-reminder] select failed", "unparseable");
    return null;
  }
}

// Every address that has ever paid: the accounts with a Stripe subscription, any status. A Set of normalized
// addresses, or null when any part cannot be read (an account that no longer exists is not an error).
async function paidAddresses(supabaseUrl, key) {
  const res = await fetchWithDeadline(`${supabaseUrl}/rest/v1/subscriptions?select=user_id&provider_subscription_id=not.is.null`,
    { headers: authHeaders(key) }, READ_TIMEOUT_MS, "paid");
  if (!res) return null;
  if (!res.ok) { console.error("[founding-reminder] paid failed", res.status); return null; }
  let rows;
  try { rows = await res.json(); } catch { console.error("[founding-reminder] paid failed", "unparseable"); return null; }
  if (!Array.isArray(rows)) return null;
  const ids = [...new Set(rows.map(r => r && r.user_id).filter(Boolean))];
  if (ids.length > PAID_LOOKUP_CAP) { console.error("[founding-reminder] paid failed", "too_many"); return null; }
  const paid = new Set();
  for (let i = 0; i < ids.length; i += PAID_LOOKUP_PARALLEL) {
    const answers = await Promise.all(ids.slice(i, i + PAID_LOOKUP_PARALLEL).map(async (id) => {
      const r = await fetchWithDeadline(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(id)}`, { headers: authHeaders(key) }, READ_TIMEOUT_MS, "account");
      if (!r) return false;
      if (r.status === 404) return true;                       // the account was deleted: nobody to match
      if (!r.ok) { console.error("[founding-reminder] account failed", r.status); return false; }
      try {
        const u = await r.json();
        const user = u && u.user ? u.user : u;
        if (user && typeof user.email === "string" && user.email.trim()) paid.add(normalizeEmail(user.email));
        return true;
      } catch {
        console.error("[founding-reminder] account failed", "unparseable");
        return false;
      }
    }));
    if (answers.includes(false)) return null;
  }
  return paid;
}

// Billing's own answer for this address: the founding number it holds, or null. undefined when the lookup
// itself failed, which stops the run.
async function honouredNumber(supabaseUrl, key, email) {
  const res = await fetchWithDeadline(`${supabaseUrl}/rest/v1/rpc/waitlist_founding_position_for_email`, {
    method: "POST",
    headers: { ...authHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify({ p_email: normalizeEmail(email) }),
  }, READ_TIMEOUT_MS, "lookup");
  if (!res) return undefined;
  if (!res.ok) { console.error("[founding-reminder] lookup failed", res.status); return undefined; }
  try {
    const n = await res.json();
    return isFoundingPosition(n) ? n : null;
  } catch {
    console.error("[founding-reminder] lookup failed", "unparseable");
    return undefined;
  }
}

// The record of the send, on the row. Only where none of this kind is there yet.
async function recordSent(supabaseUrl, key, row, kind, sentAtIso) {
  const metadata = obj(row.metadata);
  const next = { ...metadata, founding_reminders: { ...obj(metadata.founding_reminders), [kind]: { sent_at: sentAtIso, consent_version: row.consent_version } } };
  const res = await fetchWithDeadline(`${supabaseUrl}/rest/v1/waitlist?id=eq.${encodeURIComponent(row.id)}&metadata->founding_reminders->${kind}=is.null`, {
    method: "PATCH",
    headers: { ...authHeaders(key), "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify({ metadata: next }),
  }, WRITE_TIMEOUT_MS, "record");
  if (!res) return false;
  if (!res.ok) { console.error("[founding-reminder] record failed", res.status); return false; }
  return true;
}

// Old enough? An ISO time at least MIN_GAP_MS before now. Anything unreadable is not old enough.
const atLeastGapAgo = (iso, nowMs) => {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  return Number.isFinite(t) && nowMs - t >= MIN_GAP_MS;
};

/**
 * One run. Options exist so the windows and caps can be exercised in tests; the handler runs the real values.
 * @returns {{skipped: string|null, kind: string|null, considered: number, sent: number, failed: number, paid: number, tooSoon: number, notHonoured: number, stoppedEarly: boolean}}
 */
async function runFoundingReminderSweep(opts = {}) {
  const startedAt = opts.now != null ? opts.now : Date.now();
  const clock = opts.clock || (() => (opts.now != null ? opts.now : Date.now()));
  const budgetMs = opts.budgetMs != null ? opts.budgetMs : RUN_BUDGET_MS;
  const perRunCap = opts.perRunCap != null ? opts.perRunCap : PER_RUN_CAP;
  const dailyCap = opts.dailyCap != null ? opts.dailyCap : DAILY_CAP;
  const done = (skipped, extra) => ({ skipped, kind: null, considered: 0, sent: 0, failed: 0, paid: 0, tooSoon: 0, notHonoured: 0, stoppedEarly: false, ...extra });

  // The two switches come first: with either off, nothing is read, sent or written.
  if (!flagOn("BILLING_ENABLED")) return done("billing_off");
  if (!flagOn("FOUNDING_REMINDERS")) return done("founding_reminders_off");
  const kind = dueKind(startedAt);
  if (!kind) return done("not_due");
  if (!(process.env.RESEND_API_KEY || "").trim()) return done("no_api_key", { kind });

  const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!supabaseUrl || !key) {
    console.error("[founding-reminder] skipped", "missing_supabase_env");
    return done("missing_supabase_env", { kind });
  }

  const sentToday = await countSentSince(supabaseUrl, key, kind, new Date(startedAt - 86400000).toISOString());
  if (sentToday === null) return done("daily_count_unreadable", { kind });
  const remaining = dailyCap - sentToday;
  if (remaining <= 0) {
    console.log("[founding-reminder]", JSON.stringify({ kind, skipped: "daily_cap_reached", sent_24h: sentToday, daily_cap: dailyCap }));
    return done("daily_cap_reached", { kind });
  }
  const rows = await selectOwed(supabaseUrl, key, kind);
  if (rows === null) return done("select_failed", { kind });
  if (!rows.length) return done(null, { kind });
  const paidSet = await paidAddresses(supabaseUrl, key);
  if (paidSet === null) return done("paid_unreadable", { kind });

  const limit = Math.min(perRunCap, remaining);
  let considered = 0, sent = 0, failed = 0, paid = 0, tooSoon = 0, notHonoured = 0, stoppedEarly = false, lookupDown = false, recordDown = false;
  for (const row of rows) {
    if (sent + failed >= limit) break;
    if (clock() - startedAt >= budgetMs) { stoppedEarly = true; break; }
    considered++;
    if (!row || !row.email || row.is_test === true || !isFoundingPosition(row.founding_position)) { notHonoured++; continue; }
    if (!FOUNDING_LINK_CONSENT_VERSIONS.includes(row.consent_version) || !mayEmailWaitlistRow(row, kind)) { notHonoured++; continue; }
    const meta = obj(row.metadata), link = obj(meta.founding_link), sentBefore = obj(meta.founding_reminders);
    if (link.kind !== "founding_link" || sentBefore[kind]) { notHonoured++; continue; }
    // Two days between emails: after the founding link email, and after the reminder for the last call.
    const now = clock();
    if (!atLeastGapAgo(link.sent_at, now)) { tooSoon++; continue; }
    if (kind === "founding_last_call" && sentBefore.founding_reminder && !atLeastGapAgo(obj(sentBefore.founding_reminder).sent_at, now)) { tooSoon++; continue; }
    if (paidSet.has(normalizeEmail(row.email))) { paid++; continue; }
    const honoured = await honouredNumber(supabaseUrl, key, row.email);
    if (honoured === undefined) { lookupDown = true; break; }        // fail closed: no lookup, no email
    if (honoured !== row.founding_position) { notHonoured++; continue; }
    const result = await sendFoundingReminder(row.email, row, kind);
    if (!result.sent) { failed++; continue; }
    sent++;
    if (!(await recordSent(supabaseUrl, key, row, kind, new Date(clock()).toISOString()))) { recordDown = true; break; }
  }

  // Counts only. No address, no id, no key, ever.
  console.log("[founding-reminder]", JSON.stringify({
    kind, considered, sent, failed, paid, too_soon: tooSoon, not_honoured: notHonoured, stopped_early: stoppedEarly,
    lookup_down: lookupDown, record_down: recordDown, sent_24h: sentToday + sent, daily_cap: dailyCap,
  }));
  return { skipped: lookupDown ? "lookup_failed" : recordDown ? "record_failed" : null, kind, considered, sent, failed, paid, tooSoon, notHonoured, stoppedEarly };
}

exports.handler = async () => {
  const result = await runFoundingReminderSweep();
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) };
};

exports.runFoundingReminderSweep = runFoundingReminderSweep;
exports.PER_RUN_CAP = PER_RUN_CAP;
exports.RUN_BUDGET_MS = RUN_BUDGET_MS;
exports.DAILY_CAP = DAILY_CAP;
