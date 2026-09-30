// tests/nativeNoPurchase.test.cjs
// -----------------------------------------------------------------------------
// THE STORE APPS NEVER SHOW A WAY TO PAY (QA-surgical item 6).
//
// Apple and Google reject an app that sells a digital subscription outside their own purchase
// systems, and Flourish has no in-app purchase. So in a native shell nothing may render a trial that
// ended, an "Upgrade", a "Try Free", a free trial or a plan price, not even in demo mode.
//
// The existing billing tests pin the gates (billingUiState, isNativeApp) and the source that uses
// them. This file renders the screens: src/App.jsx is bundled with esbuild and rendered with
// react-dom/server inside a simulated iOS shell (window.Capacitor), in demo mode, with no trial, a
// running trial and an ended trial, and the visible text is searched.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const REPO = path.join(__dirname, "..");
const store = new Map();

function loadApp() {
  const esbuild = require(path.join(REPO, "node_modules", "esbuild"));
  const contents = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8") + `
export { Dashboard as __Dashboard, Settings as __Settings, AICoach as __AICoach, WhatIfSimulator as __WhatIf,
  PlanAhead as __PlanAhead, Goals as __Goals, BudgetScreen as __BudgetScreen, Family as __Family, PremiumGate as __PremiumGate,
  buildDemoState as __buildDemoState };
export { renderToStaticMarkup as __render } from "react-dom/server";
export { createElement as __h } from "react";
`;
  const { outputFiles } = esbuild.buildSync({
    stdin: { contents, resolveDir: path.join(REPO, "src"), sourcefile: "App.jsx", loader: "jsx" },
    absWorkingDir: REPO, bundle: true, platform: "node", format: "cjs", jsx: "automatic",
    write: false, logLevel: "error", sourcemap: "inline", sourcesContent: false,
    external: ["@sentry/react", "pdfjs-dist", "pdfjs-dist/*", "@capacitor-community/in-app-review"],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://placeholder.invalid"),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("placeholder"),
      "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(""),
      "import.meta.env.VITE_BUILD_SHA": JSON.stringify("test"),
      "import.meta.env.MODE": JSON.stringify("test"),
    },
  });
  // A native shell: Capacitor's bridge says ios, and the page is served from capacitor://localhost.
  const browser = {
    window: globalThis,
    innerWidth: 390,
    navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", language: "en-CA" },
    location: { protocol: "capacitor:", pathname: "/", hash: "", search: "", origin: "capacitor://localhost", href: "capacitor://localhost/" },
    Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
      key: (i) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    document: { getElementById: () => null, documentElement: { style: { setProperty() {} } }, title: "" },
  };
  for (const [k, value] of Object.entries(browser)) Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  process.setSourceMapsEnabled(true);
  const file = path.join(REPO, "render-bundle.cjs");
  const m = new Module(file, module);
  m.filename = file; m.paths = Module._nodeModulePaths(REPO);
  m._compile(outputFiles[0].text, file);
  return m.exports;
}

const textOf = (html) => html.replace(/<[^>]*>/g, " ")
  .replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
const describe = (e) => `${e && e.name}: ${e && e.message} ${(String(e && e.stack).split("\n").find((l) => l.includes("App.jsx")) || "").trim()}`;

(async () => {
  const t = create();
  const pricingSrc = fs.readFileSync(path.join(REPO, "src", "lib", "pricing.js"), "utf8");
  // Every plan price the product can quote, read from pricing.js (the one owner of prices).
  const prices = [...new Set((pricingSrc.match(/\b\d{1,3}\.99\b/g) || []))];
  t.ok(prices.length >= 4, `sanity: the plan prices come from pricing.js (${prices.join(", ")})`);
  const PRICE = new RegExp(`\\$\\s?(?:${prices.map(p => p.replace(".", "\\.")).join("|")})\\b`);
  const FORBIDDEN = [
    [/\bupgrade\b/i, "an Upgrade call to action"],
    [/\btry (?:it )?free\b/i, "Try Free"],
    [/\bfree trial\b|\btrial (?:has )?ended\b|\btrial ends\b|\bdays? left\b.*\btrial\b|\bstart \d+ days free\b|\b\d+ days free\b/i, "a trial surface"],
    [/\bget flourish plus\b|\bflourish plus\b/i, "the paid plan"],
    [PRICE, "a plan price"],
  ];
  const offences = (text) => FORBIDDEN.filter(([rx]) => rx.test(text)).map(([rx, what]) => `${what} ("${(text.match(rx) || [""])[0]}")`);

  let app = null;
  try { app = loadApp(); } catch (e) { t.ok(false, `src/App.jsx bundles and loads in a native shell: ${describe(e)}`); }
  if (!app) return t.summary("nativeNoPurchase.test");
  const { __render: render, __h: h, __buildDemoState: buildDemoState } = app;
  const noop = () => {};

  // The same shell really is native to the app's own detector, or the rest of this proves nothing.
  const { isNativeApp } = await import("../src/lib/billingVisibility.js");
  t.eq(isNativeApp(globalThis), true, "sanity: the simulated shell is native to isNativeApp()");

  const DAY = 86400000;
  const TRIALS = {
    "no trial": {},
    "a running trial (day 3 of 14)": { flourish_trial_started_at: new Date(Date.now() - 3 * DAY).toISOString() },
    "an ended trial (day 30)": { flourish_trial_started_at: new Date(Date.now() - 30 * DAY).toISOString(), flourish_trial_ends_at: new Date(Date.now() - 16 * DAY).toISOString() },
  };

  for (const [trialLabel, keys] of Object.entries(TRIALS)) {
    store.clear();
    const data = buildDemoState("CA");
    store.set("flourish_v1", JSON.stringify({ onboarded: true, appData: data, isPremium: false, checkInBonus: 0 }));
    for (const [k, v] of Object.entries(keys)) store.set(k, v);

    // Every screen that carries purchase copy on the web.
    const screens = [
      ["Today", () => h(app.__Dashboard, { data, setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onCheckIn: noop, onWhatIf: noop, onWrapped: noop, dashLayout: null, setDashLayout: noop, setGoalsTab: noop, setActiveScenario: noop })],
      ["Settings", () => h(app.__Settings, { data, setAppData: noop, setScreen: noop, onClose: noop, onReset: noop, theme: "dark", toggleTheme: noop, onOpenWidget: noop, onDisconnectBank: noop, onAddBank: noop, onDeleteData: noop, onSignOut: noop, bankConnected: false, needsReconnect: false, reconnectLoading: false, onReconnect: noop, aiCoachEnabled: true, setAiCoachEnabled: noop, onRevokeAIConsent: noop, onAcceptAIConsent: noop, onExitDemo: noop, billingUi: null, onOpenUpgrade: noop })],
      ["Coach", () => h(app.__AICoach, { data, isOnline: true, isPremium: false, coachMsgCount: 99, onSend: noop, onUpgrade: noop, setScreen: noop, setAppData: noop, onExitDemo: noop })],
      ["What-If", () => h(app.__WhatIf, { data, onClose: noop })],
      ["Watch", () => h(app.__PlanAhead, { data, setAppData: noop, setScreen: noop })],
      ...["sim", "budget", "tax", "learn", "worth"].map(tab => [`Goals (${tab})`, () => h(app.__Goals, { data, initialTab: tab, onUpgrade: noop, setScreen: noop, setAppData: noop, isPremium: false })]),
      ["Do > Budget", () => h(app.__BudgetScreen, { data, setAppData: noop, setScreen: noop })],
      ["Meet", () => h(app.__Family, { data, setAppData: noop, household: null, setHousehold: noop, setScreen: noop })],
      ["the Credit and AI Coach gates", () => h(app.__PremiumGate, { feature: "AI Coach", desc: "Coaching from your own numbers.", onUpgrade: noop })],
    ];
    for (const [name, el] of screens) {
      try {
        const text = textOf(render(el()));
        t.eq(offences(text), [], `${trialLabel}: ${name} shows no way to pay`);
      } catch (e) { t.ok(false, `${trialLabel}: ${name} renders in a native shell: ${describe(e)}`); }
    }
  }


  // ── The root shell ────────────────────────────────────────────────────────────────────────────
  // The trial banners, the sidebar trial status and the paywall mount live in FlourishApp, which
  // draws nothing until sign-in resolves, so it cannot be rendered here. Proven from the source
  // instead: every string of purchase copy in src/App.jsx must sit on the web side of a native
  // guard (the right of `!isNativeApp() && …`, the web branch of `isNativeApp() ? … : …`, behind
  // `billingUi.show`, which is false on native), or inside a screen whose only mount is guarded.
  {
    const parser = require(path.join(REPO, "node_modules", "@babel", "parser"));
    const src = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const ast = parser.parse(src, { sourceType: "module", plugins: ["jsx"] });
    const code = (n) => src.slice(n.start, n.end);
    const NATIVE_OFF = /!isNativeApp\(\)|billingUi\??\.show/;
    const guarded = (chain) => {
      for (let i = chain.length - 1; i > 0; i--) {
        const a = chain[i - 1], child = chain[i];
        if (a.type === "LogicalExpression" && a.operator === "&&" && a.right === child && NATIVE_OFF.test(code(a.left))) return true;
        if (a.type === "ConditionalExpression" && a.alternate === child && /(^|[^!])isNativeApp\(\)/.test(code(a.test)) && !/!isNativeApp\(\)/.test(code(a.test))) return true;
        if (a.type === "ConditionalExpression" && a.consequent === child && /!isNativeApp\(\)/.test(code(a.test))) return true;
      }
      return false;
    };
    // Screens that are purchase screens through and through, and the one guarded line that mounts each.
    const MOUNTED_ONLY_OFF_NATIVE = {
      UpgradeScreen: /if\(showUpgrade && billingUi\.show\)return <UpgradeScreen /,
      Paywall: /if\(showPaywall && !isNativeApp\(\)\)return <Paywall /,
    };
    for (const [name, mount] of Object.entries(MOUNTED_ONLY_OFF_NATIVE)) {
      t.ok(mount.test(src), `${name} is mounted only when native is off`);
      t.eq((src.match(new RegExp(`<${name}\\b`, "g")) || []).length, 1, `…and nowhere else`);
    }
    const { billingUiState } = await import("../src/lib/billingVisibility.js");
    t.eq(billingUiState({ status: { enabled: true, plans: [{}] }, native: true, paid: false }).show, false, "billingUi.show is false on native, even with billing on");
    // Status, not an offer: a household that already has Plus is told so.
    const STATUS_ONLY = new Set(["✦ Flourish Plus"]);
    const unguarded = [];
    (function walk(n, chain) {
      if (!n || typeof n.type !== "string") return;
      const txt = n.type === "StringLiteral" || n.type === "JSXText" ? n.value : n.type === "TemplateElement" ? n.value.cooked : null;
      const parent = chain[chain.length - 1];
      const drawn = !(parent && (parent.type === "SwitchCase" || parent.type === "BinaryExpression" || parent.type === "ObjectProperty" && parent.key === n));
      if (txt && drawn && FORBIDDEN.some(([rx]) => rx.test(txt)) && !STATUS_ONLY.has(txt.trim())) {
        const fn = [...chain].reverse().find(a => a.type === "FunctionDeclaration");
        const name = fn && fn.id ? fn.id.name : "?";
        if (!MOUNTED_ONLY_OFF_NATIVE[name] && !guarded([...chain, n])) unguarded.push(`App.jsx:${n.loc.start.line} ${name}: "${txt.trim().slice(0, 50)}"`);
      }
      for (const k of Object.keys(n)) {
        if (["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "extra"].includes(k)) continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(x => x && typeof x.type === "string" && walk(x, [...chain, n]));
        else if (v && typeof v.type === "string") walk(v, [...chain, n]);
      }
    })(ast.program, []);
    t.eq(unguarded, [], "every piece of purchase copy in src/App.jsx is behind a native guard");
  }

  // The check can see a violation: the same patterns catch the web copy they exist to keep out.
  t.eq(offences("Your free trial has ended Upgrade Now").length >= 2, true, "sanity: the check catches the web's trial-ended banner");
  t.eq(offences(`Flourish Plus $${prices[0]}/month`).length >= 2, true, "sanity: …and a plan with its price");
  t.eq(offences("Safe to spend $1,944 · $4,700/mo take-home · Invest $300/month"), [], "sanity: …and not ordinary money figures");

  t.summary("nativeNoPurchase.test");
  // The bundled app starts timers at import (the Supabase client); nothing here needs them.
  setImmediate(() => process.exit(process.exitCode || 0));
})();
