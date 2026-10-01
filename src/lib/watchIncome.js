// src/lib/watchIncome.js
// -----------------------------------------------------------------------------
// THE INCOME FIGURES WATCH SHOWS, read through primaryIncome() (incomeReconcile.js), never incomes[0].
//
// Watch printed the pay frequency, the Est. paycheque and its balance-bar scale from whichever income
// happened to be first in the list. Income lists are in the order they were added, so a household whose
// list starts with a small monthly benefit read "Pay frequency: Monthly" and "Est. paycheque: $560"
// above a forecast built on a biweekly $2,840 job (KNOWN-DEFECTS 4).
//
//   freq             the primary income's frequency (the largest real income: the paycheque).
//   scalePerDeposit  the primary income's per-deposit amount, for the balance-bar scale only.
//   paycheques       one entry per job (type "employment", or no type: the form's default), the primary
//                    job first, then by size. A household with two jobs gets two paycheques, each with
//                    its own amount and frequency, instead of one job's pay passed off as the household's.
//                    With no job at all (a pension, benefits), the primary income stands in, as before.
//                    Each amount is as the household corrected it (monthlyIncomeBasis: a change from a
//                    date on, or the low end when the pay varies).
// -----------------------------------------------------------------------------
import { primaryIncome } from "./incomeReconcile.js";
import { perDepositAmount } from "./incomeSchedule.js";
import { monthlyIncomeBasis } from "./forecastEdits.js";

const isJob = (i) => !!i && (i.type == null || i.type === "" || i.type === "employment");
const hasPay = (i) => !!i && (perDepositAmount(i) != null || !!i.isVariable);

export function watchIncomeFigures(data, today = new Date()) {
  const incomes = (data && Array.isArray(data.incomes)) ? data.incomes.filter(Boolean) : [];
  const primary = primaryIncome(incomes); // { inc, amount } | null
  const jobs = incomes.filter(i => isJob(i) && hasPay(i));
  let payList = jobs;
  if (!payList.length) payList = primary && hasPay(primary.inc) ? [primary.inc] : [];
  const lead = primaryIncome(payList);
  const ordered = lead
    ? [lead.inc, ...payList.filter(i => i !== lead.inc).sort((a, b) => (perDepositAmount(b) || 0) - (perDepositAmount(a) || 0))]
    : payList;
  const paycheques = ordered.map(i => ({
    label: String(i.label || "").trim().slice(0, 28) || null,
    freq: i.freq || null,
    amount: monthlyIncomeBasis(i, data, today),
  }));
  return {
    freq: primary ? (primary.inc.freq || null) : null,
    scalePerDeposit: primary ? (perDepositAmount(primary.inc) || 0) : 0,
    paycheques,
  };
}
