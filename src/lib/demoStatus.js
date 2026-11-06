// src/lib/demoStatus.js — what the app shell says about how fresh its numbers are.
//
// One rule: in demo mode every figure is sample data, so nothing in the shell may say or imply
// "live". Demo builds its state with bankConnected:true (so the whole app has accounts to draw), which
// means a claim keyed on bankConnected — "· live", "updated 3m ago" — was true of the flag and false of
// the numbers. The header chip was worse: it never looked at demo at all.
//
// These are pure functions so the rule can be tested; App.jsx renders whatever they return.
//
// balance-truth (2026-11-06): a bank balance is "live" only while the bank has answered within the hour
// (lib/balanceTruth.js bankFreshness). Before, the chip read "· up to date" whenever the last refresh was over an
// hour old or missing, and the stamp read "updated today" for anything over a day, so balances from a bank link
// whose sign-in had run out were shown as live for weeks. Now a balance that is not live says when the bank last
// answered (or that it can't say), and "live" appears nowhere. `freshness` is bankFreshness's answer; a caller
// that leaves it out gets one worked out from flourish_last_refresh, under the same rule.
import { LIVE_WINDOW_MS, lastUpdatedLine } from "./balanceTruth.js";

function freshnessFrom(freshness, lastRefreshRaw, nowMs) {
  if (freshness && typeof freshness === "object" && freshness.state) return freshness;
  const at = parseInt(lastRefreshRaw || "0");
  if (!Number.isFinite(at) || at <= 0) return { state: "unknown", at: null };
  return { state: nowMs - at < LIVE_WINDOW_MS ? "live" : "stale", at };
}

// The wording Meet uses for sample data. One string, so Today, Watch, Do, Learn and Meet can't drift
// (the coach header had "Sample data" with a capital S). Meet uppercases it with CSS; the case here is
// the source of truth.
export const DEMO_STATUS_LABEL = "Example · sample data";

// The header status chip on Today: a label plus the detail that follows it.
//   lastRefreshRaw — the raw localStorage string for flourish_last_refresh (may be null/garbage)
//   nowMs          — injected clock, so tests don't depend on the wall
//   bankConnected  — manual-balances: false means no linked bank, so nothing on Today is live. Then the
//                    chip says "Balances you entered" when the household entered any, and there is no
//                    chip at all when it entered none (null). Left out (undefined), the chip reads as it
//                    always did, which is what every caller from before this rule gets.
//   enteredBalances — the household has entered at least one balance (lib/manualBalances.js)
//   freshness      — lib/balanceTruth.js bankFreshness: "live" chips say Live and the minutes; "stale" and
//                    "unknown" say when the bank last answered (stale:true, no live dot); "none" (no bank link
//                    behind the figures) is the entered-balances chip or nothing.
export const ENTERED_STATUS_LABEL = "Balances you entered";
export function statusChip({ demo, lastRefreshRaw, nowMs, bankConnected, enteredBalances = false, freshness }) {
  if (demo) return { label: DEMO_STATUS_LABEL, detail: "" };
  if (bankConnected === false) return enteredBalances ? { label: ENTERED_STATUS_LABEL, detail: "" } : null;
  const fresh = freshnessFrom(freshness, lastRefreshRaw, nowMs);
  if (fresh.state === "none") return enteredBalances ? { label: ENTERED_STATUS_LABEL, detail: "" } : null;
  if (fresh.state !== "live") return { label: lastUpdatedLine(fresh, nowMs), detail: "", stale: true };
  const m = Math.round((nowMs - fresh.at) / 60000);
  return { label: "Live", detail: m < 1 ? "· just refreshed" : `· updated ${m}m ago` };
}

// The suffix on the safe-to-spend headline. `kind` lets the caller keep its existing colours:
// "live" is muted, everything else is gold.
// In demo the suffix carries NO leading separator: it is long enough to wrap onto its own line at phone
// width, and a line that starts with "·" separates nothing. App.jsx renders it as a small tag instead,
// which reads correctly whether it sits inline or wraps.
// balance-truth: "· live" only while the bank balances are live. A linked household whose balances are not live
// gets no suffix (kind "stale", text ""): the stamp under the figure says when the bank last answered, once.
export function heroFreshness({ demo, bankConnected, freshness, lastRefreshRaw, nowMs }) {
  if (demo) return { text: DEMO_STATUS_LABEL, kind: "example" };
  if (!bankConnected) return { text: "· estimated", kind: "estimated" };
  const fresh = freshnessFrom(freshness, lastRefreshRaw, nowMs);
  if (fresh.state === "none") return { text: "· estimated", kind: "estimated" };
  return fresh.state === "live" ? { text: "· live", kind: "live" } : { text: "", kind: "stale" };
}

// The small stamp under the headline, or null when there is nothing honest to say. Live: "just updated" or
// "updated Nm ago". Not live: when the bank last answered (lastUpdatedLine), never "updated today".
// Never in demo: sample data was not updated from anywhere, whatever an earlier real session left in
// localStorage on this browser.
export function refreshStamp({ demo, bankConnected, isRefreshing, lastRefreshRaw, nowMs, freshness }) {
  if (demo || !bankConnected || isRefreshing) return null;
  const fresh = freshnessFrom(freshness, lastRefreshRaw, nowMs);
  if (fresh.state === "none") return null;
  if (fresh.state !== "live") return lastUpdatedLine(fresh, nowMs);
  const mins = Math.round((nowMs - fresh.at) / 60000);
  return mins < 1 ? "just updated" : `updated ${mins}m ago`;
}
