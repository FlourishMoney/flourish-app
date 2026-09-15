// src/lib/format.js — the single shared formatter for displayed numbers and dollar amounts.
// Thousands separators; whole dollars by default ($2,082), cents on request ($2,082.50).

export function formatNumber(n, { cents = false } = {}) {
  const num = Number(n);
  if (!Number.isFinite(num)) return cents ? "0.00" : "0";
  return num.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
}

export function formatMoney(n, { cents = false } = {}) {
  const num = Number(n);
  const safe = Number.isFinite(num) ? num : 0;
  return (safe < 0 ? "-$" : "$") + formatNumber(Math.abs(safe), { cents });
}

// Ordinal suffix for a day-of-month: 1->st, 2->nd, 3->rd, but 11/12/13->th (and 21->st, 22->nd, 31->st).
// The 11-13 exception is why `day==="1"?"st":...:"th"` produced "22th"/"11st" — this handles every day.
export function ordinalSuffix(day) {
  const n = parseInt(day, 10);
  if (!Number.isFinite(n)) return "";
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; }
}
