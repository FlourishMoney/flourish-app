"use strict";
// Deterministic numeric guard for the Meet facilitator's OUTPUT (server-side, facilitator only).
//
// The facilitator must never state a number that the deterministic agenda did not supply, and must
// never DERIVE one (counts, ratios, percentages, totals, averages) even from agenda numbers. Prompt
// hardening reduces this but cannot guarantee it, so this guard validates the model's prose after the
// fact. It does NOT merely check "does this digit appear somewhere in the agenda" — that would pass an
// invented relationship like "5 of 7 days" whenever 5 and 7 each appear separately. Instead it:
//   1. builds a canonical allow-list of agenda numeric facts (value + unit), and
//   2. fails any compound "N of M" / percentage / labelled total-or-average, and any bare figure,
//      that is not present verbatim in the agenda in a matching unit/context.
// Structural exceptions are phrase-specific (e.g. the literal "15-minute" meeting length), never a
// bare-number whitelist. Scope: facilitator only. Not applied to chat or checkin in this pass.

// ── normalization ────────────────────────────────────────────────────────────────────────────
function normNum(s) {
  const n = parseFloat(String(s).replace(/,/g, "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
// Lowercased, comma-stripped, "out of" → "of", whitespace-collapsed — for compound-phrase substring tests.
function normalizeForCompound(text) {
  return String(text || "").toLowerCase().replace(/\bout of\b/g, "of").replace(/,/g, "").replace(/\s+/g, " ");
}

const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;
// "N of M" / "N out of M" — a derived count/ratio.
const OF_RE = /(\d[\d,]*(?:\.\d+)?)\s*(?:of|out of)\s*(\d[\d,]*(?:\.\d+)?)/gi;

// Classify one numeric token by the unit implied by its immediate surroundings.
function classify(text, index, raw) {
  const before = text.slice(Math.max(0, index - 10), index);
  const after = text.slice(index + raw.length, index + raw.length + 14);
  const value = normNum(raw);
  let unit = "plain";
  if (/^\s*%/.test(after) || /^\s*percent/i.test(after)) unit = "percent";
  else if (/^\s*(?:months?|mos?\b)/i.test(after)) unit = "months";
  else if (/^\s*weeks?/i.test(after)) unit = "weeks";
  else if (/^\s*days?/i.test(after)) unit = "days";
  else if (/^\s*years?/i.test(after)) unit = "years";
  else if (/\$\s*$/.test(before) || /^\s*dollars?/i.test(after)) unit = "currency";
  else if (/(?:mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*$/i.test(before) || /^\s*(?:st|nd|rd|th)\b/.test(after)) unit = "date";
  return { value, unit, index, len: raw.length, raw };
}

function tokens(text) {
  const out = [];
  let m;
  const re = new RegExp(NUM_RE);
  while ((m = re.exec(text))) out.push(classify(text, m.index, m[0]));
  return out;
}

// Canonical allow-list: every numeric fact the agenda actually states, as {value, unit}.
function extractAgendaFacts(agendaText) {
  return tokens(String(agendaText || ""));
}

function unitCompatible(factUnit, claimUnit) {
  if (factUnit === claimUnit) return true;
  // dates are fuzzy across day/date phrasing; keep currency/percent/duration strict so an invented
  // "$85 average" or "71%" can't borrow a same-valued figure of a different kind.
  if ((factUnit === "date" && claimUnit === "days") || (factUnit === "days" && claimUnit === "date")) return true;
  return false;
}

// Phrase-specific structural exception: the literal "15-minute" meeting length (never a bare-15 whitelist).
function isStructuralException(text, tok) {
  if (tok.value !== 15) return false;
  const around = text.slice(Math.max(0, tok.index - 2), tok.index + tok.len + 9);
  return /\b15[-\s]?min(?:ute)?s?\b/i.test(around);
}

// Validate facilitator prose against the agenda. Returns { ok, violations: [{text, reason}] }.
function validateFacilitatorProse(prose, agendaText) {
  const violations = [];
  const facts = extractAgendaFacts(agendaText);
  const agendaNorm = normalizeForCompound(agendaText);

  // 1) compound "N of M" — must appear verbatim in the agenda (so "5 of 7" fails even when 5 and 7
  //    each appear separately elsewhere).
  const compoundSpans = [];
  let m;
  const of = new RegExp(OF_RE);
  while ((m = of.exec(prose))) {
    compoundSpans.push([m.index, m.index + m[0].length]);
    const phrase = `${normNum(m[1])} of ${normNum(m[2])}`;
    if (!agendaNorm.includes(phrase)) {
      violations.push({ text: m[0].trim(), reason: `derived count/ratio "${m[0].trim()}" is not stated in the agenda` });
    }
  }

  // 2) every other numeric token must match an agenda fact by value AND unit.
  for (const tok of tokens(prose)) {
    if (Number.isNaN(tok.value)) continue;
    if (compoundSpans.some(([a, b]) => tok.index >= a && tok.index < b)) continue; // handled above
    if (isStructuralException(prose, tok)) continue;
    const supported = facts.some((f) => f.value === tok.value && unitCompatible(f.unit, tok.unit));
    if (!supported) {
      const snippet = prose.slice(Math.max(0, tok.index - 12), tok.index + tok.len + 12).replace(/\s+/g, " ").trim();
      violations.push({ text: tok.raw, reason: `figure "${tok.raw}" (${tok.unit}) is not in the agenda — near "…${snippet}…"` });
    }
  }
  return { ok: violations.length === 0, violations };
}

// Safe qualitative fallback — contains NO numbers and no FLOURISH_UPDATE.
const SAFE_FACILITATOR_FALLBACK =
  "Let's stick to what Flourish already calculated on your agenda — I don't want to introduce any figure that isn't there. " +
  "Tell me which item you'd like to start with: a win, an upcoming bill, or the decision, and I'll reflect back exactly what the agenda says.";

// Decide which output to use: the model's first reply if clean, else a validated retry, else the safe
// fallback. Pure and deterministic (no network) so it can be unit-tested directly.
function resolveFacilitatorOutput(agendaText, firstProse, retryProse) {
  if (validateFacilitatorProse(firstProse, agendaText).ok) return { kind: "first", text: firstProse };
  if (retryProse != null && validateFacilitatorProse(retryProse, agendaText).ok) return { kind: "retry", text: retryProse };
  return { kind: "fallback", text: SAFE_FACILITATOR_FALLBACK };
}

module.exports = {
  normNum,
  extractAgendaFacts,
  validateFacilitatorProse,
  resolveFacilitatorOutput,
  SAFE_FACILITATOR_FALLBACK,
};
