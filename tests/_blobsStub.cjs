// tests/_blobsStub.cjs
// -----------------------------------------------------------------------------
// A stateless stand-in for @netlify/blobs, for suites that run beta.js's waitlist and signup paths but are not
// about the rate limiter (tests/signupLimit.test.cjs owns that). Outside Netlify getStore throws and the limiter
// rightly fails closed, which would make every join a 429 (join_waitlist is metered since 2026-10-26, H3). Every
// read here is empty, so the limiter never refuses; nothing is kept. Install before beta.js is required.
// -----------------------------------------------------------------------------
"use strict";
const BLOBS_PATH = require.resolve("@netlify/blobs", { paths: [require("path").join(__dirname, "..", "netlify", "functions")] });

// setDown(true): getStore throws, as it does outside Netlify, so the limiter refuses (fails closed).
let down = false;
function setDown(v) { down = !!v; }
function install() {
  require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true,
    exports: { getStore: () => {
      if (down) throw new Error("blobs unavailable (test)");
      return { async get() { return null; }, async setJSON() {}, async delete() {}, async list() { return { blobs: [] }; } };
    } } };
  if (!process.env.LIMITER_HASH_SECRET) process.env.LIMITER_HASH_SECRET = "test-limiter-secret";
  return { setDown };
}

module.exports = { install, setDown, BLOBS_PATH };
