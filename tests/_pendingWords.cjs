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

// A THIRD EXCEPTION, AS NARROW: THE PLUS ADD-ON, BANK LOGIN LIMITS AND NET WORTH WORDS (2026-11-10), UNTIL BOTH
// REVIEWERS APPROVE THEM. The same three conditions: the id starts "plus-", "banks-" or "networth-";
// docs/product/NET-WORTH-WORDS.md lists it with the placeholder as its line; and it is in src/lib/netWorthWords.js.
// The same refusal keeps them from shipping, and once they are approved this exception covers nothing.
const NW_DOC = path.join(__dirname, "..", "docs", "product", "NET-WORTH-WORDS.md");
const NW_HOME = path.join("src", "lib", "netWorthWords.js");
function pendingNetWorthWordIds() {
  let doc = "";
  try { doc = fs.readFileSync(NW_DOC, "utf8"); } catch { return []; }
  return [...doc.matchAll(/^\| `((?:plus|banks|networth)-[a-z0-9-]+)` \| [^|]+ \| [^|]+ \| \[WORDS: ((?:plus|banks|networth)-[a-z0-9-]+)\] \| \d+ \|$/gm)]
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
  if (where === NW_HOME) { const pending = pendingNetWorthWordIds(); return found.filter((id) => !pending.includes(id)); }
  return found;
}

module.exports = { pendingCreatorWordIds, pendingBalanceWordIds, pendingNetWorthWordIds, placeholders, strayPlaceholders };
