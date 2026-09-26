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
//   PER IP,    5 an hour   one machine cannot mint accounts in bulk. Counted on every ATTEMPT.
//   PER EMAIL, 3 a day     one inbox cannot be posted to over and over. Counted only when mail is
//                          actually SENT, never on a failed attempt.
//
// WHY THE EMAIL BUCKET COUNTS SENDS AND NOT ATTEMPTS. Counting attempts turned the limit into a
// weapon: three throwaway requests naming someone else's address (which need no account and no code)
// spent that address's day, so its real owner was refused their own signup and their own Resend
// while never having received a thing. Counting sends means the bucket only fills with mail that
// actually reached the inbox, which is the thing being protected.
//
// The address is normalised for the bucket only: case folded, and a "+tag" dropped, because
// victim+1@, victim+2@ … all land in one inbox and would otherwise each get their own three. It is
// only ever a counter key — the address stored on the account is untouched.
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

// The inbox this address belongs to, for counting only.
function inboxKey(email) {
  const addr = String(email || "").trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at < 1) return addr;
  const local = addr.slice(0, at).split("+")[0];
  return `${local}${addr.slice(at)}`;
}

/**
 * May this attempt proceed? Counts the IP bucket, and READS the address bucket without filling it.
 *
 * @param {object} o
 * @param {{get: Function, setJSON: Function}|null} o.store  a Netlify Blobs store, or null
 * @param {string|null} o.ip
 * @param {string} o.email
 * @param {Date} [o.now]
 * @returns {Promise<{allowed: boolean, reason: string|null, message: string|null}>}
 */
async function checkSignupLimit({ store, ip, email, now = new Date() }) {
  if (!store) return { allowed: false, reason: "store_unavailable", message: TOO_MANY_MESSAGE };
  const inbox = inboxKey(email);
  // No IP means Netlify gave us no client address. That is not a licence to skip the limit: the
  // address bucket still applies, and an attempt we cannot attribute is the one to be strictest with.
  if (!ip && !inbox) return { allowed: false, reason: "unattributable", message: TOO_MANY_MESSAGE };

  try {
    if (ip) {
      const key = `${hourKey(now)}:${ip}`;
      const cur = await store.get(key, { type: "json" });
      const n = ((cur && cur.n) || 0) + 1;
      await store.setJSON(key, { n });
      if (n > IP_HOURLY_LIMIT) return { allowed: false, reason: "ip_hourly", message: TOO_MANY_MESSAGE };
    }
    if (inbox) {
      // Read only. recordEmailSent() is what fills this, once the mail has actually gone.
      const cur = await store.get(`${dayKey(now)}:${inbox}`, { type: "json" });
      if (((cur && cur.n) || 0) >= EMAIL_DAILY_LIMIT) return { allowed: false, reason: "email_daily", message: TOO_MANY_MESSAGE };
    }
    return { allowed: true, reason: null, message: null };
  } catch (e) {
    console.error("[signup] rate-limit store unavailable, refusing:", e.message);
    return { allowed: false, reason: "store_unavailable", message: TOO_MANY_MESSAGE };
  }
}

/**
 * One confirmation email has just gone to this address. Never throws and never blocks: the mail is
 * already sent, so a counter that cannot be written must not turn that into an error.
 */
async function recordEmailSent({ store, email, now = new Date() }) {
  const inbox = inboxKey(email);
  if (!store || !inbox) return;
  try {
    const key = `${dayKey(now)}:${inbox}`;
    const cur = await store.get(key, { type: "json" });
    await store.setJSON(key, { n: ((cur && cur.n) || 0) + 1 });
  } catch (e) {
    console.error("[signup] could not record a sent confirmation:", e.message);
  }
}

module.exports = { checkSignupLimit, recordEmailSent, inboxKey, IP_HOURLY_LIMIT, EMAIL_DAILY_LIMIT, TOO_MANY_MESSAGE };
