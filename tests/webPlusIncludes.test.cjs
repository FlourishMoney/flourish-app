// tests/webPlusIncludes.test.cjs
// -----------------------------------------------------------------------------
// THE WEBSITE'S "Flourish Plus includes:" LIST, WORD FOR WORD (approved 2026-10-20, ChatGPT and Grok).
//
//   1  src/lib/plusIncludes.js holds exactly the five approved lines, in order;
//   2  the old six lines (which named features the free plan also has) are gone from the app;
//   3  the web locked screen (PremiumGate) renders the five under "Flourish Plus includes:";
//   4  a store app's locked screen renders none of them, and no "Flourish Plus includes:".
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const APPROVED = ["The coach with no weekly limit", "What-If as often as you like", "More than one connected bank", "Credit", "The coach-run money meeting"];
const OLD = ["AI Coach with real data", "Full credit coaching", "Tax tips & benefits checker", "Investment tracking", "Weekly money meeting", "Debt simulator"];

(async () => {
  const t = create();
  const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const L = await import("../src/lib/plusIncludes.js");
  t.eq([...L.PLUS_INCLUDES], APPROVED, "1a the five approved lines, word for word and in order");
  t.ok(Object.isFrozen(L.PLUS_INCLUDES), "1b …frozen, so nothing rewords them at run time");
  const gateSrc = APP.slice(APP.indexOf("function PremiumGate("), APP.indexOf("// ─── PAYWALL"));
  t.eq([OLD.filter((x) => gateSrc.includes(x)), APP.includes('"AI Coach with real data","Full credit coaching"')], [[], false], "2a the six old lines are gone from the locked screen (\"Weekly money meeting\" stays only as the old Paywall's feature card title)");
  const gate = APP.slice(APP.indexOf("function PremiumGate("), APP.indexOf("// ─── PAYWALL"));
  t.ok(/Flourish Plus includes:<\/div>\s*<div[^>]*>\s*\{PLUS_INCLUDES\.map\(/.test(gate), "2b the web locked screen lists PLUS_INCLUDES under \"Flourish Plus includes:\"");

  let A = null;
  try { A = loadApp(["PremiumGate"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  if (A) {
    const props = { feature: "Credit Coaching", desc: "x", onUpgrade() {}, billingOn: true };
    const web = textOf(A.render(A.h(A.PremiumGate, props)));
    t.ok(web.includes("Flourish Plus includes:") && APPROVED.every((x) => web.includes(x)) && !OLD.some((x) => web.includes(x)), "3a the website renders the five lines, and none of the old six");
    globalThis.window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" };
    let native = "";
    try { native = textOf(A.render(A.h(A.PremiumGate, props))); } finally { delete globalThis.window.Capacitor; }
    t.ok(native.length > 0 && !native.includes("Flourish Plus includes:") && !APPROVED.slice(0, 3).some((x) => native.includes(x)), "4a a store app's locked screen shows none of them");
  }
  t.summary("webPlusIncludes.test");
})();
