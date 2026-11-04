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
// Every placeholder in a text, by its id.
const placeholders = (src) => [...String(src).matchAll(/\[WORDS:\s*([a-z0-9-]+)/g)].map((m) => m[1]);
// The placeholders in a file that the exception does not cover: every one, unless the file is the words file.
function strayPlaceholders(src, file) {
  const found = placeholders(src);
  if (path.normalize(String(file || "")) !== HOME) return found;
  const pending = pendingCreatorWordIds();
  return found.filter((id) => !pending.includes(id));
}

module.exports = { pendingCreatorWordIds, placeholders, strayPlaceholders };
