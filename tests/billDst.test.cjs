// tests/billDst.test.cjs — MATH-LOCK
// -----------------------------------------------------------------------------
// A WEEKLY OR EVERY-TWO-WEEKS BILL IS DUE ON ITS DAY IN EVERY TIME ZONE, ACROSS THE CLOCK CHANGES
// (audit of 2026-11-13, finding 8).
//
// billNextDue found the next due date by counting 7 or 14 day steps in milliseconds from the saved date. Across the
// autumn clock change the count came out one hour over, so ON the due day the step rounded up to the following
// cycle: a $450 bill every two weeks, saved as Oct 16, read "due Nov 27" on the morning of Nov 13, its real due day,
// and safe to spend rose from $434 to $899. It lasted from the change in November to the one in March.
//
// Every check runs in a child process started in the zone (TZ is read when a process starts):
//   America/Toronto     clocks change (Nov 1 2026, Mar 14 2027; Mar 8 2026)
//   America/Vancouver   clocks change
//   America/Edmonton    as this machine's zone data has it
//   Etc/GMT+6           a fixed UTC-6 with no clock change at all, which is what Alberta observes from Nov 1 2026
//                       whatever the zone data on a given phone or server still says
//   UTC                 the CI runner
// The expected dates are worked out in UTC calendar arithmetic, which has no clock changes, never with the code
// under test.
//
//   1  every day for a year and a half: the next due date, and "is it due today", for a weekly and a two-week bill
//   2  early morning and late evening give the same answer as midday
//   3  the audit's case: Nov 12 and Nov 13, safe to spend counts the $450 on both
//   4  the days the clocks change are themselves due days
// -----------------------------------------------------------------------------
"use strict";
const { spawnSync } = require("child_process");

const ZONES = ["America/Toronto", "America/Vancouver", "America/Edmonton", "Etc/GMT+6", "UTC"];

// Calendar arithmetic with no time zone in it.
const utc = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const isoPlus = (iso, n) => new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const nextInSeries = (anchor, step, day) => {            // the first anchor + k*step on or after `day` (k >= 0)
  const k = Math.max(0, Math.ceil(daysBetween(anchor, day) / step));
  return isoPlus(anchor, k * step);
};

async function child() {
  const fc = await import("../src/lib/financialCalculations.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const local = (iso, h = 9, min = 0) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, h, min); };
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const out = { zone: process.env.TZ, offsets: [local("2026-07-01").getTimezoneOffset(), local("2026-12-01").getTimezoneOffset()] };

  // 1 and 2: a sweep of every day, at three times of day.
  const sweep = (anchor, step, from, to) => {
    const bill = { id: "b", name: "Daycare", amount: "450", freq: step === 7 ? "weekly" : "biweekly", nextDueDate: anchor };
    let wrong = 0, first = null, checked = 0;
    for (let day = from; day <= to; day = isoPlus(day, 1)) {
      const want = nextInSeries(anchor, step, day);
      for (const [h, min] of [[9, 0], [0, 30], [23, 30]]) {
        const today = local(day, h, min);
        const nd = fc.billNextDue(bill, today);
        const got = nd ? isoOf(nd) : null;
        const dueToday = fc.billOccursOnDate(bill, today, today);
        checked++;
        if (got !== want || dueToday !== (want === day)) { wrong++; if (!first) first = { day, h, want, got, dueToday }; }
      }
    }
    return { wrong, first, checked };
  };
  out.biweeklyAutumn = sweep("2026-10-16", 14, "2026-10-01", "2027-04-30");   // saved before the autumn change, through the next spring
  out.weeklyAutumn = sweep("2026-09-04", 7, "2026-09-01", "2027-04-30");
  out.biweeklySpring = sweep("2026-02-27", 14, "2026-02-20", "2026-12-31");   // saved before the spring change, through the autumn
  out.weeklySpring = sweep("2026-02-27", 7, "2026-02-20", "2026-12-31");

  // 3: the audit's household.
  const bill = { id: "b", name: "Daycare", amount: "450", freq: "biweekly", nextDueDate: "2026-10-16" };
  const data = { profile: { country: "CA" }, accounts: [{ id: "a", type: "depository", subtype: "checking", balance: 1000 }],
    incomes: [{ id: 1, label: "Job", amount: "2000", freq: "biweekly", nextPayDate: "2026-11-20" }], bills: [bill], debts: [], transactions: [] };
  out.audit = ["2026-11-12", "2026-11-13"].map((day) => { const ss = SafeSpendEngine.calculate(data, local(day)); return [ss.upcomingBills, ss.safeAmount]; });

  // 4: the change days themselves (Sundays), as due days of a weekly bill saved the Sunday before.
  out.changeDays = [["2026-10-25", "2026-11-01"], ["2026-03-01", "2026-03-08"], ["2027-03-07", "2027-03-14"]].map(([anchor, day]) => {
    const b = { id: "s", name: "Lessons", amount: "60", freq: "weekly", nextDueDate: anchor };
    const nd = fc.billNextDue(b, local(day));
    return [isoOf(nd), fc.billOccursOnDate(b, local(day), local(day)), isoOf(fc.billNextDue(b, local(isoPlus(day, 1))))];
  });
  process.stdout.write("RESULT " + JSON.stringify(out) + "\n");
}

function parent() {
  const { create } = require("./_runner.cjs");
  const t = create();
  for (const zone of ZONES) {
    const r = spawnSync(process.execPath, ["--no-warnings", __filename], { env: { ...process.env, TZ: zone, BILL_DST_CHILD: "1" }, encoding: "utf8" });
    const line = (r.stdout || "").split("\n").find((l) => l.startsWith("RESULT "));
    if (!line) { t.ok(false, `${zone}: the child did not report (${(r.stderr || "").slice(0, 200)})`); continue; }
    const o = JSON.parse(line.slice(7));
    t.eq(o.zone, zone, `${zone}: ran in its zone`);
    for (const [key, what] of [["biweeklyAutumn", "every two weeks, saved Oct 16, each day to the end of April"], ["weeklyAutumn", "weekly, saved Sep 4, each day to the end of April"],
                               ["biweeklySpring", "every two weeks, saved Feb 27, each day to the end of December"], ["weeklySpring", "weekly, saved Feb 27, each day to the end of December"]]) {
      t.eq([o[key].wrong, o[key].first], [0, null], `${zone} 1/2 ${what}: the next due date and "due today" are right at 9:00, 0:30 and 23:30 (${o[key].checked} checks)`);
    }
    t.eq(o.audit, [[450, 434.43], [450, 448.87]], `${zone} 3 the audit's case: the $450 is counted on Nov 12 ($434.43) and on Nov 13, its due day ($448.87; was $0 counted and $898.87)`);
    t.eq(o.changeDays, [["2026-11-01", true, "2026-11-08"], ["2026-03-08", true, "2026-03-15"], ["2027-03-14", true, "2027-03-21"]],
         `${zone} 4 a weekly bill due on the Sunday the clocks change is due that day, and next due a week later`);
  }
  // The zones really differ: this is not five runs of one clock.
  const off = (zone) => { const r = spawnSync(process.execPath, ["-e", "process.stdout.write(String(new Date(2026,11,1,9).getTimezoneOffset()))"], { env: { ...process.env, TZ: zone }, encoding: "utf8" }); return Number(r.stdout); };
  t.eq([off("America/Toronto"), off("America/Vancouver"), off("Etc/GMT+6"), off("UTC")], [300, 480, 360, 0], "0 December offsets: Toronto UTC-5, Vancouver UTC-8, the fixed zone UTC-6, UTC 0");
  t.summary("billDst");
}

if (process.env.BILL_DST_CHILD) child(); else parent();
