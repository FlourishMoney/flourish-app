// netlify/functions/trial-plan-first.js   (GET /api/trial-plan-first)
// -----------------------------------------------------------------------------
// Is TRIAL_PLAN_FIRST on? For the screens a person sees before signing in (the website's landing, the app's first
// onboarding screen), which must not say "no card" once a card is needed. 200 { on: true, since } while it is on; 404
// while it is off, like every endpoint that is not open yet. Reads nothing, needs no account, says nothing else.
// since: TRIAL_PLAN_FIRST_SINCE as a full UTC time, for the Terms' section 7 ("An account opened before {date}").
// -----------------------------------------------------------------------------
"use strict";

const { corsHeadersFor } = require("./_lib/cors");
const { trialPlanFirstSince } = require("./_lib/planRules");

exports.handler = async (event) => {
  const CORS = { ...corsHeadersFor(event), "Cache-Control": "public, max-age=60" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  const since = trialPlanFirstSince();
  if (since === null) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: "not_found" }) };
  return { statusCode: 200, headers: CORS, body: JSON.stringify({ on: true, since: new Date(since).toISOString() }) };
};
