// src/lib/deviceCountry.js
// -----------------------------------------------------------------------------
// THE COUNTRY A NEW HOUSEHOLD STARTS WITH (onboarding, 2026-10-23). Onboarding no longer asks, so it is read from
// the device: its time zone and the region of its language (the first of navigator.languages that names one,
// then Intl's own locale), in this order: a Canadian time zone means Canada (many browsers in Canada report
// en-US); else a US time zone or a US region means the United States; else Canada.
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

// The IANA zones of the provinces and territories, and their old Canada/* names.
const CA_ZONES = new Set([
  "America/St_Johns", "America/Halifax", "America/Glace_Bay", "America/Moncton", "America/Goose_Bay", "America/Toronto",
  "America/Montreal", "America/Nipigon", "America/Thunder_Bay", "America/Iqaluit", "America/Pangnirtung", "America/Winnipeg",
  "America/Rainy_River", "America/Resolute", "America/Rankin_Inlet", "America/Regina", "America/Swift_Current",
  "America/Edmonton", "America/Cambridge_Bay", "America/Yellowknife", "America/Inuvik", "America/Dawson_Creek",
  "America/Fort_Nelson", "America/Creston", "America/Vancouver", "America/Whitehorse", "America/Dawson",
  "America/Atikokan", "America/Coral_Harbour", "America/Blanc-Sablon",
]);

export function isCanadianTimeZone(zone) {
  const z = typeof zone === "string" ? zone : "";
  return CA_ZONES.has(z) || z.startsWith("Canada/");
}

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
  if (isCanadianTimeZone(zone)) return "CA";
  return region === "US" || isUsTimeZone(zone) ? "US" : "CA";
}
