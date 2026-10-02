// src/lib/meetSnapshot.js — Step 9: bridge from appData → the Meet agenda.
//
// buildMeetSnapshot() reads ONLY existing engine outputs (ForecastEngine, SafeSpendEngine,
// decisionEngine) and appData arrays, and hands them to meetingAgenda.js, which assembles the
// agenda without computing any figure. meetAgendaFor() is the single function both the Meet screen
// and the facilitator context use — so what is displayed is exactly what is generated and sent.

import { ForecastEngine } from "./forecastEngine.js";
import { SafeSpendEngine } from "./safeSpendEngine.js";
import { selectHighestRateDebt, savingsBufferAfter, spareUntilDeposit } from "./decisionEngine.js";
import { buildMeetingAgenda } from "./meetingAgenda.js";
import { detectRecurringBills } from "./plaidNormalize.js";
import { billPrompts, billChangeQuestion } from "./billsReconcile.js";
import { dismissedEntries, lastMeeting, meetingOpening } from "./meetingRecord.js";
import { formatMoney } from "./format.js";
import { safeToSpendView } from "./safeToSpendView.js";
import { isCashAccount, num, buildDebtListForSimulator } from "./financialCalculations.js";
import { weekVersusUsual, categoryPaceDeltas } from "./weeklyReview.js";

const _round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// The safe-to-spend working, exactly as Today's breakdown prints it (safeToSpendView rows), for How
// we got this on Meet. null when Today would show no figure either.
function _safeRows(data) {
  try {
    const hasCashAccount = (data.accounts || []).filter(a => isCashAccount(a)).length > 0;
    const hasIncome = (data.incomes || []).some(i => num(i && i.amount) > 0);
    if (!hasCashAccount || !hasIncome) return null;
    const view = safeToSpendView(SafeSpendEngine.calculate(data), { hasCashAccount, hasIncome });
    if (view.needsSetup || !view.headlineText) return null;
    return [...view.rows.map(r => ({ label: r.sign ? `${r.sign} ${r.label}` : r.label, value: r.value })),
            { label: view.totalLabel, value: view.headlineText }];
  } catch { return null; }
}
const SAFE_MEANING = "What's left in your accounts after the bills due before payday, minimum debt payments, a spending buffer and a savings amount are accounted for. The same figure as Today.";
const _day = (d) => { try { return new Date(d).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }); } catch { return String(d); } };
const _num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
function _fmtDate(d) {
  try { return new Date(d).toLocaleDateString("en-CA", { weekday: "short", day: "numeric" }); }
  catch { return String(d); }
}

// IS THERE ANYTHING TO FORECAST FROM? (prompt 4d) A household with no cash account has no balance:
// the forecast starts from an assumed $0 and every day of it reads as "Low balance $0.00 takes you to
// $0.00", which the agenda used to list day after day. A balance (a cash account) and a payday (an
// income with an amount) are what the meeting's figures are worked out from; until both exist the
// agenda says so in one plain line, and lists no low-balance days.
export const MEET_SETUP_LINE = "Your agenda fills in once Flourish has a balance and a payday to work from.";
export function meetSetupState(data = {}) {
  const hasCashAccount = (data.accounts || []).some(a => isCashAccount(a));
  const hasIncome = (data.incomes || []).some(i => num(i && i.amount) > 0);
  return { hasCashAccount, hasIncome, needsSetup: !hasCashAccount || !hasIncome };
}

// Assemble the snapshot from engine outputs. Sections with no data are omitted; buildMeetingAgenda
// handles a partial snapshot gracefully.
export function buildMeetSnapshot(data = {}) {
  const snap = {};

  // Upcoming risks — from ForecastEngine only (overdraft + low-balance events, next 14 days). Only
  // when there is a balance to project from: with no cash account, every day is an invented $0.
  if (meetSetupState(data).hasCashAccount) try {
    const fc = ForecastEngine.generate(data, 14) || {};
    const forecast = fc.forecast || [];
    const byDay = new Map(forecast.map(f => [f.day, f]));
    const seen = new Set();
    const risks = [];
    [...(fc.overdraftRisk || []), ...(fc.lowBalanceWarnings || [])].forEach(r => {
      if (seen.has(r.day)) return; seen.add(r.day);
      const f = byDay.get(r.day);
      risks.push({
        date: _fmtDate(r.date),
        label: r.balance < 0 ? "Balance goes negative" : "Low balance",
        amount: f ? _round2(Math.abs(f.expenses || 0)) : null,
        balanceAfter: _round2(r.balance),
      });
    });
    if (risks.length) snap.forecastRisks = risks.slice(0, 4);
  } catch { /* forecast unavailable → no risk section */ }

  // The week that just went — the wins and changes sections, which nothing used to fill.
  //
  // Both figures come from weeklyReview.js, which does the counting; this bridge only forwards, the
  // way it already forwards the forecast and the decision. One `now` for both, so a meeting opened
  // a millisecond either side of midnight cannot read two different weeks. weeklyReview returns
  // null / [] when the week or the history is too thin to describe, and nothing is added then —
  // which is what keeps a quiet week quiet, and keeps quietWeekAgendaFor reachable.
  try {
    const now = new Date();
    const txns = data.transactions || [];
    const week = weekVersusUsual({ transactions: txns, now });
    if (week) snap.weekTotal = week;
    // Top three by size. The agenda applies its own threshold on top, so a quiet week still says
    // nothing rather than reading out three differences of four dollars each.
    const deltas = categoryPaceDeltas({ transactions: txns, now }).slice(0, 3);
    if (deltas.length) snap.behaviorDeltas = deltas;
  } catch { /* no usable history → no wins and no changes, which is not a failure */ }

  // Debts and goals → progress (values read straight from appData / engine, never recomputed here).
  const debts = (data.debts || []).filter(d => _num(d.balance) > 0);
  if (debts.length) {
    snap.debts = debts.map(d => ({ name: d.name || "Debt", balance: _round2(_num(d.balance)), prevBalance: null, payoffDate: null }));
  }
  const goals = data.goals || [];
  if (goals.length) {
    snap.goals = goals.map(g => ({
      name: g.name || "Goal",
      current: _round2(_num(g.saved != null ? g.saved : g.current)),
      target: _round2(_num(g.target)),
      projectedDate: g.projectedDate || null,
    }));
  }

  // One question about the spare amount (prompt 3e). It used to offer "Extra $X to <debt>" against
  // "$X into savings", each with an outcome built on moving that amount: a suggested amount for a debt.
  // Now it states the spare amount (spareUntilDeposit, the figure Today shows) and how it was worked
  // out, and lists the top-rate debt and savings by name with their own balances. No amount is
  // suggested for either, and the two options never add up to more than the spare amount.
  try {
    // The same debt list What-If models (a bank-linked card with its bank's APR and minimum).
    const top = selectHighestRateDebt(buildDebtListForSimulator(data.debts, data.liabilities));
    const { spare: extra, safe } = spareUntilDeposit(data);
    if (top && extra > 0) {
      const buf    = savingsBufferAfter(data.accounts, 0); // engine helper: the savings balance now
      let periodEnd = "";
      try {
        const fc2 = ForecastEngine.generate(data, 31) || {};
        const pay = (fc2.forecast || []).find(f => f.day > 0 && f.isPayday);
        if (pay && pay.date) periodEnd = new Date(pay.date).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
      } catch { /* no payday found → generic period label */ }
      const savingsAccts = (data.accounts || []).filter(a => String((a && (a.type || a.subtype)) || "").toLowerCase() === "savings");
      snap.decisions = [{
        question: `${formatMoney(extra)} is spare ${periodEnd ? `before ${periodEnd}` : "until your next deposit"}: a quarter of your ${formatMoney(safe)} safe to spend. Is there anything you want to do with it?`,
        explain: {
          title: `Spare ${periodEnd ? `before ${periodEnd}` : "until your next deposit"}`, value: formatMoney(extra),
          meaning: "A quarter of what's safe to spend until your next payday, rounded down to the dollar. It is a figure to talk about: nothing is moved.",
          rows: [...(_safeRows(data) || [{ label: "= Safe until next payday", value: formatMoney(safe) }]),
                 { label: "× 25%, rounded down", value: formatMoney(extra) }],
          source: "Safe to spend on Today",
        },
        options: [
          { label: top.name || "Your top debt", outcome: `${formatMoney(top.balance)} owed at ${top.rate}%`,
            explain: { title: top.name || "Your top debt", value: formatMoney(top.balance),
              meaning: "The debt with the highest interest rate in your list, and what is owed on it now.",
              rows: [{ label: "Owed now", value: formatMoney(top.balance) },
                     { label: "Interest rate", value: `${top.rate}%${top.rateEstimated ? " (assumed: no rate entered)" : ""}` },
                     ...(num(top.min) > 0 ? [{ label: "Minimum payment", value: formatMoney(num(top.min)) }] : [])],
              source: top.source === "manual" ? "Your debts" : "Your bank" } },
          { label: "Savings", outcome: `${formatMoney(buf.current)} saved now`,
            explain: { title: "Savings", value: formatMoney(buf.current),
              meaning: "The balance of your savings accounts now.",
              rows: [...savingsAccts.map(a => ({ label: a.name || "Savings", value: formatMoney(_num(a.balance)) })), { label: "Total", value: formatMoney(buf.current) }],
              source: "Your accounts" } },
        ],
      }];
    }
  } catch { /* decision unavailable → no decision */ }

  return snap;
}

// ── The reconcile questions (items 2 and 4) ─────────────────────────────────────────────────────
// This is what moves the ASKING into the money meeting. Without it every piece of the loop exists
// and none of it reaches a household: buildMeetingAgenda iterates snapshot.reconcilePrompts, and
// nothing set it.
//
// Suppression comes from DISMISSED answers only (meetingRecord.dismissedSignatures) plus the local
// dismissal field, never from accepted ones — accepting changes the data, so the detector stops
// finding a difference by itself, and treating a yes as permanent would mean a bill added in
// September could never be asked about again.
export function buildReconcilePrompts(data = {}) {
  try {
    const txns = data.transactions || [];
    if (!txns.length) return [];
    // userBillOverrides, NOT billOverrides. The wrong name fell back to {} and the detector ran
    // blind to removed bills, typed amounts, corrected types and corrected cadences — so the
    // meeting asked about bills the household had already removed, with amounts they had already
    // corrected. App.jsx:14155 is the other caller and names it correctly.
    const detected = detectRecurringBills(txns, { overrides: data.userBillOverrides || {}, debts: data.debts || [] });
    const dismissed = [
      ...dismissedEntries(data.meetingRecords || [], "bills"),
      ...(Array.isArray(data.billSuggestionDismissed) ? data.billSuggestionDismissed : []),
    ];
    return billPrompts({ detectedBills: detected, currentBills: data.bills || [], dismissedSignatures: dismissed })
      .map(p => ({
        signature: p.signature,
        text: billChangeQuestion(p.change),
        domain: "bills",
        kind: p.change.kind,
        subject: p.change.name,
      }));
  } catch {
    // A detector failure must not take the meeting down with it: the agenda is still worth having
    // without its questions.
    return [];
  }
}

// The one function the screen renders AND the facilitator receives — displayed === generated === sent.
export function meetAgendaFor(data) {
  const snap = buildMeetSnapshot(data);
  snap.reconcilePrompts = buildReconcilePrompts(data);
  return buildMeetingAgenda(snap);
}

// ITEM 5: what the meeting opens with. Stored answers plus engine output, never the model.
export function meetOpeningFor(data = {}) {
  const records = data.meetingRecords || [];
  return meetingOpening({ lastRecord: lastMeeting(records), snapshot: buildMeetSnapshot(data) });
}

// ── A QUIET WEEK IS STILL A MEETING ───────────────────────────────────────────────────────────
// When nothing stood out, the agenda comes back empty and there is nothing to talk about — which
// used to grey the start button out, so the one week you most want to check in was the week the
// app refused. This builds a short agenda for that case.
//
// Pure, and deliberately so: every figure is passed IN, already computed by an engine. Nothing here
// adds, rounds or estimates. The text carries no bare number of its own — "in the week ahead"
// rather than "in the next 7 days" — so anything numeric that reaches the facilitator can be traced
// to an engine that calculated it.
export function quietWeekAgendaFor({ safeToSpendText = null, safeToSpend = null, safeToSpendLabel = "Safe until next payday", upcoming = [], truncated = false, safeToSpendRows = null, needsSetup = false } = {}) {
  const progress = [];
  // The figure comes PRE-FORMATTED from safeToSpendView, the one owner of how this number is shown.
  // Formatting the engine's raw safeAmount here produced a different number from the rest of the
  // app for the same label — it rounds half-up where the display policy floors the balance and
  // ceils the deductions, so a $2,950 dashboard became a $2,951 agenda. Overstating what is
  // available is the single thing that policy exists to prevent.
  if (safeToSpendText) {
    progress.push({ text: `${safeToSpendLabel}: ${safeToSpendText}.`, value: safeToSpend, source: "safeSpendEngine",
      ...(safeToSpendRows ? { explain: { title: safeToSpendLabel, value: safeToSpendText, meaning: SAFE_MEANING, rows: safeToSpendRows, source: "Safe to spend on Today" } } : {}) });
  }
  // What is coming is neither a risk nor a win. Listing a paycheque under "Upcoming risks" — which
  // the facilitator reads out in order — is simply wrong, and mislabels routine rent the same way.
  const up = (upcoming || []).filter(u => u && u.text).map(u => ({ text: u.text, value: u.value ?? null, source: "forecastEngine", ...(u.explain ? { explain: u.explain } : {}) }));
  if (truncated) up.push({ text: "More items follow in the week ahead.", value: null, source: "meetSnapshot" });
  // Always last. It speaks about the week that HAPPENED, so it does not contradict the items above,
  // which are about the week ahead. With nothing to work from yet (no balance or no payday) there is
  // no week to describe: the one line says what the agenda is waiting for instead.
  progress.push(needsSetup
    ? { text: MEET_SETUP_LINE, value: null, source: "meetSnapshot" }
    : { text: "Nothing unusual happened this week.", value: null, source: "meetSnapshot" });
  return { wins: [], changes: [], risks: [], progress, decisions: [], questions: [], upcoming: up, quiet: true };
}

// The figures for the above, read from the engines exactly as every other part of the agenda does.
export function quietWeekFiguresFor(data = {}) {
  // Read the figure through safeToSpendView, exactly as every screen that shows it does — including
  // its refusals. No cash account means no balance to subtract from, and no income means the app
  // already declines to show this number anywhere else; the meeting does not get a private version.
  let safeToSpendText = null, safeToSpend = null, safeToSpendRows = null;
  try {
    const hasCashAccount = (data.accounts || []).filter(a => isCashAccount(a)).length > 0;
    const hasIncome = (data.incomes || []).some(i => num(i && i.amount) > 0);
    if (hasCashAccount && hasIncome) {
      const view = safeToSpendView(SafeSpendEngine.calculate(data), { hasCashAccount, hasIncome });
      if (!view.needsSetup && view.headlineText) { safeToSpendText = view.headlineText; safeToSpend = view.headline; safeToSpendRows = _safeRows(data); }
    }
  } catch { safeToSpendText = null; safeToSpend = null; safeToSpendRows = null; }

  const upcoming = [];
  try {
    const fc = ForecastEngine.generate(data, 7) || {};
    (fc.forecast || []).forEach(day => {
      if (!day || day.day < 1 || day.day > 7) return;
      (day.bills || []).forEach(b => {
        const amt = num(b?.amount);   // num(), not parseFloat: "$1,800" must not read as 1
        if (!b?.name || !amt) return;
        upcoming.push({ text: `${_fmtDate(day.date)}: ${b.name} ${formatMoney(amt)} out.`, value: amt,
          explain: { title: b.name, value: formatMoney(amt),
            meaning: b._debt ? "The minimum payment on this debt, on the day the forecast expects it."
              : b._expected ? "A payment out you added as expected money on Watch."
              : "A bill from your list, on the day the forecast expects it.",
            rows: [{ label: "Due", value: _day(day.date) }, { label: "Amount", value: formatMoney(amt) }],
            source: b._debt ? "Your debts" : b._expected ? "Expected money in or out, on Watch" : "Your bills" } });
      });
      (day.deposits || []).forEach(dep => {
        const amt = num(dep?.amount);
        if (!dep?.label || !amt) return;
        upcoming.push({ text: `${_fmtDate(day.date)}: ${dep.label} ${formatMoney(amt)} in.`, value: amt,
          explain: { title: dep.label, value: formatMoney(amt),
            meaning: dep.kind === "income" ? "A deposit from your income, on the day the forecast expects it." : "Money in you added as expected on Watch.",
            rows: [{ label: "Expected", value: _day(day.date) }, { label: "Amount", value: formatMoney(amt) }],
            source: dep.kind === "income" ? "Your income" : "Expected money in or out, on Watch" } });
      });
    });
  } catch { /* no forecast is not a reason to refuse the meeting */ }
  return { safeToSpendText, safeToSpend, safeToSpendRows, upcoming: upcoming.slice(0, 6), truncated: upcoming.length > 6,
           needsSetup: meetSetupState(data).needsSetup };
}

// ── WHAT IS COMING IS NOT ONLY FOR A QUIET WEEK ─────────────────────────────────────────────────
// quietWeekAgendaFor was written as a SUBSTITUTE: an empty agenda was replaced wholesale by the
// safe-to-spend figure and what falls due in the next seven days. That was safe while the wins and
// changes sections were dead, because almost every agenda without a decision was empty. Now that
// they fill, a household whose week had something in it would have LOST the rent due on Thursday
// and the number they came to the meeting for, in exchange for one line about their groceries.
//
// So those figures are ADDED instead, to any agenda that does not already carry what is coming.
// Nothing is computed here either: both come from quietWeekFiguresFor, which reads them through
// safeToSpendView exactly as every screen that shows them does, refusals included.
export function withWeekAhead(agenda, data = {}, label = "Safe until next payday") {
  if (!agenda || agenda.quiet) return agenda;
  let f;
  try { f = quietWeekFiguresFor(data); } catch { return agenda; }
  // The two halves are decided SEPARATELY. A single early return on `risks` meant the household
  // with an overdraft warning — the one most likely to want the number — was the one denied its
  // safe-to-spend line, because a risk is not a safe-to-spend figure.
  const already = (agenda.upcoming || []);
  const upcoming = already.length || (agenda.risks || []).length ? already
    : (f.upcoming || []).filter(u => u && u.text)
        .map(u => ({ text: u.text, value: u.value != null ? u.value : null, source: "forecastEngine", ...(u.explain ? { explain: u.explain } : {}) }))
        .concat(f.truncated ? [{ text: "More items follow in the week ahead.", value: null, source: "meetSnapshot" }] : []);
  const progress = [...(agenda.progress || [])];
  // Keyed on the line itself, not on whether anything else was added: with nothing falling due in
  // the next seven days the upcoming list comes back empty, so a guard that read it would prepend
  // this line again on every call.
  const line = f.safeToSpendText ? `${label}: ${f.safeToSpendText}.` : null;
  if (f.needsSetup && !progress.some(p => p && p.text === MEET_SETUP_LINE)) {
    progress.unshift({ text: MEET_SETUP_LINE, value: null, source: "meetSnapshot" });
  }
  if (line && !progress.some(p => p && p.text === line)) {
    progress.unshift({ text: line, value: f.safeToSpend, source: "safeSpendEngine",
      ...(f.safeToSpendRows ? { explain: { title: label, value: f.safeToSpendText, meaning: SAFE_MEANING, rows: f.safeToSpendRows, source: "Safe to spend on Today" } } : {}) });
  }
  // Compare by CONTENT, not by identity: with nothing falling due in the next seven days the
  // computed list is a fresh empty array, so an identity check returned a new object for a call
  // that changed nothing, and the guard read as if it did not.
  const sameUpcoming = upcoming.length === already.length && upcoming.every((u, i) => u === already[i]);
  if (sameUpcoming && progress.length === (agenda.progress || []).length) return agenda;
  return { ...agenda, upcoming, progress };
}

// True when the assembled agenda has nothing in it — the case quietWeekAgendaFor exists for.
export function agendaIsEmpty(agenda) {
  if (!agenda) return true;
  const n = (k) => (agenda[k] || []).length;
  // questions MUST be counted. agendaToText sends them, and they are the reconcile loop's whole
  // output — "is Netflix a new regular bill?" — so treating an agenda that holds only questions as
  // empty would replace it, throw the questions away, and then tell the household nothing came up
  // in the very week the app had something to ask.
  return n("wins") + n("changes") + n("risks") + n("progress") + n("decisions") + n("questions") === 0;
}

// Which facilitator state the Meet screen shows (item 3). Pure, so it can be unit-tested:
//   'trial'  — unauthenticated/demo OR free tier: no input; "Start your trial to run the meeting..."
//   'ai-off' — eligible but AI off: no input; "Coach is off in Settings. Your agenda is above."
//   'ready'  — signed-in trial/premium/beta_founder with AI on: the ONLY state that shows the input.
export function facilitatorGateState({ demo, canFacilitate, aiOn }) {
  if (demo || !canFacilitate) return "trial";
  if (!aiOn) return "ai-off";
  return "ready";
}

// Serialize the agenda to the plain text the facilitator operates on (its ONLY source of figures).
export function agendaToText(agenda) {
  const lines = [];
  const sect = (title, items, render) => {
    if (!items || !items.length) return;
    lines.push(title + ":");
    items.forEach(i => lines.push("- " + render(i)));
  };
  sect("Wins", agenda.wins, i => i.text);
  sect("Changes", agenda.changes, i => i.text);
  sect("Upcoming risks", agenda.risks, i => i.text);
  sect("Coming up", agenda.upcoming, i => i.text);
  sect("Progress", agenda.progress, i => i.text);
  if (agenda.decisions && agenda.decisions.length) {
    lines.push("Decisions:");
    agenda.decisions.forEach(d => {
      lines.push("- " + d.text);
      (d.options || []).forEach(o => lines.push(`    • ${o.label}: ${o.outcome}`));
    });
  }
  // The questions the household is being asked. The facilitator READS these out; it does not
  // compose them and must not restate their figures differently — every one is already phrased by
  // its domain, from engine output.
  if (agenda.questions && agenda.questions.length) {
    lines.push("Questions to ask (read as written, do not restate the figures):");
    agenda.questions.forEach(q => lines.push(`- ${q.text}`));
  }
  return lines.join("\n");
}
