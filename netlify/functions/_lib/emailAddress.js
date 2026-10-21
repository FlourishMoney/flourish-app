// netlify/functions/_lib/emailAddress.js
// -----------------------------------------------------------------------------
// THE SERVER'S COPY OF src/lib/emailAddress.js (tests/emailAddress.test.cjs holds the two together).
// Every space-like character is removed before an address is checked or used: a phone keyboard adds them
// (a space after a predictive-text suggestion, a no-break or zero-width character), and an address with
// one was refused as invalid_email although the person typed it correctly. A plus sign and every other
// character Supabase accepts are kept exactly as typed.
// -----------------------------------------------------------------------------
"use strict";

const SPACES = /[\s​-‍⁠﻿]+/g;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(value) {
  return String(value == null ? "" : value).replace(SPACES, "").toLowerCase();
}

function isEmail(value) {
  return EMAIL_RX.test(value);
}

module.exports = { cleanEmail, isEmail, EMAIL_RX };
