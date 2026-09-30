// src/lib/sampleHouseholdAccount.js
// -----------------------------------------------------------------------------
// WHICH SIGN-INS OPEN ON THE POPULATED SAMPLE HOUSEHOLD INSTEAD OF THE DATABASE.
//
// Two accounts: the screenshot account (by its address, as before) and the App Review account.
// The App Review account is matched by the SHA-256 of its sign-in email, trimmed and lowercased,
// computed at runtime. Only the hash is kept in the source, so the address itself never ships in
// the bundle or sits in the repository.
// -----------------------------------------------------------------------------

export const SCREENSHOT_EMAIL = "snap@flourish.app";

// SHA-256 hex of the App Review account's email (trimmed, lowercased).
export const REVIEW_ACCOUNT_SHA256 = "af552e5b3f4529120915257ae8073ff990043c65e6163630d694fe2b6516dc7b";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function sha256Hex(text) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) return null;
  const buf = await subtle.digest("SHA-256", new globalThis.TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// true for the review account; false for everyone else, and on any failure (no Web Crypto), so a
// failure can only ever mean "read the database as normal".
export async function isReviewAccount(email, hashes = [REVIEW_ACCOUNT_SHA256]) {
  const e = normalizeEmail(email);
  if (!e) return false;
  try {
    const h = await sha256Hex(e);
    return !!h && hashes.includes(h);
  } catch {
    return false;
  }
}
