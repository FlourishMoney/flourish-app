// src/lib/appleGrant.js
// -----------------------------------------------------------------------------
// AFTER AN APPLE SIGN-IN, HAND THE SERVER WHAT IT NEEDS TO REVOKE IT WHEN THE ACCOUNT IS DELETED (App Store guideline
// 5.1.1(v), 1.1.7; netlify/functions/_lib/appleTokens.js keeps it sealed, plaid.js delete_account revokes it).
//   iPhone            Apple's sheet's one-time authorization code (lib/socialSignIn.js returns it as appleGrant).
//   website           Supabase hands the page Apple's refresh token once, on the session it reads from the address
//                     (provider_refresh_token). A flag set just before leaving for Apple says the session is Apple's.
//   Android           the same token, from the address the Custom Tab returns to (lib/socialSignIn.js).
// Sent once, in the background, and never waited for: a failure changes nothing for the person. Nothing is logged.
// -----------------------------------------------------------------------------

export const APPLE_GRANT_FLAG = "flourish_apple_grant_pending";

/** The website, just before leaving for Apple's page. */
export function markWebAppleSignIn(storage) {
  try { storage && storage.setItem(APPLE_GRANT_FLAG, "1"); } catch { /* no grant kept; deleting still deletes */ }
}

/** Back from Apple on the website: { refresh_token } when this session is the Apple one that just landed, else null. The flag goes either way. */
export function takeWebAppleGrant(session, storage) {
  let flagged = false;
  try { flagged = !!(storage && storage.getItem(APPLE_GRANT_FLAG)); if (flagged) storage.removeItem(APPLE_GRANT_FLAG); } catch { flagged = false; }
  const token = session && session.provider_refresh_token;
  return flagged && typeof token === "string" && token ? { refresh_token: token } : null;
}

/** Send a grant ({ code } or { refresh_token }) for the signed-in account. Resolves true when the server answered. Never throws. */
export async function sendAppleGrant({ grant, jwt, apiBase = "", fetchImpl = globalThis.fetch }) {
  if (!grant || !jwt || typeof fetchImpl !== "function") return false;
  try {
    const r = await fetchImpl(`${apiBase}/api/beta`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action: "apple_grant", grant }) });
    return !!(r && r.ok);
  } catch { return false; }
}
