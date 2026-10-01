// tests/incomeTypePicker.test.cjs
// -----------------------------------------------------------------------------
// THE SETTINGS INCOME EDITOR ASKS WHAT EACH INCOME IS (prelaunch-copy, prompt 3b, item 2).
//
// It used to save every income as "employment" with no way to change it, so a Canada Child Benefit
// added in Settings showed on Watch as an "Est. paycheque". Hand-worked households, MATH-LOCK style:
//   A. A $2,840 biweekly job, then a $560 monthly CCB added in Settings:
//        before (saved as employment): two paycheques, $2,840 and $560
//        after  (type Canada Child Benefit): one paycheque, $2,840
//   B. Two jobs ($2,400 biweekly day job, $600 weekly side job) plus a $560 monthly CCB, all from Settings:
//        two paycheques, $2,400 every 2 weeks then $600 every week; the CCB is not one
// The picker is required, defaults to Job for a new income, and keeps each existing income's saved type.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

(async () => {
  const t = create();
  const T = await import("../src/lib/incomeTypes.js");
  const { watchIncomeFigures } = await import("../src/lib/watchIncome.js");
  const { cadenceLabel } = await import("../src/lib/incomeReconcile.js");
  const TODAY = new Date("2026-10-01T12:00:00");
  const hh = (incomes) => ({ incomes, transactions: [], bills: [], accounts: [], profile: { country: "CA" } });
  const fill = (inc, label, amount, freq) => ({ ...inc, label, amount: String(amount), typicalAmount: String(amount), freq });
  const pays = (incomes) => watchIncomeFigures(hh(incomes), TODAY).paycheques.map(p => [p.label, p.amount, cadenceLabel(p.freq)]);

  // ── 1. The choices ───────────────────────────────────────────────────────────────────────────
  const labels = (country, inc) => T.incomeTypeOptions(country, inc).map(o => `${o.label}=${o.value}`);
  t.eq(labels("CA", T.newSettingsIncome(1)),
    ["Job=employment", "Self-employed=selfemployed", "Canada Child Benefit=ccb", "Other benefit=benefit", "Pension=cpp", "Other=other"],
    "1a the six choices, mapped to the app's income types");
  // Prompt 3c: a US pension has its own type, "pension", never Canada Pension Plan.
  t.eq(labels("US", T.newSettingsIncome(1)), ["Job=employment", "Self-employed=selfemployed", "Other benefit=benefit", "Pension=pension", "Other=other"],
    "1b in the US the Canada Child Benefit is not offered, and Pension saves as \"pension\"");
  t.eq([T.newSettingsIncome(1).type, T.pickerValue(T.newSettingsIncome(1))], ["employment", "employment"], "1c a new income defaults to Job");
  t.eq(T.pickerValue({ id: 1, type: "ccb" }), "ccb", "1d an existing income keeps its saved type");
  t.eq([T.pickerValue({ id: 1 }), T.pickerValue({ id: 1, type: "" })], ["employment", "employment"], "1e an income saved with no type shows Job, as it was always counted");
  t.eq(labels("CA", { id: 1, type: "ei" }).slice(-1), ["EI benefits=ei"], "1f a type from onboarding outside the six is kept, under its own name");
  t.eq(T.setIncomeType([{ id: 1, type: "employment", sourceTypes: ["employment"] }, { id: 2, type: "employment" }], 2, "ccb"),
    [{ id: 1, type: "employment", sourceTypes: ["employment"] }, { id: 2, type: "ccb", sourceTypes: ["ccb"] }], "1g choosing a type changes only that income");

  // ── 2. A CCB entered in Settings is not a paycheque ──────────────────────────────────────────
  {
    const job = fill(T.newSettingsIncome(1), "Full-time Job", 2840, "biweekly");
    const ccbAsBefore = fill(T.newSettingsIncome(2), "Canada Child Benefit", 560, "monthly"); // the old editor: type left as employment
    t.eq(pays([job, ccbAsBefore]).map(p => p[1]), [2840, 560], "2a (before: the CCB showed as a $560 Est. paycheque)");
    const typed = T.setIncomeType([job, ccbAsBefore], 2, "ccb");
    t.eq(pays(typed), [["Full-time Job", 2840, "every 2 weeks"]], "2b with its type set to Canada Child Benefit, Watch shows one paycheque: $2,840");
    for (const ty of ["benefit", "cpp", "other"]) {
      t.eq(pays(T.setIncomeType([job, ccbAsBefore], 2, ty)).length, 1, `2c an income typed ${ty} is not a paycheque either`);
    }
    t.eq(pays(T.setIncomeType([job, ccbAsBefore], 2, "selfemployed")).length, 2, "2d self-employed pay is still counted");
  }

  // ── 3. Two jobs plus the CCB, all entered in Settings ────────────────────────────────────────
  {
    let incomes = [fill(T.newSettingsIncome(1), "Weekend shifts", 600, "weekly"), fill(T.newSettingsIncome(2), "Day job", 2400, "biweekly"),
      fill(T.newSettingsIncome(3), "Canada Child Benefit", 560, "monthly")];
    incomes = T.setIncomeType(incomes, 3, "ccb");
    t.eq(pays(incomes), [["Day job", 2400, "every 2 weeks"], ["Weekend shifts", 600, "every week"]],
      "3a two paycheques, the day job first ($2,400 every 2 weeks) then the side job ($600 every week); the CCB is not one");
    t.eq(watchIncomeFigures(hh(incomes), TODAY).freq, "biweekly", "3b Pay frequency is the day job's");
  }

  // ── 4. The Settings editor renders the picker and uses it ────────────────────────────────────
  let A = {};
  try { A = loadApp(["SettingsSectionContent"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const data = { profile: { country: "CA", province: "ON" }, accounts: [], debts: [], bills: [], transactions: [],
    incomes: [{ id: 1, label: "Day job", amount: "2400", freq: "biweekly", type: "employment" }, { id: 2, label: "CCB", amount: "560", freq: "monthly", type: "ccb" },
      { id: 3, label: "EI", amount: "900", freq: "biweekly", type: "ei" }] };
  let html = "";
  try { html = A.render(A.h(A.SettingsSectionContent, { sectionKey: "profile", data, setAppData: () => {}, color: "#00CC85" })); } catch (e) { t.ok(false, `4 Settings renders: ${describe(e)}`); }
  const selects = html.match(/<select[^>]*aria-label="Income type"[^>]*>[\s\S]*?<\/select>/g) || [];
  t.eq(selects.length, 3, "4a every income has a type picker");
  t.ok(selects.every(s => /\brequired\b/.test(s)), "4b …and it is required");
  const selected = selects.map(s => textOf((s.match(/<option[^>]*selected[^>]*>[^<]*<\/option>/) || [""])[0]).trim());
  t.eq(selected, ["Job", "Canada Child Benefit", "EI benefits"], "4c each picker shows the income's saved type");
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  t.ok(/incomes: \[\.\.\.\(prev\.incomes \|\| \[\]\), newSettingsIncome\(\)\]/.test(app), "4d Add income source adds a Job by default");
  t.ok(/onChange=\{e=>updateIncomeType\(inc\.id,e\.target\.value\)\}/.test(app) && /incomes: setIncomeType\(prev\.incomes, id, type\)/.test(app), "4e the picker saves the chosen type");
  t.ok(!/incomes: \[\.\.\.\(prev\.incomes \|\| \[\]\), \{ id: Date\.now\(\), label: "", amount: "", freq: "biweekly", type: "employment"/.test(app), "4f the old hard-coded employment income is gone from Settings");

  // ── 5. A US pension never saves as Canada Pension Plan (prompt 3c) ───────────────────────────
  {
    const pensionValue = (country) => (T.incomeTypeOptions(country, T.newSettingsIncome(1)).find(o => o.label === "Pension") || {}).value;
    t.eq([pensionValue("US"), pensionValue("CA")], ["pension", "cpp"], "5a Pension is \"pension\" in the US and \"cpp\" in Canada (as onboarding saves it)");
    t.ok(!T.incomeTypeOptions("US", T.newSettingsIncome(1)).some(o => o.value === "cpp"), "5b a US household is never offered cpp");
    const chosen = T.setIncomeType([T.newSettingsIncome(1)], 1, pensionValue("US"));
    t.eq([chosen[0].type, chosen[0].sourceTypes], ["pension", ["pension"]], "5c choosing Pension in the US saves \"pension\"");
    const legacy = { id: 2, label: "Pension", amount: "1800", freq: "monthly", type: "cpp" };
    t.eq([T.pickerValue(legacy), labels("US", legacy).slice(-1)[0]], ["cpp", "CPP / Pension=cpp"], "5d a US income already saved as cpp stays readable, under its own name, until changed");
    t.eq(labels("US", legacy).filter(x => x.startsWith("Pension=")), ["Pension=pension"], "5e …and the US Pension choice is still the one \"pension\" option");
    const hh2 = (incomes) => ({ incomes, transactions: [], bills: [], accounts: [], profile: { country: "US" } });
    const job = fill(T.newSettingsIncome(3), "Job", 2000, "biweekly");
    t.eq(watchIncomeFigures(hh2([job, fill(chosen[0], "Pension", 1800, "monthly")]), TODAY).paycheques.map(p => p.amount), [2000], "5f a US pension is not a paycheque");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/pension:\{label:"Pension",emoji:"🏛️"\}/.test(app), "5g onboarding's income card can name a \"pension\" income");
  }

  t.summary("incomeTypePicker.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
