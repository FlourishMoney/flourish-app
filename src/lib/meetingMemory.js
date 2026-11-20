// src/lib/meetingMemory.js
// -----------------------------------------------------------------------------
// THE MEETING REMEMBERS: loading the household's meetings and saving a finished one, through
// /api/meeting (netlify/functions/meeting.js), which is the only reader and writer of meeting_records.
//
// IN MEMORY ONLY. What comes back here is held in its own React state in the app shell and handed to
// the screens beside appData, never inside it, so it is never written to user_data, the household
// blob or this device's storage. A phone cannot rewrite what a meeting decided by saving its copy back.
//
// UNKNOWN IS NOT EMPTY. A read that fails returns null, never []. An empty list means "this household
// has held no meeting" and opens with the first-meeting line; null means "we do not know", and the Meet
// screen then shows no opening and asks no questions, rather than saying something that may be false
// or asking again a question the household already said no to.
// -----------------------------------------------------------------------------

import { buildMeetingRecord } from "./meetingRecord.js";

const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Today's date on this device, YYYY-MM-DD. A meeting belongs to the day the household held it. */
export function localDay(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** One record from the server, or null. Answers go through the same allow-list as storage. */
export function normaliseRecord(raw) {
  if (!raw || !isDay(raw.metOn)) return null;
  const { metOn, answers } = buildMeetingRecord({ metOn: raw.metOn, answers: raw.answers });
  return { metOn, mine: raw.mine === true, answers };
}

/**
 * The questions the household answered, as recordable answers. choices maps a question's id (its
 * signature) to "accepted" or "dismissed"; a question with no choice was not answered and is left out.
 */
export function answersFor(questions, choices) {
  const c = choices || {};
  return (Array.isArray(questions) ? questions : [])
    .filter(q => q && q.id && (c[q.id] === "accepted" || c[q.id] === "dismissed"))
    .map(q => ({ signature: q.id, domain: q.domain, kind: q.kind || undefined, subject: q.subject || undefined, answer: c[q.id] }));
}

/** The list with this person's record for that day replaced or added, newest first. null stays null. */
export function withRecord(records, record) {
  if (!Array.isArray(records) || !record || !isDay(record.metOn)) return Array.isArray(records) ? records : null;
  const rest = records.filter(r => !(r && r.mine && r.metOn === record.metOn));
  return [{ ...record, mine: true }, ...rest].sort((a, b) => String(b.metOn).localeCompare(String(a.metOn)));
}

/** The household's meetings, or null when they could not be read. Never throws. */
export async function loadMeetingRecords({ apiBase = "", getJwt, fetchImpl } = {}) {
  try {
    const jwt = getJwt ? await getJwt() : null;
    if (!jwt) return null;
    const f = fetchImpl || fetch;
    const r = await f(`${apiBase}/api/meeting`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ action: "list" }),
    });
    if (!r || !r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j || !Array.isArray(j.records)) return null;
    return j.records.map(normaliseRecord).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Save a finished meeting. Returns { ok: true, record } with the answers the server actually stored,
 * or { ok: false }. Never throws. Nothing else changes until this says ok.
 */
export async function saveMeetingRecord({ apiBase = "", getJwt, fetchImpl, metOn, answers } = {}) {
  try {
    const rec = buildMeetingRecord({ metOn, answers });
    if (!isDay(rec.metOn)) return { ok: false };
    const jwt = getJwt ? await getJwt() : null;
    if (!jwt) return { ok: false };
    const f = fetchImpl || fetch;
    const r = await f(`${apiBase}/api/meeting`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ action: "record", met_on: rec.metOn, answers: rec.answers }),
    });
    if (!r || !r.ok) return { ok: false };
    const j = await r.json().catch(() => null);
    if (!j || j.met_on !== rec.metOn || !Array.isArray(j.answers)) return { ok: false };
    const stored = normaliseRecord({ metOn: j.met_on, mine: true, answers: j.answers });
    return stored ? { ok: true, record: stored } : { ok: false };
  } catch {
    return { ok: false };
  }
}
