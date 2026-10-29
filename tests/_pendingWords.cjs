// tests/_pendingWords.cjs
// -----------------------------------------------------------------------------
// THE WORDS STILL TO COME. A line still waiting for approval is written as "[WORDS: id]", and only the ids that
// docs/product/COUPLE-MODE-WORDS.md lists with that placeholder as their line may appear anywhere: the suites that
// look for a placeholder left behind take these out, and fail on any other. Nothing ships while one is left: the
// production deploy and every store build run scripts/check-pending-words.mjs, which refuses them all.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");

const DOC = path.join(__dirname, "..", "docs", "product", "COUPLE-MODE-WORDS.md");

// The ids whose row in the words doc still has its own placeholder as its line.
function pendingWordIds() {
  const doc = fs.readFileSync(DOC, "utf8");
  return [...doc.matchAll(/^\| `([a-z0-9_.]+)` \| [^|]+ \| [^|]+ \| \[WORDS: ([a-z0-9_.]+)\] \| \d+ \|$/gm)]
    .filter((m) => m[1] === m[2]).map((m) => m[1]);
}
// Every placeholder in a text, by its full id.
const placeholders = (src) => [...String(src).matchAll(/\[WORDS:\s*([a-z0-9_.-]+)/g)].map((m) => m[1]);
// The placeholders in a text that are NOT still to come: always none.
const strayPlaceholders = (src, pending = pendingWordIds()) => placeholders(src).filter((id) => !pending.includes(id));

module.exports = { pendingWordIds, placeholders, strayPlaceholders };
