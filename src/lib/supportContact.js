// src/lib/supportContact.js
// -----------------------------------------------------------------------------
// THE CONTACT DETAILS ON /support.
//
// Apple requires the support URL in App Store Connect to show real contact information, and a
// reviewer reads it literally. The email is real. The operator's legal name and mailing address are
// Amanda's to supply: they are NOT to be guessed, abbreviated or copied from somewhere that merely
// looks right, because a wrong address on a support page is worse than none.
//
// SUPPORT_OPERATOR_NAME_AND_ADDRESS is shown exactly as written, one line per "\n", for example:
//   "Company Name Inc.\n123 Street\nCity, Province A1A 1A1\nCanada"
// Until it is filled, the page shows the placeholder itself, so an unfilled page is obvious.
// -----------------------------------------------------------------------------

export const SUPPORT_EMAIL = "hello@flourishmoney.app";

export const SUPPORT_OPERATOR_NAME_AND_ADDRESS = "GrowSmart Inc.\nPO Box 29\nFoxboro, Ontario K0K 2B0\nCanada";
