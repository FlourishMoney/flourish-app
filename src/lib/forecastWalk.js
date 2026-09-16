// src/lib/forecastWalk.js
// -----------------------------------------------------------------------------
// The ONE owner of the forecast drill-down's arithmetic — the "cash flow breakdown" a user opens on
// a forecast day to check the maths for themselves. Two surfaces render it (the Today Time Machine
// and the Watch day-by-day list); both now read this, because they have already drifted apart twice.
//
// WHY CENTS, WHEN EVERY OTHER SURFACE IS WHOLE DOLLARS.
// The walk used to print whole dollars, and four of the demo's seven event days did not add up:
//
//     Opening balance             $2,617
//     Deposit                    +$2,840
//     Est. daily spend (30d avg)    −$33
//     Projected balance (est.)    $5,423      ← 2,617 + 2,840 − 33 = 5,424
//
// Three rounding directions met in one equation: the balances floored (a balance rounds DOWN), the
// terms rounded to nearest, and "Est. daily spend" was really $33.4617 — 46 cents a day the result
// kept and the screen did not show. Rounding the spend term alone still left it wrong, by 54 cents
// instead of a dollar, because the opening balance is floored too. Only ONE precision throughout
// makes a displayed equation actually true.
//
// So this screen carries cents, for the same reason DataTransparencyPanel's per-account rows do: it
// is the screen a user opens specifically to check the arithmetic. The collapsed day row stays whole
// dollars, floored — that is the balance rule, not an exception to it — and the drill-down states the
// relationship out loud ("rounded down from $5,423.54") so the two precisions read as one rule rather
// than as a contradiction.
//
// WHERE THE REMAINDER GOES, AND WHY IT IS HONEST.
// Everything is computed in INTEGER CENTS, so there is no float residue. The two balances are the
// engine's own, to the cent. The bill and deposit amounts are exact. The remainder — at most one cent,
// from rounding the two balances — is carried by the "Est. daily spend (30d avg)" row, which is the
// only term on the screen that is an ESTIMATE rather than a fact, and is labelled as one. The
// alternative was to let the printed equation be false, which is what we are removing.
//
// PURE. No React, no dates, no engine calls — callers pass the numbers they already hold.
// -----------------------------------------------------------------------------

import { formatMoney, roundBalanceDown } from "./format.js";

const _cents = (n) => Math.round((Number(n) || 0) * 100);
const _money = (cents) => formatMoney(cents / 100, { cents: true });

/**
 * @param {object}  o
 * @param {number}  o.opening          previous day's projected balance (ignored when isToday)
 * @param {number}  o.income           deposits landing that day (0 / ignored when isToday)
 * @param {Array}   o.bills            bill objects for that day; each needs `amount` and `name`
 * @param {number}  o.avgDailySpend    the 30-day average, for the sanity check only
 * @param {number}  o.closing          that day's projected balance — the engine's own number
 * @param {boolean} o.isToday          day 0: a snapshot, not a walk (no opening, no spend row)
 */
export function forecastWalk({ opening = 0, income = 0, bills = [], avgDailySpend = 0, closing = 0, isToday = false } = {}) {
  const closingCents = _cents(closing);
  const billRows = (bills || []).map((b) => {
    const cents = _cents(b && b.amount);
    return { key: "bill", bill: b, label: (b && b.name) || "Bill", sign: "−", cents, value: _money(cents) };
  });

  const headline = roundBalanceDown(closingCents / 100);
  const headlineText = formatMoney(headline);
  // Only worth explaining when the two precisions actually differ.
  const roundedFromText = _cents(headline) === closingCents ? null : _money(closingCents);

  const base = {
    billRows,
    closingCents,
    closingText: _money(closingCents),
    headline,
    headlineText,
    roundedFromText,
  };

  // Day 0 is a snapshot of a balance that already exists — there is nothing to walk to it.
  if (isToday) return { ...base, hasWalk: false, rows: [], openingCents: closingCents, openingText: _money(closingCents), incomeCents: 0, spendCents: 0, spendText: _money(0), reconciles: true };

  const openingCents = _cents(opening);
  const incomeCents = Math.max(0, _cents(income));
  const billsCents = billRows.reduce((s, r) => s + r.cents, 0);
  // The residue lands here, by construction, so the printed equation is exactly true.
  const spendCents = openingCents + incomeCents - billsCents - closingCents;

  const rows = [
    { key: "opening", label: "Opening balance", sign: "", cents: openingCents, value: _money(openingCents) },
    ...(incomeCents > 0 ? [{ key: "income", label: "Deposit", sign: "+", cents: incomeCents, value: _money(incomeCents) }] : []),
    ...billRows,
    { key: "spend", label: "Est. daily spend", sign: "−", cents: spendCents, value: _money(spendCents) },
  ];

  const walked = openingCents + incomeCents - billsCents - spendCents;
  return {
    ...base,
    hasWalk: true,
    rows,
    openingCents,
    openingText: _money(openingCents),
    incomeCents,
    incomeText: _money(incomeCents),
    billsCents,
    spendCents,
    spendText: _money(spendCents),
    reconciles: walked === closingCents,
    // How far the displayed estimate sits from the real 30-day average, in cents. Rounding two
    // balances can move it by at most 1; anything larger means a caller passed a mismatched pair,
    // and the walk would be quietly attributing someone else's money to daily spending.
    spendDriftCents: Math.abs(spendCents - _cents(avgDailySpend)),
  };
}
