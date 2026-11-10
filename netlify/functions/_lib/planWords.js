// netlify/functions/_lib/planWords.js
// -----------------------------------------------------------------------------
// THE SERVER'S LINES THAT NAMED THE MAIN PLAN "PLUS" (2026-11-10). To households the main paid plan is "flourish";
// "flourish Plus" is only the add-on (Amanda). These go back to review: placeholders until both reviewers approve
// them (docs/product/NET-WORTH-WORDS.md), and scripts/check-pending-words.mjs refuses the production deploy while one
// is left (it reads netlify/functions too). tests/_pendingWords.cjs allows them only here, only while listed.
// -----------------------------------------------------------------------------
"use strict";

const PLAN_WORDS = Object.freeze({
  "plan-server-coach-limit": "[WORDS: plan-server-coach-limit]",
  "plan-server-one-bank": "[WORDS: plan-server-one-bank]",
  "plan-server-one-bank-migrate": "[WORDS: plan-server-one-bank-migrate]",
});

function planWords(id) {
  const w = PLAN_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  return w;
}

module.exports = { PLAN_WORDS, planWords };
