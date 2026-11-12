// src/lib/socialSignIn.js
// -----------------------------------------------------------------------------
// SIGN IN WITH APPLE AND GOOGLE, THROUGH SUPABASE (1.1.7, 2026-11-11). No new account path of our own: Supabase
// Auth creates the account (handle_new_user gives it the 14-day trial, as for an email signup) and issues the session.
//
//   website           supabase.auth.signInWithOAuth: the provider's page, then back to flourishmoney.app, where
//                     supabase-js reads the session from the address (detectSessionInUrl).
//   iPhone, Apple     Apple's own sheet (Face ID), through @capacitor-community/apple-sign-in; Supabase checks Apple's
//                     identity token with signInWithIdToken. The nonce Apple signs is the SHA-256 of the one Supabase gets.
//   everything else   (Google on iPhone and Android, Apple on Android) the provider's page in the system's in-app browser
//   in the apps       (@capacitor/browser: SFSafariViewController, a Custom Tab), which returns to
//                     flourishmoney://auth-callback; the app reads the session from that address (sessionFromCallback).
//
// Google refuses its sign-in inside an embedded web view, which is why it never runs inside the app's own view.
// Nothing here logs a token, a code or an address.
// -----------------------------------------------------------------------------

export const SOCIAL_PROVIDERS = Object.freeze(["apple", "google"]);
export const NATIVE_CALLBACK = "flourishmoney://auth-callback";
export const IOS_BUNDLE_ID = "app.flourishmoney";

/** A random nonce (hex), and its SHA-256 (hex): Apple gets the hash, Supabase the original. */
export async function nonces(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(32);
  cryptoImpl.getRandomValues(bytes);
  const raw = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
}

/**
 * The session in the address the provider sent the app back to: { access_token, refresh_token } (Supabase's implicit
 * flow, in the fragment), { code } (the PKCE flow, in the query), { error } (the person cancelled, or the provider
 * refused), or null when the address is not our callback at all.
 */
export function sessionFromCallback(url) {
  if (typeof url !== "string" || !url.startsWith(NATIVE_CALLBACK)) return null;
  const hashAt = url.indexOf("#"), queryAt = url.indexOf("?");
  const frag = new URLSearchParams(hashAt >= 0 ? url.slice(hashAt + 1) : "");
  const query = new URLSearchParams(queryAt >= 0 ? url.slice(queryAt + 1, hashAt >= 0 ? hashAt : undefined) : "");
  const get = (k) => frag.get(k) || query.get(k);
  if (get("error") || get("error_description")) return { error: get("error") || "cancelled" };
  const access_token = get("access_token"), refresh_token = get("refresh_token");
  if (access_token && refresh_token) return { access_token, refresh_token };
  const code = get("code");
  return code ? { code } : { error: "no_session" };
}

/**
 * Start a sign-in. Resolves { ok: true } once the session is set (the app's auth listener takes it from there),
 * { ok: true, redirecting: true } on the website (the page is about to leave), { ok: false } on a failure or a cancel.
 *   deps: { supabase, native, platform ("ios" | "android" | "web"), origin, appleSignIn, browser, appListener }
 *   appListener(cb) subscribes to appUrlOpen and returns an unsubscribe function.
 */
export async function signInWithProvider(provider, deps) {
  const { supabase, native, platform, origin, appleSignIn, browser, appListener } = deps || {};
  if (!SOCIAL_PROVIDERS.includes(provider) || !supabase) return { ok: false };
  try {
    if (!native) {
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: origin } });
      return error ? { ok: false } : { ok: true, redirecting: true };
    }
    if (provider === "apple" && platform === "ios" && appleSignIn) {
      const { raw, hashed } = await nonces();
      const res = await appleSignIn.authorize({ clientId: IOS_BUNDLE_ID, redirectURI: origin || "https://flourishmoney.app", scopes: "email name", nonce: hashed });
      const token = res && res.response && res.response.identityToken;
      if (!token) return { ok: false };
      const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token, nonce: raw });
      return { ok: !error };
    }
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: NATIVE_CALLBACK, skipBrowserRedirect: true } });
    if (error || !data || !data.url) return { ok: false };
    let finished = null;
    const back = new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (settled) return; settled = true; stop(); if (finished && finished.remove) finished.remove(); resolve(v); };
      const stop = appListener((url) => { const s = sessionFromCallback(url); if (s) done(s); });   // another link: not ours
      // Closed without finishing. Android can report the tab closed just before the app link arrives, so wait a moment.
      Promise.resolve(browser.addListener ? browser.addListener("browserFinished", () => setTimeout(() => done({ error: "cancelled" }), 1500)) : null)
        .then((h) => { finished = h; }).catch(() => {});
    });
    await browser.open({ url: data.url, presentationStyle: "popover" });
    const s = await back;
    // Android: the Custom Tab has already closed itself; closing it again restarts the plugin's helper activity.
    if (platform === "ios") { try { await browser.close(); } catch { /* already gone */ } }
    if (s.access_token) { const { error: e } = await supabase.auth.setSession(s); return { ok: !e }; }
    if (s.code) { const { error: e } = await supabase.auth.exchangeCodeForSession(s.code); return { ok: !e }; }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
