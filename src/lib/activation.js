// src/lib/activation.js
// -----------------------------------------------------------------------------
// ACTIVATION SIGNALS, AGGREGATE ONLY (2026-10-15).
//
// The app tells /api/activation (netlify/functions/activation.js) that one of four things happened for
// the signed-in account. The server adds 1 to a per-signup-day counter and keeps nothing else (no account
// id, no amount, no text; migration 0019). This file decides WHEN to send, and sends only the metric:
//   data_source     the household has a bank, an imported statement, or a balance it entered (PR #72)
//   safe_view       Today showed the safe-to-spend figure
//   meeting_opened  a money meeting was opened
//   app_open        the app was opened (the server keeps it only on day 1 and day 7 after signup)
//
// Each is sent once per account on this device (app_open once per local day). Never in the demo, never
// without a session, and a failure is silent: nothing the household sees depends on it. No third-party
// analytics: the request goes to our own function only.
// -----------------------------------------------------------------------------

export const ACTIVATION_METRICS = ["data_source", "safe_view", "meeting_opened", "app_open"];
const KEY_PREFIX = "flourish_activation";

// Does this household have a data source? A linked bank, an imported statement, or an entered balance.
export function hasDataSource(data) {
  if (!data || data.demo) return false;
  if (data.bankConnected === true) return true;
  return (Array.isArray(data.accounts) ? data.accounts : []).some(a => a && (
    !!a._item
    || a.institution === "Statement"
    || a.balanceEntered === true
    || (typeof a.institution === "string" && a.institution !== "" && a.institution !== "Manual" && a.institution !== "Statement")
  ));
}

const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// The once-only key for a metric and an account (app_open: once a day).
export function activationKey(metric, userId, today = new Date()) {
  return metric === "app_open" ? `${KEY_PREFIX}:${metric}:${userId}:${localDay(today)}` : `${KEY_PREFIX}:${metric}:${userId}`;
}

const _inflight = new Set();

// Send one metric, once. Resolves true when it was sent now, false otherwise. Never throws.
//   getSession  async () => ({ userId, jwt }) | null
//   apiBase     the same origin the app's other /api calls use
export async function sendActivationOnce(metric, { demo = false, getSession, apiBase = "", storage, fetchImpl, today = new Date() } = {}) {
  try {
    if (demo || !ACTIVATION_METRICS.includes(metric) || typeof getSession !== "function") return false;
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!store || !doFetch) return false;
    const session = await getSession();
    if (!session || !session.userId || !session.jwt) return false;
    const key = activationKey(metric, session.userId, today);
    if (_inflight.has(key) || store.getItem(key)) return false;
    _inflight.add(key);
    store.setItem(key, "1");                       // claimed before the request, so a second call cannot send it too
    try {
      const res = await doFetch(`${apiBase}/api/activation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.jwt}` },
        body: JSON.stringify({ metric }),
      });
      if (!res || !(res.status === 204 || res.ok)) { store.removeItem(key); return false; }
      return true;
    } catch {
      store.removeItem(key);
      return false;
    } finally {
      _inflight.delete(key);
    }
  } catch {
    return false;
  }
}

// For tests.
export function _resetActivationInflight() { _inflight.clear(); }
