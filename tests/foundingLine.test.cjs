// tests/foundingLine.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING LINE above the hero's email field (2026-10-07), on phones and tablets only.
// The rendered page is checked in landingDemo.browser.test.cjs (section 10); this pins the words and
// the rules: the exact text, the count sentence dropped when no count was read, no line at 0, one
// shared request, phones only, and the tap target.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const WITH = "Founding price: $79.99 a year plus tax for the first 50 households, paid and used on flourishmoney.app. Not yet in the iPhone and Android apps. 35 of 50 spots left.";
const WITHOUT = "Founding price: $79.99 a year plus tax for the first 50 households, paid and used on flourishmoney.app. Not yet in the iPhone and Android apps.";

(async () => {
  const t = create();
  const O = await import("../src/lib/foundingOffer.js");
  const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");

  // ── 1. the words ─────────────────────────────────────────────────────────────────────────────
  t.eq(O.foundingLineText(35), WITH, "1a with the live count: the line, word for word");
  t.eq(O.foundingLineParts(35).bold, "Founding price: $79.99 a year", "1b the bold lead");
  t.eq([1, 50].map(O.foundingLineText).map(s => s.slice(WITHOUT.length)), [" 1 of 50 spots left.", " 50 of 50 spots left."], "1c the count sentence carries the number read");
  for (const [v, why] of [[null, "no read"], [undefined, "not asked"], [51, "out of range"], [-1, "negative"], [3.5, "not whole"], ["35", "a string"]]) {
    t.eq(O.foundingLineText(v), WITHOUT, `1d ${why}: the last sentence is left out and the rest kept`);
  }
  t.eq([O.foundingLineText(0), O.foundingLineParts(0)], [null, null], "1e 0 left: no line");
  t.ok(!/\d+\.\d{2}/.test(fs.readFileSync(path.join(REPO, "src", "lib", "foundingOffer.js"), "utf8")), "1f the price is read from pricing.js, not typed");

  // ── 2. one request for the line and the block ────────────────────────────────────────────────
  {
    const real = global.fetch; let calls = 0;
    global.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ spotsLeft: 35 }) }; };
    try {
      O._resetSharedFoundingSpots();
      const [a, b] = await Promise.all([O.sharedFoundingSpots(), O.sharedFoundingSpots()]);
      const c = await O.sharedFoundingSpots();
      t.eq([a, b, c, calls], [35, 35, 35, 1], "2a the line and the block share one /api/founding request");
    } finally { global.fetch = real; O._resetSharedFoundingSpots(); }
    const block = APP.slice(APP.indexOf("function FoundingOffer()"), APP.indexOf("function FoundingLine()"));
    const line = APP.slice(APP.indexOf("function FoundingLine()"), APP.indexOf("function AuthScreen("));
    t.ok(/sharedFoundingSpots\(\)\.then/.test(block) && /sharedFoundingSpots\(\)\.then/.test(line) && !/fetchFoundingSpots\(/.test(block + line),
      "2b both read through sharedFoundingSpots, neither fetches on its own");
    t.ok(/const parts = foundingLineParts\(spotsLeft\);\s+if \(!parts\) return null;/.test(line), "2c the component draws nothing when there is no line (0 left)");

    // ── 3. phones and tablets only, directly above the email field ─────────────────────────────
    const desk = APP.slice(APP.indexOf("@media(min-width:960px){"), APP.indexOf("@media(min-width:960px){") + 3000);
    t.ok(/\.fll-founding-line\{ display:none; \}/.test(desk) && /\.fll-founding-line\{ display:block;/.test(APP),
      "3a shown in the one-column layout, hidden at 960px and up");
    t.ok(/<div className="fll-hero-form">\s+<FoundingLine\/>\s+<WaitlistForm source="hero"\/>/.test(APP), "3b it sits in the hero form, directly above the email field");
    let A = {};
    try { A = loadApp(["AuthScreen"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A.AuthScreen) {
      const html = A.render(A.h(A.AuthScreen, { onAuth: () => {}, onTryDemo: () => {} }));
      const lineAt = html.indexOf('class="fll-founding-line"'), inputAt = html.indexOf('class="fll-input"');
      t.ok(lineAt > 0 && inputAt > lineAt, "3c rendered: the line comes before the email field");
      t.ok(textOf(html.slice(lineAt, inputAt)).includes(WITHOUT), "3d before any count is read, it reads without the count sentence");
    }

    // ── 4. tapping it goes to the founding block ───────────────────────────────────────────────
    t.ok(/<button type="button" className="fll-founding-line" onClick=\{toBlock\}>/.test(line)
      && /document\.querySelector\("\.fll-founding"\)/.test(line) && /el\.scrollIntoView\(\{ block: "start"/.test(line),
      "4a it is a button that scrolls the founding block (.fll-founding) into view");
    t.ok(/class(?:Name)?="fll-founding"/.test(APP), "4b …and that block exists on the page");
    // ── 5. readable: dark green text on a light green tint, AA ─────────────────────────────────
    const lum = (hex) => { const c = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    // The tint, rgba(46,139,46,0.10), over the landing's own background, #FDF6EC (.fll-root).
    const mix = (fg, bg, a) => Math.round(fg * a + bg * (1 - a)).toString(16).padStart(2, "0");
    const tint = mix(46, 0xFD, 0.10) + mix(139, 0xF6, 0.10) + mix(46, 0xEC, 0.10);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    t.ok((() => { const r = APP.slice(APP.indexOf(".fll-founding-line{ display:block;"), APP.indexOf("\n", APP.indexOf(".fll-founding-line{ display:block;"))); return r.includes("background:rgba(46,139,46,0.10);") && r.includes("color:#15321a;"); })() && ratio("15321a", tint) >= 4.5 && ratio("1b5e20", tint) >= 4.5,
      `5a text ${ratio("15321a", tint).toFixed(1)}:1 and bold ${ratio("1b5e20", tint).toFixed(1)}:1 on the tint: AA`);
  }
  t.summary("foundingLine.test");
})();
