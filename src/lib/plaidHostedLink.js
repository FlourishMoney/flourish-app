// src/lib/plaidHostedLink.js
// -----------------------------------------------------------------------------
// LINKING A BANK IN THE STORE APPS: PLAID HOSTED LINK IN THE SYSTEM'S IN-APP BROWSER.
//
// Plaid has deprecated its web SDK inside a WebView, and recommends Hosted Link for an app that would
// otherwise do that (plaid.com/docs/link/hosted-link). So in a store app:
//
//   1. create_link_token (a store app's request) returns hosted_link_url and a result_key with the
//      link token (netlify/functions/_lib/plaidLink.js). rememberHostedLink() keeps them by token.
//   2. The URL opens in @capacitor/browser: SFSafariViewController on iOS, a Custom Tab on Android.
//      Both run outside the app's WebView, which is what Plaid asks for. Only a https plaid.com URL is
//      ever opened.
//   3. When the session ends, Plaid sends the browser to HOSTED_LINK_COMPLETION_URI, which both apps
//      register (Info.plist CFBundleURLTypes, AndroidManifest.xml), and @capacitor/app reports it as
//      appUrlOpen. Plaid sends it "whether the user successfully completed the session" or not, so it
//      only means "look now": the result is read from the server (hosted_link_result).
//   4. success → the public_token goes to the same success handler the web SDK calls (exchange_token,
//      unchanged). Anything else is a plain message and a way to try again, never a silent nothing:
//        closed  the household closed the browser, or left Link, before a bank was added
//        failed  Link ended on an error, the result never came, or the browser would not open
//
// The universal link / App Link (https://flourishmoney.app/plaid/app) also arrives as appUrlOpen, when a
// bank's own app hands the household back. Plaid finishes the session itself; it is ignored here.
//
// THE PENDING RECORD. Before the browser opens, { link_token, result_key, intent, at } is kept in the
// app's own storage, so a session that finished while the system closed the app is still read when the
// app opens again (readPlaidPending, 30 minutes). It is removed when the session is settled.
// -----------------------------------------------------------------------------

export const HOSTED_LINK_COMPLETION_URI = "flourishmoney://plaid/complete";
export const APP_REDIRECT_URI = "https://flourishmoney.app/plaid/app";
export const PLAID_PENDING_KEY = "flourish_plaid_pending";
export const PLAID_PENDING_MAX_AGE_MS = 30 * 60 * 1000;

// What the household is told when no bank was added. Plain, no blame, and always followed by a way to
// try again (Onboarding: the Connect button is ready again; Settings: a Try again button).
export const HOSTED_LINK_COPY = Object.freeze({
  closed: "Your bank wasn't connected. The bank window closed before it finished.",
  failed: "Your bank wasn't connected. Something went wrong on the way back from your bank.",
  again: "You can try again.",
  tryAgain: "Try again",
  notNow: "Not now",
});

const hosted = new Map();

/** Keep a store app's hosted_link_url and result_key by link token (from a create_link_token reply). */
export function rememberHostedLink(reply) {
  if (reply && typeof reply.link_token === "string" && typeof reply.hosted_link_url === "string") {
    hosted.set(reply.link_token, { url: reply.hosted_link_url, resultKey: typeof reply.result_key === "string" ? reply.result_key : "" });
  }
}

export function hostedLinkFor(linkToken) {
  return (linkToken && hosted.get(linkToken)) || null;
}

export function isHostedLinkCompletion(url) {
  return typeof url === "string" && /^flourishmoney:\/\/plaid\/complete\/?(?:[?#].*)?$/i.test(url);
}

export function isPlaidHostedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "plaid.com" || u.hostname.endsWith(".plaid.com"));
  } catch {
    return false;
  }
}

// ── The pending record ────────────────────────────────────────────────────────────────────────────
// The browser's storage, or null where even reading window.localStorage throws (storage blocked).
export function appStorage(win = typeof window === "undefined" ? undefined : window) {
  try { return win ? win.localStorage : null; } catch { return null; }
}

export function savePlaidPending(storage, record, now = Date.now()) {
  try { storage.setItem(PLAID_PENDING_KEY, JSON.stringify({ ...record, at: now })); } catch { /* storage unavailable */ }
}

export function clearPlaidPending(storage) {
  try { storage.removeItem(PLAID_PENDING_KEY); } catch { /* storage unavailable */ }
}

/** The pending record, or null when there is none, it is unreadable or it is older than 30 minutes. */
export function readPlaidPending(storage, now = Date.now(), maxAgeMs = PLAID_PENDING_MAX_AGE_MS) {
  let raw = null, rec = null;
  try { raw = storage.getItem(PLAID_PENDING_KEY); } catch { return null; }
  try { rec = JSON.parse(raw || "null"); } catch { rec = null; }
  const fresh = rec && typeof rec === "object" && typeof rec.link_token === "string" && rec.link_token
    && Number.isFinite(rec.at) && now - rec.at >= 0 && now - rec.at <= maxAgeMs;
  if (!fresh) { if (raw != null) clearPlaidPending(storage); return null; }
  return rec;
}

/** The success handler's metadata, in the shape Plaid's web SDK passes (metadata.institution.name). */
export function successMetadata(result) {
  return { institution: { name: result?.institution_name || null, institution_id: result?.institution_id || null } };
}

/**
 * One Hosted Link session, from opening the browser to a settled outcome.
 *
 * deps (all injected, so the whole flow runs in a test with no device):
 *   openBrowser(url)                 @capacitor/browser Browser.open
 *   closeBrowser()                   Browser.close on iOS (the sheet stays up after the redirect). Not on
 *                                    Android: the redirect already brought the app forward, and close()
 *                                    there would start the plugin's helper screen again.
 *   addAppUrlListener(fn)            App.addListener("appUrlOpen", fn) → { remove }
 *   addBrowserFinishedListener(fn)   Browser.addListener("browserFinished", fn) → { remove }
 *   fetchResult()                    hosted_link_result → { status, public_token?, institution_name?, ... }
 *   sleep(ms)
 * Resolves { outcome: "success", result } | { outcome: "closed", reason } | { outcome: "failed", reason }.
 */
export async function runHostedLink(deps, { url, graceMs = 1500, pendingTries = 6, pendingDelayMs = 1000, closedTries = 2 } = {}) {
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  if (!isPlaidHostedUrl(url)) return { outcome: "failed", reason: "not_a_plaid_url" };

  const handles = [];
  let state = "open";                 // open → checking → settled
  let completed = false;              // the completion redirect arrived
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });

  const settle = (v) => {
    if (state === "settled") return;
    state = "settled";
    for (const h of handles) { try { h && h.remove && h.remove(); } catch { /* already gone */ } }
    resolveDone(v);
  };

  const check = async () => {
    if (state !== "open") return;
    state = "checking";
    let last = null;
    // A redirect means the session ended, so a pending result is only lag: wait for it. A closed browser
    // with no redirect is asked twice, in case the household closed it on the very last screen.
    for (let i = 0; i < (completed ? pendingTries : closedTries); i++) {
      if (i > 0) await sleep(pendingDelayMs);
      try { last = await deps.fetchResult(); } catch { settle({ outcome: "failed", reason: "result_unavailable" }); return; }
      if (!last || last.status !== "pending") break;
    }
    const st = last && last.status;
    if (st === "success" && last.public_token) settle({ outcome: "success", result: last });
    else if (st === "error") settle({ outcome: "failed", reason: "link_error" });
    else if (st === "exited") settle({ outcome: "closed", reason: "exited" });
    else settle(completed ? { outcome: "failed", reason: "no_result" } : { outcome: "closed", reason: "closed_early" });
  };

  const onAppUrl = (ev) => {
    if (!isHostedLinkCompletion(ev && ev.url)) return;   // e.g. the universal link from a bank's app
    if (state === "settled" || completed) return;        // once is enough
    completed = true;
    try { Promise.resolve(deps.closeBrowser && deps.closeBrowser()).catch(() => {}); } catch { /* nothing to close */ }
    check();
  };

  const onBrowserFinished = async () => {
    if (state !== "open") return;
    await sleep(graceMs);             // the redirect can land just after the browser reports it closed
    check();
  };

  try {
    handles.push(await deps.addAppUrlListener(onAppUrl));
    handles.push(await deps.addBrowserFinishedListener(onBrowserFinished));
    await deps.openBrowser(url);
  } catch {
    settle({ outcome: "failed", reason: "browser_unavailable" });
  }
  return done;
}
