// netlify/functions/_lib/attribution.js
// -----------------------------------------------------------------------------
// SOURCE AND CREATIVE (src, cr) THROUGH THE STORE HANDOFF (2026-11-04, migration 0036).
//
// A tag is a plain short word, or it is dropped: the address is anyone's to type. Counts hold a day, src, cr, platform,
// event and a number. The user agent is read for the platform here and never kept; the IP is never read.
// Until 0036 runs, every write fails and is dropped: nothing a person sees depends on it.
// -----------------------------------------------------------------------------
"use strict";

const TAG_RX = /^[a-z0-9_-]{1,40}$/;
const NO_SRC = "direct";
const NO_CR = "none";
const PUBLIC_EVENTS = Object.freeze(["landing_visit", "store_click", "install"]);
// home_visit (migration 0043): the home page was shown, counted by beta.js with the landing's own count, never sent here.
const COUNT_EVENTS = Object.freeze([...PUBLIC_EVENTS, "home_visit"]);

function cleanTag(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return TAG_RX.test(v) ? v : null;
}

function cleanAttribution(a) {
  const o = a && typeof a === "object" ? a : {};
  return { src: cleanTag(o.src) || NO_SRC, cr: cleanTag(o.cr) || NO_CR };
}

function platformFromUserAgent(userAgent) {
  const ua = String(userAgent || "");
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

// The account's platform, from the Origin the two store apps' WebViews send (_lib/cors.js).
function accountPlatform(event) {
  const h = (event && event.headers) || {};
  const origin = h.origin || h.Origin || "";
  if (origin === "capacitor://localhost") return "ios";
  if (origin === "https://localhost") return "android";
  return "web";
}

/** Never throws; true when the database took the count. */
async function bumpAttributionCount({ supabaseUrl, secretKey, name, attribution, platform, fetchImpl = fetch, timeoutMs = 3000 }) {
  if (!COUNT_EVENTS.includes(name) || !supabaseUrl || !secretKey) return false;
  const { src, cr } = cleanAttribution(attribution);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/bump_attribution_count`, {
      method: "POST",
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_event: name, p_src: src, p_cr: cr, p_platform: platform }),
      signal: ctl.signal,
    });
    if (!res.ok) { console.error("[attribution] not counted", res.status); return false; }
    return true;
  } catch {
    console.error("[attribution] not counted", "no_status");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The new account's src and cr. Best effort: the account exists either way. */
async function recordAccountAttribution(admin, userId, attribution, platform) {
  try {
    const { src, cr } = cleanAttribution(attribution);
    const { error } = await admin.from("account_attribution").insert({ user_id: userId, src, cr, platform });
    if (error) console.error("[attribution] account not recorded");
  } catch {
    console.error("[attribution] account not recorded");
  }
}

/** The first number showed within 24 hours of signup (the metric dictionary's activation). Best effort, first time only. */
async function markActivated(admin, userId, createdAt, now = new Date()) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created) || now.getTime() - created > 24 * 60 * 60 * 1000) return;
  try {
    const { error } = await admin.from("account_attribution").update({ activated_at: now.toISOString() }).eq("user_id", userId).is("activated_at", null);
    if (error) console.error("[attribution] activation not recorded");
  } catch {
    console.error("[attribution] activation not recorded");
  }
}

module.exports = { TAG_RX, NO_SRC, NO_CR, PUBLIC_EVENTS, COUNT_EVENTS, cleanTag, cleanAttribution, platformFromUserAgent, accountPlatform, bumpAttributionCount, recordAccountAttribution, markActivated };
