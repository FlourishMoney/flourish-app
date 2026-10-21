// src/lib/emailAddress.js
// -----------------------------------------------------------------------------
// AN EMAIL ADDRESS AS TYPED ON A PHONE (2026-10-20: a plus address "rejected" in the iOS app).
//
// An address cannot contain unquoted whitespace, and Supabase refuses one that does. But a phone keyboard
// adds it: a space after a predictive-text suggestion, a non-breaking space, a zero-width character from
// a paste. The server then answered invalid_email ("Enter a valid email address.") for an address the
// person typed correctly, such as name+tag@example.com. So every space-like character is removed as the
// address is typed and again before it is checked; nothing else is changed, so a plus sign, dots and
// every character Supabase accepts stay exactly as typed. netlify/functions/_lib/emailAddress.js is the
// server's copy, and tests/emailAddress.test.cjs holds the two together.
// -----------------------------------------------------------------------------

// \s covers ASCII and Unicode spaces (no-break space, the U+2000 range, line breaks); the rest are the
// zero-width characters \s does not match.
const SPACES = /[\s​-‍⁠﻿]+/g;

/** The address as typed, with every space-like character removed (case kept: the person sees what they typed). */
export function stripEmailSpaces(value) {
  return String(value == null ? "" : value).replace(SPACES, "");
}

/** The address to send and check: no spaces, lower case. */
export function cleanEmail(value) {
  return stripEmailSpaces(value).toLowerCase();
}

/** The same shape check as the server: something, @, something, a dot, something; no spaces, one @ split. */
export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
