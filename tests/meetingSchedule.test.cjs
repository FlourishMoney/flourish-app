// tests/meetingSchedule.test.cjs — MATH-LOCK suite for Money Meeting schedule math.
// Pure function, frozen fixtures. Day-of-week is computed from the fixtures (never hardcoded) so the
// suite is independent of what weekday any given date happens to fall on. See src/lib/meetingSchedule.js.
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { computeNextMeeting } = await import("../src/lib/meetingSchedule.js");
  const t = create();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  // ── 1. null lastMeetingAt → next occurrence of dayOfWeek on/after today ──────────────────────────
  {
    const today = new Date(2026, 0, 1);         // Jan 1 2026 (local)
    const dow = 3;                               // Wednesday
    const r = computeNextMeeting({ cadence: "biweekly", dayOfWeek: dow, lastMeetingAt: null }, today);
    t.eq(r.nextDate.getDay(), dow, "1: lands on the chosen day-of-week");
    t.ok(r.daysUntil >= 0 && r.daysUntil <= 6, "1: within the next week");
    t.eq(r.overdue, false, "1: a fresh schedule is never overdue");
  }

  // ── 1b. null lastMeetingAt where TODAY is the dayOfWeek → today, daysUntil 0 ─────────────────────
  {
    const today = new Date(2026, 0, 7);          // whatever weekday this is
    const r = computeNextMeeting({ cadence: "weekly", dayOfWeek: today.getDay(), lastMeetingAt: null }, today);
    t.eq(r.daysUntil, 0, "1b: today counts when today IS the dayOfWeek");
    t.eq(r.overdue, false, "1b: due today is not overdue");
  }

  // ── 2. weekly / biweekly / monthly intervals compute from lastMeetingAt ──────────────────────────
  {
    const last = new Date(2026, 0, 7);           // Jan 7 2026
    const dow = last.getDay();                    // same weekday → weekly/biweekly snap is a no-op
    const today = new Date(2026, 0, 1);

    const wk = computeNextMeeting({ cadence: "weekly", dayOfWeek: dow, lastMeetingAt: last }, today);
    t.eq(iso(wk.nextDate), iso(new Date(2026, 0, 14)), "2: weekly → +7 (Jan 14)");
    t.eq(wk.daysUntil, 13, "2: weekly daysUntil from Jan 1");

    const bw = computeNextMeeting({ cadence: "biweekly", dayOfWeek: dow, lastMeetingAt: last }, today);
    t.eq(iso(bw.nextDate), iso(new Date(2026, 0, 21)), "2: biweekly → +14 (Jan 21)");

    const mo = computeNextMeeting({ cadence: "monthly", dayOfWeek: dow, lastMeetingAt: last }, today);
    t.eq(mo.nextDate.getMonth(), 1, "2: monthly → February");
    t.eq(mo.nextDate.getDay(), dow, "2: monthly still lands on the chosen day-of-week");
    t.ok(mo.nextDate.getDate() >= 7, "2: monthly is on/after the one-month anniversary");
  }

  // ── 3. monthly from Jan 31 → clamps to Feb (not overflow to Mar 3) ──────────────────────────────
  {
    const last = new Date(2026, 0, 31);          // Jan 31 2026
    const feb28dow = new Date(2026, 1, 28).getDay(); // pick dayOfWeek = Feb 28's weekday → snap is a no-op
    const r = computeNextMeeting({ cadence: "monthly", dayOfWeek: feb28dow, lastMeetingAt: last }, new Date(2026, 0, 15));
    t.eq(r.nextDate.getMonth(), 1, "3: Jan 31 + month clamps into February");
    t.eq(r.nextDate.getDate(), 28, "3: clamped to Feb 28 (2026 not a leap year)");
    // Leap-year variant: Jan 31 2024 + month → Feb 29 2024
    const leap = new Date(2024, 0, 31);
    const feb29dow = new Date(2024, 1, 29).getDay();
    const rl = computeNextMeeting({ cadence: "monthly", dayOfWeek: feb29dow, lastMeetingAt: leap }, new Date(2024, 0, 15));
    t.eq(rl.nextDate.getDate(), 29, "3: leap year clamps to Feb 29");
  }

  // ── 4. past nextDate → overdue true ─────────────────────────────────────────────────────────────
  {
    const last = new Date(2026, 4, 1);           // May 1
    const today = new Date(2026, 5, 15);         // June 15 — well past the next biweekly meeting
    const r = computeNextMeeting({ cadence: "biweekly", dayOfWeek: new Date(2026,4,1).getDay(), lastMeetingAt: last }, today);
    t.ok(r.daysUntil < 0, "4: nextDate is in the past");
    t.eq(r.overdue, true, "4: overdue is true");
  }

  // ── 5. changing cadence recomputes from lastMeetingAt, not from an old next-date ─────────────────
  {
    const last = new Date(2026, 0, 7);
    const dow = last.getDay();
    const today = new Date(2026, 0, 1);
    const wk = computeNextMeeting({ cadence: "weekly", dayOfWeek: dow, lastMeetingAt: last }, today);
    const bw = computeNextMeeting({ cadence: "biweekly", dayOfWeek: dow, lastMeetingAt: last }, today);
    // Both derive from Jan 7 → the biweekly next is exactly 7 days later than the weekly next.
    t.eq(bw.daysUntil - wk.daysUntil, 7, "5: cadence change recomputes from lastMeetingAt (Δ = 7 days)");
    t.eq(iso(wk.nextDate), iso(new Date(2026,0,14)), "5: weekly still Jan 14");
    t.eq(iso(bw.nextDate), iso(new Date(2026,0,21)), "5: biweekly still Jan 21");
  }

  // ── 6. defaults: missing cadence → biweekly; missing dayOfWeek → 0 (Sunday) ──────────────────────
  {
    const today = new Date(2026, 0, 1);
    const def = computeNextMeeting({ lastMeetingAt: null }, today);      // no cadence, no dayOfWeek
    t.eq(def.nextDate.getDay(), 0, "6: default dayOfWeek is Sunday (0)");
    const last = new Date(2026, 0, 4);   // a Sunday-ish anchor; cadence defaults to biweekly
    const bw = computeNextMeeting({ dayOfWeek: last.getDay(), lastMeetingAt: last }, today);
    t.eq(iso(bw.nextDate), iso(new Date(2026, 0, 18)), "6: default cadence biweekly → +14");
  }

  t.summary("meetingSchedule.test");
})();
