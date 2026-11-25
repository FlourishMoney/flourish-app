// src/lib/appRegion.js
// -----------------------------------------------------------------------------
// WHICH MARKET THIS BUILD SERVES (canada-lock, 2026-11-25). flourish is Canada only. A separate US app will be
// built later from this same code under its own name, so the US code paths stay (CC.US, TAX_DATA.US, the US demo,
// payWord("US") and the rest), reachable only in a build made with APP_REGION="US".
//
// APP_REGION is a build-time setting: vite.config.js bakes process.env.APP_REGION in as import.meta.env.APP_REGION
// (through normalizeRegion below). flourish builds with it unset, which is "CA". The server reads the same
// variable (netlify/functions/_lib/appRegion.js, which holds this same rule; tests/canadaLock.test.cjs checks
// the two agree).
//
// In the CA region the country is always "CA", whatever the device's language or time zone, the store's country,
// or a profile saved as "US" (by the old device rule or the Settings picker). Everything that reads
// profile.country (words, tax and benefit tips, currency via baseCurrencyOf, Plaid) then follows by construction.
// In the US region the country passes through as it did before this lock (US is US, anything else Canada); the
// US app may tighten that when it is built.
// -----------------------------------------------------------------------------

// "US" only for an exact US (any case, trimmed); anything else, including nothing, is Canada.
export function normalizeRegion(raw) {
  return String(raw ?? "").trim().toUpperCase() === "US" ? "US" : "CA";
}

// import.meta.env exists only in a Vite (or esbuild-with-define) build; under plain node it is undefined, and
// reading it throws, which means the default: Canada.
function buildTimeRegion() {
  try { return import.meta.env.APP_REGION; } catch { return undefined; }
}

export const APP_REGION = normalizeRegion(buildTimeRegion());

// The household's country for this build. `candidate` is whatever a signal says (the device, the store, a saved
// profile, the Settings picker).
export function appCountry(candidate, region = APP_REGION) {
  if (normalizeRegion(region) === "CA") return "CA";
  return String(candidate ?? "").trim().toUpperCase() === "US" ? "US" : "CA";
}

// The country list for Plaid's /link/token/create.
export function plaidCountryCodes(candidate, region = APP_REGION) {
  return [appCountry(candidate, region)];
}

// App data as it loads (from this device or the server), with its profile's country locked. A profile that is
// already Canadian comes back as the same object, so nothing re-renders or re-saves for it. A profile that was
// US loses its US state code too, as the Settings picker does when the country changes (province unset).
// The household's own currency (profile.baseCurrency, read by baseCurrencyOf) is CAD: a saved non-CAD value is
// replaced. Accounts are not touched: a bank account Plaid reports in USD stays USD (Canadians hold US-dollar
// accounts) and is read as held apart from CAD, as it always has been for a Canadian household.
export function lockCountry(appData, region = APP_REGION) {
  const p = appData && appData.profile;
  if (!p || normalizeRegion(region) !== "CA") return appData;
  const savedBase = p.baseCurrency == null || p.baseCurrency === "" ? null : String(p.baseCurrency).trim().toUpperCase();
  const baseOk = savedBase === null || savedBase === "CAD";
  if (p.country === "CA" && baseOk) return appData;
  const wasUS = String(p.country ?? "").trim().toUpperCase() === "US";
  return { ...appData, profile: { ...p, country: "CA", ...(wasUS ? { province: "" } : {}), ...(baseOk ? {} : { baseCurrency: "CAD" }) } };
}
