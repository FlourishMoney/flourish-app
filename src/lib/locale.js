// src/lib/locale.js
// -----------------------------------------------------------------------------
// The ONE place a user-facing word changes spelling by country.
//
// Why this exists: "paycheque"/"paycheck" was open-coded as an inline ternary at
// seven render sites and hard-coded Canadian at eight more, so a US user read
// "paycheque" on Today, in onboarding, in the income-detection banner and in the
// Plan Ahead table while reading "paycheck" three screens away. Inline ternaries
// do not scale — every new surface is one more chance to forget — so the spelling
// rule lives here and the surfaces ask for it.
//
// Pure. Takes the country code explicitly (never reads global state), so a caller
// with no source for country has to say so rather than silently defaulting.
// -----------------------------------------------------------------------------

export function isUS(country) {
  return String(country || "").trim().toUpperCase() === "US";
}

/**
 * The spelling of "paycheque"/"paycheck" for a country.
 * @param {string} country  ISO-ish country code from profile.country ("CA" | "US" | …)
 * @param {{plural?: boolean, capital?: boolean}} [opts]
 */
export function payWord(country, { plural = false, capital = false } = {}) {
  const base = isUS(country) ? "paycheck" : "paycheque";
  const word = plural ? `${base}s` : base;
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/**
 * The tax-sheltered investment account this country's users actually have, for the Autopilot
 * "Move to …" label. decisionEngine hard-coded "TFSA / Investment", so a US household was told to
 * move money into a Canadian registered account. Both names are accounts this product already
 * teaches (CC.CA.taxTips covers the TFSA, CC.US.taxTips covers the Roth IRA) — nothing new is
 * invented here, and the Canadian string is unchanged.
 */
export function shelterLabel(country) {
  return isUS(country) ? "Roth IRA / Investment" : "TFSA / Investment";
}

/**
 * The BCP-47 tag for date and number formatting. Several modules hard-coded "en-CA", which formats
 * a US visitor's dates by Canadian conventions. Falls back to en-CA, matching the app's default
 * profile country.
 */
export function localeTag(country) {
  return isUS(country) ? "en-US" : "en-CA";
}

/**
 * What this country calls a high-interest savings account. "HISA" is Canadian banking vocabulary;
 * an American reader has most likely never seen the acronym. The savings-opportunity card said
 * "A HISA at 4%+ earns $90/yr" to everyone.
 */
export function savingsAccountTerm(country) {
  return isUS(country) ? "a high-yield savings account" : "a HISA";
}
