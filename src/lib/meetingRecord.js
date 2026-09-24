// src/lib/meetingRecord.js
// -----------------------------------------------------------------------------
// WHAT THE MEETING DECIDED, AND WHAT CHANGED SINCE THE LAST ONE.
//
// The money meeting was one way: buildMeetingAgenda produced an agenda and nothing came
// back. A household could answer a question out loud, type it into the facilitator box,
// and the answer reached the model and then nowhere — component state, cleared on a tab
// switch. So the next meeting opened exactly like the last one, and the product's central
// promise (it gets better at your situation) had nothing to get better with.
//
// This module is the shape of a recorded answer and the opening of the next meeting.
// It is PURE and it NEVER COMPUTES A FIGURE. Every number it carries was produced by an
// engine and is copied verbatim, exactly like meetingAgenda.js. The model may phrase a
// question and summarise an answer; it may not put a number in one.
//
// WHY ANSWERS ARE AN ALLOW-LIST. The facilitator is a model with the household's context,
// and it writes nothing here: recordableAnswer() keeps five fields and drops everything
// else, so a model-authored "amount" or "newBalance" cannot reach storage even if some
// future caller passes one through.
// -----------------------------------------------------------------------------

// A decision is one of exactly two things. "Later" is not an answer — it is the absence of
// one, and it must not be stored, or the question would never be asked again.
export const ANSWER_ACCEPTED = "accepted";
export const ANSWER_DISMISSED = "dismissed";
const ANSWERS = new Set([ANSWER_ACCEPTED, ANSWER_DISMISSED]);

// The only fields a recorded answer may carry. Anything else is dropped, including anything
// numeric — figures live in the engines, and the next meeting reads them from there.
const ALLOWED_FIELDS = ["signature", "domain", "kind", "answer", "subject"];
export const MAX_FIELD_LENGTH = 200;

/**
 * Normalise one answer for storage, or null if it is not a real answer.
 * Deliberately strict: an unknown answer value, a missing signature or a missing domain all
 * produce null rather than a half-record that the next meeting would have to interpret.
 */
export function recordableAnswer(raw) {
  const a = raw || {};
  // Length is checked HERE, not only in the copy below: an over-long signature stripped by the
  // copy would leave an answer with no signature at all — a record that can never be matched to
  // the question it answers, which is worse than refusing it.
  const str = (v) => typeof v === "string" && v.length > 0 && v.length <= MAX_FIELD_LENGTH;
  if (!str(a.signature)) return null;
  if (!str(a.domain)) return null;
  if (!ANSWERS.has(a.answer)) return null;
  const out = {};
  for (const f of ALLOWED_FIELDS) {
    const v = a[f];
    if (v == null) continue;
    if (typeof v !== "string") continue;      // no numbers, no objects, no arrays
    if (v.length > MAX_FIELD_LENGTH) continue; // a signature or a merchant name is short; anything
                                               // longer is not one, and storing it would let a
                                               // single meeting write megabytes
    out[f] = v;
  }
  return out;
}

/** A whole meeting: the date it happened and the answers it produced. */
export function buildMeetingRecord({ metOn, answers } = {}) {
  const list = (Array.isArray(answers) ? answers : []).map(recordableAnswer).filter(Boolean);
  return { metOn: typeof metOn === "string" ? metOn.slice(0, 10) : null, answers: list };
}

/**
 * Signatures the household has answered, optionally filtered by domain and by which answer.
 *
 * For SUPPRESSION use dismissedSignatures() below, not this. Feeding every answered signature
 * into the loop's dismissal set would make an ACCEPT permanent too: the household says "yes, add
 * that bill", and if the bill is later removed or the charge reappears, the question can never be
 * asked again. An accept does not need suppressing — applying it changes the data, so the
 * detector stops finding a difference on its own.
 */
export function answeredSignatures(records, domain = null, answer = null) {
  const out = [];
  for (const r of Array.isArray(records) ? records : []) {
    for (const a of (r && Array.isArray(r.answers)) ? r.answers : []) {
      if (!a || !a.signature) continue;
      if (domain && a.domain !== domain) continue;
      if (answer && a.answer !== answer) continue;
      out.push(a.signature);
    }
  }
  return [...new Set(out)];
}

/** The suppression set: what the household said NO to. This is what the loop must be given. */
export function dismissedSignatures(records, domain = null) {
  return answeredSignatures(records, domain, ANSWER_DISMISSED);
}

/**
 * The same set WITH the date each no was said, which is what the twelve-month reopen needs.
 * The meeting's own date is the dismissal date — it is when the household actually said it.
 */
export function dismissedEntries(records, domain = null) {
  const out = new Map();
  for (const r of Array.isArray(records) ? records : []) {
    for (const a of (r && Array.isArray(r.answers)) ? r.answers : []) {
      if (!a || !a.signature || a.answer !== ANSWER_DISMISSED) continue;
      if (domain && a.domain !== domain) continue;
      const at = r.metOn || null;
      // Keep the LATEST no for a signature: saying it again restarts the clock.
      const prev = out.get(a.signature);
      if (!prev || (at && prev.at && at > prev.at) || (at && !prev.at)) out.set(a.signature, { signature: a.signature, at });
    }
  }
  return [...out.values()];
}

/** The most recent meeting, by date. Ties keep the first, which is the order the server returns. */
export function lastMeeting(records) {
  const list = (Array.isArray(records) ? records : []).filter(r => r && r.metOn);
  if (!list.length) return null;
  return list.slice().sort((a, b) => String(b.metOn).localeCompare(String(a.metOn)))[0];
}

const VERB = {
  [ANSWER_ACCEPTED]: "you said yes to",
  [ANSWER_DISMISSED]: "you left",
};

/**
 * ITEM 5: how the next meeting opens.
 *
 * Two sources and no others: what the household decided last time (from the stored record)
 * and what the engines say now (from the snapshot the caller already built for the agenda).
 * Every line carries the source it came from, so the "never from the model" rule is
 * checkable rather than promised — see tests/meetingRecord.test.cjs section 5.
 *
 * Returns { hasHistory, metOn, lines: [{ text, source }] }.
 */
export function meetingOpening({ lastRecord = null, snapshot = {} } = {}) {
  const lines = [];
  const last = lastRecord && lastRecord.metOn ? lastRecord : null;

  if (!last) {
    lines.push({ text: "This is your first money meeting, so there is nothing to compare against yet.", source: "meetingRecord" });
    return { hasHistory: false, metOn: null, lines };
  }

  const answers = Array.isArray(last.answers) ? last.answers : [];
  const accepted = answers.filter(a => a.answer === ANSWER_ACCEPTED);
  const dismissed = answers.filter(a => a.answer === ANSWER_DISMISSED);

  lines.push({ text: `Last meeting: ${last.metOn}.`, source: "meetingRecord" });

  for (const a of accepted) {
    lines.push({ text: `Since then, ${VERB[a.answer]} ${a.subject || a.kind || "a change"}.`, source: "meetingRecord" });
  }
  // "No" is an ANSWER. The agenda's second option maps to `dismissed`, so calling these
  // "unanswered" told the household they had not decided something they had just decided.
  for (const a of dismissed) {
    lines.push({ text: `You said no to ${a.subject || a.kind || "a change"}, so it is not being raised again.`, source: "meetingRecord" });
  }
  if (!answers.length) {
    lines.push({ text: "No decisions were recorded at that meeting.", source: "meetingRecord" });
  }

  // Engine output, copied verbatim. The health score is the one figure that is meaningful as a
  // "since last time" line, and the engine has already computed both halves of it.
  const hs = snapshot.healthScore || {};
  const cur = typeof hs.current === "number" && Number.isFinite(hs.current) ? hs.current : null;
  const prev = typeof hs.previous === "number" && Number.isFinite(hs.previous) ? hs.previous : null;
  if (cur != null && prev != null && cur !== prev) {
    const d = cur - prev;
    lines.push({ text: `Your health score has moved ${d > 0 ? "up" : "down"} ${Math.abs(d)} since then, to ${cur}.`, source: "healthScore" });
  }

  return { hasHistory: true, metOn: last.metOn, lines };
}
