// netlify/functions/_lib/blobsContext.js
// -----------------------------------------------------------------------------
// NETLIFY BLOBS NEEDS ITS CONTEXT IN A LAMBDA-STYLE FUNCTION (2026-10-20 incident).
//
// beta.js, coach.js and billing.js are `exports.handler` functions (Netlify's Lambda compatibility
// mode). In that mode @netlify/blobs does not find its context in the environment: Netlify passes it on
// the event (event.blobs, with the site and deploy ids in the headers), and connectLambda(event) must be
// called before getStore. Without it, getStore throws "The environment has not been configured to use
// Netlify Blobs", and each caller's fallback ran instead:
//   beta.js     the signup limiter fails closed, so EVERY signup, resend and code check was refused
//               with "Too many attempts. Try again in an hour." (signup is open since 2026-10-20);
//   billing.js  the founding confirmation link's send counter refuses, so no link could be sent;
//   coach.js    the per-IP backstop fails open (the per-account limits still apply).
//
// Call connectBlobs(event) first in every handler that uses getStore. It never throws: an event with
// no Blobs context (a test, a local run) leaves the environment as it was, and the caller's own
// fail-closed or fail-open rule still decides.
// -----------------------------------------------------------------------------
"use strict";

const { connectLambda } = require("@netlify/blobs");

function connectBlobs(event) {
  try {
    if (event && typeof event.blobs === "string" && event.blobs) connectLambda(event);
  } catch (e) {
    console.error("[blobs] could not read the Blobs context from the event:", e.message);
  }
}

module.exports = { connectBlobs };
