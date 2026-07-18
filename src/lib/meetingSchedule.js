// src/lib/meetingSchedule.js
// -----------------------------------------------------------------------------
// Flourish — Money Meeting schedule math (MATH-LOCK).
//
// The next meeting date is DERIVED, never stored — a stored next-date goes stale
// the moment the user changes cadence or misses a meeting. This is a PURE function
// (today is injected; all arithmetic is calendar-based so it's DST-safe) and unit-
// testable.
//
// schedule = { cadence:"weekly"|"biweekly"|"monthly", dayOfWeek:0-6, lastMeetingAt:ISO|Date|null }
// -----------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function atMidnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = atMidnight(d); x.setDate(x.getDate() + n); return x; }

// Soonest date on or after `from` whose day-of-week === dow (0-6). Calendar arithmetic (DST-safe).
function snapToDayOfWeek(from, dow) {
  const d = atMidnight(from);
  const diff = (((dow - d.getDay()) % 7) + 7) % 7;   // 0..6 forward
  d.setDate(d.getDate() + diff);
  return d;
}

// +1 calendar month, clamping the day into the target month (Jan 31 → Feb 28/29) — mirrors the
// existing bill day-clamp (Math.min(day, daysInMonth)).
function addMonthClamped(d) {
  const dd = atMidnight(d);
  const y = dd.getFullYear(), m = dd.getMonth(), day = dd.getDate();
  const dim = new Date(y, m + 2, 0).getDate();       // days in month m+1
  return new Date(y, m + 1, Math.min(day, dim));
}

// computeNextMeeting(schedule, today) → { nextDate, daysUntil, overdue }
//   lastMeetingAt null → the next occurrence of dayOfWeek on/after today.
//   otherwise         → (lastMeetingAt + one cadence interval) snapped forward to dayOfWeek.
//   overdue           → nextDate is strictly before today (daysUntil < 0).
export function computeNextMeeting(schedule = {}, today = new Date()) {
  const dow = Number.isInteger(schedule.dayOfWeek) ? (((schedule.dayOfWeek % 7) + 7) % 7) : 0;
  const cadence = schedule.cadence || "biweekly";
  const todayMid = atMidnight(today);

  let nextDate;
  if (!schedule.lastMeetingAt) {
    // Never met → the upcoming dayOfWeek (today counts if today IS that day).
    nextDate = snapToDayOfWeek(todayMid, dow);
  } else {
    const last = atMidnight(schedule.lastMeetingAt instanceof Date ? schedule.lastMeetingAt : new Date(schedule.lastMeetingAt));
    const base = cadence === "monthly" ? addMonthClamped(last) : addDays(last, cadence === "weekly" ? 7 : 14);
    nextDate = snapToDayOfWeek(base, dow);
  }

  const daysUntil = Math.round((nextDate.getTime() - todayMid.getTime()) / DAY_MS);
  return { nextDate, daysUntil, overdue: daysUntil < 0 };
}
