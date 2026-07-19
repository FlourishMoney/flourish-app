// src/lib/notificationPlanner.js
// -----------------------------------------------------------------------------
// Flourish — plans the DESIRED set of local notifications from appData (Stage 2).
//
// PURE: given (data, now) it returns a deterministic list of { type, id, title, body, at }.
// Every `at` is derived from stored data (a bill's due date, a charge's date, the meeting date),
// NEVER from `now` — so re-planning yields identical times. The reconciler can therefore cancel and
// reschedule freely without any drift, and stable ids (notifId) mean an edit overwrites rather than
// duplicates. Toggle- and permission-gating happen in the reconciler, not here.
// -----------------------------------------------------------------------------

import { ForecastEngine } from "./forecastEngine.js";
import { SafeSpendEngine } from "./safeSpendEngine.js";
import { billNextDue, isBillArchived } from "./financialCalculations.js";
import { computeNextMeeting } from "./meetingSchedule.js";
import { notifId } from "./notifications.js";

const at9am = (y, m, d) => new Date(y, m, d, 9, 0, 0, 0);
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Same month + year as `now`.
function inThisMonth(dateStr, now) {
  try { const d = new Date(dateStr + "T12:00:00"); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }
  catch { return false; }
}

// Mirrors SafeSpendEngine.isBillPaid: a same-month transaction whose name contains (or is contained
// by) the bill name AND whose amount is within ±5% / ±$2 of the bill amount.
function paidThisMonth(bill, txns, now) {
  const billName = norm(bill.vendorPattern || bill.name);
  const billAmt = parseFloat(bill.amount || 0);
  if (billName.length < 3 || billAmt <= 0) return false;
  return (txns || []).some(t => {
    if (!inThisMonth(t.date, now)) return false;
    const tn = norm(t.name), ta = Math.abs(parseFloat(t.amount || 0));
    return tn && (tn.includes(billName) || billName.includes(tn)) && Math.abs(ta - billAmt) <= Math.max(2, billAmt * 0.05);
  });
}

export function planNotifications(data, now = new Date()) {
  const out = [];
  const bills = data?.bills || [];
  const txns = data?.transactions || [];

  // ── TYPE 1 · BILL DUE — the day before, 9am, for the next unpaid occurrence ──────────────────────
  for (const b of bills) {
    if (isBillArchived(b, now)) continue;
    const amt = parseFloat(b.amount || 0);
    if (!(amt > 0)) continue;
    if (paidThisMonth(b, txns, now)) continue;           // already paid this month → no reminder
    const due = billNextDue(b, now);
    if (!due) continue;
    const at = at9am(due.getFullYear(), due.getMonth(), due.getDate() - 1); // day-before 9am
    if (at <= now) continue;                             // reminder moment already passed
    out.push({
      type: "billDue",
      id: notifId("billDue", b.id || b.name),
      title: b.name,
      body: `${b.name} ${b.variable ? "~" : ""}${money(amt)} is due tomorrow`,
      at,
    });
  }

  // ── TYPE 2 · LOW BALANCE — morning before the first projected shortfall within 7 days ────────────
  try {
    const ss = SafeSpendEngine.calculate(data, now);
    const threshold = ss.safetyBuf > 0 ? ss.safetyBuf : 100;     // existing "spending buffer", else $100
    const { forecast } = ForecastEngine.generate(data, 7, null, now);
    const low = forecast.find(f => f.day >= 1 && f.day <= 7 && f.balance < threshold);
    if (low) {
      const d = low.date;
      const at = at9am(d.getFullYear(), d.getMonth(), d.getDate() - 1);  // morning BEFORE the shortfall
      if (at > now) {
        out.push({
          type: "lowBalance",
          id: notifId("lowBalance", ""),                  // single stable id → one at a time
          title: "Heads up on your balance",
          body: low.balance < 0
            ? `You're projected to overdraft around ${fmt(d)} — worth getting ahead of it`
            : `You're projected to be tight around ${fmt(d)} — about ${money(low.balance)} left`,
          at,
        });
      }
    }
  } catch { /* forecast unavailable → skip */ }

  // ── TYPE 3 · UNUSUAL BILL AMOUNT — morning after the charge, one per bill per charge ─────────────
  for (const b of bills) {
    const expected = parseFloat(b.amount || 0);
    if (!(expected > 0)) continue;
    const bv = norm(b.vendorPattern || b.name);
    if (bv.length < 4) continue;
    const tx = txns.find(t => {
      if (!inThisMonth(t.date, now)) return false;
      const v = norm(t.name);
      return v && (v.includes(bv.substring(0, 6)) || bv.includes(v.substring(0, 6)));
    });
    if (!tx) continue;
    const actual = Math.abs(parseFloat(tx.amount || 0));
    const diff = actual - expected;
    if (diff <= Math.max(5, expected * 0.10)) continue;   // only a MEANINGFUL spike (> $5 or > 10%)
    let txd; try { txd = new Date(tx.date + "T12:00:00"); } catch { continue; }
    const at = at9am(txd.getFullYear(), txd.getMonth(), txd.getDate() + 1);  // morning after the charge
    if (at <= now) continue;
    out.push({
      type: "unusualAmount",
      id: notifId("unusualAmount", `${b.id || b.name}:${tx.id || tx.date}`), // per bill, per charge
      title: b.name,
      body: `${b.name} was ${money(actual)} — ${money(diff)} more than usual`,
      at,
    });
  }

  // ── TYPE 4 · MEETING REMINDER — morning of the next meeting, only when enabled ───────────────────
  const sched = data?.profile?.meetingSchedule;
  if (sched && sched.enabled) {
    const { nextDate } = computeNextMeeting(sched, now);
    const at = at9am(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
    if (at > now) {
      out.push({
        type: "meetingReminder",
        id: notifId("meetingReminder", ""),
        title: "Money meeting today",
        body: "Time for your money meeting — a few minutes to stay on the same page.",
        at,
      });
    }
  }

  return out;
}
