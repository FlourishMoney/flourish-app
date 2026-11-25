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

import { baseCurrencyOf } from "./financialCalculations.js";

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
// The household's own currency (profile.baseCurrency, read by baseCurrencyOf) is CAD: any saved value that is
// not exactly "CAD" (" cad ", "USD") is written back as "CAD". A bank account that states its currency keeps it:
// one Plaid reports in USD stays USD (Canadians hold US-dollar accounts) and is held apart from CAD totals.
// An account that states NO currency is read as the household's base (accountCurrencyOf), so when the base
// moves off something else (a US household's USD) every such account in data.accounts (bank, manual balances,
// statement imports: the only list the currency code reads) is first stamped with that old base. Otherwise a
// US household's dollars would silently count as Canadian ones.
export function lockCountry(appData, region = APP_REGION) {
  const p = appData && appData.profile;
  if (!p || normalizeRegion(region) !== "CA") return appData;
  const hasSavedBase = !(p.baseCurrency == null || p.baseCurrency === "");
  if (p.country === "CA" && (!hasSavedBase || p.baseCurrency === "CAD")) return appData;
  // The base before the lock: exactly what the app read (baseCurrencyOf), trimmed. Not the lock's own reading of
  // the country: baseCurrencyOf treats only an exact "US" as USD, so a saved " us " was CAD to the app and its
  // unstamped accounts were counted as CAD (review round 2).
  const oldBase = String(baseCurrencyOf(appData)).trim().toUpperCase();
  const wasUS = String(p.country ?? "").trim().toUpperCase() === "US";
  const next = { ...appData, profile: { ...p, country: "CA", ...(wasUS ? { province: "" } : {}), ...(hasSavedBase ? { baseCurrency: "CAD" } : {}) } };
  if (oldBase && oldBase !== "CAD" && Array.isArray(appData.accounts) && appData.accounts.some((a) => a && !a.currency)) {
    next.accounts = appData.accounts.map((a) => (a && !a.currency ? { ...a, currency: oldBase } : a));
  }
  return next;
}
