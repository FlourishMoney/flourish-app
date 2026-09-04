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
