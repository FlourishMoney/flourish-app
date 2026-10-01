// src/lib/incomeTypes.js
// -----------------------------------------------------------------------------
// THE INCOME TYPE PICKER IN SETTINGS (prelaunch-copy, prompt 3b, item 2).
//
// The Settings income editor used to save every income it added as "employment", with no way to change
// it, so a Canada Child Benefit added there was counted as a job and showed on Watch as an
// "Est. paycheque". Each income now carries a type chosen from this list. The values are the income
// types the app already uses (watchIncome.js counts only "employment" and "selfemployed" as pay),
// plus "benefit" for "Other benefit": no existing type means "a benefit" in general, and borrowing a
// specific one (EI, SNAP) would mislabel it.
//
// Pension is mapped per country (prompt 3c): "cpp" in Canada, as onboarding saves it, and "pension" in
// the US, so a US household never stores Canada Pension Plan. An income already saved as "cpp" in the
// US stays readable: it is offered under its own name ("CPP / Pension") and kept until changed.
//
// A new income defaults to Job. An existing income keeps the type it was saved with: when that type is
// not one of these six (EI, rental, gig and so on from onboarding), it is offered as an extra choice
// under its own name, selected, so opening Settings never rewrites it. An income saved with no type
// was always treated as a job, so the picker shows Job for it without writing anything.
// -----------------------------------------------------------------------------

export const NEW_INCOME_TYPE = "employment";

// Six choices per country (Pension has one value in each).
export const SETTINGS_INCOME_TYPES = [
  { value: "employment", label: "Job" },
  { value: "selfemployed", label: "Self-employed" },
  { value: "ccb", label: "Canada Child Benefit", country: "CA" },
  { value: "benefit", label: "Other benefit" },
  { value: "cpp", label: "Pension", country: "CA" },
  { value: "pension", label: "Pension", country: "US" },
  { value: "other", label: "Other" },
];

// The names of the other types an income may already carry (from onboarding), so a kept type reads as
// itself rather than as a code.
const KEPT_LABELS = {
  ccb: "Canada Child Benefit", cpp: "CPP / Pension", pension: "Pension",
  ei: "EI benefits", odsp: "ODSP / Ontario Works", rental: "Rental income", gig: "Gig / freelance",
  socialsecurity: "Social Security / SSI", disability: "SSDI / disability", childsupport: "Child support / alimony",
  investment: "Investment income", salary: "Salary", hourly: "Hourly", ssi: "SSI / disability", snap: "SNAP / benefits",
};

// The value the picker shows for an income: its saved type, or Job when it was saved with none.
export function pickerValue(inc) {
  const t = inc && inc.type;
  return t == null || t === "" ? NEW_INCOME_TYPE : t;
}

// The choices for one income, for its country. The Canada Child Benefit is offered only in Canada,
// and Pension is "cpp" in Canada and "pension" in the US. A saved type that is not one of this
// country's six (a CCB or a "cpp" in the US, EI from onboarding) is kept as an extra choice.
export function incomeTypeOptions(country, inc) {
  const c = country === "US" ? "US" : "CA";
  const value = pickerValue(inc);
  const list = SETTINGS_INCOME_TYPES.filter((o) => !o.country || o.country === c)
    .map(({ value: v, label }) => ({ value: v, label }));
  if (!list.some((o) => o.value === value)) list.push({ value, label: KEPT_LABELS[value] || value });
  return list;
}

// A new income from the Settings editor.
export function newSettingsIncome(id = Date.now()) {
  return { id, label: "", amount: "", freq: "biweekly", type: NEW_INCOME_TYPE, isVariable: false, owner: "self" };
}

// Set one income's type. sourceTypes (onboarding's multi-select) is set to match, so the two never
// disagree about what the income is.
export function setIncomeType(incomes, id, type) {
  return (incomes || []).map((x) => (x && x.id === id ? { ...x, type, sourceTypes: [type] } : x));
}
