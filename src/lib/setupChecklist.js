// src/lib/setupChecklist.js
// -----------------------------------------------------------------------------
// THE SETUP CHECKLIST ON TODAY (tester suggestions, item 1).
//
// Five things, each ticked from real state and never from a tap on the checklist itself:
//   payday     an income with an amount (the forecast needs one to place a payday)
//   bills      at least one bill
//   bank       a linked bank, or an account imported from a statement (institution "Statement")
//   number     Today has shown a safe-to-spend figure at least once (recorded when the hero shows it)
//   meeting    a money meeting was marked done (profile.meetingSchedule.lastMeetingAt)
// The card is dismissible, and gone for good once every item is done. Never in demo mode: sample
// data is not the household's own setup, so "bank linked" would be ticked by an example.
// -----------------------------------------------------------------------------

export const NUMBER_SEEN_KEY = "flourish_first_number_seen";
export const CHECKLIST_DISMISSED_KEY = "flourish_setup_checklist_dismissed";

const amount = (v) => { const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : 0; };

export function setupChecklist(data = {}, { numberSeen = false } = {}) {
  const incomes = Array.isArray(data.incomes) ? data.incomes : [];
  const bills = Array.isArray(data.bills) ? data.bills : [];
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const lastMeetingAt = data.profile && data.profile.meetingSchedule && data.profile.meetingSchedule.lastMeetingAt;
  return [
    { id: "payday",  label: "Payday set",                          done: incomes.some((i) => i && amount(i.amount) > 0) },
    { id: "bills",   label: "Bills added",                         done: bills.length > 0 },
    { id: "bank",    label: "Bank linked or statement imported",   done: !!data.bankConnected || accounts.some((a) => a && a.institution === "Statement") },
    { id: "number",  label: "First number seen",                   done: !!numberSeen },
    { id: "meeting", label: "First money meeting held",            done: !!lastMeetingAt },
  ];
}

export function showSetupChecklist(data = {}, { numberSeen = false, dismissed = false } = {}) {
  if (data.demo || dismissed) return false;
  return setupChecklist(data, { numberSeen }).some((i) => !i.done);
}
