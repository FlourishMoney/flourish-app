// tests/tapFigures.test.cjs
// -----------------------------------------------------------------------------
// EVERY FIGURE UNDER "TAP ANY NUMBER" OPENS ITS WORKING (watch-meet-fixes, item 2).
//
// "Tap any number to see how Flourish got it." showed on Meet, where no figure was tappable. Every
// agenda figure now carries its working (item.explain). The tip may show only on a screen where
// every engine figure is a tap target: a button, a role="button", or a link, or inside an
// explanation that is already open (data-explanation) or the meeting's own chat (data-chat), which
// stays plain text. A figure here is a dollar amount or a percentage. Today no longer shows the tip.
// The same rule in a real browser, with every figure clicked: tapFigures.browser.test.cjs.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const TIP = "Tap any number to see how Flourish got it.";
const FIG = /-?\$\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?%/g;

// Every figure in rendered HTML that is not inside a tap target, an open explanation or the chat.
function untappedFigures(html) {
  const out = [], stack = [];
  const VOID = new Set(["br", "img", "input", "meta", "link", "hr", "wbr", "source", "col", "area", "base", "embed", "track"]);
  const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[5] != null) {
      const text = decode(m[5]);
      const figs = text.match(FIG);
      if (figs && !stack.some(e => e.ok)) out.push(...figs.map(f => `${f} in "${text.trim().slice(0, 70)}"`));
      continue;
    }
    const [, close, tagRaw, attrs, self] = m;
    const tag = tagRaw.toLowerCase();
    if (close) { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; } continue; }
    if (self || VOID.has(tag)) continue;
    const ok = tag === "button" || tag === "a" || tag === "style" || tag === "script" || tag === "svg"
      || /\brole="button"/.test(attrs) || /\bdata-explanation=/.test(attrs) || /\bdata-chat=/.test(attrs);
    stack.push({ tag, ok });
  }
  return out;
}

(async () => {
  const t = create();
  const M = await import("../src/lib/meetSnapshot.js");
  const D = await import("../src/lib/demoFixture.js");
  const now = new Date();
  const demo = (c) => ({ profile: D.demoProfileFor(c), accounts: D.demoAccountsFor(c), debts: D.demoDebtsFor(c), incomes: D.buildDemoIncomes(now, c),
    bills: D.buildDemoBills(now, c), transactions: D.buildDemoTxns(now, c), bankConnected: true, demo: true });

  let A = {};
  try { A = loadApp(["PlanAhead", "MeetAgenda"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const watch = (data, r) => A.render(A.h(A.PlanAhead, { data, setAppData: () => {}, setScreen: () => {}, initialRange: r }));
  const broke = (() => { const d = demo("CA"); d.accounts = d.accounts.map(a => (a.type === "checking" || a.type === "savings") ? { ...a, balance: 0 } : a); d.demo = false; return d; })();
  // ── 3. Watch, at every range, on both demos and with an overdraft ──────────────────────────
  for (const [name, data] of [["CA demo", demo("CA")], ["US demo", demo("US")], ["CA demo with $0 cash", broke]]) {
    for (const r of [7, 30, 90]) {
      let html = "";
      try { html = watch(data, r); } catch (e) { t.ok(false, `3 ${name} ${r}d renders: ${describe(e)}`); continue; }
      t.ok(html.includes(TIP), `3a ${name} ${r}d: Watch shows the tip`);
      t.eq(untappedFigures(html), [], `3b ${name} ${r}d: every figure on Watch is a tap target`);
    }
  }
  // Supporting figures (folded away by default) are tap targets too.
  const plan = APP.slice(APP.indexOf("function PlanAhead("), APP.indexOf("// ─── SPEND"));
  const sf = plan.slice(plan.indexOf("<SupportingFigures"), plan.indexOf("]}/>", plan.indexOf("<SupportingFigures")));
  t.ok(/onExplain:\(\)=>setExplainRange\("spend"\)/.test(sf.split("\n").find(l => l.includes('label:"Est. daily spend"')) || "") && (sf.match(/onExplain:/g) || []).length >= 3, "3c every supporting figure with an amount opens its working (daily spend, each paycheque)");
  t.ok(/r\.onExplain\s*\? <button onClick=\{r\.onExplain\}/.test(APP), "3d …and SupportingFigures renders that as a button");
  t.ok(/<button onClick=\{stopToggle\} aria-expanded=\{isDrilled\}/.test(plan) && (plan.match(/onClick=\{stopToggle\}/g) || []).length === 2 && !/role="button" tabIndex=\{0\} aria-expanded=\{isDrilled\}/.test(plan),
    "3e each day's date and balance are real buttons opening its breakdown, and no role=\"button\" wraps the line buttons (no nested controls)");

  // ── 4. Meet: every figure has a working tap target, with its source and working ───────────────
  for (const c of D.DEMO_COUNTRIES) {
    const data = demo(c);
    const full = M.meetAgendaFor(data);
    const agenda = M.agendaIsEmpty(full) ? M.quietWeekAgendaFor(M.quietWeekFiguresFor(data)) : M.withWeekAhead(full, data);
    const items = [...agenda.wins, ...agenda.changes, ...agenda.risks, ...(agenda.upcoming || []), ...agenda.progress];
    const withFig = items.filter(i => (i.text.match(FIG) || []).length);
    t.ok(withFig.length >= 2, `4a ${c}: the agenda carries figures (${withFig.length} lines)`);
    const decs = agenda.decisions || [];
    const all = [...withFig.map(i => [i.text, i.explain]), ...decs.map(d => [d.text, d.explain]), ...decs.flatMap(d => d.options.map(o => [`${o.label}: ${o.outcome}`, o.explain]))];
    for (const [text, ex] of all) {
      const ok = ex && ex.title && ex.value && ex.meaning && ex.source && Array.isArray(ex.rows) && ex.rows.length > 0;
      t.ok(!!ok, `4b ${c} "${text.slice(0, 50)}": has a title, value, meaning, source and working`);
      if (!ok) continue;
      const shown = [ex.value, ...ex.rows.map(r => r.value)].join(" ");
      const missing = (text.match(FIG) || []).filter(f => !shown.includes(f.replace(/^-/, "")));
      t.eq(missing, [], `4c ${c} "${text.slice(0, 50)}": every figure in it appears in its working`);
    }
    t.ok(decs.length === 0 || /a quarter of your/.test(decs[0].text) && decs[0].explain.rows.some(r => /25%/.test(r.label)), `4d ${c}: the spare amount shows 25% x safe to spend`);
    let html = "";
    try { html = A.render(A.h(A.MeetAgenda, { data, isCouple: false, setScreen: () => {} })); } catch (e) { t.ok(false, `4 ${c} Meet renders: ${describe(e)}`); continue; }
    t.ok(html.includes(TIP), `4e ${c}: Meet shows the tip`);
    t.eq(untappedFigures(html), [], `4f ${c}: every figure on Meet is a tap target (the chat stays plain)`);
    const btns = (html.match(/aria-label="[^"]*How Flourish got it"/g) || []).length + (html.match(/aria-label="[^"]*: how Flourish got it"/g) || []).length;
    t.eq(btns, all.length, `4g ${c}: one button per figure line, decision and option (${all.length})`);
    const chatAt = html.indexOf('data-chat="plain"'), lastBtn = html.lastIndexOf("<button", chatAt);
    t.ok(chatAt > 0 && (lastBtn < 0 || html.slice(lastBtn, chatAt).includes("</button>")), `4h ${c}: the scripted meeting line is marked as chat and is not a button`);
  }
  t.ok(/onClick=\{\(\)=>setExplainItem\(it\.explain\)\}/.test(APP) && /onClick=\{\(\)=>setExplainItem\(dec\.explain\)\}/.test(APP) && /onClick=\{\(\)=>setExplainItem\(o\.explain\)\}/.test(APP)
    && /\{explainItem&&<HowWeGotThis /.test(APP), "4i each Meet button opens How we got this with that figure's working");

  // ── 5. The tip shows only where every figure is tappable ─────────────────────────────────────
  const tipAt = [...APP.matchAll(/<FirstRunTip id="([a-z]+)">Tap any number to see how Flourish got it\.<\/FirstRunTip>/g)].map(m => m[1]).sort();
  t.eq(tipAt, ["meet", "watch"], "5a the tip is on Watch and Meet, which are checked above, and nowhere else");
  t.ok(!/<FirstRunTip id="today">/.test(APP), "5b Today, whose cards carry figures that open nothing, no longer shows it");

  t.summary("tapFigures.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
