// Sprint Z #10 — error reporting (Sentry), env-gated.
//
// Stays completely inert (no init, no network, captureError is a no-op) until VITE_SENTRY_DSN is set
// in the build/Netlify env. Once a DSN is configured, Sentry.init installs global handlers for
// uncaught errors + unhandled promise rejections, and captureError() reports the SWALLOWED errors
// (caught-and-handled paths the global handlers never see) from the key async call sites.
//
// PII: a finance app must not ship transaction names, account names, or amounts to a third party.
// Two layers of defense:
//   1. callers pass only a small, safe context (an `area` tag + scalar `extra`), never raw txn/account data.
//   2. beforeSend scrubs the user object down to an id and redacts currency amounts + emails from any
//      message / exception / breadcrumb text as a backstop.

// Sentry is loaded via DYNAMIC import — only when a DSN is configured. With no DSN (v1's state) the
// @sentry/react chunk is never fetched, so it adds zero weight to the main bundle.
let _sentry = null;

function redact(s) {
  if (typeof s !== "string") return s;
  return s
    .replace(/\$\s?-?\d[\d,]*(?:\.\d+)?/g, "$[amt]")          // $-prefixed amounts
    .replace(/-?\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, "[amt]")  // comma-grouped numbers (1,234 / 1,234.56) → money
    .replace(/-?\b\d+\.\d{2}\b/g, "[amt]")                    // bare 2-decimal numbers (1234.56) → money
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]");          // emails
  // NOTE: free-text merchant/account NAMES can't be regex-matched. These error paths (network/HTTP/
  // parse) don't echo them, and no captureError site passes PII in `extra`, so this is the residual
  // backstop, not the primary control. Don't start sending raw user data in `extra`.
}

// Sprint Z3 Phase D #1: deep-scrub arbitrary structured data. event.extra is the one channel that
// can carry a raw object (e.g. a Supabase PostgrestError whose `details` field echoes the query
// payload — unencrypted financial rows for this app). Recurse and redact every string leaf.
function scrubObject(x) {
  if (typeof x === "string") return redact(x);
  if (Array.isArray(x)) return x.map(scrubObject);
  if (x && typeof x === "object") {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, scrubObject(v)]));
  }
  return x;
}

function scrubPII(event) {
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  if (event.message) event.message = redact(event.message);
  (event.exception?.values || []).forEach(v => { if (v.value) v.value = redact(v.value); });
  (event.breadcrumbs || []).forEach(b => { if (b.message) b.message = redact(b.message); });
  if (event.extra) event.extra = scrubObject(event.extra); // Phase D #1: backstop for any rich `extra`
  return event;
}

export async function initErrorReporting() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // inert until a DSN is configured — Sentry chunk is never loaded
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      sendDefaultPii: false,   // don't auto-attach IP / headers / cookies
      tracesSampleRate: 0,     // v1: error reporting only, no performance tracing
      beforeSend: scrubPII,
    });
    _sentry = Sentry;
  } catch (e) {
    console.error("[errorReporting] init failed:", e?.message || e);
  }
}

// Report a handled error with a small, PII-safe context. No-op until Sentry has loaded, so it's safe
// to call unconditionally. `context` = { area?: string, extra?: object-of-scalars }.
export function captureError(err, context = {}) {
  if (!_sentry) return;
  try {
    _sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: context.area ? { area: context.area } : undefined,
      extra: (context.extra && typeof context.extra === "object") ? context.extra : undefined,
    });
  } catch {}
}
