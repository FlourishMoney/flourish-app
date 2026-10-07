// tests/foundingCard.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING CARD above the hero's email field (2026-10-07), on phones and tablets only. It replaced the
// one-line version. The rendered page is checked in landingDemo.browser.test.cjs (section 10); this pins the
// words and the rules: the four rows exactly, the $20 worked out from the two annual prices, no pill when no
// count was read, no card at 0, one shared request, phones only, the tap target, and AA on every row.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const ROWS = {
  eyebrow: "FOUNDING PRICE · FIRST 50 HOUSEHOLDS",
  price: "$79.99 a year",
  regular: "$99.99 a year",
  pill: "35 of 50 left",
  save: "$20 a year less than the regular $99.99.",
  small: "Plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet in the iPhone and Android apps.",
};

(async () => {
  const t = create();
  const O = await import("../src/lib/foundingOffer.js");
  const P = await import("../src/lib/pricing.js");
  const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const LIB = fs.readFileSync(path.join(REPO, "src", "lib", "foundingOffer.js"), "utf8");

  // ── 1. the words ─────────────────────────────────────────────────────────────────────────────
  t.eq(O.foundingCardParts(35), ROWS, "1a with the live count: every row, word for word");
  t.eq([1, 50].map(n => O.foundingCardParts(n).pill), ["1 of 50 left", "50 of 50 left"], "1b the pill carries the number read");
  for (const [v, why] of [[null, "no read"], [undefined, "not asked"], [51, "out of range"], [-1, "negative"], [3.5, "not whole"], ["35", "a string"]]) {
    t.eq(O.foundingCardParts(v), { ...ROWS, pill: null }, `1c ${why}: only the pill is left out`);
  }
  t.eq(O.foundingCardParts(0), null, "1d 0 left: no card");

  // ── 2. the prices and the $20 come from pricing.js ───────────────────────────────────────────
  const p = P.getPricing("CA");
  t.eq(Math.round((p.annual - p.foundingAnnual) * 100) / 100, 20, "2a the two annual prices differ by $20");
  t.ok(!/\d+\.\d{2}|\$20\b|\b20 a year/.test(LIB.replace(/^\s*\/\/.*$/gm, "")), "2b no price and no saving is typed in foundingOffer.js");
  t.ok(/const saving = Math\.round\(\(p\.annual - p\.foundingAnnual\) \* 100\) \/ 100;/.test(LIB), "2c the saving is the regular annual less the founding annual");
  {
    // Change the prices and the card follows: nothing on it is a fixed figure.
    const saved = { ...P.PRICING.CA };
    try {
      P.PRICING.CA.annual = 109.99; P.PRICING.CA.foundingAnnual = 84.49;
      const c = O.foundingCardParts(12);
      t.eq([c.price, c.regular, c.save], ["$84.49 a year", "$109.99 a year", "$25.50 a year less than the regular $109.99."],
        "2d other prices give other figures, and a saving with cents keeps its cents");
    } catch (e) { t.ok(false, `2d PRICING is not writable here (${e.message})`); }
    finally { Object.assign(P.PRICING.CA, saved); }
  }

  // ── 3. one request for the card and the block; nothing drawn at 0 ────────────────────────────
  {
    const real = global.fetch; let calls = 0;
    global.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ spotsLeft: 35 }) }; };
    try {
      O._resetSharedFoundingSpots();
      const [a, b] = await Promise.all([O.sharedFoundingSpots(), O.sharedFoundingSpots()]);
      t.eq([a, b, await O.sharedFoundingSpots(), calls], [35, 35, 35, 1], "3a the card and the block share one /api/founding request");
    } finally { global.fetch = real; O._resetSharedFoundingSpots(); }
  }
  const block = APP.slice(APP.indexOf("function FoundingOffer()"), APP.indexOf("function FoundingCard()"));
  const card = APP.slice(APP.indexOf("function FoundingCard()"), APP.indexOf("function AuthScreen("));
  t.ok(/sharedFoundingSpots\(\)\.then/.test(block) && /sharedFoundingSpots\(\)\.then/.test(card) && !/fetchFoundingSpots\(/.test(block + card),
    "3b both read through sharedFoundingSpots, neither fetches on its own");
  t.ok(/const parts = foundingCardParts\(spotsLeft\);\s+if \(!parts\) return null;/.test(card) && /\{parts\.pill && <span className="fll-fc-pill"/.test(card),
    "3c no card at 0, and no pill without a count");
  t.ok(!/fll-founding-line|FoundingLine/.test(APP), "3d the one-line version is gone");

  // ── 4. phones and tablets only, directly above the email field ─────────────────────────────
  const desk = APP.slice(APP.indexOf("@media(min-width:960px){"), APP.indexOf("@media(min-width:960px){") + 3000);
  t.ok(/\.fll-founding-card\{ display:none; \}/.test(desk) && /\.fll-founding-card\{ display:block;/.test(APP), "4a shown in the one-column layout, hidden at 960px and up");
  t.ok(/<div className="fll-hero-form">\s+<FoundingCard\/>\s+<WaitlistForm source="hero"\/>/.test(APP), "4b it sits in the hero form, directly above the email field");
  let A = {};
  try { A = loadApp(["AuthScreen"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  if (A.AuthScreen) {
    const html = A.render(A.h(A.AuthScreen, { onAuth: () => {}, onTryDemo: () => {} }));
    const at = html.indexOf('class="fll-founding-card"'), inputAt = html.indexOf('class="fll-input"');
    t.ok(at > 0 && inputAt > at, "4c rendered: the card comes before the email field");
    const text = textOf(html.slice(at, inputAt));
    t.ok([ROWS.eyebrow, ROWS.price, ROWS.regular, ROWS.save, ROWS.small].every(r => text.includes(r)) && !/of 50 left/.test(text),
      "4d before any count is read: every row, and no pill");
    t.ok(/<s class="fll-fc-regular">\$99\.99 a year<\/s>/.test(html), "4e the regular price is struck through");
  }

  // ── 5. tapping it goes to the founding block ───────────────────────────────────────────────
  t.ok(/<button type="button" className="fll-founding-card" onClick=\{toBlock\}>/.test(card) && /document\.querySelector\("\.fll-founding"\)/.test(card)
    && /el\.scrollIntoView\(\{ block: "start"/.test(card), "5a it is a button that scrolls the founding block (.fll-founding) into view");

  // ── 6. AA on every row, and it does not look like the Join button ──────────────────────────
  const lum = (hex) => { const c = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const rule = (sel) => { const i = APP.indexOf(sel + "{"); return APP.slice(i, APP.indexOf("\n", i)); };
  const colour = (sel, prop = "color") => ((rule(sel).match(new RegExp(`(?:^|[ ;{])${prop}:#([0-9a-f]{6})`)) || [])[1]);
  const BG = colour(".fll-founding-card", "background"), PILL = colour(".fll-fc-pill", "background");
  t.eq(BG, "15321a", "6a the card is the brand's dark green");
  for (const [sel, name] of [[".fll-fc-eyebrow", "eyebrow"], [".fll-fc-price", "price"], [".fll-fc-regular", "struck regular price"], [".fll-fc-save", "saving"], [".fll-fc-small", "small print"]]) {
    const r = ratio(colour(sel), BG);
    t.ok(r >= 4.5, `6b ${name}: ${r.toFixed(1)}:1 on the card (AA)`);
  }
  const pr = ratio(colour(".fll-fc-pill"), PILL);
  t.ok(PILL === "c8f169" && pr >= 4.5, `6c the lime pill: ${pr.toFixed(1)}:1 (AA)`);
  t.ok(!/linear-gradient/.test(rule(".fll-founding-card")) && /\.fll-btn\{[^\n]*linear-gradient/.test(APP),
    "6d the card is flat dark green with lime; the Join button keeps its bright green gradient");

  t.summary("foundingCard.test");
})();
