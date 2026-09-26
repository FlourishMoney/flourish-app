// tests/affordPresetFormat.test.cjs
// -----------------------------------------------------------------------------
// THE "CAN I AFFORD THIS?" PRESET CHIPS USE THE SHARED MONEY FORMATTER.
//
// The chips printed a literal "$" followed by the raw number, so with a safe-to-spend of $1,944 the
// third chip read "$1750" while the headline beside it read "$1,944". Every chip label now goes through
// formatMoney, the one formatter for displayed dollar amounts (src/lib/format.js).
//
// No DOM harness here, so: the formatter is checked on the exact amounts these chips produce, and
// App.jsx is scanned (an established pattern in this repo) to pin the chip to that formatter.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { formatMoney } = await import("../src/lib/format.js");

  // ── 1. four-figure amounts render with a separator ───────────────────────────────────────────
  t.eq(formatMoney(1750), "$1,750", "1a a four-figure preset renders with a thousands separator");
  t.eq(formatMoney(1000), "$1,000", "1b the smallest four-figure amount");
  t.eq(formatMoney(9995), "$9,995", "1c the largest four-figure amount a $5-rounded preset can be");
  t.eq(formatMoney(485), "$485", "1d three-figure amounts are untouched");

  // ── 2. the chip in App.jsx renders through formatMoney ───────────────────────────────────────
  const raw = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  const start = code.indexOf("presets.map(amt=>(");
  t.ok(start > -1, "2a the preset chip map is where this test expects it");
  const chip = start > -1 ? code.slice(start, code.indexOf("</button>", start)) : "";
  t.ok(/\{formatMoney\(amt\)\}/.test(chip), "2b the chip label is {formatMoney(amt)}");
  t.ok(!/\$\{amt\}/.test(chip), "2c no raw ${amt} label (a literal $ plus the unformatted number)");

  t.summary("affordPresetFormat.test");
})();
