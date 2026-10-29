// tests/_sampleWords.cjs
// -----------------------------------------------------------------------------
// SAMPLE WORDS FOR THE EMAILS' PLACEHOLDERS (2026-10-29). The founding and welcome emails refuse to send while a
// line is still "[WORDS: id]" (netlify/functions/_lib/pendingWords.js). The tests that check how those emails are
// built and sent (the allowlist, the Idempotency-Key, the consent version, the HTML) stand sample words in for the
// placeholders, so they keep checking all of that until the real words are written. Each sample names its id.
//   useSampleWords()  the server's pendingWords module answers samples; the modules that read it reload
//   useRealWords()    back to the real module
// -----------------------------------------------------------------------------
"use strict";
const path = require("path");

const FN = path.join(__dirname, "..", "netlify", "functions");
const WORDS_PATH = require.resolve(path.join(FN, "_lib", "pendingWords.js"));
const READERS = ["_lib/foundingLinkEmail.js", "_lib/foundingWaitlist.js", "_lib/waitlistWelcome.js", "founding-link-sweep.js", "waitlist-sweep.js", "beta.js"]
  .map((f) => path.join(FN, f));

const sample = (id) => `Sample words for ${id}.`;

function reloadReaders() {
  for (const f of READERS) { try { delete require.cache[require.resolve(f)]; } catch { /* not loaded */ } }
}

function useSampleWords() {
  delete require.cache[WORDS_PATH];
  const real = require(WORDS_PATH);
  const PENDING_WORDS = Object.freeze(Object.fromEntries(Object.keys(real.PENDING_WORDS).map((id) => [id, sample(id)])));
  require.cache[WORDS_PATH].exports = { ...real, PENDING_WORDS, pendingWords: (id) => { if (!(id in PENDING_WORDS)) throw new Error(`no such words: ${id}`); return PENDING_WORDS[id]; } };
  reloadReaders();
}

function useRealWords() {
  delete require.cache[WORDS_PATH];
  reloadReaders();
}

module.exports = { useSampleWords, useRealWords, sample };
