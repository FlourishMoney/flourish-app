// netlify/functions/_lib/planWords.js
// -----------------------------------------------------------------------------
// THE SERVER'S LINES THAT NAMED THE MAIN PLAN "PLUS" (2026-11-10). To households the main paid plan is "flourish";
// "flourish Plus" is only the add-on (Amanda). Word for word as APPROVED 2026-11-20 (ChatGPT 100, Grok 100, Amanda;
// docs/product/NET-WORTH-WORDS.md lists each). A line changed later goes back to a placeholder until approved again:
// scripts/check-pending-words.mjs refuses the production deploy while one is left (it reads netlify/functions too),
// and tests/_pendingWords.cjs allows one only here, only while listed.
// A fact goes in as {name} ({n}: the free plan's coach messages a week); while a line is a placeholder it follows
// the line in brackets.
// -----------------------------------------------------------------------------
"use strict";

const PLAN_WORDS = Object.freeze({
  "plan-server-coach-limit": "You've used your {n} free coach messages this week. A flourish subscription has unlimited messages, or come back on Monday when they reset.",
  "plan-server-one-bank": "The free plan connects one bank. A flourish subscription connects more.",
  "plan-server-one-bank-migrate": "The free plan connects one bank. A flourish subscription connects more.",
});

function planWords(id, facts = {}) {
  const w = PLAN_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  const keys = Object.keys(facts);
  if (/^\[WORDS: [a-z0-9-]+\]$/.test(w)) return [w, ...keys.map((k) => `[${k} ${facts[k]}]`)].join(" ");
  return keys.reduce((s, k) => s.split(`{${k}}`).join(String(facts[k])), w);
}

module.exports = { PLAN_WORDS, planWords };
