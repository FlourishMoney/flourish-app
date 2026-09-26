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
import { suggestedDailyView } from "./suggestedDaily.js";
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

/**
 * Three-to-four pre-written exchanges, filled in from the engines.
 * Returns [{ q, a }]. Pure; safe to call on every render.
 */
export function demoCoachExchanges(data, today = new Date()) {
  const f = facts(data, today);
  const out = [];

  // 1 — the headline number, explained from its own displayed components.
  const deductions = f.view.rows
    .filter(r => r.kind === "deduction")
    .map(r => `${r.value} ${r.label.toLowerCase()}`);
  out.push({
    q: "What's actually safe for me to spend right now?",
    a: `${f.view.headlineText}. You have ${f.view.balanceText} in cash, and I've held back ${_list(deductions)}.` +
       (f.nd ? ` That's what's left to cover you until your next deposit on ${_date(f.nd.date, data.profile?.country)}.` : ""),
  });

  // 2 — the daily pace, and why it is not a spending cap.
  if (f.pace.daily > 0) {
    out.push({
      q: "So how much can I spend today?",
      a: `${f.pace.dailyText}. That paces ${f.view.headlineText} over ${f.pace.daysLeft} days. ` +
         `It's a pace, not a limit — Safe to Spend is what you can afford, this is how to make it last. ` +
         `I never divide by fewer than 14 days, so a deposit landing soon doesn't tempt you into spending it all at once.`,
    });
  }

  // 3 — the highest-rate debt, using the same decision the Meet agenda already shows.
  if (f.debt) {
    let a = `Your ${f.debt.name} is at ${formatMoney(f.debt.balance)} and ${f.debt.rate}% — the most expensive money you owe, so it's the one worth attacking.`;
    if (f.decision && (f.decision.options || []).length >= 2) {
      const [d1, d2] = f.decision.options;
      a += ` ${f.decision.text} ${d1.label}: ${d1.outcome}. ${d2.label}: ${d2.outcome}.`;
    }
    out.push({ q: `Should I put money on the ${f.debt.name}?`, a });
  }

  // 4 — when money next arrives.
  if (f.nd) {
    out.push({
      q: "When does money come in next?",
      a: `${formatMoney(f.nd.amount)} on ${_date(f.nd.date, data.profile?.country)} — your ${f.nd.sourceLabel}, ${f.days} days away. ` +
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
  return `Let's start with the one decision your week actually raised. ${decision.text} ` +
         `${d1.label} and it's ${d1.outcome}; ${d2.label} and your ${d2.outcome}. Which of those sounds more like the month you want?`;
}
