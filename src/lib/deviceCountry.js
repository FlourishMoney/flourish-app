// src/lib/deviceCountry.js
// -----------------------------------------------------------------------------
// THE COUNTRY A NEW HOUSEHOLD STARTS WITH (onboarding, 2026-10-23). Onboarding no longer asks, so it is read from
// the device: the region of its language (the first of navigator.languages that names one, then Intl's own
// locale) and its time zone. A US region or a US time zone means the United States; anything else, Canada.
// Editable in Settings (Profile & Income: Country). Onboarding passes it to Plaid's institution search
// (create_link_token's country), so a US household is shown US banks.
// -----------------------------------------------------------------------------

// The IANA zones of the fifty states, and their old US/* names.
const US_ZONES = new Set([
  "America/New_York", "America/Detroit", "America/Chicago", "America/Menominee", "America/Denver", "America/Boise",
  "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "America/Juneau", "America/Sitka", "America/Metlakatla",
  "America/Yakutat", "America/Nome", "America/Adak", "Pacific/Honolulu",
  "America/Indianapolis", "America/Fort_Wayne", "America/Louisville", "America/Knox_IN", "Navajo",
]);
const US_ZONE_PREFIXES = ["America/Indiana/", "America/Kentucky/", "America/North_Dakota/", "US/"];

export function isUsTimeZone(zone) {
  const z = typeof zone === "string" ? zone : "";
  return US_ZONES.has(z) || US_ZONE_PREFIXES.some((p) => z.startsWith(p));
}

// The region of a language tag ("en-US" -> "US", "zh-Hant-TW" -> "TW", "en_CA" -> "CA"), or null when it has none.
export function regionOf(tag) {
  const parts = typeof tag === "string" ? tag.split(/[-_]/) : [];
  for (let i = 1; i < parts.length; i++) {
    if (/^[A-Za-z]{4}$/.test(parts[i])) continue;                 // a script
    if (/^[A-Za-z]{2}$/.test(parts[i]) || /^\d{3}$/.test(parts[i])) return parts[i].toUpperCase();
    break;
  }
  return null;
}

// "US" or "CA". With no arguments it reads this device; the arguments are for tests.
export function deviceCountry({ languages, timeZone } = {}) {
  let langs = languages, zone = timeZone;
  try {
    if (langs === undefined) {
      const nav = typeof navigator !== "undefined" ? navigator : null;
      langs = [...((nav && nav.languages) || []), nav && nav.language, Intl.DateTimeFormat().resolvedOptions().locale];
    }
    if (zone === undefined) zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch { /* no navigator or Intl: Canada */ }
  const region = (langs || []).map(regionOf).find(Boolean) || null;
  return region === "US" || isUsTimeZone(zone) ? "US" : "CA";
}
