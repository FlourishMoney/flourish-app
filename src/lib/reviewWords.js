// src/lib/reviewWords.js
// -----------------------------------------------------------------------------
// THREE LINES APPROVED ON 2026-11-22 (full-app review, round 2), word for word. They are here, not in the screens,
// so a test can hold the exact words (tests/review1122Round2.test.cjs).
// -----------------------------------------------------------------------------

// Settings, disconnecting a bank. The whole question reads:
//   "Disconnect {Bank}? We'll remove its accounts, transactions, card debts and investments from flourish."
// It is shown as a title and a body. It is true since review finding P9-02: a disconnected bank takes with it what
// came from it (lib/multibank.js dropBankData).
export const bankDisconnectTitle = (bank) => `Disconnect ${bank}?`;
export const BANK_DISCONNECT_BODY = "We'll remove its accounts, transactions, card debts and investments from flourish.";

// The debt What-If, when the payment being looked at covers the interest but would still take over 100 years
// (lib/financialCalculations.js simulateDebtPayoff, beyondHorizon; review finding P4-04).
export const DEBT_OVER_100_YEARS = "This payment would take over 100 years to pay off the debt. Try a bigger payment to see a payoff date.";

// Settings, AI Coach: the server could not record the consent, so the coach stays off (review finding P9-07).
export const AI_TURN_ON_FAILED = "We couldn't turn on the AI coach just now. Try again in a moment.";
