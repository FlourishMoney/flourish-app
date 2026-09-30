// tests/budgetGoalsRender.test.cjs
// -----------------------------------------------------------------------------
// THE BUDGET VIEWS MUST RENDER FOR A HOUSEHOLD THAT HAS SET A BUDGET.
//
// Do → Goals → Budget built "Where you could save" from `actuals[cat]`, a per-category 90-day
// average that generateBudgetSuggestions stopped returning in 44a6cc9 (its suggestions are now
// "NEVER blended with history"). Nothing declared `actuals` after that, so the tab threw
// ReferenceError for every household with a budget. `vite build` accepts an undeclared name, the
// demo has no budgets, and every other suite reads App.jsx as text, so nothing caught it.
//
// Do → Budget (BudgetScreen) had the same kind of break. Its goal savings reminder counts and lists
// `activeGoals`, which only Goals declares: 44a6cc9 moved BudgetScreen's goal sum into
// generateBudgetSuggestions and deleted the list it was built from. It threw whenever a household
// with a budget was still saving toward a goal.
//
// Once Goals → Budget rendered again, its "Available for spending" was shown to be wrong: it took the
// goal savings off `discret`, which generateBudgetSuggestions has already taken them off. Do → Budget
// shows `discret` itself, so the two screens disagreed by exactly the goal savings.
//
// This renders the real components from src/App.jsx (bundled with esbuild, rendered with
// react-dom/server) for a household with budgets, goals and this month's spending, and checks what
// the screen says.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const REPO = path.join(__dirname, "..");

// src/App.jsx plus the exports this suite needs, in one bundle with react-dom/server so the renderer
// and the components share one copy of React. Nothing is written to disk.
function loadApp() {
  const esbuild = require(path.join(REPO, "node_modules", "esbuild"));
  const contents = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8") + `
export { Goals as __Goals, BudgetScreen as __BudgetScreen, generateBudgetSuggestions as __generateBudgetSuggestions,
  buildDemoState as __buildDemoState };
export { renderToStaticMarkup as __renderToStaticMarkup } from "react-dom/server";
export { createElement as __createElement } from "react";
`;
  const { outputFiles } = esbuild.buildSync({
    stdin: { contents, resolveDir: path.join(REPO, "src"), sourcefile: "App.jsx", loader: "jsx" },
    absWorkingDir: REPO, bundle: true, platform: "node", format: "cjs", jsx: "automatic",
    write: false, logLevel: "error", sourcemap: "inline", sourcesContent: false,
    // Loaded on demand (error reporting, PDF import, the review prompt), never while rendering.
    external: ["@sentry/react", "pdfjs-dist", "pdfjs-dist/*", "@capacitor-community/in-app-review"],
    // Placeholders: the Supabase client is created at import and throws without a URL and key.
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://placeholder.invalid"),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("placeholder"),
      "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(""),
      "import.meta.env.VITE_BUILD_SHA": JSON.stringify("test"),
      "import.meta.env.MODE": JSON.stringify("test"),
    },
  });

  // The browser the components read while rendering, set the same way on every Node version (CI
  // runs Node 20, which has no navigator).
  const store = new Map();
  const browser = {
    window: globalThis,
    innerWidth: 390,
    navigator: { userAgent: "", language: "en-CA" },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
  };
  for (const [k, value] of Object.entries(browser)) {
    Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  }

  process.setSourceMapsEnabled(true); // so a render error names its line in src/App.jsx
  const file = path.join(REPO, "render-bundle.cjs"); // never written; resolves modules from the repo
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(REPO);
  m._compile(outputFiles[0].text, file);
  return m.exports;
}

// The visible text of rendered markup, whitespace collapsed.
const textOf = (html) => html.replace(/<[^>]*>/g, " ")
  .replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
// The text after `start`, up to `end`, or null when `start` is not on the screen.
const between = (text, start, end) => {
  const i = text.indexOf(start);
  if (i < 0) return null;
  const j = text.indexOf(end, i + start.length);
  return text.slice(i + start.length, j < 0 ? undefined : j).trim();
};
// A render error, with the src/App.jsx line it came from.
const describe = (e) => `${e && e.name}: ${e && e.message} ${(String(e && e.stack).split("\n").find((l) => l.includes("App.jsx")) || "").trim()}`;

// This month, as the screens count it: local dates, read as `t.date + "T12:00:00"`.
const now = new Date();
const thisMonth = (d) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const household = {
  profile: { country: "CA", status: "single" },
  incomes: [{ name: "Pay", amount: 5000, freq: "monthly" }],
  bills: [], debts: [], accounts: [],
  budgets: { "Coffee & Dining": 100, "Groceries": 400, "Subscriptions": 10 },
  transactions: [
    { id: "t1", name: "Corner Cafe", cat: "Coffee & Dining", amount: 150, date: thisMonth(1) }, // 50% over
    { id: "t2", name: "Fresh Market", cat: "Groceries", amount: 450, date: thisMonth(1) },     // 12.5% over
    { id: "t3", name: "Stream Plus", cat: "Subscriptions", amount: 15, date: thisMonth(1) },    // 50% over, $15
  ],
  goals: [
    { name: "Trip", target: 2400, saved: 0, monthly: 100 },
    { name: "Laptop", target: 1200, saved: 0 },          // no monthly amount: ceil(1200 / 24) = $50
    { name: "Emergency fund", target: 500, saved: 500 }, // reached, so not an active goal
  ],
};

(async () => {
  const t = create();
  let app = null;
  try { app = loadApp(); } catch (e) { t.ok(false, `src/App.jsx bundles and loads for rendering: ${describe(e)}`); }
  if (!app) return t.summary("budgetGoalsRender.test");
  const { __Goals: Goals, __BudgetScreen: BudgetScreen, __generateBudgetSuggestions: generateBudgetSuggestions,
    __buildDemoState: buildDemoState, __renderToStaticMarkup: render, __createElement: h } = app;
  const noop = () => {};

  // ── Do → Goals → Budget ─────────────────────────────────────────────────────
  // "Where you could save" lists a budget once this month's spending is more than 20% over it and
  // above $20, and says how far over it is. It projects nothing: one month is not a monthly saving.
  let goalsBudget = null;
  try {
    goalsBudget = textOf(render(h(Goals, { data: household, initialTab: "budget", setAppData: noop, setScreen: noop })));
  } catch (e) {
    t.ok(false, `Do → Goals → Budget renders for a household with a budget: ${describe(e)}`);
  }
  if (goalsBudget != null) {
    const panel = between(goalsBudget, "Where you could save", "Monthly Category Budgets");
    t.ok(panel != null, "Goals → Budget shows \"Where you could save\" when a budget is more than 20% over this month");
    if (panel != null) {
      t.ok(panel.includes("Coffee & Dining $50 over budget here this month"), `Coffee & Dining, $150 against $100, is listed as "$50 over budget here this month" (panel: ${panel})`);
      t.ok(!/Save|\/mo/.test(panel), `the panel states the overage and projects no saving per month (panel: ${panel})`);
      t.ok(!panel.includes("Groceries"), `Groceries, 12.5% over, is under the 20% bar (panel: ${panel})`);
      t.ok(!panel.includes("Subscriptions"), `Subscriptions, 50% over on $15 spent, is under the $20 floor (panel: ${panel})`);
    }
  }

  // ── Do → Budget ─────────────────────────────────────────────────────────────
  // Once a budget is set, the screen reminds the household of its goal savings. The reminder shows
  // when goalsMo (the "Goal savings" line of "How that is worked out") is above $0, so it has to
  // count and list exactly the goals goalsMo adds up.
  let budget = null;
  try {
    budget = textOf(render(h(BudgetScreen, { data: household, setAppData: noop, setScreen: noop })));
  } catch (e) {
    t.ok(false, `Do → Budget renders for a household with a budget and a goal: ${describe(e)}`);
  }
  if (budget != null) {
    const { goalsMo } = generateBudgetSuggestions(household);
    t.eq(goalsMo, 150, "sanity: the household's goal savings are Trip's $100 plus Laptop's $50 a month");
    const reminder = between(budget, "Saving toward", "Category Breakdown");
    const m = reminder && reminder.match(/^(\d+) goals? (.*)$/);
    t.ok(!!m, `Do → Budget shows the goal savings reminder (text: ${reminder})`);
    if (m) {
      const rows = [...m[2].matchAll(/(.+?) \$(-?\d+)\/mo · \d+% saved/g)].map((r) => ({ name: r[1].trim(), monthly: Number(r[2]) }));
      t.eq(Number(m[1]), 2, "the reminder counts the two goals still being saved for");
      t.eq(rows.map((r) => r.name), ["Trip", "Laptop"], "it lists exactly those goals, not the one already reached");
      t.eq(rows.reduce((s, r) => s + r.monthly, 0), goalsMo, "the monthly amounts it lists add up to the Goal savings figure");
    }
  }

  // ── What is left to spend: Goals → Budget and Do → Budget must say the same ──────────────────
  // `discret` is take-home less fixed bills, the savings target and goal savings. Do → Budget shows
  // it as "Available to spend"; Goals → Budget's "Available for spending" has to be the same amount.
  const dollars = (text, re) => { const m = text && text.match(re); return m ? Number(m[1].replace(/\D/g, "")) : null; };
  for (const [label, data, expected] of [
    // $3,750 take-home, no bills, $563 savings target (15%), $150 goal savings.
    ["the test household", household, 3037],
    // The demo with one goal saving $150 a month: $4,700 − $2,177 − $705 − $150.
    ["the demo household with a $150-a-month goal",
      { ...buildDemoState("CA"), goals: [{ name: "Vacation", target: 2400, saved: 600, monthly: 150 }] }, 1668],
    // Goals bigger than what is left: nothing is available, and neither screen may invent a figure.
    ["a household whose goals take everything left",
      { ...household, incomes: [{ name: "Pay", amount: 1000, freq: "monthly" }], goals: [{ name: "House", target: 50000, saved: 0, monthly: 2000 }] }, 0],
  ]) {
    let inGoals = null, inBudget = null;
    try {
      inGoals = dollars(textOf(render(h(Goals, { data, initialTab: "budget", setAppData: noop, setScreen: noop }))), /Available for spending \$([\d,.\s]+?) ?\/mo/);
      inBudget = dollars(textOf(render(h(BudgetScreen, { data, setAppData: noop, setScreen: noop }))), /Available to spend \$([\d,.\s]+?) ?\/mo/);
    } catch (e) {
      t.ok(false, `${label}: both budget screens render: ${describe(e)}`);
      continue;
    }
    t.eq(generateBudgetSuggestions(data).discret, expected, `sanity: ${label} has $${expected} a month left to spend`);
    t.eq(inBudget, expected, `${label}: Do → Budget shows $${expected} available to spend`);
    t.eq(inGoals, inBudget, `${label}: Goals → Budget shows the same amount available as Do → Budget`);
  }

  t.summary("budgetGoalsRender.test");
})();
