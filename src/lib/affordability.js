// src/lib/affordability.js
// -----------------------------------------------------------------------------
// "Can I afford this?" — the arithmetic only. The copy stays at the render site.
//
// THE DEFECT THIS EXISTS FOR. The card read the ENGINE's raw `safeAmount` while the headline two
// inches above it read safeToSpendView's DISPLAYED headline. Two owners for one fact, on one card:
//
//     SAFE TO SPEND UNTIL NEXT PAYDAY   $1,944          <- floored, from the displayed components
//     spend 800 -> "$1145 left in your safe limit"      <- 1944.88 - 800 = 1144.88, toFixed -> 1145
//
// A reader subtracts 1944 - 800 = 1144 and the card says 1145. It was not occasional: the raw safe
// amount carries a fraction (.88 in the CA demo, .55 in the US one) and toFixed rounds to NEAREST, so
// it was wrong for EVERY amount in both demos — and for a real user it would be wrong whenever their
// fraction happens to be >= .5, which is worse than always, because it is unpredictable.
//
// So the remainder is computed from the DISPLAYED safe-to-spend, the number the user can actually
// see. The subtraction a reader does in their head is now the subtraction the card performed.
//
// The 10% "tight" threshold is taken from the same displayed figure for the same reason — the
// yes/tight boundary should sit where the visible number says it sits.
//
// PURE. No React, no engine calls: the caller passes the displayed headline it already holds.
// -----------------------------------------------------------------------------

import { formatMoney } from "./format.js";

// Absurd-input cap, unchanged from the render site it came from.
export const MAX_AFFORD_AMOUNT = 99999;

/**
 * @param {number} displayedSafe  safeToSpendView(...).headline — the integer ON SCREEN, not the
 *                                engine's raw safeAmount. Passing the raw value is the bug.
 * @param {string|number} rawAmount  whatever the user typed.
 * @returns {null | {state:"yes"|"tight"|"no", remaining:number, remainingText:string,
 *                   overBy:number, overByText:string, amount:number}}
 *          null when there is nothing to answer (empty, zero, negative, or absurd input).
 */
export function affordabilityCheck(displayedSafe, rawAmount) {
  const amt = typeof rawAmount === "number"
    ? rawAmount
    : parseFloat(String(rawAmount == null ? "" : rawAmount).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amt) || amt <= 0 || amt > MAX_AFFORD_AMOUNT) return null;

  const safe = Number.isFinite(Number(displayedSafe)) ? Number(displayedSafe) : 0;
  const remaining = safe - amt;
  // Scales with the user's actual situation rather than a flat number, as before.
  const tightThreshold = Math.max(10, safe * 0.10);

  // Cents only when the remainder actually has them — a whole-dollar spend against a whole-dollar
  // headline must print a whole-dollar remainder, or the reader's subtraction stops matching again.
  const money = (n) => formatMoney(n, { cents: !Number.isInteger(n) });

  return {
    amount: amt,
    remaining,
    remainingText: money(remaining),
    overBy: Math.max(0, -remaining),
    overByText: money(Math.max(0, -remaining)),
    state: remaining >= tightThreshold ? "yes" : remaining >= 0 ? "tight" : "no",
  };
}
