// src/lib/demoStatus.js — what the app shell says about how fresh its numbers are.
//
// One rule: in demo mode every figure is sample data, so nothing in the shell may say or imply
// "live". Demo builds its state with bankConnected:true (so the whole app has accounts to draw), which
// means a claim keyed on bankConnected — "· live", "updated 3m ago" — was true of the flag and false of
// the numbers. The header chip was worse: it never looked at demo at all.
//
// These are pure functions so the rule can be tested; App.jsx renders whatever they return. Every
// non-demo branch below reproduces the wording and thresholds the shell used before, byte for byte —
// tests/demoStatus.test.cjs holds a copy of the old expressions and compares the two.

// The wording Meet uses for sample data. One string, so Today, Watch, Do, Learn and Meet can't drift
// (the coach header had "Sample data" with a capital S). Meet uppercases it with CSS; the case here is
// the source of truth.
export const DEMO_STATUS_LABEL = "Example · sample data";

// The header status chip on Today: a label plus the detail that follows it.
//   lastRefreshRaw — the raw localStorage string for flourish_last_refresh (may be null/garbage)
//   nowMs          — injected clock, so tests don't depend on the wall
export function statusChip({ demo, lastRefreshRaw, nowMs }) {
  if (demo) return { label: DEMO_STATUS_LABEL, detail: "" };
  let detail;
  if (!lastRefreshRaw) {
    detail = "· up to date";
  } else {
    const m = Math.round((nowMs - parseInt(lastRefreshRaw)) / 60000);
    detail = m < 1 ? "· just refreshed" : m < 60 ? `· updated ${m}m ago` : "· up to date";
  }
  return { label: "Live", detail };
}

// The suffix on the safe-to-spend headline. `kind` lets the caller keep its existing colours:
// "live" is muted, everything else is gold.
export function heroFreshness({ demo, bankConnected }) {
  if (demo) return { text: `· ${DEMO_STATUS_LABEL}`, kind: "example" };
  return bankConnected
    ? { text: "· live", kind: "live" }
    : { text: "· estimated", kind: "estimated" };
}

// The small "updated Nm ago" stamp under the headline, or null when there is nothing honest to say.
// Never in demo: sample data was not updated from anywhere, whatever an earlier real session left in
// localStorage on this browser.
export function refreshStamp({ demo, bankConnected, isRefreshing, lastRefreshRaw, nowMs }) {
  if (demo || !bankConnected || isRefreshing) return null;
  const lastRefresh = parseInt(lastRefreshRaw || "0");
  if (!lastRefresh) return null;
  const mins = Math.round((nowMs - lastRefresh) / 60000);
  return mins < 1 ? "just updated"
    : mins < 60 ? `updated ${mins}m ago`
    : mins < 1440 ? `updated ${Math.floor(mins / 60)}h ago`
    : "updated today";
}
