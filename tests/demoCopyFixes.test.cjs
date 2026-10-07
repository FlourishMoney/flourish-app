// tests/demoCopyFixes.test.cjs
// -----------------------------------------------------------------------------
// MUSE'S DEMO REVIEW (2026-10-06): the fixes that need more than a word changed.
//
//   1. The tax authority is the household's: "CRA" in Canada, "IRS" in the US, never "CRA or IRS".
//   4. The demo's check-in never calls the AI. It shows a fixed "Sample insight" built only from the
//      demo's own figures.
//   5. The bell badge and the notification panel read ONE unread count.
//   7. Budget suggestions say "Typical starting points" until the household has 30 or more days of its
//      own transactions; from then on they are its observed spending. The demo stays typical.
//   +  No user-visible string says "Safe to Spend", "safe-to-spend" or "CRA or IRS".
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const noop = () => {};
const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);

(async () => {
  const t = create();
  let A = {};
  try {
    A = loadApp(["Goals", "SupportPage", "faqFor", "Notifications", "notifListFor", "unreadNotifCount", "buildDemoState",
      "generateBudgetSuggestions", "BudgetScreen", "BudgetPlanCard", "WeeklyCheckInModal"]);
  } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const L = await import("../src/lib/locale.js");
  const B = await import("../src/lib/budgetBasis.js");
  const DC = await import("../src/lib/demoCoach.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");

  const demoCA = A.buildDemoState ? A.buildDemoState("CA") : null;
  const demoUS = A.buildDemoState ? A.buildDemoState("US") : null;

  // ── 1. CRA in Canada, IRS in the US, never both ──────────────────────────────────────────────
  {
    t.eq([L.taxAuthority("CA"), L.taxAuthority("US"), L.taxAuthority(undefined)], ["CRA", "IRS", "CRA"],
      "1a the tax authority is the household's: CRA in Canada (and by default), IRS in the US");
    if (A.Goals && demoCA && demoUS) {
      for (const [data, auth, other, who] of [[demoCA, "CRA", "IRS", "the Canadian demo"], [demoUS, "IRS", "CRA", "a US household"]]) {
        const tax = textOf(A.render(A.h(A.Goals, { data, initialTab: "tax", setAppData: noop, setScreen: noop })));
        t.ok(tax.includes(`Eligibility is decided by the ${auth}.`) && !/CRA or IRS|CRA\/IRS/.test(tax),
          `1b Tax Tips footer, ${who}: "Eligibility is decided by the ${auth}."`);
        const ret = textOf(A.render(A.h(A.Goals, { data, initialTab: "retire", setAppData: noop, setScreen: noop })));
        t.ok(ret.includes(`Limits are from the ${auth}, with the year.`) && !ret.includes(`from the ${other},`),
          `1c Retirement header, ${who}: "Limits are from the ${auth}, with the year."`);
      }
    }
    if (A.faqFor) {
      const where = (c) => A.faqFor(c).find(f => f.q === "Where do the numbers come from?").a;
      t.ok(where("CA").includes("come from the CRA, with the year") && where("US").includes("come from the IRS, with the year"),
        "1d the FAQ names the household's authority");
      const support = textOf(A.render(A.h(A.SupportPage, { onBack: noop })));
      t.ok(support.includes("come from the CRA, with the year") && !/CRA or IRS/.test(support), "1e /support with no household reads for Canada");
    }
    t.eq((APP.match(/\(\{taxAuthority\(data\?\.profile\?\.country\)\}\) before making/g) || []).length, 2,
      "1f both \"official sources\" disclaimers (What-If and the coach) name the household's authority");
  }

  // ── 4. the demo's check-in never calls the AI ────────────────────────────────────────────────
  {
    const fi = APP.slice(APP.indexOf("const fetchInsight = async () => {"), APP.indexOf("const steps = [", APP.indexOf("const fetchInsight = async () => {")));
    const demoAt = fi.indexOf("if (data.demo) {"), returnAt = fi.indexOf("return;", demoAt), fetchAt = fi.indexOf("fetch(");
    t.ok(demoAt > 0 && returnAt > demoAt && fetchAt > returnAt, "4a in the demo the check-in returns before any request to the coach");
    t.ok(/setInsight\(sample\); setInsightIsSample\(true\);/.test(fi) && /demoCheckInInsight\(data\)/.test(fi), "4b …and shows the fixed demo insight");
    t.ok(/\{insightIsSample \? "Sample insight" : "Your AI Coach Says"\}/.test(APP), "4c …labelled \"Sample insight\", never as the AI coach");
    const demoCoachSrc = fs.readFileSync(path.join(REPO, "src", "lib", "demoCoach.js"), "utf8");
    t.ok(!/\bfetch\(|XMLHttpRequest/.test(demoCoachSrc.replace(/\/\/.*$/gm, "")), "4d the sample insight's module makes no network call");

    if (demoCA) {
      const today = new Date();
      const text = DC.demoCheckInInsight(demoCA, today);
      const view = safeToSpendView(SafeSpendEngine.calculate(demoCA, today));
      t.ok(typeof text === "string" && text.includes(view.headlineText) && text.includes(view.balanceText),
        `4e the insight states the demo's own safe to spend (${view.headlineText}) and balance (${view.balanceText})`);
      const shown = new Set(view.rows.map(r => r.value).concat([view.headlineText]));
      const figures = text.match(/\$[\d,]+(?:\.\d+)?/g) || [];
      t.ok(figures.length >= 3 && figures.every(f => shown.has(f)), `4f every figure in it is one the Today card shows (${figures.join(", ")}); none is invented`);
      t.ok(!/\byou should\b|\btry to\b|\bconsider\b|\bwill (?:save|improve|raise)\b/i.test(text), "4g it explains; it does not direct or promise");
      if (A.WeeklyCheckInModal) {
        const realFetch = global.fetch; let calls = 0;
        global.fetch = async () => { calls++; throw new Error("no network in test"); };
        try { A.render(A.h(A.WeeklyCheckInModal, { data: demoCA, onClose: noop, onComplete: noop })); } finally { global.fetch = realFetch; }
        t.eq(calls, 0, "4h opening the demo's check-in makes no request");
      }
    }
  }

  // ── 5. one unread count for the bell and the panel ───────────────────────────────────────────
  if (A.notifListFor && demoCA) {
    const realHouse = { ...demoCA, demo: false };
    for (const [data, who] of [[demoCA, "the demo"], [realHouse, "a real household"], [null, "no data yet"]]) {
      for (const read of [[], [1], ["bill_0"], [1, "bill_0", "bill_1"]]) {
        const readIds = new Set(read);
        const panel = A.notifListFor(data, readIds).filter(n => !n.read).length;
        t.eq(A.unreadNotifCount(data, readIds), panel, `5a ${who}, read ${JSON.stringify(read)}: the badge count is the panel's (${panel})`);
      }
    }
    t.ok(A.notifListFor(demoCA).some(n => n.id === 1) && A.notifListFor(demoCA).find(n => n.id === 1).read,
      "5b demo: the welcome notice is in the list, already read, so neither count includes it");
    const html = A.render(A.h(A.Notifications, { onClose: noop, data: demoCA, onMarkAllRead: noop }));
    const n = A.unreadNotifCount(demoCA, new Set());
    t.ok(n === 0 ? !/\d+ unread/.test(textOf(html)) : textOf(html).includes(`${n} unread`), `5c the panel renders the same number (${n})`);
    t.eq((APP.match(/unreadNotifCount\(/g) || []).length >= 4 && !/badgeInitNotifs/.test(APP) &&
      !/\.filter\(n=>!readIds\.has\(n\.id\)\)\.length/.test(APP), true,
      "5d the Today bell, the app shell and the panel all call unreadNotifCount; no second count is left");
  }

  // ── 7. typical starting points until 30 days of the household's own transactions ─────────────
  {
    const today = new Date("2026-10-07T12:00:00");
    const tx = (daysAgo, amount, cat) => ({ date: iso(today.getTime() - daysAgo * DAY), amount, cat, name: cat });
    const house = (txns, extra = {}) => ({ transactions: txns, ...extra });
    const t29 = house([tx(28, 120, "Groceries"), tx(3, 40, "Coffee & Dining")]);
    const t30 = house([tx(29, 300, "Groceries"), tx(10, 300, "Groceries"), tx(5, 60, "Coffee & Dining"), tx(4, 900, "Rent"), tx(2, -2840, "Income")]);
    t.eq([B.ownHistoryDays(t29, today), B.budgetSuggestionBasis(t29, today).basis, B.budgetSuggestionBasis(t29, today).label],
      [29, "typical", "Typical starting points"], "7a 29 days of its own transactions: \"Typical starting points\"");
    t.eq([B.ownHistoryDays(t30, today), B.budgetSuggestionBasis(t30, today).basis], [30, "observed"], "7b 30 days: based on its observed spending");
    t.eq(B.budgetSuggestionBasis(t30, today).label, "Based on your spending over the last 30 days", "7c …and says so");
    t.eq(B.observedMonthlySpend(t30, today), { "Groceries": 610, "Coffee & Dining": 60 },
      "7d observed: each category's monthly average over the days it has (600 over 30 days = $610 a month; bills and income left out)");
    t.eq(B.budgetSuggestionBasis(house([]), today).basis, "typical", "7e no transactions: typical");
    t.eq(B.budgetSuggestionBasis({ ...t30, demo: true }, today).basis, "typical", "7f the demo is sample data: always typical, whatever its dates");
    if (demoCA && A.generateBudgetSuggestions) {
      const g = A.generateBudgetSuggestions(demoCA);
      t.eq([g.basis.basis, g.basis.label], ["typical", "Typical starting points"], "7g the demo's budget suggestions are typical starting points");
      const now = new Date();
      const own = { ...demoCA, demo: false, transactions: [
        { date: iso(now.getTime() - 40 * DAY), amount: 400, cat: "Groceries", name: "Grocer" },
        { date: iso(now.getTime() - 2 * DAY), amount: 400, cat: "Groceries", name: "Grocer" },
        { date: iso(now.getTime() - 3 * DAY), amount: 82, cat: "Entertainment", name: "Cinema" }] };
      const g2 = A.generateBudgetSuggestions(own);
      t.eq(g2.basis.basis, "observed", "7h a household with 41 days of its own transactions gets observed suggestions");
      t.eq(g2.suggestions, B.observedMonthlySpend(own, new Date(), (x) => x.cat), "7i …which are exactly its monthly averages, not the typical figures");
      // Both editors (Do → Budget and Spend → This Month) open from an effect or a tap, which a server render
      // does not run; the label's wiring is checked here and the demo screens are checked in a browser.
      t.eq((APP.match(/<div data-budget-basis=\{basis\.basis\} [^>]*>\{basis\.label\}<\/div>/g) || []).length, 2,
        "7j both budget editors show the basis label above the suggested rows");
      t.ok(!APP.includes("Suggested for your household") && /return basis && basis\.basis === "observed" \? "Your monthly average" : "Typical starting point";/.test(APP),
        "7k each suggested row says \"Typical starting point\" (or \"Your monthly average\"), not \"Suggested for your household\"");
    }
  }

  // ── copy: no "Safe to Spend", no "safe-to-spend", no "CRA or IRS" anywhere a person can read ────
  {
    let parser = null;
    try { parser = require(path.join(REPO, "node_modules", "@babel", "parser")); } catch { /* reported below */ }
    t.ok(!!parser, "the copy check can load @babel/parser");
    const FORBIDDEN = [
      [/Safe to Spend/, "\"Safe to Spend\" (sentence case: \"Safe to spend\")"],
      [/safe-to-spend/i, "\"safe-to-spend\" (no hyphens)"],
      [/CRA\s*(?:or|\/)\s*IRS|IRS\s*(?:or|\/)\s*CRA/i, "both tax authorities (name the household's)"],
    ];
    const scan = (src, file) => {
      const hits = [];
      const ast = parser.parse(src, { sourceType: "module", plugins: ["jsx"] });
      (function walk(n) {
        if (!n || typeof n.type !== "string") return;
        const text = n.type === "StringLiteral" ? n.value : n.type === "TemplateElement" ? (n.value.cooked ?? n.value.raw) : n.type === "JSXText" ? n.value : null;
        if (text) for (const [rx, what] of FORBIDDEN) if (rx.test(text)) hits.push(`${file}:${n.loc.start.line} ${what}: "${text.trim().slice(0, 60)}"`);
        for (const k of Object.keys(n)) {
          if (["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "extra"].includes(k)) continue;
          const v = n[k];
          if (Array.isArray(v)) v.forEach(x => x && typeof x.type === "string" && walk(x)); else if (v && typeof v.type === "string") walk(v);
        }
      })(ast.program);
      return hits;
    };
    if (parser) {
      // The scanner itself: it catches each phrase in copy, and ignores a comment.
      const planted = scan(`// Safe to Spend, safe-to-spend, CRA or IRS in a comment is fine
        const a = "Tap Safe to Spend"; const b = <p>your safe-to-spend</p>; const c = \`from the CRA or IRS\`; const d = "CRA/IRS";`, "fixture");
      t.eq(planted.length, 4, "copy-a the check catches each phrase in a string, JSX text and a template, and ignores comments");
      const files = ["App.jsx", "main.jsx", ...fs.readdirSync(path.join(REPO, "src", "lib")).filter(f => /\.jsx?$/.test(f)).map(f => path.join("lib", f))];
      const hits = files.flatMap(f => scan(fs.readFileSync(path.join(REPO, "src", f), "utf8"), f));
      t.eq(hits, [], `copy-b no user-visible string in src/ says "Safe to Spend", "safe-to-spend" or "CRA or IRS" (${files.length} files)`);
      t.ok(/marginBottom:3\}\}>Safe to spend<\/div>/.test(APP), "copy-c sanity: the scan is reading the real copy");
    }
  }

  t.summary("demoCopyFixes.test");
})();
