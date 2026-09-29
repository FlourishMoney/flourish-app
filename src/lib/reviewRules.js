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
// A GOOD MOMENT is one of two things, whichever happens first:
//   • the third separate day this install opens Today (three days of use, not three taps in one), or
//   • a weekly money check-in has just been finished.
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
export const TODAY_DAYS_TO_ASK = 3;
export const TROUBLE_QUIET_HOURS = 24;

export const REVIEW_TRIGGERS = Object.freeze({ TODAY_OPEN: "today_open", CHECKIN_DONE: "checkin_done" });

const DAY_MS = 24 * 60 * 60 * 1000;

// The person's own calendar day, not UTC: "a separate day" is the day they lived, so 11pm and
// 1am are two days here and 9am and 9pm are one.
export function localDayKey(now) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyReviewState() {
  return { todayDays: [], lastAskedAt: null, lastTroubleAt: null };
}

// Whatever was stored (or nothing, or junk) becomes a well-formed state. A corrupt record must not
// be able to make the app ask sooner than the rules allow, so unreadable timestamps are dropped and
// an unreadable ask time is treated as "asked just now" rather than "never asked".
export function normalizeReviewState(raw) {
  const s = emptyReviewState();
  if (!raw || typeof raw !== "object") return s;
  if (Array.isArray(raw.todayDays)) {
    s.todayDays = [...new Set(raw.todayDays.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)))].slice(-TODAY_DAYS_TO_ASK);
  }
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

// Today was opened. Only the day counts, so opening it ten times on Monday is one day.
export function withTodayOpen(state, now) {
  const s = normalizeReviewState(state);
  const key = localDayKey(now);
  if (!s.todayDays.includes(key)) s.todayDays = [...s.todayDays, key].slice(-TODAY_DAYS_TO_ASK);
  return s;
}

// Something went wrong: an error, a failed bank link or a refused coach message.
export function withTrouble(state, now) {
  return { ...normalizeReviewState(state), lastTroubleAt: new Date(now).toISOString() };
}

// Flourish asked. The day count starts again, so after the cooldown it takes three NEW days.
export function withAsked(state, now) {
  return { ...normalizeReviewState(state), lastAskedAt: new Date(now).toISOString(), todayDays: [] };
}

// Returns { ask, reason }. `ask` is true only when every rule allows it.
export function decideReviewAsk({ state, trigger, now, native, demo }) {
  if (!native) return { ask: false, reason: "web" };
  if (demo) return { ask: false, reason: "demo" };
  if (trigger !== REVIEW_TRIGGERS.TODAY_OPEN && trigger !== REVIEW_TRIGGERS.CHECKIN_DONE) return { ask: false, reason: "unknown_trigger" };
  const s = normalizeReviewState(state);
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
  if (trigger === REVIEW_TRIGGERS.CHECKIN_DONE) return { ask: true, reason: "checkin_done" };
  if (s.todayDays.length >= TODAY_DAYS_TO_ASK) return { ask: true, reason: "third_day" };
  return { ask: false, reason: "not_yet" };
}
