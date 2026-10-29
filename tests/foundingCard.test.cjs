// tests/foundingCard.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING CARD above the hero's email field (2026-10-07), on phones and tablets only. It replaced the
// one-line version. The rendered page is checked in landingDemo.browser.test.cjs (section 10); this pins the
// words and the rules: the four rows exactly, the price everyone else pays read from pricing.js (2026-10-14:
// no struck-through price and no saving claim), no pill when no count was read, no card at 0, one shared
// request, phones only, the tap target, and AA on every row.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const ROWS = {
  eyebrow: "FOUNDING PRICE · FIRST 50 HOUSEHOLDS",
  price: "$79.99 a year",
  pill: "35 of 50 left",
  small: "Plus tax, for as long as you stay subscribed. Available on the website and in the iPhone and Android apps.",
  save: "Everyone else: $99.99 a year, plus tax.",
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

  // ── 2. the prices come from pricing.js; no saving claim (2026-10-14) ─────────────────────────
  const p = P.getPricing("CA");
  const cardFn = LIB.slice(LIB.indexOf("export function foundingCardParts("), LIB.indexOf("\n}\n", LIB.indexOf("export function foundingCardParts(")));
  t.ok(/save: `Everyone else: \$\{formatPrice\(p\.annual\)\} a year, plus tax\.`,/.test(cardFn) && !/regular:/.test(cardFn), "2a the card states the annual price everyone else pays, read from pricing.js, and no struck-through regular price");
  t.ok(!/\d+\.\d{2}|\$20\b|\b20 a year/.test(LIB.replace(/^\s*\/\/.*$/gm, "")), "2b no price and no saving is typed in foundingOffer.js");
  t.ok(!/a year less|less than the regular|saving|\bsave \$/i.test(Object.values(O.foundingCardParts(35)).join(" ")) && !/p\.annual - p\.foundingAnnual/.test(LIB), "2c no saving is worked out or claimed");
  {
    // Change the prices and the card follows: nothing on it is a fixed figure.
    const saved = { ...P.PRICING.CA };
    try {
      P.PRICING.CA.annual = 109.99; P.PRICING.CA.foundingAnnual = 84.49;
      const c = O.foundingCardParts(12);
      t.eq([c.price, c.save, c.regular], ["$84.49 a year", "Everyone else: $109.99 a year, plus tax.", undefined],
        "2d other prices give other figures: nothing on the card is a fixed figure");
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
  const block = APP.slice(APP.indexOf("function FoundingOffer("), APP.indexOf("function FoundingCard("));
  const card = APP.slice(APP.indexOf("function FoundingCard("), APP.indexOf("function AuthScreen("));
  t.ok(/sharedFoundingSpots\(\)\.then/.test(block) && /sharedFoundingSpots\(\)\.then/.test(card) && !/fetchFoundingSpots\(/.test(block + card),
    "3b both read through sharedFoundingSpots, neither fetches on its own");
  t.ok(/const parts = foundingCardParts\(spotsLeft\);\s+if \(!parts\) return null;/.test(card) && /\{pill && parts\.pill && <span className="fll-fc-pill"/.test(card),
    "3c no card at 0, and no pill without a count");
  // The trial-first page (Oct 22): the founding line under the badges carries the count, so the card has no pill there.
  // Before the launch (signup shut) the pill stays.
  t.ok(/function FoundingCard\(\{ pill = true \}\)/.test(card) && /<FoundingCard pill=\{!launched\}\/>/.test(block),
    "3c2 the pill only before the launch: the price box passes pill={!launched}");
  t.ok(!/fll-founding-line|FoundingLine/.test(APP), "3d the one-line version is gone");

  // ── 4. phones and tablets only, directly above the email field ─────────────────────────────
  const desk = APP.slice(APP.indexOf("@media(min-width:960px){"), APP.indexOf("@media(min-width:960px){") + 3000);
  t.ok(/\.fll-founding-card\{ display:none; \}/.test(desk) && /\.fll-founding-card\{ display:block;/.test(APP), "4a shown in the one-column layout, hidden at 960px and up");
  // The trial-first landing (approved Oct 22): the card is the top of the price box, above its lines and the
  // founding list form.
  t.ok(/<section className="fll-founding"[^>]*>\s*(?:\{\/\*[^*]*\*\/\}\s*)?<FoundingCard pill=\{!launched\}\/>/.test(APP) && (APP.match(/<FoundingCard[ /]/g) || []).length === 1,
    "4b it sits at the top of the price box, and only there");
  let A = {};
  try { A = loadApp(["AuthScreen"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  if (A.AuthScreen) {
    const html = A.render(A.h(A.AuthScreen, { onAuth: () => {}, onTryDemo: () => {} }));
    const at = html.indexOf('class="fll-founding-card"'), boxAt = html.indexOf('class="fll-founding"'), inputAt = html.indexOf('class="fll-founding-h', at);
    t.ok(boxAt > 0 && at > boxAt && inputAt > at, "4c rendered: the card opens the price box, before its lines");
    const text = textOf(html.slice(at, inputAt));
    t.ok([ROWS.eyebrow, ROWS.price, ROWS.save, ROWS.small].every(r => text.includes(r)) && !/of 50 left/.test(text),
      "4d before any count is read: every row, and no pill");
    const cardHtml = html.slice(at, inputAt);
    // The order on the card (2026-10-15): "$79.99 a year", then its terms, then "Everyone else: …".
    const iPrice = text.indexOf(ROWS.price), iSmall = text.indexOf(ROWS.small), iSave = text.indexOf(ROWS.save);
    t.ok(iPrice >= 0 && iSmall > iPrice && iSave > iSmall, "4d2 in this order: the founding price, its terms (\"Plus tax, for as long as…\"), then \"Everyone else: $99.99 a year, plus tax.\"");
    t.ok(!/<s[ >]|<del[ >]|<strike/i.test(cardHtml) && !/fll-fc-regular/.test(APP), "4e no price on the card is struck through (2026-10-14)");
  }

  // ── 5. tapping it goes to the founding block ───────────────────────────────────────────────
  t.ok(/<div className="fll-founding-card">/.test(card) && !/toBlock|scrollIntoView|<button/.test(card),
    "5a inside the price box it is part of the box, not a button (there is nothing to scroll to)");

  // ── 6. AA on every row, and it does not look like the Join button ──────────────────────────
  const lum = (hex) => { const c = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const rule = (sel) => { const i = APP.indexOf(sel + "{"); return APP.slice(i, APP.indexOf("\n", i)); };
  const colour = (sel, prop = "color") => ((rule(sel).match(new RegExp(`(?:^|[ ;{])${prop}:#([0-9a-f]{6})`)) || [])[1]);
  const BG = colour(".fll-founding-card", "background"), PILL = colour(".fll-fc-pill", "background");
  t.eq(BG, "15321a", "6a the card is the brand's dark green");
  for (const [sel, name] of [[".fll-fc-eyebrow", "eyebrow"], [".fll-fc-price", "price"], [".fll-fc-save", "everyone else's price"], [".fll-fc-small", "small print"]]) {
    const r = ratio(colour(sel), BG);
    t.ok(r >= 4.5, `6b ${name}: ${r.toFixed(1)}:1 on the card (AA)`);
  }
  const pr = ratio(colour(".fll-fc-pill"), PILL);
  t.ok(PILL === "c8f169" && pr >= 4.5, `6c the lime pill: ${pr.toFixed(1)}:1 (AA)`);
  t.ok(!/linear-gradient/.test(rule(".fll-founding-card")) && /\.fll-btn\{[^\n]*linear-gradient/.test(APP),
    "6d the card is flat dark green with lime; the Join button keeps its bright green gradient");

  t.summary("foundingCard.test");
})();
