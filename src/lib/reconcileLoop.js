// src/lib/reconcileLoop.js
// -----------------------------------------------------------------------------
// THE LOOP THE PRODUCT PROMISES: detect, ask, apply, remember.
//
// Flourish is supposed to get better at a household's situation over time. Exactly one
// feature did that — income reconciliation — and the loop was welded to income:
// detectionSignature/incomeDifferences/shouldPromptIncome in incomeReconcile.js, with the
// remembering done by hand in a JSX click handler (App.jsx). This module is that same
// shape with the income taken out, so bills, categories and anything later can reuse it.
//
// THE FOUR PARTS
//   detect    a domain detector produces a SIGNATURE for "this same finding" and a list of
//             DIFFERENCES (reason codes) against what the household currently has
//   ask       decidePrompt() turns those into a yes/no with a reason
//   apply     the domain applies its own answer — this module never touches domain data
//   remember  a dismissal is stored against the signature, so the same question is not
//             asked twice, while a materially different finding still gets to ask
//
// WHY A SIGNATURE RATHER THAN A FLAG: "don't ask again" must expire when the facts change.
// A flag would silence the question forever; a signature silences exactly one answer to it.
//
// This module is pure and knows nothing about React, storage or any domain.
// -----------------------------------------------------------------------------

// Every reason a prompt can be withheld or raised. Domains may add their own blocking reason
// (income uses "no-current-income"), but these four are the shared vocabulary.
export const NO_DETECTION    = "no-detection";
export const DISMISSED       = "dismissed";
export const WITHIN_TOLERANCE = "within-tolerance";
export const DIFFERS         = "differs";

/**
 * Should the household be asked about this finding?
 *
 * @param {string|null} signature          stable id for this finding; null = nothing detected
 * @param {string[]}    differences        reason codes; empty = nothing worth asking about
 * @param {string|null} dismissedSignature the signature the household already declined
 * @param {string|null} blockedReason      a domain guard that outranks everything but no-detection
 *
 * Returns { prompt, reason, signature } and, when prompting, `reasons`.
 *
 * GUARD ORDER IS LOAD-BEARING and matches what income has always done:
 *   no signature       -> no-detection, and the signature is reported as null, not as itself
 *   blocked by domain  -> that reason, BEFORE the dismissal is consulted
 *   dismissed          -> dismissed
 *   no differences     -> within-tolerance
 *   otherwise          -> differs
 * The blocked-before-dismissed order matters: a household with nothing to compare against is
 * not "dismissed", and must not have a dismissal recorded against a question never asked.
 */
export function decidePrompt({ signature = null, differences = [], dismissedSignature = null, blockedReason = null } = {}) {
  if (!signature) return { prompt: false, reason: NO_DETECTION, signature: null };
  if (blockedReason) return { prompt: false, reason: blockedReason, signature };
  if (dismissedSignature && dismissedSignature === signature) return { prompt: false, reason: DISMISSED, signature };
  const reasons = Array.isArray(differences) ? differences.filter(Boolean) : [];
  if (reasons.length === 0) return { prompt: false, reason: WITHIN_TOLERANCE, signature };
  return { prompt: true, reason: DIFFERS, signature, reasons };
}


// ── How long a "no" lasts ───────────────────────────────────────────────────────────────────────
// Settled product decision: a dismissal holds for as long as the pattern holds, reopens
// IMMEDIATELY when the amount or cadence materially changes, and reopens ONCE after twelve
// months — and never sooner.
//
// The first two need no clock: the signature encodes the amount and the cadence, so a material
// change is a different signature and is asked about at once, while an unchanged pattern keeps
// matching its dismissal. Only the third needs a date, so a dismissal is recorded as
// { signature, at } and expires 365 days later. Dismissing again starts a fresh clock, which is
// what makes it reopen once rather than repeatedly.
export const DISMISSAL_REOPEN_DAYS = 365;
const DAY_MS = 86400000;

// Accepts a bare signature string (what was stored before there was a clock) or { signature, at }.
export function normaliseDismissal(entry) {
  if (!entry) return null;
  if (typeof entry === "string") return { signature: entry, at: null };
  if (!entry.signature || typeof entry.signature !== "string") return null;
  return { signature: entry.signature, at: entry.at || null };
}

// Is this dismissal still holding?
//
// An entry with no date holds. It predates the clock, and the alternative — treating an unknown
// date as expired — would reopen every existing dismissal at once, which is the one thing
// "never sooner" rules out.
export function isDismissalActive(entry, now = Date.now()) {
  const d = normaliseDismissal(entry);
  if (!d) return false;
  if (!d.at) return true;
  const at = Date.parse(d.at);
  if (!Number.isFinite(at)) return true;
  const t = now instanceof Date ? now.getTime() : now;
  return (t - at) < DISMISSAL_REOPEN_DAYS * DAY_MS;
}

// The signatures still suppressed, from a mixed list of strings and { signature, at } records.
export function activeDismissedSignatures(list, now = Date.now()) {
  return (Array.isArray(list) ? list : [])
    .filter(e => isDismissalActive(e, now))
    .map(e => normaliseDismissal(e).signature);
}

// ── Remembering ─────────────────────────────────────────────────────────────────────────────────
// Where each domain's dismissal lives on appData. Income keeps the field it has always used, so
// a household mid-flight does not suddenly get re-asked a question it already declined.
export const DISMISSAL_FIELD = Object.freeze({
  income: "incomeSuggestionDismissed",
  bills:  "billSuggestionDismissed",
});

export function dismissalFieldFor(domain) {
  const field = DISMISSAL_FIELD[domain];
  if (!field) throw new Error(`reconcileLoop: unknown domain "${domain}"`);
  return field;
}

export function dismissedSignatureFor(appData, domain) {
  return (appData || {})[dismissalFieldFor(domain)] || null;
}

// Patches to merge into appData. Returned rather than applied: this module does no writing.
export function rememberDismissal(domain, signature) {
  return { [dismissalFieldFor(domain)]: signature || null };
}

// Accepting clears the dismissal, so a LATER material change may prompt again.
export function clearDismissal(domain) {
  return { [dismissalFieldFor(domain)]: null };
}
