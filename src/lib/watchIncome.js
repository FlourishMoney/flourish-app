// src/lib/watchIncome.js
// -----------------------------------------------------------------------------
// THE INCOME FIGURES WATCH SHOWS, read through primaryIncome() (incomeReconcile.js), never incomes[0].
//
// Watch printed the pay frequency, the Est. paycheque and its balance-bar scale from whichever income
// happened to be first in the list. Income lists are in the order they were added, so a household whose
// list starts with a small monthly benefit read "Pay frequency: Monthly" and "Est. paycheque: $560"
// above a forecast built on a biweekly $2,840 job (KNOWN-DEFECTS 4).
//
//   freq             the frequency of the first paycheque below, so "Pay frequency" always describes the
//                    "Est. paycheque" printed under it.
//   scalePerDeposit  the largest income's per-deposit amount (primaryIncome of all), for the bar scale only.
//   paycheques       one entry per income from work (type "employment" or "selfemployed", or no type: the
//                    form's default), the largest first (primaryIncome of those), then by size. A household with two jobs gets two paycheques, each with
//                    its own amount and frequency, instead of one job's pay passed off as the household's.
//                    With no job at all (a pension, benefits), the primary income stands in, as before.
//                    Each amount is as the household corrected it (monthlyIncomeBasis: a change from a
//                    date on, or the low end when the pay varies).
// -----------------------------------------------------------------------------
import { primaryIncome } from "./incomeReconcile.js";
import { perDepositAmount } from "./incomeSchedule.js";
import { monthlyIncomeBasis } from "./forecastEdits.js";

const isJob = (i) => !!i && (i.type == null || i.type === "" || i.type === "employment" || i.type === "selfemployed");
// A long income name is cut at a word with an ellipsis, so a row never ends mid-word.
const shortLabel = (s) => {
  const t = String(s || "").trim();
  if (t.length <= 28) return t || null;
  const cut = t.slice(0, 27); const sp = cut.lastIndexOf(" ");
  return (sp > 12 ? cut.slice(0, sp) : cut).replace(/[\s,.;:-]+$/, "") + "…";
};
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
    label: shortLabel(i.label),
    freq: i.freq || null,
    amount: monthlyIncomeBasis(i, data, today),
  }));
  return {
    freq: ordered.length ? (ordered[0].freq || null) : (primary ? (primary.inc.freq || null) : null),
    scalePerDeposit: primary ? (perDepositAmount(primary.inc) || 0) : 0,
    paycheques,
  };
}
