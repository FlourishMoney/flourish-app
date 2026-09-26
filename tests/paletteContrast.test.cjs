// tests/paletteContrast.test.cjs
// -----------------------------------------------------------------------------
// EVERY TEXT COLOUR CLEARS WCAG AA, ON EVERY SURFACE IT IS USED ON, IN BOTH THEMES.
//
// Contrast was being fixed one element at a time, which is why it kept coming back: the same
// dozen palette entries are used in hundreds of places, so patching a button leaves the other
// ninety-nine. The palette is the right place to fix it, and the matrix is the right way to check
// it — a colour is only safe if it clears 4.5:1 on the WORST surface it can land on, and in this
// app that surface was cardAlt, a beige that no one thinks about.
//
// The light theme had eleven colours below the line. They were darkened by lightness only, hue and
// saturation untouched, most by under 3%. This file recomputes the whole matrix from the source of
// truth so the fix cannot drift back one hex at a time.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
const palette = (name) => {
  const i = SRC.indexOf(`const ${name} = {`);
  const body = SRC.slice(i, SRC.indexOf("\n};", i));
  const out = {};
  for (const m of body.matchAll(/(\w+):\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
};
const hex = (h) => { h = h.replace("#", ""); if (h.length === 3) h = [...h].map(x => x + x).join("");
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: 1 }; };
const parse = (c) => { if (!c || typeof c !== "string") return null;
  if (c.startsWith("#")) return hex(c);
  const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
  const p = m[1].split(",").map(s => parseFloat(s.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
const over = (f, b) => ({ r: f.r*f.a + b.r*(1-f.a), g: f.g*f.a + b.g*(1-f.a), b: f.b*f.a + b.b*(1-f.a), a: 1 });
const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
const ratio = (fg, bg) => { const F = over(parse(fg), bg); const a = lum(F), b = lum(bg);
  return (Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05); };

// Every colour the app renders TEXT in.
const TEXT_KEYS = ["muted","mutedHi","cream","green","greenBright","gold","goldBright","red","redBright",
  "blue","blueBright","teal","tealBright","orange","orangeBright","purple","purpleBright","pink","pinkBright"];
const AA_BODY = 4.5;

(async () => {
  const t = create();

  for (const name of ["DARK_C", "LIGHT_C"]) {
    const P = palette(name);
    t.ok(Object.keys(P).length > 10, `0a ${name} was read from source (${Object.keys(P).length} entries)`);

    // The surfaces text can land on: the flat ones, the glass layer over the page, and every
    // colour's own Dim tint composited over a card.
    const surfaces = [];
    for (const k of ["bg", "surface", "card", "cardAlt"]) if (parse(P[k])) surfaces.push([k, parse(P[k])]);
    const base = parse(P.card) || parse(P.bg);
    if (parse(P.glass)) surfaces.push(["glass over bg", over(parse(P.glass), parse(P.bg))]);
    for (const k of Object.keys(P)) if (/Dim$/.test(k) && parse(P[k])) surfaces.push([`${k} over card`, over(parse(P[k]), base)]);
    t.ok(surfaces.length >= 6, `0b ${name} has the surfaces to test against (${surfaces.length})`);

    const failures = [];
    for (const key of TEXT_KEYS) {
      if (!P[key]) continue;
      for (const [sname, s] of surfaces) {
        const r = ratio(P[key], s);
        if (r < AA_BODY) failures.push(`${key} on ${sname} = ${r.toFixed(2)}`);
      }
    }
    t.eq(failures.join(" | ") || "(none)", "(none)",
      `1 ${name}: every text colour clears AA ${AA_BODY}:1 on every surface it can land on`);
  }

  // The eleven that were changed must stay changed, and stay the same hue.
  {
    const L = palette("LIGHT_C");
    t.eq(L.orangeBright, "#A55314", "2a orangeBright was the worst at 2.88 and is now darkened");
    t.eq(L.blueBright, "#226BB4", "2b blueBright likewise");
    t.eq(L.redBright, "#D0193C", "2c redBright likewise");
    // Hue kept: a darkened orange is still orange, not brown-red.
    const hueOf = (h) => { const { r, g, b } = hex(h); const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
      if (!d) return 0;
      const x = mx === r ? ((g-b)/d + (g<b?6:0)) : mx === g ? ((b-r)/d + 2) : ((r-g)/d + 4);
      return (x * 60 + 360) % 360; };
    const pairs = [["orangeBright","#D86C1A"],["blueBright","#3386D8"],["redBright","#E84060"],
                   ["orange","#C45E10"],["pinkBright","#CC4282"],["blue","#2472C8"],["red","#D42E4A"]];
    for (const [k, was] of pairs) {
      const drift = Math.abs(hueOf(L[k]) - hueOf(was));
      t.ok(Math.min(drift, 360 - drift) <= 3, `2d ${k} kept its hue (moved ${Math.min(drift,360-drift).toFixed(1)}°)`);
    }
  }

  // The dark theme was already clear and must not be disturbed by a light-theme fix.
  {
    const D = palette("DARK_C");
    t.eq(D.green, "#00CC85", "3a the dark palette's green is untouched");
    t.eq(D.muted, "rgba(237,233,226,0.62)", "3b …and its muted text");
  }

  t.summary("paletteContrast.test");
})();
