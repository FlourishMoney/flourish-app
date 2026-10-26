// src/lib/confirmLink.js
// -----------------------------------------------------------------------------
// WHAT THE CONFIRMATION LINK SAID (audit 2026-10-26, B5).
//
// /confirmed said "You're confirmed" to everybody, including a link Supabase refused
// (#error=access_denied&error_code=otp_expired) and a visit with no token at all, and it had no button: the person
// believed they were confirmed, signed in, and was refused. Supabase puts its answer in the hash (implicit flow) or
// the query (PKCE): error, error_code, error_description. This reads it.
//   confirmLinkResult(location) -> { failed, code, description }
//     failed       Supabase sent an error
//     code         its error_code ("otp_expired"…), or null
//     description  its error_description when it is plain text (shown as Supabase wrote it), else null
// PURE.
// -----------------------------------------------------------------------------

const PLAIN = /^[A-Za-z0-9 .,'()-]{1,140}$/;

export function confirmLinkResult(loc) {
  const read = (s) => { try { return new URLSearchParams(String(s || "").replace(/^[#?]/, "")); } catch { return new URLSearchParams(""); } };
  const hash = read(loc && loc.hash), query = read(loc && loc.search);
  const get = (k) => hash.get(k) || query.get(k) || null;
  const error = get("error"), code = get("error_code"), raw = get("error_description");
  const description = raw && PLAIN.test(raw.trim()) ? raw.trim() : null;
  return { failed: !!(error || code), code: code || null, description };
}
