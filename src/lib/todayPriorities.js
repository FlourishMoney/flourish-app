// src/lib/todayPriorities.js — Today's "one thing to know" selector.
//
// Pure and deterministic: returns the single highest-priority forecast / behaviour / next-bill item,
// or null to HIDE the line. The safe-to-spend hero figure is deliberately NOT an input here, so the
// "know" line can never repeat the hero. Priority: immediate overdraft → 7-day overdraft → next bill.

import { formatMoney } from "./format.js";

function _ordinal(day) {
  const n = parseInt(day, 10);
  if (!Number.isFinite(n)) return String(day);
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function todayKnowItem({ overdraftImmediate, sevenDayOverdraft, nextBill } = {}) {
  if (overdraftImmediate) return "Your balance can't cover the bills due before payday. Tap Safe to Spend to see which bill does it.";
  if (sevenDayOverdraft) return "Your balance is on track to go negative within a week.";
  if (nextBill && nextBill.name) {
    const amt = Number(nextBill.amount);
    const money = Number.isFinite(amt) ? ` ${formatMoney(amt)}` : "";
    const due = (nextBill.date != null && String(nextBill.date) !== "") ? ` is due the ${_ordinal(nextBill.date)}` : " is due soon";
    return `${nextBill.name}${money}${due}.`;
  }
  return null; // nothing noteworthy → hide the "know" line, keep "one thing you could do"
}
