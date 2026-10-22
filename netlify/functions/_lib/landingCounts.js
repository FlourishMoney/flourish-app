// netlify/functions/_lib/landingCounts.js
// -----------------------------------------------------------------------------
// THE LANDING'S OWN COUNTS, by day, src and device (the trial-first landing, 2026-10-22). Counts only: no
// email, no IP, no user agent, no account id is stored or logged. Each count is one row per Toronto day,
// src, device and event in public.landing_counts (migration 0027), bumped by bump_landing_count, which only
// the service role may run. Until 0027 has run, a bump fails and is dropped: it never changes an answer.
//
//   landing_view, main_tap    sent by the page (src/lib/landingCounts.js, beta.js action "landing_count")
//   account_created           counted by beta.js when the signup's account is created
//   founding_join             counted by beta.js when a founding list signup is stored (a new row)
// -----------------------------------------------------------------------------
"use strict";
const { waitlistSourceFor } = require("./waitlistConsent");

const COUNT_EVENTS = Object.freeze(["landing_view", "main_tap", "account_created", "founding_join"]);
const CLIENT_COUNT_EVENTS = Object.freeze(["landing_view", "main_tap"]);
const DEVICES = Object.freeze(["phone", "tablet", "desktop"]);

// The device kind from the browser's own description of itself, and nothing more. The description is read
// here and never kept.
function deviceFrom(userAgent) {
  const ua = String(userAgent || "");
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "phone";
  return "desktop";
}
const headerOf = (event, name) => {
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find((x) => x.toLowerCase() === name);
  return k ? h[k] : "";
};

/** Add one to today's count. Never throws; returns true when the database took it. */
async function bumpLandingCount({ supabaseUrl, secretKey, event, name, src, fetchImpl = fetch, timeoutMs = 3000 }) {
  if (!COUNT_EVENTS.includes(name) || !supabaseUrl || !secretKey || typeof fetchImpl !== "function") return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/bump_landing_count`, {
      method: "POST",
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_event: name, p_src: waitlistSourceFor(src), p_device: deviceFrom(headerOf(event, "user-agent")) }),
      signal: ctl.signal,
    });
    if (!res.ok) { console.error("[landing-count] not counted", res.status); return false; }
    return true;
  } catch {
    console.error("[landing-count] not counted", "no_status");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { COUNT_EVENTS, CLIENT_COUNT_EVENTS, DEVICES, deviceFrom, bumpLandingCount };
