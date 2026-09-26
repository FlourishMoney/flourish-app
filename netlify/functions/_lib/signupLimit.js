// netlify/functions/_lib/signupLimit.js
// -----------------------------------------------------------------------------
// HOW OFTEN ONE MACHINE, AND ONE ADDRESS, MAY TRY TO SIGN UP.
//
// KNOWN-DEFECTS 33. Once OPEN_SIGNUP is on, the signup endpoint is a public URL that creates a real
// account and sends a real email. Without a limit, one script can mint accounts until the Anthropic
// bill or the Resend quota notices, and can point the confirmation mail at anyone it likes.
//
// Netlify Blobs, the same backstop coach.js already uses for its per-IP cap: no new paid service, no
// Supabase round trip, and independent of the database so a database outage does not remove the limit.
// Read-then-write is not atomic, so a burst of simultaneous requests can slip an extra attempt
// through. That is fine here and is the same trade coach.js makes: this is an abuse brake, not a
// quota anybody is billed against.
//
// TWO LIMITS, because they stop different things:
//   PER IP,    5 an hour   one machine cannot mint accounts in bulk.
//   PER EMAIL, 3 a day     one address cannot be mailed over and over, whether by its owner pressing
//                          Resend or by somebody else using signup to post mail to a stranger.
//
// FAILS CLOSED. If the store cannot be reached the attempt is refused. An abuse control that opens
// when its counter is unavailable is not a control: the outage is exactly when it matters, and the
// cost of being wrong is a person seeing "try again in an hour" while the alternative is an unmetered
// signup endpoint. coachLimits.js makes the same choice for the same reason.
//
// PURE-ISH: the store is injected, so the rule is tested without Netlify Blobs or a network.
// -----------------------------------------------------------------------------

"use strict";

const IP_HOURLY_LIMIT = 5;
const EMAIL_DAILY_LIMIT = 3;

// One message for every refusal. A different one per bucket would tell a stranger which limit they
// hit, which is a map of the limits; and the person who is simply trying again does not care.
const TOO_MANY_MESSAGE = "Too many attempts. Try again in an hour.";

const hourKey = (now) => `ip:${now.toISOString().slice(0, 13)}`;   // YYYY-MM-DDTHH
const dayKey  = (now) => `email:${now.toISOString().slice(0, 10)}`; // YYYY-MM-DD

/**
 * Counts this attempt and says whether it may proceed.
 *
 * @param {object} o
 * @param {{get: Function, setJSON: Function}|null} o.store  a Netlify Blobs store, or null
 * @param {string|null} o.ip
 * @param {string} o.email     already normalised (trimmed, lower case)
 * @param {Date} [o.now]
 * @returns {Promise<{allowed: boolean, reason: string|null, message: string|null}>}
 */
async function checkSignupLimit({ store, ip, email, now = new Date() }) {
  if (!store) return { allowed: false, reason: "store_unavailable", message: TOO_MANY_MESSAGE };

  const buckets = [];
  // No IP means Netlify gave us no client address. That is not a licence to skip the limit: the
  // address bucket still applies, and an attempt we cannot attribute is the one to be strictest with.
  if (ip) buckets.push({ key: `${hourKey(now)}:${ip}`, limit: IP_HOURLY_LIMIT, reason: "ip_hourly" });
  if (email) buckets.push({ key: `${dayKey(now)}:${email}`, limit: EMAIL_DAILY_LIMIT, reason: "email_daily" });
  if (!buckets.length) return { allowed: false, reason: "unattributable", message: TOO_MANY_MESSAGE };

  try {
    // Every bucket is counted before any is judged, so an attempt that is refused still counts
    // against the other bucket. Otherwise the cheapest way past the email limit would be to trip the
    // IP limit first.
    const counts = [];
    for (const b of buckets) {
      const cur = await store.get(b.key, { type: "json" });
      const n = ((cur && cur.n) || 0) + 1;
      await store.setJSON(b.key, { n });
      counts.push({ ...b, n });
    }
    const over = counts.find(b => b.n > b.limit);
    if (over) return { allowed: false, reason: over.reason, message: TOO_MANY_MESSAGE };
    return { allowed: true, reason: null, message: null };
  } catch (e) {
    console.error("[signup] rate-limit store unavailable, refusing:", e.message);
    return { allowed: false, reason: "store_unavailable", message: TOO_MANY_MESSAGE };
  }
}

module.exports = { checkSignupLimit, IP_HOURLY_LIMIT, EMAIL_DAILY_LIMIT, TOO_MANY_MESSAGE };
