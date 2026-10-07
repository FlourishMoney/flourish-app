// src/lib/demoCoach.js
// -----------------------------------------------------------------------------
// A scripted coach for DEMO MODE ONLY, so a visitor can see the app's most
// distinctive feature working on the sample data without an account.
//
// PURELY LOCAL. This module makes no network call and is never reached by a
// signed-in user — the real coach path is untouched. It cannot be used to obtain
// free coaching: the questions and the shape of every answer are fixed here; only
// the FIGURES are filled in, and they are read from the same engines the rest of
// the app reads (safeToSpendView, suggestedDailyView, incomeSchedule,
// decisionEngine, meetSnapshot). Nothing is sent anywhere and nothing is generated.
//
// WHY THE NUMBERS ARE DERIVED, NOT WRITTEN DOWN: the demo fixture dates every
// transaction relative to "now", so its figures move every day — safe-to-spend is
// $2,009 on 16 Sep and $359 on 18 Sep (rent enters the window), and the next
// deposit alternates between the $2,840 paycheque and the $560 benefit. A hard
// coded exchange would contradict the demo's own Today card within two days, which
// is the exact defect the rest of this codebase exists to prevent. Deriving keeps
// the scripted coach true on every date, by construction.
// -----------------------------------------------------------------------------

import { SafeSpendEngine } from "./safeSpendEngine.js";
import { safeToSpendView } from "./safeToSpendView.js";
import { suggestedDailyView, paceSentence } from "./suggestedDaily.js";
import { nextDepositFor, daysToNextDepositFor } from "./forecastEdits.js";
import { selectHighestRateDebt } from "./decisionEngine.js";
import { meetAgendaFor } from "./meetSnapshot.js";
import { formatMoney } from "./format.js";
import { localeTag } from "./locale.js";

// Dates follow the demo household's country. (For {month:"short",day:"numeric"} en-CA and en-US
// happen to render identically, so this changes no output today — but the hard-coded "en-CA" was a
// Canadian assumption sitting in a module the US demo now runs through, and it would bite the moment
// the format changed.)
const _date = (d, country) => d.toLocaleDateString(localeTag(country), { month: "short", day: "numeric" });

// Join a list into prose: "a, b and c".
function _list(parts) {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

// Every figure below comes from an engine call; none is written into this file.
function facts(data, today) {
  const ss = SafeSpendEngine.calculate(data, today);
  const view = safeToSpendView(ss);
  const pace = suggestedDailyView(view.headline, data.incomes, data.transactions, today, data);
  const nd = nextDepositFor(data, today);
  const days = daysToNextDepositFor(data, today);
  const debt = selectHighestRateDebt(data.debts || []);
  const decision = (meetAgendaFor(data).decisions || [])[0] || null;
  return { ss, view, pace, nd, days, debt, decision };
}

// The demo's weekly check-in insight (Muse review item 4). The demo never calls the AI, so instead of
// "the coach didn't answer" the check-in shows this, labelled "Sample insight". It explains one pattern
// in this week's numbers, built ONLY from the figures the demo's Today card shows (the same rows, the
// same next deposit): no invented number, no instruction, no promise.
export function demoCheckInInsight(data, today = new Date()) {
  const f = facts(data, today);
  if (f.view.headline == null) return null;
  const PHRASE = { upcomingBills: (v) => `${v} in upcoming bills`, debtPayments: (v) => `${v} in minimum debt payments`,
                   safetyBuf: (v) => `a ${v} spending buffer`, savingsAlloc: (v) => `${v} in savings` };
  const deductions = f.view.rows
    .filter(r => r.kind === "deduction")
    .map(r => (PHRASE[r.key] ? PHRASE[r.key](r.value) : `${r.value} in ${r.label.toLowerCase()}`));
  const until = f.nd ? ` until your next deposit on ${_date(f.nd.date, data.profile?.country)}` : " until your next deposit";
  return `${f.view.headlineText} is safe to spend${until}. It starts from ${f.view.balanceText} in your accounts` +
    (deductions.length ? `, less ${_list(deductions)}.` : ".");
}

/**
 * Three-to-four pre-written exchanges, filled in from the engines.
 * Returns [{ q, a }]. Pure; safe to call on every render.
 */
export function demoCoachExchanges(data, today = new Date()) {
  const f = facts(data, today);
  const out = [];

  // 1 — the headline number, explained from its own displayed components.
  // demo-clarity: facts, not "I've held back … to cover you". Every amount is the displayed row's own value.
  const PHRASE = { upcomingBills: (v) => `${v} in upcoming bills`, debtPayments: (v) => `${v} in minimum debt payments`,
                   safetyBuf: (v) => `a ${v} spending buffer`, savingsAlloc: (v) => `${v} in savings` };
  const deductions = f.view.rows
    .filter(r => r.kind === "deduction")
    .map(r => (PHRASE[r.key] ? PHRASE[r.key](r.value) : `${r.value} in ${r.label.toLowerCase()}`));
  out.push({
    q: "What's actually safe for me to spend right now?",
    a: `${f.view.headlineText}. You have ${f.view.balanceText} in your accounts. Flourish accounts for ${_list(deductions)}.` +
       (f.nd ? ` That's what's safe to spend until your next deposit on ${_date(f.nd.date, data.profile?.country)}.` : ""),
  });

  // 2 — the daily pace, and why it is not a spending cap.
  if (f.pace.daily > 0) {
    out.push({
      q: "So how much can I spend today?",
      a: `${paceSentence(f.pace, f.view.headline)} ` +
         `It's a pace, not a limit. Safe to spend is the total until your next deposit; this spreads it across the days. ` +
         `The pace always uses at least 14 days, even when a deposit is closer.`,
    });
  }

  // 3 — the highest-rate debt, using the same decision the Meet agenda already shows.
  if (f.debt) {
    let a = `Your ${f.debt.name} is at ${formatMoney(f.debt.balance)} and ${f.debt.rate}%, the highest rate on anything you owe.`;
    if (f.decision && (f.decision.options || []).length >= 2) {
      const [d1, d2] = f.decision.options;
      // Prompt 3e: the spare amount and the two balances, with no amount suggested for either.
      a += ` ${f.decision.text} ${d1.label}: ${d1.outcome}. ${d2.label}: ${d2.outcome}. What you do with it is up to you.`;
    }
    out.push({ q: `Should I put money on the ${f.debt.name}?`, a });
  }

  // 4 — when money next arrives.
  if (f.nd) {
    out.push({
      q: "When does money come in next?",
      a: `${formatMoney(f.nd.amount)} on ${_date(f.nd.date, data.profile?.country)}, your ${f.nd.sourceLabel}, ${f.days} days away. ` +
         `That's the date every number above is planning towards.`,
    });
  }

  return out;
}

/**
 * One scripted facilitator line for the Meet tab in demo mode — it reads the
 * agenda that is already on screen and nothing else. Returns null when the
 * agenda has no decision, so the caller can fall back.
 */
export function demoFacilitatorLine(data, today = new Date()) {
  const { decision } = facts(data, today);
  if (!decision || (decision.options || []).length < 2) return null;
  const [d1, d2] = decision.options;
  return `Let's start with the one question your week raised. ${decision.text} ` +
         `${d1.label}: ${d1.outcome}. ${d2.label}: ${d2.outcome}.`;
}
