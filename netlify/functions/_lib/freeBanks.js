// netlify/functions/_lib/freeBanks.js
// -----------------------------------------------------------------------------
// HOW MANY BANKS THE FREE PLAN CONNECTS (free v1 on the website, 2026-11-23). Plaid bills every connected bank, so
// the free plan connects none from the website. Only an account without unlimited access is asked (_lib/auth.js
// getUserPlan: a paid plan, a trial, a founder, a gift year or a partner's cover is unlimited and never counted).
//
// THE STORE APPS KEEP TODAY'S RULE, ONE BANK, until their next builds are live (the founder, 2026-11-23). Their screens
// are bundled inside them and ask for a bank during onboarding, before the store trial; refusing it there would send
// every new phone user to an error the installed apps cannot explain. When the new store builds are live, this becomes
// 0 too: one line, STORE_APP_FREE_BANKS below.
//
// Told apart by the Origin the two store apps' WebViews send (_lib/cors.js isNativeRequest). A caller that pretends to
// be a store app gets today's one-bank rule, never more: the same as every Free account had before this change.
// -----------------------------------------------------------------------------
"use strict";

const { isNativeRequest } = require("./cors");

const WEBSITE_FREE_BANKS = 0;
const STORE_APP_FREE_BANKS = 1;

/** The number of banks an account WITHOUT unlimited access may hold, for this request. */
function freeBankCap(event) {
  return isNativeRequest(event) ? STORE_APP_FREE_BANKS : WEBSITE_FREE_BANKS;
}

module.exports = { freeBankCap, WEBSITE_FREE_BANKS, STORE_APP_FREE_BANKS };
