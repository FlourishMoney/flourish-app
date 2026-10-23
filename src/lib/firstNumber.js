// src/lib/firstNumber.js
// -----------------------------------------------------------------------------
// THE FIRST-NUMBER SCREEN'S WORDS (onboarding, 2026-10-23; approved by ChatGPT and Grok). The screen a new
// account sees once onboarding ends (App.jsx FirstVisitScreen). It says only what is true of THIS number:
//
//   firstNumberGreeting(name)  "Welcome, Sam", or "Welcome" (W5) when no name was given.
//   FIRST_NUMBER_HEADLINE      "Here's your number." (W6).
//   firstNumberSentence(ss)    the parts actually in the number, by their approved names, + "are accounted for.":
//                              "Bills due before payday", "minimum debt payments", "a spending buffer",
//                              "a savings amount", each only when it took something off the number. None:
//                              no sentence. A single part that is singular ("a spending buffer", "a savings
//                              amount") would need "is", which is not an approved word, so it has no sentence
//                              either (the breakdown still shows it).
//   bufferPending(data, ss)    the spending buffer is $0 because there are no transactions yet, so the screen
//                              adds W2: BUFFER_PENDING_LINE.
// Pure: the Safe to spend result (SafeSpendEngine.calculate) and the household's data in, words out.
// -----------------------------------------------------------------------------
import { correctionsOf } from "./forecastEdits.js";

export const FIRST_NUMBER_HEADLINE = "Here's your number.";
export const BUFFER_PENDING_LINE = "The spending buffer starts after flourish has enough of your transactions to calculate it.";
const WELCOME = "Welcome";

// In the order the number takes them off, with whether the name is plural (so "are" reads right alone).
export const FIRST_NUMBER_PARTS = Object.freeze([
  { key: "upcomingBills", name: "Bills due before payday", plural: true },
  { key: "debtPayments", name: "minimum debt payments", plural: true },
  { key: "safetyBuf", name: "a spending buffer", plural: false },
  { key: "savingsAlloc", name: "a savings amount", plural: false },
]);

export function firstNumberGreeting(name) {
  const n = typeof name === "string" ? name.trim() : "";
  return n ? `${WELCOME}, ${n}` : WELCOME;
}

// The parts that took something off this number.
export function partsInNumber(ss) {
  return FIRST_NUMBER_PARTS.filter((p) => Number(ss && ss[p.key]) > 0);
}

// "A", "A and B", "A, B and C" (the approved lines' own style: no comma before "and").
function listOf(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function firstNumberSentence(ss) {
  const parts = partsInNumber(ss);
  if (!parts.length) return null;
  if (parts.length === 1 && !parts[0].plural) return null;   // would need "is"
  const text = `${listOf(parts.map((p) => p.name))} are accounted for.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// W2: the buffer took nothing because there is no spending to measure yet, not because the household set it to 0.
export function bufferPending(data, ss) {
  if (!ss || Number(ss.safetyBuf) > 0) return false;
  if (correctionsOf(data || {}).dailySpend != null) return false;
  return !((data && data.transactions) || []).length;
}
