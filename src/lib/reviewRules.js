// src/lib/reviewRules.js
// -----------------------------------------------------------------------------
// WHEN FLOURISH MAY ASK FOR A STORE REVIEW.
//
// The ask is the store's own sheet (App Store / Google Play), shown with nothing in front of it:
// no reward, no "do you like us?" screen that filters unhappy people out first. Both stores forbid
// that, and it would make the rating a lie. So the only thing Flourish controls is WHEN, and these
// rules are the whole of that decision. They are pure: the caller passes the stored state and the
// clock, and gets back yes or no with a reason, so every rule is testable without a phone.
//
// A GOOD MOMENT is one thing (tester suggestions, item 3, as decided 2026-10-01): the FIRST money
// meeting the household marks done. Asked once per install for that reason, and only for the first
// meeting: a later meeting never asks. (It used to be the third day Today was opened, or a finished
// weekly check-in; both are retired.)
//
// NEVER straight after something went wrong: an error, a bank link that failed, or a coach message
// that was refused. Any of those in the last 24 hours rules the ask out, because a person who just
// hit a wall is being asked to grade the wall.
//
// AT MOST ONCE PER 120 DAYS PER INSTALL, counted from the last time Flourish asked, whether or not
// the store chose to show its sheet (neither store says whether it did, so the conservative reading
// is that it did).
//
// Never on the web (there is no store to review in), and never in demo mode (sample data is a tour,
// not a week of someone's own money).
// -----------------------------------------------------------------------------

export const REVIEW_COOLDOWN_DAYS = 120;
export const TROUBLE_QUIET_HOURS = 24;

export const REVIEW_TRIGGERS = Object.freeze({ MEETING_DONE: "meeting_done" });

const DAY_MS = 24 * 60 * 60 * 1000;

// The person's own calendar day, not UTC: "a separate day" is the day they lived, so 11pm and
// 1am are two days here and 9am and 9pm are one.
export function localDayKey(now) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyReviewState() {
  return { lastAskedAt: null, lastTroubleAt: null, meetingAsked: false };
}

// Whatever was stored (or nothing, or junk) becomes a well-formed state. A corrupt record must not
// be able to make the app ask sooner than the rules allow, so unreadable timestamps are dropped and
// an unreadable ask time is treated as "asked just now" rather than "never asked".
export function normalizeReviewState(raw) {
  const s = emptyReviewState();
  if (!raw || typeof raw !== "object") return s;
  // Any value but false reads as "already asked": a corrupt record must not ask a second time.
  if (raw.meetingAsked != null) s.meetingAsked = raw.meetingAsked !== false;
  if (raw.lastAskedAt != null) {
    const t = Date.parse(raw.lastAskedAt);
    s.lastAskedAt = Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
  }
  if (raw.lastTroubleAt != null) {
    const t = Date.parse(raw.lastTroubleAt);
    if (Number.isFinite(t)) s.lastTroubleAt = new Date(t).toISOString();
  }
  return s;
}

// Something went wrong: an error, a failed bank link or a refused coach message.
export function withTrouble(state, now) {
  return { ...normalizeReviewState(state), lastTroubleAt: new Date(now).toISOString() };
}

// Flourish asked. The first-meeting ask is spent for good on this install.
export function withAsked(state, now) {
  return { ...normalizeReviewState(state), lastAskedAt: new Date(now).toISOString(), meetingAsked: true };
}

// Returns { ask, reason }. `ask` is true only when every rule allows it.
// firstMeeting: true only when the meeting just marked done is the household's first.
export function decideReviewAsk({ state, trigger, now, native, demo, firstMeeting = false }) {
  if (!native) return { ask: false, reason: "web" };
  if (demo) return { ask: false, reason: "demo" };
  if (trigger !== REVIEW_TRIGGERS.MEETING_DONE) return { ask: false, reason: "unknown_trigger" };
  if (!firstMeeting) return { ask: false, reason: "not_first_meeting" };
  const s = normalizeReviewState(state);
  if (s.meetingAsked) return { ask: false, reason: "already_asked" };
  const t = new Date(now).getTime();
  if (s.lastAskedAt) {
    const since = t - Date.parse(s.lastAskedAt);
    // A clock set backwards reads as a negative gap, which is not 120 days, so it waits.
    if (!(since >= REVIEW_COOLDOWN_DAYS * DAY_MS)) return { ask: false, reason: "cooldown" };
  }
  if (s.lastTroubleAt) {
    const since = t - Date.parse(s.lastTroubleAt);
    if (since < TROUBLE_QUIET_HOURS * 60 * 60 * 1000) return { ask: false, reason: "recent_trouble" };
  }
  return { ask: true, reason: "first_meeting" };
}
