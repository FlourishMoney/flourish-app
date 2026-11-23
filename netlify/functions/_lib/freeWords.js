// netlify/functions/_lib/freeWords.js
// -----------------------------------------------------------------------------
// FREE V1 ON THE WEBSITE: THE SERVER'S WORD SLOT (2026-11-23). The answer plaid.js gives a Free account that asks the
// website to connect a bank. It is a placeholder (the words "[WORDS:", a space, then its id) until the approved line is pasted in; the app's own
// slots are in src/lib/freeWords.js, and both are listed in docs/product/FREE-V1-WORDS.md.
// tests/freeV1Words.test.cjs fails while it is a placeholder, and scripts/check-pending-words.mjs refuses the
// production build (it reads netlify/functions too).
// -----------------------------------------------------------------------------
"use strict";

const FREE_SERVER_WORDS = Object.freeze({
  "free-server-bank": "[WORDS: free-server-bank]",
});

function freeServerWords(id) {
  const w = FREE_SERVER_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  return w;
}

module.exports = { FREE_SERVER_WORDS, freeServerWords };
