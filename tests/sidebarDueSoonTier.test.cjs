// tests/sidebarDueSoonTier.test.cjs
// -----------------------------------------------------------------------------
// TWO THINGS APP REVIEW SEES AT IPAD WIDTH (the sidebar layout, 960pt and wider).
//
// 1. The right-column card said "No bills due in the next 10 days" beside Today's Due soon tile
//    counting Phone $65 on the 5th (demo, Sept 29). It filtered bills by day-of-month between today and
//    today + 10, which never wraps the month end. It now reads the same list and total as the tile
//    (lib/dueSoon.js, from SafeSpendEngine's window).
// 2. On a store app no plan or tier is named anywhere (1.0.0 has nothing to buy): not the sidebar's
//    "Flourish Plus", not the Terms' trial and free tier, not Meet's "Start your trial". The web keeps them.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

// The demo's fixed date. The app reads new Date() for "today", so the clock is pinned for the render.
const RealDate = Date;
let FIXED = new RealDate("2026-09-29T19:00:00-04:00").getTime();
class PinnedDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED])); }
  static now() { return FIXED; }
}
global.Date = PinnedDate;

(async () => {
  const t = create();
  const D = await import("../src/lib/demoFixture.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { dueSoonList } = await import("../src/lib/dueSoon.js");
  const FMT = await import("../src/lib/format.js");
  const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const demo = (made) => ({ accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA"), incomes: D.buildDemoIncomes(made, "CA"),
    bills: D.buildDemoBills(made, "CA"), transactions: D.buildDemoTxns(made, "CA"), profile: D.demoProfileFor("CA"), demo: true });

  let W = {}, N = {};
  try { W = loadApp(["DesktopSidebar", "TermsOfService", "MeetAgenda"]); } catch (e) { t.ok(false, `App.jsx bundles (web): ${describe(e)}`); }

  // ── 1. Due soon agrees with Today ────────────────────────────────────────────────────────────
  {
    const d = demo(new Date());
    const ss = SafeSpendEngine.calculate(d);
    const list = dueSoonList(ss);
    const tile = ss.upcomingBills + (ss.minimumsDueSoon || []).reduce((s, m) => s + m.amount, 0); // the tile's own formula before this change
    t.eq(Math.round(list.total), 413, "1a (Today's Due soon tile is $413 for the demo on Sept 29)");
    t.eq(Math.round(list.total * 100), Math.round(tile * 100), "1b the shared total is the tile's: bills plus minimums in the window");
    t.ok(list.items.some(i => i.name === "Phone" && i.amount === 65), "1c the list has Phone $65, due the 5th of next month");
    let txt = "";
    try { txt = textOf(W.render(W.h(W.DesktopSidebar, { data: d, setScreen: () => {} }))); } catch (e) { t.ok(false, `1d the sidebar renders: ${describe(e)}`); }
    t.ok(!/No bills due/.test(txt), `1d the right-column card no longer says nothing is due ("${txt.slice(txt.indexOf("Due soon"), txt.indexOf("Due soon") + 90)}")`);
    t.ok(/Phone Due Mon, Oct 5 \$65/.test(txt), `1e it lists Phone, due Mon, Oct 5, $65 ("${txt.slice(txt.indexOf("Due soon"), txt.indexOf("Due soon") + 160)}")`);
    t.ok(/Total \$413/.test(txt), "1f …and the same $413 total as the tile");
    t.ok(/const dueSoon = dueSoonList\(_ss\);\s*const dueSoonTotal = dueSoon\.total;/.test(APP) && /label:"Due soon",value:formatMoney\(dueSoonTotal\|\|0\),sub:dueSoon\.windowLabel,/.test(APP),
      "1g Today's tile reads the same helper: the same total, money format and window label as the card");
    t.ok(/Due soon before next payday/.test(txt), "1g2 the card names the same window as the tile (before next payday)");

    // Bills the demo does not have: a weekly bill due twice in the window, and a monthly bill with no
    // stored next date. One row per due date, each with a real date, and the rows add up to the total.
    const extra = { ...d, bills: [...d.bills,
      { id: "gym", name: "Gym", amount: "20", freq: "weekly", nextDueDate: "2026-06-02" },
      { id: "ins", name: "Insurance", amount: "90", freq: "monthly", date: "8" }] };
    const sx = SafeSpendEngine.calculate(extra);
    const lx = dueSoonList(sx);
    const gym = lx.items.filter(i => i.name === "Gym");
    t.ok(gym.length >= 2 && gym.every(i => i.date && i.date > new Date(2026, 8, 28)), `1g3 a weekly bill due ${gym.length} times is ${gym.length} rows, each dated in the window, not its Jun 2 anchor`);
    const ins = lx.items.find(i => i.name === "Insurance");
    t.ok(ins && ins.date && ins.date.getDate() === 8, "1g4 a monthly bill with no stored next date still shows its due date (the 8th)");
    t.eq(Math.round(lx.items.reduce((a, i) => a + i.amount, 0) * 100), Math.round((sx.upcomingBills + sx.minimumsDueSoon.reduce((a, m) => a + m.amount, 0)) * 100),
      "1g5 the rows add up to the total, and the total is the tile's");
    t.eq(new Set(lx.items.map(i => i.key)).size, lx.items.length, "1g6 every row has its own key");

    // Every day for two months, month ends included, the card's total is the tile's.
    const bad = [];
    for (let k = 0; k < 60; k++) {
      FIXED = new RealDate(2026, 8, 1 + k, 19).getTime();
      const made = new Date(); made.setDate(made.getDate() - (k % 20)); // demos of different ages
      const dd = demo(made);
      const s2 = SafeSpendEngine.calculate(dd);
      const tileK = s2.upcomingBills + (s2.minimumsDueSoon || []).reduce((s, m) => s + m.amount, 0);
      const html = textOf(W.render(W.h(W.DesktopSidebar, { data: dd, setScreen: () => {} })));
      const shown = (html.match(/Total (\$[\d,]+)/) || [])[1] || (/Nothing due (before next payday|next 10 days)\./.test(html) ? "$0" : "?");
      const want = FMT.formatMoney(tileK); // exactly what the tile prints
      if (shown !== want) bad.push(`${new Date().toDateString()}: card ${shown}, tile ${want}`);
    }
    FIXED = new RealDate("2026-09-29T19:00:00-04:00").getTime();
    t.eq(bad, [], "1h on every day from Sept 1 to Oct 30, the card's total equals Today's Due soon");
  }

  // ── 2. No plan or tier named on native ───────────────────────────────────────────────────────
  {
    // The bundle's own @capacitor/core installs a "web" Capacitor when it loads, so a store app is
    // simulated by switching the platform the app reads at render time.
    const real = globalThis.Capacitor;
    const setPlatform = (p) => Object.defineProperty(globalThis, "Capacitor", { value: { ...real, getPlatform: () => p, isNativePlatform: () => p !== "web" }, configurable: true, writable: true });
    const native = (fn) => { setPlatform("ios"); try { return fn(); } finally { setPlatform("web"); } };
    N = { render: (el) => native(() => W.render(el)), h: W.h, TermsOfService: W.TermsOfService, MeetAgenda: W.MeetAgenda };
    const TIER = /Flourish Plus|\bPlus\b|Founder|\btrial\b|\bTrial\b|free tier|free plan|\bFree\b/;
    const household = { ...demo(new Date()), demo: false };
    const nTerms = textOf(N.render(N.h(N.TermsOfService, { onBack: () => {} })));
    const sec7 = nTerms.slice(nTerms.indexOf("7. Subscription"), nTerms.indexOf("8. Intellectual"));
    t.ok(sec7.length > 20 && !TIER.test(sec7) && /usage limits/.test(sec7), `2a native Terms, section 7 names no plan or tier ("${sec7.slice(0, 90)}")`);
    const nMeet = textOf(N.render(N.h(N.MeetAgenda, { data: household, isCouple: false, setScreen: () => {} })));
    t.ok(/isn't included in this version/.test(nMeet) && !/Start your trial/.test(nMeet), "2b native Meet, without the coach meeting, says it isn't included, naming no trial");
    const nativeProfile = APP.slice(APP.indexOf("appData.profile?.name||\"User\""), APP.indexOf("appData.profile?.name||\"User\"") + 700);
    t.ok(/\{isPremium&&!isNativeApp\(\)&&<div[^>]*>✦ Flourish Plus<\/div>\}/.test(nativeProfile), "2c the sidebar profile card shows no \"Flourish Plus\" on native");
    // Controls: the web is unchanged.
    const wTerms = textOf(W.render(W.h(W.TermsOfService, { onBack: () => {} })));
    t.ok(/Free Tier/.test(wTerms), "2d (web Terms keep their tiers)");
    const wMeet = textOf(W.render(W.h(W.MeetAgenda, { data: household, isCouple: false, setScreen: () => {} })));
    t.ok(/Start your trial/.test(wMeet), "2e (web Meet keeps its trial line)");
  }

  t.summary("sidebarDueSoonTier.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
