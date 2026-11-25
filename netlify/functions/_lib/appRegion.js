// netlify/functions/_lib/appRegion.js
// -----------------------------------------------------------------------------
// The server's copy of src/lib/appRegion.js (canada-lock, 2026-11-25): flourish is Canada only, so with
// APP_REGION unset (flourish's site) the country is always "CA", whatever the app sends. A site with
// APP_REGION="US" (the future US app) keeps the behaviour from before the lock. The rule is the app's own;
// tests/canadaLock.test.cjs checks the two copies answer alike. Read at call time, so a setting change needs no
// code change.
// -----------------------------------------------------------------------------
"use strict";

function normalizeRegion(raw) {
  return String(raw ?? "").trim().toUpperCase() === "US" ? "US" : "CA";
}

function appRegion(env = process.env) {
  return normalizeRegion(env && env.APP_REGION);
}

function appCountry(candidate, region = appRegion()) {
  if (normalizeRegion(region) === "CA") return "CA";
  return String(candidate ?? "").trim().toUpperCase() === "US" ? "US" : "CA";
}

function plaidCountryCodes(candidate, region = appRegion()) {
  return [appCountry(candidate, region)];
}

module.exports = { normalizeRegion, appRegion, appCountry, plaidCountryCodes };
