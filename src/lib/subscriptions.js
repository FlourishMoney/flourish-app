// src/lib/subscriptions.js
// -----------------------------------------------------------------------------
// Sprint C Fix 5 — normalize subscription spend to a real MONTHLY figure.
//
// OpportunityDetector summed every "Subscriptions" transaction across the ~90-day window and called
// the total "$X/mo" with the raw row count as "N active subscriptions". Three monthly Netflix charges
// became "$57/mo, 3 active" when it is one $19 sub — and the 30% savings badge inherited the inflated
// number. This groups by merchant, counts DISTINCT active merchants, and estimates ONE monthly amount
// per merchant (the median charge, never a sum of every historical occurrence).
// -----------------------------------------------------------------------------

// A merchant is "active" if it has charged within this many days of `now`. A live monthly sub should
// have billed within ~6 weeks; anything older is treated as cancelled/dormant and not counted.
export const SUBSCRIPTION_ACTIVE_WINDOW_DAYS = 45;

// Conservative merchant identity: NETFLIX.COM / Netflix / "NETFLIX 1234" all collapse to "netflix",
// while distinct merchants stay distinct (no loose prefix-matching). Strips TLDs, punctuation, and
// standalone transaction-number tokens.
export function normalizeMerchant(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\.(com|net|org|io|co|ca|app|tv)\b/g, " ") // netflix.com -> netflix
    .replace(/[^a-z0-9 ]+/g, " ")                        // slashes/punctuation -> space
    .replace(/\b\d+\b/g, " ")                            // "netflix 1234" -> netflix (drop number tokens)
    .replace(/\s+/g, " ")
    .trim();
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// Analyze subscription transactions into a normalized monthly view.
//   txns       — all transactions; only cat === "Subscriptions", positive-amount rows are considered.
//   now        — injected reference date (never real-time in tests).
//   windowDays — the active window; defaults to SUBSCRIPTION_ACTIVE_WINDOW_DAYS.
// Returns { monthlyTotal, activeCount, merchants:[{key, monthly, count}], windowDays }.
//   monthlyTotal — sum of each active merchant's estimated monthly charge (rounded).
//   activeCount  — number of DISTINCT active merchants (not transaction rows).
export function analyzeSubscriptions(txns, now = new Date(), windowDays = SUBSCRIPTION_ACTIVE_WINDOW_DAYS) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - windowDays);

  const byMerchant = new Map();
  for (const t of Array.isArray(txns) ? txns : []) {
    if (!t || t.cat !== "Subscriptions") continue;
    const amt = Math.abs(Number(t.amount));         // expenses are positive; Math.abs is belt-and-suspenders
    if (!Number.isFinite(amt) || amt <= 0) continue; // skip $0 / malformed rows → no NaN downstream
    let d;
    try { d = new Date(String(t.date) + "T12:00:00"); } catch { continue; }
    if (isNaN(d.getTime())) continue;
    const key = normalizeMerchant(t.merchant || t.name);
    if (!key) continue;
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key).push({ amt, d });
  }

  const merchants = [];
  for (const [key, charges] of byMerchant) {
    const recent = charges.filter(c => c.d >= cutoff);
    if (recent.length === 0) continue;               // last charge too old → not an active subscription
    // ONE representative monthly charge — the median of recent charges. Never the sum: multiple
    // charges in a window describe the SAME monthly sub, so their median is the monthly amount.
    const monthly = median(recent.map(c => c.amt));
    merchants.push({ key, monthly, count: recent.length });
  }

  const monthlyTotal = Math.round(merchants.reduce((s, m) => s + m.monthly, 0));
  return { monthlyTotal, activeCount: merchants.length, merchants, windowDays };
}
