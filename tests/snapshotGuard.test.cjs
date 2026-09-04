// tests/snapshotGuard.test.cjs — deterministic numeric guard for chat + checkin output.
// Mirrors the facilitator set (permitted fact, compound N-of-M, invented %, total, structural pass,
// retry-failure fallback) PLUS the required specifics: exact supplied figure allowed; computed
// income-minus-expenses surplus rejected; misquoted supplied figure rejected; invented percentage
// and total rejected; failed retry → safe fallback. Fact source is the snapshot + user-typed text.
"use strict";
const { create } = require("./_runner.cjs");
const {
  buildSnapshotFactText,
  validateSnapshotProse,
  resolveSnapshotOutput,
  SAFE_SNAPSHOT_FALLBACK,
} = require("../netlify/functions/_lib/snapshotGuard.js");
const t = create();

// A canonical snapshot that SUPPLIES: balance $2,340; income $4,200; expenses $3,100; emergency
// fund $1,500; a credit card of $6,800 at 19.99%. It does NOT supply a surplus, a percentage other
// than 19.99, or any total.
const SNAP = `Financial snapshot:
- Balance: $2,340.00
- Monthly take-home income: $4,200.00
- Monthly essential expenses: $3,100.00
- Emergency fund: $1,500.00
- Debts: Credit card $6,800.00 at 19.99% APR`;

// exact supplied figures allowed
t.ok(validateSnapshotProse("Your balance is $2,340 and the card sits at 19.99%.", SNAP).ok,
  "1 exact supplied figures ($2,340, 19.99%) pass");

// computed income-minus-expenses surplus rejected (1100 is NOT supplied)
t.ok(!validateSnapshotProse("You have a $1,100 monthly surplus.", SNAP).ok,
  "2 computed surplus ($4,200 − $3,100 = $1,100) rejected — not a supplied fact");
t.ok(!validateSnapshotProse("Your surplus is about $1,140 a month.", SNAP).ok,
  "2b a wrong computed surplus ($1,140) is also rejected");

// misquoted supplied figure rejected (income is $4,200, not $4,250)
t.ok(!validateSnapshotProse("Your income is $4,250 a month.", SNAP).ok,
  "3 misquoted supplied figure ($4,250 vs supplied $4,200) rejected");

// invented percentage rejected (only 19.99% is supplied)
t.ok(!validateSnapshotProse("You're saving roughly 30% of your income.", SNAP).ok,
  "4 invented percentage (30%) rejected");

// invented total rejected
t.ok(!validateSnapshotProse("Your debts total $18,000 altogether.", SNAP).ok,
  "5 invented total ($18,000) rejected");

// program limit/amount not in the snapshot rejected (name would be fine, the amount is not)
t.ok(!validateSnapshotProse("The FHSA lets you put in $8,000 a year.", SNAP).ok,
  "6 program amount not in snapshot ($8,000) rejected");
t.ok(validateSnapshotProse("An FHSA is a First Home Savings Account worth asking Flourish about.", SNAP).ok,
  "6b the program NAME alone (no amount) passes");

// mirror facilitator: compound N-of-M not in snapshot rejected
t.ok(!validateSnapshotProse("You stayed on budget 5 of 7 days.", SNAP).ok,
  "7 invented '5 of 7' rejected (not in snapshot)");

// mirror facilitator: phrase-specific structural number passes
t.ok(validateSnapshotProse("Let's do a quick 15-minute review of your money.", SNAP).ok,
  "8 phrase-specific '15-minute' passes");

// user-typed figure is a legitimate fact the coach may echo
const withUser = buildSnapshotFactText(SNAP, "Can I afford a $500 purchase this week?");
t.ok(validateSnapshotProse("Yes — $500 fits within your safe-to-spend.", withUser).ok,
  "9 a figure the user typed ($500) is allowed");
t.ok(!validateSnapshotProse("Yes — $650 fits within your safe-to-spend.", withUser).ok,
  "9b but a figure neither supplied nor user-typed ($650) is rejected");

// resolve: clean first → first; bad first + clean retry → retry; bad first + bad retry → fallback
t.eq(resolveSnapshotOutput(SNAP, "Your balance is $2,340.", null).kind, "first", "10a clean first used");
t.eq(resolveSnapshotOutput(SNAP, "You have a $1,100 surplus.", "Your balance is $2,340.").kind, "retry", "10b bad first, clean retry → retry");
const fb = resolveSnapshotOutput(SNAP, "You have a $1,100 surplus.", "You save 30% of income.");
t.eq(fb.kind, "fallback", "10c bad first AND bad retry → safe fallback");
t.eq(fb.text, SAFE_SNAPSHOT_FALLBACK, "10d fallback returns the safe qualitative text");
t.ok(!/\d/.test(SAFE_SNAPSHOT_FALLBACK), "10e safe fallback contains no numbers");

t.summary("snapshotGuard");
