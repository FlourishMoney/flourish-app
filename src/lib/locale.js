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
 * The BCP-47 tag for date and number formatting. Falls back to en-CA, matching the app's default
 * profile country.
 *
 * READ THIS BEFORE USING IT TO "FIX" A HARD-CODED "en-CA". An earlier version of this comment
 * claimed those hard-coded tags "format a US visitor's dates by Canadian conventions". That was
 * asserted, not measured, and it is false for every option-shape this app actually passes. Measured:
 *
 *   {weekday:"long", month:"long", day:"numeric"}   en-CA === en-US   "Wednesday, September 16"
 *   {month:"short",  day:"numeric"}                 en-CA === en-US   "Sep 16"
 *   {weekday:"short",month:"short",day:"numeric"}   en-CA === en-US   "Wed, Sep 16"
 *   {month:"long",   year:"numeric"}                en-CA === en-US   "September 2026"
 *   {month:"long",   day:"numeric", year:"numeric"} en-CA === en-US   "September 16, 2026"
 *   {weekday:"short",day:"numeric"}                 DIFFERS: en-CA "Wed 16" vs en-US "16 Wed"
 *
 * The only shape that differs is the one where en-CA produces the BETTER string for both audiences
 * — so meetSnapshot's hard-coded "en-CA" at that shape is correct and must be left alone. Swapping
 * tags wholesale would degrade US output, not improve it. Use this helper where you have checked the
 * output of the specific shape; do not sweep for "en-CA".
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

/**
 * The tax-sheltered retirement accounts this country's users actually hold. The Money Personality
 * "Wealth Builder" coach insight told every user to max their "RRSP/TFSA" — Canadian registered
 * accounts a US household cannot open — on two surfaces with no country gate. Both names are
 * accounts this product already teaches (CC.CA.taxTips covers the RRSP and TFSA, CC.US.taxTips
 * covers the 401(k) and the Roth IRA), so nothing new is invented here.
 */
export function retirementAccountsLabel(country) {
  return isUS(country) ? "401(k)/IRA" : "RRSP/TFSA";
}
