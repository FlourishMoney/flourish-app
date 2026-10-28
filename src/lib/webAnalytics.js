// src/lib/webAnalytics.js
// -----------------------------------------------------------------------------
// COOKIELESS WEBSITE ANALYTICS (Plausible), FOR THE PUBLIC PAGES OF flourishmoney.app ONLY.
//
//   - Website only. Never in the iPhone or Android apps: a native build is compiled with VITE_NATIVE_BUILD=true,
//     which removes the script address from the bundle (scripts/check-native-build.mjs --artifact refuses a native
//     dist/ that mentions plausible.io), and at run time nothing loads inside Capacitor either. So the App Store and
//     Play privacy labels stay true.
//   - Public pages only (analyticsPage): the landing, privacy, terms, support and the demo. Never a signed-in
//     screen, onboarding, checkout, /confirmed, a password reset, or anything showing a household's money. The
//     script loads only when a public page is shown, and once someone signs in nothing more is sent.
//   - No personal data in any URL Plausible sees: every request goes through transformRequest, which keeps only
//     the page's origin and path (no query string, no hash: tokens, emails, checkout params) and the referrer's
//     origin and path, and drops the request outright whenever no public page is showing.
//   - Events (track), with no property that identifies anyone: "Try free", "Founding list join", "Store badge"
//     ({ store: "App Store" | "Google Play" }), "Demo open". The device link's page (public/get/, a static page outside
//     this bundle, 2026-10-27) sends one more, "Get link" ({ way, ref }, from fixed lists), with the same cleaning.
// -----------------------------------------------------------------------------

import { isNativeApp } from "./billingVisibility.js";

// Compiled out of a native build: Vite replaces the flag with a constant and the minifier drops the address.
export const PLAUSIBLE_SRC = import.meta.env.VITE_NATIVE_BUILD === "true" ? "" : "https://plausible.io/js/pa-greGtasruQXP4d1IGIYrH.js";

export const ANALYTICS_EVENTS = Object.freeze(["Try free", "Founding list join", "Store badge", "Demo open"]);
// The names, for callers (an event name is not words on a screen).
export const EVENT = Object.freeze({ tryFree: "Try free", foundingJoin: "Founding list join", storeBadge: "Store badge", demoOpen: "Demo open" });
const STORES = Object.freeze(["App Store", "Google Play"]);

// The public page being shown, as the path Plausible is told, or null when nothing may be measured.
//   screen: the app's screen ("home", "privacy", "terms", "support", "delete-account", "confirmed", …)
//   signedIn, authLoading: until sign-in is known, nothing is measured; once signed in, nothing is
//   demo: the demo household is open (only ever without an account)
//   recovery: a password-reset link is open
export function analyticsPage({ native = false, signedIn = false, authLoading = true, screen = "home", demo = false, recovery = false } = {}) {
  if (native || authLoading || signedIn || recovery) return null;
  if (screen === "privacy" || screen === "terms" || screen === "support") return `/${screen}`;
  if (screen !== "home") return null;          // /confirmed, /delete-account and anything else: never
  return demo ? "/demo" : "/";
}

// Origin and path only: no query string, no hash, no credentials. null for anything that is not an http(s) URL.
export function cleanUrl(href, base) {
  try {
    const u = new URL(String(href), base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}${u.pathname}`;
  } catch { return null; }
}

let _page = null;        // the public page now showing, or null
let _loaded = false;

// Every request Plausible is about to send. Dropped (null) unless a public page is showing; otherwise its page URL
// is this site's origin plus the public page, its referrer is cut to origin and path, and its only property is store.
export function transformRequest(payload, win = typeof window === "undefined" ? undefined : window) {
  if (!_page || !payload || !win) return null;
  const origin = win.location && win.location.origin;
  if (!origin) return null;
  const out = { ...payload, u: `${origin}${_page}` };
  if (payload.r) { const r = cleanUrl(payload.r); if (r) out.r = r; else delete out.r; }
  if (out.p && typeof out.p === "object") out.p = Object.fromEntries(Object.entries(out.p).filter(([k, v]) => k === "store" && STORES.includes(v)));
  return out;
}

// Load the site script once (the snippet from Amanda's Plausible account), with pageviews sent by us, not by it.
export function loadPlausible(win = typeof window === "undefined" ? undefined : window) {
  if (_loaded || !PLAUSIBLE_SRC || !win || !win.document || isNativeApp(win)) return false;
  _loaded = true;
  win.plausible = win.plausible || function () { (win.plausible.q = win.plausible.q || []).push(arguments); };
  win.plausible.init = win.plausible.init || function (i) { win.plausible.o = i || {}; };
  win.plausible.init({ autoCapturePageviews: false, transformRequest: (p) => transformRequest(p, win) });
  const s = win.document.createElement("script");
  s.async = true;
  s.src = PLAUSIBLE_SRC;
  win.document.head.appendChild(s);
  return true;
}

// The public page now showing (or null). A new page loads the script if needed and sends one pageview.
export function setAnalyticsPage(page, win = typeof window === "undefined" ? undefined : window) {
  const next = page || null;
  if (next === _page) return;
  _page = next;
  if (!_page || !win || isNativeApp(win)) return;
  loadPlausible(win);
  if (typeof win.plausible === "function") win.plausible("pageview");
}

// One event, only on a public page, with only the allowed property.
export function track(name, props = null, win = typeof window === "undefined" ? undefined : window) {
  if (!_page || !win || isNativeApp(win) || !ANALYTICS_EVENTS.includes(name) || typeof win.plausible !== "function") return false;
  const store = props && STORES.includes(props.store) ? props.store : null;
  if (name === "Store badge" && !store) return false;
  win.plausible(name, store ? { props: { store } } : {});
  return true;
}

// Tests only.
export function _resetAnalytics() { _page = null; _loaded = false; }
