// src/lib/plaidOAuthReturn.js
// -----------------------------------------------------------------------------
// THE WEBSITE'S OAUTH RETURN: https://flourishmoney.app/plaid/oauth.
//
// The website keeps Plaid's web SDK. For a bank that signs in with OAuth, Link sends the browser to the
// bank, and the bank sends it back to the link token's redirect_uri with an oauth_state_id. On a phone,
// Plaid recommends always doing this ("To provide the best experience for end users on mobile web, always
// specify a redirect URI and reinitialize Link", plaid.com/docs/link/oauth): the page that loads there
// re-opens Link with the SAME link token and receivedRedirectUri = the full address it arrived at.
//
// The link token comes from the pending record (lib/plaidHostedLink.js savePlaidPending, mode "web"),
// written just before Link opens and removed when Link ends. Plaid suggests local storage for exactly
// this. The record also says what the household was doing (intent) and, during onboarding, the answers
// already given on the earlier steps (draft), so the return lands back on the bank step, not the start.
//
//   resume  re-open Link with the stored token and receivedRedirectUri
//   lost    the address is an OAuth return but there is no usable record (another browser, a closed
//           tab, more than 30 minutes): say so plainly, and the household connects again
// -----------------------------------------------------------------------------

export const PLAID_OAUTH_PATH = "/plaid/oauth";

export const OAUTH_RETURN_COPY = Object.freeze({
  lost: "This page couldn't finish connecting your bank. If your bank isn't listed in Flourish, connect it again.",
});

/** Is this address Plaid's OAuth return? (/plaid/oauth with a non-empty oauth_state_id) */
export function isOAuthReturn(loc) {
  try {
    const path = String(loc?.pathname || "").replace(/\/+$/, "").toLowerCase();
    if (path !== PLAID_OAUTH_PATH) return false;
    return !!new URLSearchParams(loc?.search || "").get("oauth_state_id");
  } catch {
    return false;
  }
}

/**
 * What to do at page load. null when this is not an OAuth return.
 * pending is readPlaidPending()'s result (fresh, or null).
 */
export function planOAuthReturn(loc, pending) {
  if (!isOAuthReturn(loc)) return null;
  if (!pending || pending.mode !== "web" || typeof pending.link_token !== "string" || !pending.link_token) return { kind: "lost" };
  const intent = pending.intent === "reconnect" || pending.intent === "add" ? pending.intent : "onboarding";
  const draft = pending.draft && typeof pending.draft === "object" && pending.draft.p && typeof pending.draft.p === "object" ? pending.draft : null;
  return { kind: "resume", linkToken: pending.link_token, receivedRedirectUri: String(loc.href), intent, draft };
}

/** The receivedRedirectUri for a hook, only for the link token it came back for. */
export function redirectUriFor(resume, linkToken) {
  return resume && linkToken && resume.linkToken === linkToken ? resume.receivedRedirectUri : null;
}
