// tests/explainAndTips.test.cjs
// -----------------------------------------------------------------------------
// THE NUMBER IS THE BUTTON, THE ⓘ IS RARE, AND THE TIP IS SAID ONCE.
//
// Three rules from the readability brief, each of which is easy to get wrong in the same way:
// by adding another thing to the screen.
//
//   A number explains itself when tapped. Not a "?" beside it — a screen wearing six question
//   marks looks like it does not trust itself, and the reader still has to work out which to press.
//
//   A ⓘ appears only beside a term a new reader cannot guess from the words. "Bills" needs none.
//   "Safe to spend" sounds like a balance and is not one. The list is four, and it is pinned at
//   four here so it cannot quietly become a row of them again.
//
//   A first-run tip is said once. Its dismissal is a SYNCED setting, so the household is not told
//   the same thing on the other phone, or again after a reinstall.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
const PERSIST = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "persistence.js"), "utf8");

(async () => {
  const t = create();

  // ── 1. the main numbers are buttons, and each opens its own explanation ──────────────────────
  const heroes = (APP.match(/aria-label="How Flourish got this number"/g) || []).length;
  t.ok(heroes >= 2, `1a the main numbers are tappable (${heroes} of them: Today and Watch)`);
  t.ok(/<button onClick=\{e=>\{e\.stopPropagation\(\);setExplain\("safeToSpend"\);\}\}/.test(APP),
    "1b Today's safe-to-spend opens its sheet, and does not fire the card behind it");
  t.ok(/<button onClick=\{e=>\{e\.stopPropagation\(\);setExplainWatch\(true\);\}\}/.test(APP),
    "1c Watch's starting balance does the same");
  t.ok(/\{explain==="safeToSpend"&&\(\s*<HowWeGotThis/.test(APP), "1d Today renders the sheet");
  t.ok(/\{explainWatch&&\(\s*<HowWeGotThis/.test(APP), "1e Watch renders the sheet");

  // Both sheets must sit in the SAME component as the state that opens them. Getting this wrong
  // is silent: the button sets a flag nothing is watching, and the tap does nothing at all.
  const hostOf = (needle) => {
    const at = APP.indexOf(needle);
    if (at < 0) return null;
    const before = APP.slice(0, at);
    const m = [...before.matchAll(/^function ([A-Za-z0-9_]+)\(/gm)];
    return m.length ? m[m.length - 1][1] : null;
  };
  t.eq(hostOf('setExplain("safeToSpend")'), hostOf('{explain==="safeToSpend"&&('),
    "1f Today's trigger and its sheet live in one component");
  t.eq(hostOf("setExplainWatch(true)"), hostOf("{explainWatch&&("),
    "1g …and so do Watch's. This caught a real bug: the sheet had landed in AddCustomCategory.");
  t.eq(hostOf("<ScreenFootnote>Forecast projects forward"), hostOf("setExplainWatch(true)"),
    "1h and the Watch footnote is on the Watch screen, which it was not either");

  // ── 2. the sheet reads back engine output; it never works anything out ───────────────────────
  const sheet = APP.slice(APP.indexOf("function HowWeGotThis("), APP.indexOf("function InfoDot("));
  t.ok(!/SafeSpendEngine|ForecastEngine|\.reduce\(|Math\.round/.test(sheet),
    "2a HowWeGotThis computes nothing — every figure is handed in already calculated");
  t.ok(!/fetch\(|api\/coach/.test(sheet), "2b …and asks the AI nothing");
  t.ok(/<CalcByFlourish/.test(sheet), "2c it carries the calculated-by-Flourish mark, reusing the existing one");

  // ── 3. the ⓘ list is four, and they are the four agreed ─────────────────────────────────────
  const termsBlock = APP.slice(APP.indexOf("const TERMS = {"), APP.indexOf("};", APP.indexOf("const TERMS = {")));
  const terms = [...termsBlock.matchAll(/^\s*"([^"]+)":/gm)].map(m => m[1]);
  t.eq(terms.length, 4, `3a exactly four terms carry a ⓘ (got: ${terms.join(", ")})`);
  t.eq(terms.sort().join(" | "), ["Safe to spend", "Time Machine", "Money meeting", "Health score"].sort().join(" | "),
    "3b …and they are the four agreed: safe to spend, Time Machine, the money meeting, the health score");
  for (const term of terms) {
    const body = (new RegExp(`"${term}":\\s*"([^"]+)"`).exec(termsBlock) || [])[1] || "";
    t.ok(body.length > 60, `3c "${term}" is explained in a sentence, not a label`);
  }
  const dots = (APP.match(/<InfoDot term="/g) || []).length;
  t.ok(dots <= terms.length, `3d no more ⓘ are placed than there are terms (${dots} placed)`);
  t.ok(/aria-label=\{`What \$\{term\} means`\}/.test(APP), "3e each ⓘ says what it is for");
  t.ok(/\.\.\.tap\(\{display:"inline-flex"/.test(APP), "3f …and carries a 44px tap area");

  // ── 4. the tip is said once, and the dismissal syncs ─────────────────────────────────────────
  t.ok(/const TIPS_KEY = "flourish_tips_dismissed";/.test(APP), "4a the tip dismissal has a key");
  t.ok(/"flourish_tips_dismissed",/.test(PERSIST),
    "4b …and it is on the synced side-key list, so the other phone does not repeat the tip");
  t.ok(/const \[gone, setGone\] = useState\(\(\)=>!!readTips\(\)\[id\]\);/.test(APP),
    "4c a dismissed tip never renders again");
  t.ok(/if \(gone\) return null;/.test(APP), "4d …not even briefly");
  t.ok(/t\[id\]=Date\.now\(\); localStorage\.setItem\(TIPS_KEY/.test(APP),
    "4e dismissal is written down, per tip");
  const tips = [...APP.matchAll(/<FirstRunTip id="([a-z]+)"/g)].map(m => m[1]);
  t.eq(tips.sort().join(","), "meet,today,watch", "4f one tip each on Today, Watch and Meet");
  t.eq(new Set(tips).size, tips.length, "4g …and no screen shows two");
  const tipText = (APP.match(/<FirstRunTip id="today">([^<]+)</) || [])[1];
  t.eq(tipText, "Tap any number to see how Flourish got it.", "4h the wording is the one agreed");
  t.ok(/aria-label="Dismiss tip"/.test(APP), "4i and it can be dismissed");

  t.summary("explainAndTips.test");
})();
