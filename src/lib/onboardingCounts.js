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
//
// Never in the demo, never without a session; a failure is silent and nothing the household sees depends on it.
// Until 0028 runs the server answers 503 and nothing is counted: the app works exactly the same.
// -----------------------------------------------------------------------------

export const ONBOARDING_STEPS = Object.freeze(["welcome", "bank", "balance", "income", "bills", "debts"]);
export const BANK_LINK_EVENTS = Object.freeze(["bank_link_started", "bank_link_completed", "bank_link_failed", "bank_link_cancelled"]);
export const ONBOARDING_EVENTS = Object.freeze(["onboarding_step_completed", "first_number_shown", ...BANK_LINK_EVENTS]);
export const FIRST_NUMBER_MODES = Object.freeze(["manual", "linked"]);

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
