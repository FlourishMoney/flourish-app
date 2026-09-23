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

/**
 * Normalise one answer for storage, or null if it is not a real answer.
 * Deliberately strict: an unknown answer value, a missing signature or a missing domain all
 * produce null rather than a half-record that the next meeting would have to interpret.
 */
export function recordableAnswer(raw) {
  const a = raw || {};
  if (!a.signature || typeof a.signature !== "string") return null;
  if (!a.domain || typeof a.domain !== "string") return null;
  if (!ANSWERS.has(a.answer)) return null;
  const out = {};
  for (const f of ALLOWED_FIELDS) {
    const v = a[f];
    if (v == null) continue;
    if (typeof v !== "string") continue;      // no numbers, no objects, no arrays
    out[f] = v;
  }
  return out;
}

/** A whole meeting: the date it happened and the answers it produced. */
export function buildMeetingRecord({ metOn, answers } = {}) {
  const list = (Array.isArray(answers) ? answers : []).map(recordableAnswer).filter(Boolean);
  return { metOn: typeof metOn === "string" ? metOn.slice(0, 10) : null, answers: list };
}

/** Signatures the household has already answered, so the loop does not re-ask them. */
export function answeredSignatures(records, domain = null) {
  const out = [];
  for (const r of Array.isArray(records) ? records : []) {
    for (const a of (r && Array.isArray(r.answers)) ? r.answers : []) {
      if (!a || !a.signature) continue;
      if (domain && a.domain !== domain) continue;
      out.push(a.signature);
    }
  }
  return [...new Set(out)];
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
  if (dismissed.length) {
    lines.push({
      text: `You left ${dismissed.length} question${dismissed.length === 1 ? "" : "s"} unanswered last time; ${dismissed.length === 1 ? "it is" : "they are"} not being asked again.`,
      source: "meetingRecord",
    });
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
