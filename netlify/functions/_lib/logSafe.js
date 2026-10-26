// netlify/functions/_lib/logSafe.js
// -----------------------------------------------------------------------------
// NO RAW EMAIL ADDRESS IN A LOG LINE (2026-10-26, from Grok's review of e94b112).
//
// Netlify keeps function logs, and a log line is read by whoever reads the logs. Where a line must point at a
// household's address (a seat that has to be cleaned up by hand), it names the address by the key the database
// already uses for it (0014's public.waitlist_email_key: md5 of the address with case and whitespace dropped), so
// the manual SQL still finds the row and the address itself is never written down.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");

function emailKey(email) {
  const norm = typeof email === "string" ? email.replace(/\s+/g, "").toLowerCase() : "";
  return norm ? crypto.createHash("md5").update(norm).digest("hex") : "";
}

// "email_key 0123…" for a log line; "no_email" when there is none.
function emailRef(email) {
  const k = emailKey(email);
  return k ? `email_key ${k}` : "no_email";
}

module.exports = { emailKey, emailRef };
