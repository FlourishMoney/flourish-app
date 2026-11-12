// tests/_pendingWords.cjs
// -----------------------------------------------------------------------------
// THE ONE EXCEPTION TO "NO PLACEHOLDER ANYWHERE": THE CREATOR PROGRAM'S WORDS, UNTIL THEY ARE APPROVED (Amanda, 2026-11-02).
// A placeholder may stay only if ALL of these hold; anything else fails the suites that look for one left behind:
//   its id starts "creator-"; docs/product/CREATOR-PROGRAM-WORDS.md lists that id with the placeholder as its line; and
//   it is in src/lib/creatorWords.js. Nothing ships meanwhile: the production deploy and every store build run
// scripts/check-pending-words.mjs, which refuses them all. Once the lines are approved the list is empty, and the suites
// are exactly as strict as they were.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");

const DOC = path.join(__dirname, "..", "docs", "product", "CREATOR-PROGRAM-WORDS.md");
const HOME = path.join("src", "lib", "creatorWords.js");

// The ids whose row in the words doc still has its own placeholder as its line.
function pendingCreatorWordIds() {
  const doc = fs.readFileSync(DOC, "utf8");
  return [...doc.matchAll(/^\| `(creator-[a-z0-9-]+)` \| [^|]+ \| [^|]+ \| \[WORDS: (creator-[a-z0-9-]+)\] \| \d+ \|$/gm)]
    .filter((m) => m[1] === m[2]).map((m) => m[1]);
}
// A SECOND EXCEPTION, AS NARROW: THE HONEST-BANK-BALANCE WORDS (balance-truth), UNTIL THEY ARE APPROVED (Amanda,
// 2026-11-06: ChatGPT and Grok agree first, placeholders in the code meanwhile). The same three conditions: the id starts
// "balance-"; docs/product/BALANCE-TRUTH-WORDS.md lists it with the placeholder as its line; and it is in
// src/lib/balanceWords.js. The same refusal keeps them from shipping, and once they are in this exception covers nothing.
const BALANCE_DOC = path.join(__dirname, "..", "docs", "product", "BALANCE-TRUTH-WORDS.md");
const BALANCE_HOME = path.join("src", "lib", "balanceWords.js");
function pendingBalanceWordIds() {
  let doc = "";
  try { doc = fs.readFileSync(BALANCE_DOC, "utf8"); } catch { return []; }
  return [...doc.matchAll(/^\| `(balance-[a-z0-9-]+)` \| [^|]+ \| [^|]+ \| \[WORDS: (balance-[a-z0-9-]+)\] \| \d+ \|$/gm)]
    .filter((m) => m[1] === m[2]).map((m) => m[1]);
}

// A THIRD EXCEPTION, AS NARROW: TRIAL PLAN FIRST'S WORDS (2026-11-10, both reviewers first). The same three conditions:
// the id starts "trialfirst-"; docs/product/TRIAL-PLAN-FIRST-WORDS.md lists it with the placeholder as its line; and it
// is in src/lib/trialWords.js or netlify/functions/_lib/trialWords.js. The same refusal keeps them from shipping.
const TRIAL_DOC = path.join(__dirname, "..", "docs", "product", "TRIAL-PLAN-FIRST-WORDS.md");
const TRIAL_HOMES = [path.join("src", "lib", "trialWords.js"), path.join("netlify", "functions", "_lib", "trialWords.js")];
function pendingTrialWordIds() {
  let doc = "";
  try { doc = fs.readFileSync(TRIAL_DOC, "utf8"); } catch { return []; }
  return [...doc.matchAll(/^\| `(trialfirst-[a-z0-9-]+)` \| [^|]+ \| [^|]+ \| \[WORDS: (trialfirst-[a-z0-9-]+)\] \| \d+ \|$/gm)]
    .filter((m) => m[1] === m[2]).map((m) => m[1]);
}

// A FOURTH EXCEPTION, AS NARROW: THE 1.1.7 FIRST RUN'S CONSENT STEP (2026-11-12, placeholders until approved). The same
// three conditions: the id starts "onboarding-consent-"; docs/product/FIRST-RUN-117-WORDS.md lists it with the placeholder
// as its line; and it is in src/lib/firstRunWords.js. The same refusal keeps them from shipping.
const FIRST_RUN_DOC = path.join(__dirname, "..", "docs", "product", "FIRST-RUN-117-WORDS.md");
const FIRST_RUN_HOME = path.join("src", "lib", "firstRunWords.js");
function pendingFirstRunWordIds() {
  let doc = "";
  try { doc = fs.readFileSync(FIRST_RUN_DOC, "utf8"); } catch { return []; }
  return [...doc.matchAll(/^\| `(onboarding-consent-[a-z0-9-]+)` \| [^|]+ \| [^|]+ \| \[WORDS: (onboarding-consent-[a-z0-9-]+)\] \| \d+ \|$/gm)]
    .filter((m) => m[1] === m[2]).map((m) => m[1]);
}

// Every placeholder in a text, by its id.
const placeholders = (src) => [...String(src).matchAll(/\[WORDS:\s*([a-z0-9-]+)/g)].map((m) => m[1]);
// The placeholders in a file that the exceptions do not cover: every one, unless the file is one of the two words files.
function strayPlaceholders(src, file) {
  const found = placeholders(src);
  const where = path.normalize(String(file || ""));
  if (where === HOME) { const pending = pendingCreatorWordIds(); return found.filter((id) => !pending.includes(id)); }
  if (where === BALANCE_HOME) { const pending = pendingBalanceWordIds(); return found.filter((id) => !pending.includes(id)); }
  if (where === FIRST_RUN_HOME) { const pending = pendingFirstRunWordIds(); return found.filter((id) => !pending.includes(id)); }
  if (TRIAL_HOMES.includes(where)) { const pending = pendingTrialWordIds(); return found.filter((id) => !pending.includes(id)); }
  return found;
}

module.exports = { pendingCreatorWordIds, pendingBalanceWordIds, pendingTrialWordIds, pendingFirstRunWordIds, placeholders, strayPlaceholders };
