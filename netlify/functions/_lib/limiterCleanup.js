// netlify/functions/_lib/limiterCleanup.js
// -----------------------------------------------------------------------------
// THE DAILY CLEANUP OF THE RATE LIMITERS' STORES (limiter-cleanup.js runs it; 2026-10-21).
//
// Every limiter entry goes away once its window has passed:
//   signup_attempts         v2/ip/<hash>       { w: "YYYY-MM-DDTHH", n }   kept for its hour
//                           v2/email/<hash>    { w: "YYYY-MM-DD", n }      kept for its day
//   coach_ip_usage          v2/coach-ip/<hash> { w: "YYYY-MM-DD", n }      kept for its day
//   founding_confirm_sends  founding-confirm/<account id>  [sent times]   kept while one is under 24 hours old
// And every key in the old format of the first two stores (the raw IP or email address in the key:
// "ip:<hour>:<ip>", "email:<day>:<address>", "<day>:<ip>") is deleted, whatever its age. Nothing is read
// out or logged but the counts.
// -----------------------------------------------------------------------------
"use strict";
const { hourWindow, dayWindow, isCurrentFormat } = require("./limiterKeys");
const { SEND_WINDOW_MS } = require("./foundingConfirm");

const STORES = Object.freeze(["signup_attempts", "coach_ip_usage", "founding_confirm_sends"]);

// Is this entry past its window? An entry that cannot be read, or that has no window, is past it.
function expired(storeName, key, value, now) {
  if (storeName === "founding_confirm_sends") {
    const recent = (Array.isArray(value) ? value : []).filter((ts) => Number.isFinite(ts) && now.getTime() - ts < SEND_WINDOW_MS);
    return recent.length === 0;
  }
  const w = value && typeof value.w === "string" ? value.w : null;
  if (!w) return true;
  return key.startsWith("v2/ip/") ? w !== hourWindow(now) : w !== dayWindow(now);
}

// The old format held the raw value in the key. Only the two stores that held an IP or an address had it.
const isOldRawKey = (storeName, key) => storeName !== "founding_confirm_sends" && !isCurrentFormat(key);

async function listKeys(store) {
  const out = await store.list();
  return ((out && out.blobs) || []).map((b) => b.key).filter((k) => typeof k === "string");
}

/** Clean one store. Returns counts only. */
async function cleanStore(storeName, store, now = new Date()) {
  const counts = { oldRaw: 0, expired: 0, kept: 0 };
  for (const key of await listKeys(store)) {
    if (isOldRawKey(storeName, key)) { await store.delete(key); counts.oldRaw++; continue; }
    let value = null;
    try { value = await store.get(key, { type: "json" }); } catch { value = null; }
    if (expired(storeName, key, value, now)) { await store.delete(key); counts.expired++; } else counts.kept++;
  }
  return counts;
}

/** Clean every limiter store. getStore is @netlify/blobs' (injected so the rule is tested without Netlify). */
async function cleanAll({ getStore, now = new Date() }) {
  const result = {};
  for (const name of STORES) result[name] = await cleanStore(name, getStore(name), now);
  return result;
}

module.exports = { STORES, expired, isOldRawKey, cleanStore, cleanAll };
