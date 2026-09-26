// tests/calmCopy.test.cjs
// -----------------------------------------------------------------------------
// A WARNING STATES A FACT AND OFFERS A STEP. IT DOES NOT GIVE AN ORDER.
//
// The forecast used to say "Balance hits -$2,292 before your next deposit. Reduce spending now."
// The number is the app's to know. What to do about it is the household's to decide, and they know
// things the app does not — that the rent is already paid, that the money is coming Friday, that
// this month was the car.
//
// An order from software that cannot see any of that is worse than unhelpful on a money screen: it
// is one more voice telling someone who is already worried that they are doing it wrong. State the
// fact, and offer somewhere to look.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
// Rendered strings only: text between > and <, which is what a person actually reads. The legal
// pages are cut out first — "You must be at least 18 years old" is wording those documents are
// required to carry, and it is not a warning card telling someone how to spend.
const LEGAL_FROM = Math.min(...["function TermsOfService", "function PrivacyPolicy"]
  .map(f => APP.indexOf(f)).filter(i => i > 0));
const PROSE = Number.isFinite(LEGAL_FROM) ? APP.slice(0, LEGAL_FROM) : APP;
const RENDERED = (PROSE.match(/>[^<>{}]{12,180}</g) || []).map(s => s.slice(1, -1).trim());

(async () => {
  const t = create();

  // ── 1. no orders in anything a person reads ──────────────────────────────────────────────────
  // Imperatives, not topics. "Where you could cut back" offers the household an option and is
  // fine; "Cut back now" tells them what to do and is not.
  const ORDERS = [
    /\bReduce spending\b/i, /\bMove money now\b/i, /\bHold non-essential\b/i,
    /\bCut back now\b/i, /\bAct now\b/i, /\bStop spending\b/i, /\bYou need to (?:stop|cut|reduce)\b/i,
    /\b(?:Move|Transfer|Pay|Cancel|Cut) [^.!?]{0,40}\b(?:now|immediately)\./i,
  ];
  for (const rx of ORDERS) {
    const hit = RENDERED.filter(s => rx.test(s));
    t.eq(hit.join(" | ") || "(none)", "(none)", `1a no rendered string tells the household what to do: ${rx}`);
  }

  // ── 2. the warnings that remain say what happened, and where to look ─────────────────────────
  t.ok(/Heads up: your balance could dip to/.test(APP),
    "2a the projected overdraft states the fact, in the household's own terms");
  t.ok(/The day-by-day list below shows which day, and what lands on it\./.test(APP),
    "2b …and points at where to see it, rather than prescribing a remedy");
  // Split across a <strong>, so matched as it is actually written.
  t.ok(/>Heads up<\/strong>: your bills come to more than your balance before your next deposit\./.test(APP),
    "2c Today's strip does the same");
  t.ok(/See what's coming →/.test(APP), "2d …with a link to the forecast");
  t.ok(/Heads up: an overdraft here usually costs \$45 to \$48 in NSF fees\./.test(APP),
    "2e the per-day line states the cost as a fact");
  t.ok(/Tap the day to see what lands on it\./.test(APP), "2f …and offers a look, not an instruction");
  t.ok(/Heads up: this day runs close to empty\./.test(APP), "2g the low-balance line is a fact too");

  // ── 3. every warning opens the same way, so the tone is one voice ────────────────────────────
  const headsUp = RENDERED.filter(s => /^Heads up[:,]/.test(s));
  t.ok(headsUp.length >= 3, `3a the warnings share an opening (${headsUp.length} of them)`);
  for (const s of headsUp) {
    t.ok(!/!$/.test(s), `3b no warning shouts with an exclamation mark: "${s.slice(0, 40)}"`);
  }

  // ── 4. titles are sentence case ──────────────────────────────────────────────────────────────
  t.ok(/>Projected overdraft</.test(APP), "4a 'Projected overdraft', not 'Projected Overdraft'");
  t.ok(!/>Projected Overdraft</.test(APP), "4b …and the Title Case version is gone");

  t.summary("calmCopy.test");
})();
