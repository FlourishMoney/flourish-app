// src/lib/reviewRules.js
// -----------------------------------------------------------------------------
// WHEN FLOURISH MAY ASK FOR A STORE REVIEW (version 1.1, item 4).
//
// The ask is the store's own sheet (App Store / Google Play), shown with nothing in front of it:
// no reward, no "do you like us?" screen that filters unhappy people out first, and no choosing who
// gets asked by how they seem to feel. Both stores forbid that, and it would make the rating a lie. So
// the only thing Flourish controls is WHEN, and these rules are the whole of that decision. They are
// pure: the caller passes the stored state and the clock, and gets back yes or no with a reason, so
// every rule is testable without a phone.
//
// THE MOMENTS are three, and no other moment ever asks:
//   meeting_done    a money meeting the household has just marked done. Each completed meeting may ask once
//                   (meetingKey: the meeting's own day).
//   first_safe      about 3 seconds after the first safe-to-spend number shows on this install (2026-11-24).
//   third_open_day  the 3rd different day (the person's own calendar day) the app is opened on this install
//                   (2026-11-24). The days need not be in a row.
// The last two come once per install: once a moment has come, whether or not the rules below let it ask, it never
// asks again, so it never turns up later at some other, unrelated moment. (Amanda, 2026-11-24: the meeting alone is
// reached by almost nobody.)
//
// NEVER straight after something went wrong: an error, a bank link that failed, a payment the store
// declined (or a purchase that did not finish), or a coach message that was refused. Any of those in the
// last 24 hours rules the ask out, because a person who just hit a wall is being asked to grade the wall.
//
// AT MOST THREE TIMES IN ANY 365 DAYS PER INSTALL, counted from the times Flourish asked, whether or not
// the store chose to show its sheet (neither store says whether it did, so the conservative reading is
// that it did). Apple applies the same ceiling to its own sheet.
//
// Never on the web (there is no store to review in), and never in demo mode (sample data is a tour,
// not a week of someone's own money).
//
// This replaces the rule of 2026-10-01 (the first meeting only, once per install, 120 days apart). A record
// written under it is carried over conservatively: its ask counts as one of the three.
// -----------------------------------------------------------------------------

export const REVIEW_MAX_ASKS = 3;
export const REVIEW_WINDOW_DAYS = 365;
export const TROUBLE_QUIET_HOURS = 24;

export const REVIEW_TRIGGERS = Object.freeze({ MEETING_DONE: "meeting_done", FIRST_SAFE: "first_safe", THIRD_OPEN_DAY: "third_open_day" });
// The once-per-install moments.
const MOMENTS = [REVIEW_TRIGGERS.FIRST_SAFE, REVIEW_TRIGGERS.THIRD_OPEN_DAY];
// The first number's ask waits about this long after the number shows, so the person sees it first.
export const FIRST_SAFE_DELAY_MS = 3000;
const OPEN_DAYS_TO_ASK = 3;
const DAY_KEY_RX = /^\d{4}-\d{2}-\d{2}$/;

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP = 12;                 // ask times and meeting keys kept: more than the window can ever use

// The person's own calendar day, not UTC: "a separate day" is the day they lived, so 11pm and
// 1am are two days here and 9am and 9pm are one.
export function localDayKey(now) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyReviewState() {
  return { askedAt: [], askedMeetings: [], lastTroubleAt: null, openDays: [], moments: { first_safe: null, third_open_day: null } };
}

// Whatever was stored (or nothing, or junk) becomes a well-formed state. A corrupt record must not
// be able to make the app ask sooner than the rules allow, so an unreadable ask time is treated as
// "asked just now" rather than dropped, and an unreadable trouble time is dropped.
export function normalizeReviewState(raw, now = Date.now()) {
  const s = emptyReviewState();
  if (!raw || typeof raw !== "object") return s;
  const asIso = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : new Date(now).toISOString(); };
  if (Array.isArray(raw.askedAt)) s.askedAt = raw.askedAt.map(asIso);
  else if (raw.askedAt != null) s.askedAt = [asIso(raw.askedAt)];
  // The 2026-10-01 record: { lastAskedAt, meetingAsked }. Its ask is one of the three.
  if (raw.lastAskedAt != null) s.askedAt.push(asIso(raw.lastAskedAt));
  else if (raw.meetingAsked != null && raw.meetingAsked !== false && s.askedAt.length === 0) s.askedAt.push(new Date(now).toISOString());
  s.askedAt = s.askedAt.sort().slice(-KEEP);          // never de-duplicated: two asks at one time are two asks
  if (Array.isArray(raw.askedMeetings)) s.askedMeetings = raw.askedMeetings.filter((k) => typeof k === "string" && k).slice(-KEEP);
  if (raw.lastTroubleAt != null) {
    const t = Date.parse(raw.lastTroubleAt);
    if (Number.isFinite(t)) s.lastTroubleAt = new Date(t).toISOString();
  }
  // The first three different days the app was opened, in the order they came.
  if (Array.isArray(raw.openDays)) for (const k of raw.openDays) if (typeof k === "string" && DAY_KEY_RX.test(k) && !s.openDays.includes(k) && s.openDays.length < OPEN_DAYS_TO_ASK) s.openDays.push(k);
  // A moment that has come is kept as its time; an unreadable one reads as come (never ask sooner than the rules allow).
  const m = raw.moments && typeof raw.moments === "object" ? raw.moments : {};
  for (const k of MOMENTS) if (m[k] != null && m[k] !== false) s.moments[k] = asIso(m[k]);
  return s;
}

// Something went wrong: an error, a failed bank link, a declined payment or a refused coach message.
export function withTrouble(state, now) {
  return { ...normalizeReviewState(state, now), lastTroubleAt: new Date(now).toISOString() };
}

// Flourish asked, for this meeting.
export function withAsked(state, now, meetingKey) {
  const s = normalizeReviewState(state, now);
  return {
    ...s,
    askedAt: [...s.askedAt, new Date(now).toISOString()].slice(-KEEP),
    askedMeetings: meetingKey ? [...s.askedMeetings.filter((k) => k !== meetingKey), meetingKey].slice(-KEEP) : s.askedMeetings,
  };
}

// The app was opened today (the person's own day). Only the first three different days are kept.
export function withOpenDay(state, now) {
  const s = normalizeReviewState(state, now);
  const key = localDayKey(now);
  if (s.openDays.includes(key) || s.openDays.length >= OPEN_DAYS_TO_ASK) return s;
  return { ...s, openDays: [...s.openDays, key] };
}

// A once-per-install moment has come (asked or not): it never asks again.
export function withMomentSpent(state, trigger, now) {
  const s = normalizeReviewState(state, now);
  if (!MOMENTS.includes(trigger) || s.moments[trigger]) return s;
  return { ...s, moments: { ...s.moments, [trigger]: new Date(now).toISOString() } };
}

// How many asks fall in the 365 days up to now. An ask dated after now (a clock set backwards) counts:
// a moved clock never makes room for another ask.
export function asksInWindow(state, now) {
  const t = new Date(now).getTime();
  return normalizeReviewState(state, now).askedAt.filter((iso) => t - Date.parse(iso) < REVIEW_WINDOW_DAYS * DAY_MS).length;
}

// Returns { ask, reason }. `ask` is true only when every rule allows it.
// meetingKey: the completed meeting's own key (its local day); a meeting asks at most once.
// For third_open_day, state.openDays must already hold today (withOpenDay).
export function decideReviewAsk({ state, trigger, now, native, demo, meetingKey = null }) {
  if (!native) return { ask: false, reason: "web" };
  if (demo) return { ask: false, reason: "demo" };
  if (!Object.values(REVIEW_TRIGGERS).includes(trigger)) return { ask: false, reason: "unknown_trigger" };
  const s = normalizeReviewState(state, now);
  if (trigger === REVIEW_TRIGGERS.MEETING_DONE) {
    if (typeof meetingKey !== "string" || !meetingKey) return { ask: false, reason: "no_meeting" };
    if (s.askedMeetings.includes(meetingKey)) return { ask: false, reason: "meeting_already_asked" };
  } else {
    if (s.moments[trigger]) return { ask: false, reason: "moment_spent" };
    // The third day is the day the third different day was counted, not any day after it.
    if (trigger === REVIEW_TRIGGERS.THIRD_OPEN_DAY && (s.openDays.length < OPEN_DAYS_TO_ASK || s.openDays[OPEN_DAYS_TO_ASK - 1] !== localDayKey(now))) return { ask: false, reason: "not_third_day" };
  }
  if (asksInWindow(s, now) >= REVIEW_MAX_ASKS) return { ask: false, reason: "yearly_limit" };
  const t = new Date(now).getTime();
  if (s.lastTroubleAt) {
    const since = t - Date.parse(s.lastTroubleAt);
    // A trouble time after now (a clock set backwards) is recent: it waits.
    if (since < TROUBLE_QUIET_HOURS * 60 * 60 * 1000) return { ask: false, reason: "recent_trouble" };
  }
  return { ask: true, reason: trigger };
}
