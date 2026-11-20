// src/lib/onboardingCounts.js
// -----------------------------------------------------------------------------
// ONBOARDING COUNTS, AGGREGATE ONLY (2026-10-23, the first number). Our own code: no third-party tracker, no
// email, no IP, no account id is sent or kept. The app tells /api/activation (netlify/functions/activation.js)
// that one of these happened for the signed-in account; the server adds 1 to a per-signup-day counter
// (migration 0028, public.onboarding_counts) and keeps nothing else:
//
//   onboarding_step_completed  detail: the step left forward ("welcome", "bank", "balance", "income", "bills",
//                              "debts"); once per step per account on this device
//   first_number_shown         mode: "manual" or "linked" (a bank linked); with the milliseconds since this
//                              device first saw the account signed in. The server buckets that, and the time
//                              since signup it reads itself, into under 60 s, 60 to 120, 120 to 180, over 180.
//                              Once per account on this device
//   bank_link_started / bank_link_completed / bank_link_failed / bank_link_cancelled   every attempt
//   bank_link_failed           detail (2026-11-11): "<platform>:<code>", ios / android / web and Plaid's error code from
//                              LINK_FAIL_CODES (linkFailDetail); never Plaid's message, never an id
//
// Never in the demo, never without a session; a failure is silent and nothing the household sees depends on it.
// Until 0028 runs the server answers 503 and nothing is counted: the app works exactly the same.
// -----------------------------------------------------------------------------

export const ONBOARDING_STEPS = Object.freeze(["welcome", "bank", "balance", "income", "bills", "debts"]);
export const BANK_LINK_EVENTS = Object.freeze(["bank_link_started", "bank_link_completed", "bank_link_failed", "bank_link_cancelled"]);
export const ONBOARDING_EVENTS = Object.freeze(["onboarding_step_completed", "first_number_shown", ...BANK_LINK_EVENTS]);
export const FIRST_NUMBER_MODES = Object.freeze(["manual", "linked"]);
// The same lists as netlify/functions/_lib/onboardingCounts.js (tests/plaidLinkToken.test.cjs holds them together).
export const LINK_PLATFORMS = Object.freeze(["ios", "android", "web"]);
export const LINK_FAIL_CODES = Object.freeze([
  "INVALID_CREDENTIALS", "INVALID_MFA", "INVALID_SEND_METHOD", "INVALID_UPDATED_USERNAME", "INSUFFICIENT_CREDENTIALS",
  "ITEM_LOCKED", "ITEM_LOGIN_REQUIRED", "ITEM_NOT_SUPPORTED", "ITEM_NO_ERROR", "MFA_NOT_SUPPORTED", "NO_ACCOUNTS", "NO_AUTH_ACCOUNTS",
  "PASSWORD_RESET_REQUIRED", "USER_SETUP_REQUIRED", "USER_INPUT_TIMEOUT", "ACCESS_NOT_GRANTED", "PRODUCTS_NOT_SUPPORTED", "PRODUCT_NOT_READY",
  "INSTITUTION_DOWN", "INSTITUTION_NOT_RESPONDING", "INSTITUTION_NOT_AVAILABLE", "INSTITUTION_NO_LONGER_SUPPORTED",
  "INSTITUTION_NOT_ENABLED_IN_ENVIRONMENT", "INSTITUTION_REGISTRATION_REQUIRED", "INSTITUTION_NOT_FOUND",
  "INVALID_LINK_TOKEN", "INVALID_FIELD", "MISSING_FIELDS", "OAUTH_STATE_ID_NOT_FOUND", "RATE_LIMIT_EXCEEDED", "INTERNAL_SERVER_ERROR",
  "PLANNED_MAINTENANCE",
  // Ours: the bank linked but our server's exchange failed, or the free plan's one-bank limit refused it.
  "EXCHANGE_FAILED", "PLAN_LIMIT",
  // Anything else Plaid sends (never its text).
  "OTHER",
]);
/** The failed link's detail: the platform and Plaid's error code, each from the fixed lists (unknown -> web / OTHER). */
export function linkFailDetail(platform, code) {
  const p = LINK_PLATFORMS.includes(platform) ? platform : "web";
  const c = typeof code === "string" && LINK_FAIL_CODES.includes(code.toUpperCase()) ? code.toUpperCase() : "OTHER";
  return `${p}:${c}`;
}
const isLinkFailDetail = (d) => { const m = typeof d === "string" ? d.match(/^([a-z]+):([A-Z_]+)$/) : null; return !!m && LINK_PLATFORMS.includes(m[1]) && LINK_FAIL_CODES.includes(m[2]); };

const KEY_PREFIX = "flourish_onboarding";
const FIRST_SIGNIN_PREFIX = "flourish_first_signin_at";

const storeOf = (storage) => storage || (typeof localStorage !== "undefined" ? localStorage : null);

// The first time this device saw this account signed in (ms since epoch). Kept once; never moves.
export function noteFirstSignin(userId, { storage, now = Date.now() } = {}) {
  try {
    const store = storeOf(storage);
    if (!store || !userId) return;
    const key = `${FIRST_SIGNIN_PREFIX}:${userId}`;
    if (!store.getItem(key)) store.setItem(key, String(now));
  } catch { /* storage refused: no timing, nothing else changes */ }
}
export function msSinceFirstSignin(userId, { storage, now = Date.now() } = {}) {
  try {
    const store = storeOf(storage);
    const at = store && userId ? Number(store.getItem(`${FIRST_SIGNIN_PREFIX}:${userId}`)) : NaN;
    return Number.isFinite(at) && at > 0 && now >= at ? now - at : null;
  } catch { return null; }
}

// The once-only key for an event (bank link attempts have none: each one counts).
export function onboardingKey(event, userId, detail) {
  if (event === "onboarding_step_completed") return `${KEY_PREFIX}:${event}:${detail}:${userId}`;
  if (event === "first_number_shown") return `${KEY_PREFIX}:${event}:${userId}`;
  return null;
}

const _inflight = new Set();

// Send one onboarding count. Resolves true when it was sent now. Never throws.
//   getSession  async () => ({ userId, jwt }) | null      apiBase  the origin the app's other /api calls use
export async function sendOnboardingCount(event, { detail, mode, demo = false, userId, getSession, apiBase = "", storage, fetchImpl, now = Date.now() } = {}) {
  try {
    if (demo || !ONBOARDING_EVENTS.includes(event) || typeof getSession !== "function") return false;
    if (event === "onboarding_step_completed" && !ONBOARDING_STEPS.includes(detail)) return false;
    if (event === "first_number_shown" && !FIRST_NUMBER_MODES.includes(mode)) return false;
    const store = storeOf(storage);
    const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!store || !doFetch) return false;
    if (userId) { const k = onboardingKey(event, userId, detail); if (k && store.getItem(k)) return false; }
    const session = await getSession();
    if (!session || !session.userId || !session.jwt) return false;
    const key = onboardingKey(event, session.userId, detail);
    if (key && (_inflight.has(key) || store.getItem(key))) return false;
    if (key) { _inflight.add(key); store.setItem(key, "1"); }   // claimed before the request: a second call cannot send it too
    const body = { metric: event };
    if (event === "onboarding_step_completed") body.detail = detail;
    if (event === "bank_link_failed" && isLinkFailDetail(detail)) body.detail = detail;
    if (event === "first_number_shown") {
      body.mode = mode;
      const ms = msSinceFirstSignin(session.userId, { storage: store, now });
      if (ms != null) body.fromSigninMs = ms;
    }
    try {
      const res = await doFetch(`${apiBase}/api/activation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.jwt}` },
        body: JSON.stringify(body),
      });
      if (!res || !(res.status === 204 || res.ok)) { if (key) store.removeItem(key); return false; }
      return true;
    } catch {
      if (key) store.removeItem(key);
      return false;
    } finally {
      if (key) _inflight.delete(key);
    }
  } catch {
    return false;
  }
}

// For tests.
export function _resetOnboardingInflight() { _inflight.clear(); }
