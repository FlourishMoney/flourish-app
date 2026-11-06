// netlify/edge-functions/clarity-gate.js
// -----------------------------------------------------------------------------
// MAY THIS VISITOR'S BROWSER LOAD MICROSOFT CLARITY? (Amanda, 2026-11-06.) GET /api/clarity-gate answers {"load":true} or
// {"load":false}, decided here at the Netlify edge from where the request comes from, and nothing else.
//
//   - Never for Quebec (country CA, subdivision QC), the EEA (the EU, Iceland, Liechtenstein, Norway), the UK or
//     Switzerland. A country Netlify cannot name, or a Canadian visitor whose province it cannot name, is "no".
//   - Never until CLARITY_ENABLED is exactly "true" (set on launch day, with the privacy policy's Clarity words, for the
//     production context only, so a deploy preview never records).
//   - Nothing is kept. No IP address and no answer is logged or stored: there is no console call here, the response says
//     private, no-store so no cache holds it, and it carries no geo value back. The page asks again on each visit.
//
// Who calls it: the website's public pages, after they are interactive (src/lib/webClarity.js for the app's landing, demo
// and legal pages; public/clarity/loader.js for /get and the guides). A store app never does (tests/clarity.test.cjs).
// -----------------------------------------------------------------------------

// The EEA: the 27 EU countries (with the EU's outermost regions that have their own country codes, and Åland), Iceland,
// Liechtenstein and Norway.
export const EEA = Object.freeze([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "AX", "GF", "GP", "MQ", "RE", "YT", "MF",
  "IS", "LI", "NO",
]);
export const BLOCKED_COUNTRIES = Object.freeze([...EEA, "GB", "CH"]);

const code = (v) => (typeof v === "string" && /^[A-Za-z0-9]{1,3}$/.test(v.trim()) ? v.trim().toUpperCase() : "");

export function clarityAllowed({ enabled = false, country = "", subdivision = "" } = {}) {
  if (enabled !== true) return false;
  const c = code(country);
  if (!c || BLOCKED_COUNTRIES.includes(c)) return false;
  if (c === "CA") {
    const s = code(subdivision);
    if (!s || s === "QC") return false;
  }
  return true;
}

function flagOn() {
  try { return typeof Netlify !== "undefined" && Netlify.env.get("CLARITY_ENABLED") === "true"; } catch { return false; }
}

export default async function clarityGate(_request, context) {
  const geo = (context && context.geo) || {};
  const load = clarityAllowed({
    enabled: flagOn(),
    country: geo.country && geo.country.code,
    subdivision: geo.subdivision && geo.subdivision.code,
  });
  return new Response(load ? '{"load":true}' : '{"load":false}', {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}

export const config = { path: "/api/clarity-gate" };
