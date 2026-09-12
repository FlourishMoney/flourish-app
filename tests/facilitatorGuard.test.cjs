// tests/facilitatorGuard.test.cjs — deterministic numeric guard for facilitator output.
// Covers: a permitted agenda fact; an invented "5 of 7" where 5 and 7 appear SEPARATELY in the
// agenda; an invented percentage; an invented average; an invented total; a legitimate
// phrase-specific structural number (15-minute); and retry-failure → safe qualitative fallback.
"use strict";
const { create } = require("./_runner.cjs");
const {
  extractAgendaFacts,
  validateFacilitatorProse,
  resolveFacilitatorOutput,
  SAFE_FACILITATOR_FALLBACK,
} = require("../netlify/functions/_lib/facilitatorGuard.js");
const t = create();

// Agenda that STATES $75, 14 months, $1,400 and the win "5 of 7 days".
const DECISION_AGENDA = `Wins:
- You stayed within safe-to-spend 5 of 7 days.
Progress:
- Emergency fund: $1,400.00, on track for February.
Decisions:
- Put an extra $75 toward Visa, or into savings this period?
    • Extra $75 to Visa: pays it off in 14 months
    • Add $75 to savings: $75 more toward your buffer`;

// Agenda where 5 and 7 appear SEPARATELY (never as "5 of 7").
const SEPARATE_AGENDA = `Wins:
- You had 5 no-spend evenings.
Upcoming risks:
- Thu 7: Hydro $95.00 due.`;

// canonical allow-list sanity
const facts = extractAgendaFacts(DECISION_AGENDA);
t.ok(facts.some((f) => f.value === 75 && f.unit === "currency"), "0a agenda fact $75 extracted as currency");
t.ok(facts.some((f) => f.value === 14 && f.unit === "months"), "0b agenda fact 14 months extracted");
t.ok(facts.some((f) => f.value === 1400 && f.unit === "currency"), "0c agenda fact $1,400 extracted (comma-normalized)");

// 1. permitted agenda fact — passes
t.ok(validateFacilitatorProse("Let's put an extra $75 toward Visa — it pays it off in 14 months.", DECISION_AGENDA).ok,
  "1 permitted agenda facts ($75, 14 months) pass");

// 2. invented "5 of 7" where 5 and 7 appear separately — fails
t.ok(!validateFacilitatorProse("Nice going — you stayed on track 5 of 7 days.", SEPARATE_AGENDA).ok,
  "2 invented '5 of 7' fails even though 5 and 7 appear separately in the agenda");

// 3. invented percentage — fails
t.ok(!validateFacilitatorProse("You stayed on track about 71% of the time.", DECISION_AGENDA).ok,
  "3 invented percentage (71%) fails");

// 4. invented average — fails
t.ok(!validateFacilitatorProse("Your average daily spend was $85.", DECISION_AGENDA).ok,
  "4 invented average ($85) fails");

// 5. invented total — fails
t.ok(!validateFacilitatorProse("Altogether that's $900 total across the week.", DECISION_AGENDA).ok,
  "5 invented total ($900) fails");

// 6. legitimate phrase-specific structural number — passes (15 only inside "15-minute")
t.ok(validateFacilitatorProse("This is your 15-minute meeting — let's start with the win.", DECISION_AGENDA).ok,
  "6 phrase-specific '15-minute' passes without 15 being an agenda fact");
// ...but a bare 15 NOT in that phrase must still fail (exception is phrase-specific, not a bare whitelist)
t.ok(!validateFacilitatorProse("You have 15 dollars of wiggle room.", DECISION_AGENDA).ok,
  "6b bare 15 outside the '15-minute' phrase still fails (no global 15 whitelist)");

// 7. retry-failure path → safe qualitative fallback
const cleanFirst = "Let's start with the win, then look at the $75 decision.";
const badFirst = "Altogether that's $900 total.";
const badRetry = "You were on track 71% of days.";
t.eq(resolveFacilitatorOutput(DECISION_AGENDA, cleanFirst, null).kind, "first", "7a clean first reply is used");
t.eq(resolveFacilitatorOutput(DECISION_AGENDA, badFirst, cleanFirst).kind, "retry", "7b bad first, clean retry → retry used");
const fb = resolveFacilitatorOutput(DECISION_AGENDA, badFirst, badRetry);
t.eq(fb.kind, "fallback", "7c bad first AND bad retry → safe fallback");
t.eq(fb.text, SAFE_FACILITATOR_FALLBACK, "7d fallback returns the safe qualitative text");
t.ok(!/\d/.test(SAFE_FACILITATOR_FALLBACK), "7e safe fallback contains no numbers");

t.summary("facilitatorGuard");
