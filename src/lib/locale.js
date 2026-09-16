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
