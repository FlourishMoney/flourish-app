// src/lib/attribution.js
// -----------------------------------------------------------------------------
// SOURCE AND CREATIVE (src, cr) ON THE WAY TO A NEW ACCOUNT (2026-11-04, migration 0036).
//
// ON THE WEBSITE: ?src= and ?cr= are kept for the browser session and sent with the signup, but the server stores only an Android
// signup's (the approved privacy words, 2026-11-05: netlify/functions/beta.js), so a website account reads as direct.
// IN THE ANDROID APP: Google's Install Referrer is read once, on first launch, and kept on this install. It sends an install
// count (with src and cr only), and its src and cr go with the signup on this device. The key is outside the flourish_ prefix,
// because signing out wipes those. An ordinary Play install reads as direct.
// IN THE iPHONE APP: nothing. Apple reports downloads by campaign in App Store Connect and tells the app nothing, so an iPhone
// account reads as direct.
// The server checks every value again (netlify/functions/_lib/attribution.js).
// -----------------------------------------------------------------------------

export const WEB_KEY = "flourish_attribution";
export const REFERRER_KEY = "flourishInstallReferrer_v1";
const TAG_RX = /^[a-z0-9_-]{1,40}$/;
const NEW_INSTALL_MS = 14 * 24 * 60 * 60 * 1000;

export function cleanTag(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return TAG_RX.test(v) ? v : null;
}

function nativePlatform() {
  try { return window.Capacitor?.isNativePlatform?.() === true ? window.Capacitor.getPlatform() : null; }
  catch { return null; }
}

// Call on page load. A later link with its own src replaces the one kept.
export function captureAttribution(search = (typeof window !== "undefined" && window.location ? window.location.search : ""), storage) {
  if (nativePlatform()) return;          // a store app reads no campaign value from an address
  try {
    const st = storage !== undefined ? storage : globalThis.sessionStorage;
    const q = new URLSearchParams(search || "");
    const src = cleanTag(q.get("src")), cr = cleanTag(q.get("cr"));
    if (src && st) st.setItem(WEB_KEY, JSON.stringify({ src, cr }));
  } catch { /* storage refused: the signup goes without */ }
}

// { src, cr } from a Play referrer string, or null. An ordinary install from Play's own pages says google-play or (not set).
export function parseInstallReferrer(raw) {
  try {
    const q = new URLSearchParams(String(raw || ""));
    const src = cleanTag(q.get("utm_source"));
    if (!src || q.get("utm_medium") === "organic" || src === "google-play") return null;
    return { src, cr: cleanTag(q.get("utm_campaign")) };
  } catch { return null; }
}

// THE HOME PAGE'S OWN LINK (2026-11-08, migration 0043): this visit's src and cr, from the address or, after a reload, the
// browser session. Never in a store app. Used for the home page's counts and to tag its two store badges the way /get does.
export function landingAttribution(search = (typeof window !== "undefined" && window.location ? window.location.search : ""), storage) {
  if (nativePlatform()) return null;
  try {
    const q = new URLSearchParams(search || "");
    const src = cleanTag(q.get("src")), cr = cleanTag(q.get("cr"));
    if (src || cr) return { src: src || "direct", cr: cr || null };
    const st = storage !== undefined ? storage : globalThis.sessionStorage;
    const kept = JSON.parse((st && st.getItem(WEB_KEY)) || "null");
    if (kept && cleanTag(kept.src)) return { src: cleanTag(kept.src), cr: cleanTag(kept.cr) };
  } catch { /* nothing to tag */ }
  return null;
}

// A tap through to a store from the home page's badges: our own count, by src and cr (/api/attribution), as /get counts its
// own. sendBeacon, so the store's page never waits for it. Nothing about the visitor is sent.
export function countStoreClick(attribution, { beacon } = {}) {
  try {
    const send = beacon || (typeof navigator !== "undefined" && navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null);
    if (!send) return false;
    const a = attribution || {};
    return !!send("/api/attribution", new Blob([JSON.stringify({ event: "store_click", src: a.src || "", cr: a.cr || "" })], { type: "application/json" }));
  } catch { return false; }
}

// What goes on the signup: this install's Play referrer, otherwise the website's link, otherwise nothing.
export function signupAttribution() {
  try {
    const rec = JSON.parse(globalThis.localStorage?.getItem(REFERRER_KEY) || "null");
    if (rec && rec.src) return { src: rec.src, cr: rec.cr || null };
    const web = JSON.parse(globalThis.sessionStorage?.getItem(WEB_KEY) || "null");
    if (web && web.src) return { src: web.src, cr: web.cr || null };
  } catch { /* nothing to send */ }
  return null;
}

// Android only, and once per install. A failed read tries again next launch, and so does a count that could not be sent.
// Called once, when the app starts (App.jsx), whatever screen comes first. One run at a time: a second call while one is in
// flight shares it, so an install is never counted twice.
let _referrerRun = null;
export function readInstallReferrerOnce(opts = {}) {
  if (!_referrerRun) _referrerRun = readReferrer(opts).finally(() => { _referrerRun = null; });
  return _referrerRun;
}

async function readReferrer({ apiBase = "", now = Date.now() } = {}) {
  if (nativePlatform() !== "android") return;
  try {
    let rec = JSON.parse(localStorage.getItem(REFERRER_KEY) || "null");
    if (!rec) {
      const { registerPlugin } = await import("@capacitor/core");
      const r = await registerPlugin("FlourishInstallReferrer").read();
      const parsed = parseInstallReferrer(r && r.referrer);
      // An app updated long after its install is not a new install: its old referrer is kept, but not counted.
      const isNew = now - Number(r && r.firstInstallTime) < NEW_INSTALL_MS;
      rec = { src: parsed ? parsed.src : null, cr: parsed ? parsed.cr : null, counted: !isNew };
      localStorage.setItem(REFERRER_KEY, JSON.stringify(rec));
    }
    if (rec.counted) return;
    const res = await fetch(`${apiBase}/api/attribution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "install", src: rec.src, cr: rec.cr }),
    });
    if (res.ok) localStorage.setItem(REFERRER_KEY, JSON.stringify({ ...rec, counted: true }));
  } catch { /* the next launch tries again */ }
}
