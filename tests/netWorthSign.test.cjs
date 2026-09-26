// tests/netWorthSign.test.cjs
// -----------------------------------------------------------------------------
// A NEGATIVE NET WORTH MUST READ AS A NEGATIVE FIGURE, IN THE NEGATIVE COLOUR.
//
// Week-2 defect b. netWorth = -14500 rendered as a gain: teal, this app's colour for
// money going the right way. Half of that was fixed earlier — formatCompactMoney now
// emits "-$14.5k" (see tests/format.test.cjs section 7) — but all three surfaces that
// print net worth still hardcoded teal, so the sign said one thing and the colour said
// the opposite. On a screen, colour is read first.
//
// The three surfaces: the Today bento tile, the Net Worth Trend tile, and the Worth
// tab's headline. Each expression below is READ OUT OF App.jsx at test time and run
// with a stub palette, so this tests what renders rather than a description of it.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

// A stub palette whose values are their own names, so an assertion can say which colour won.
const C = { teal:"teal", tealBright:"tealBright", red:"red", redBright:"redBright" };
const NEGATIVE = new Set(["red", "redBright"]);

(async () => {
  const { formatCompactMoney } = await import("../src/lib/format.js");
  const t = create();
  const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

  // Pulls `color:<expr>,` or `color:<expr>,fontWeight` out of a line of JSX and compiles it.
  const colourOf = (line, varName) => {
    const m = /color:([^,]+),/.exec(line);
    if (!m) return null;
    return new Function("C", varName, `return (${m[1]});`);
  };
  const lineWith = (needle) => (app.split("\n").find(l => l.includes(needle)) || "");

  // ── 1. The Today bento tile ──────────────────────────────────────────────────────────────────
  {
    // Sentence case since the readability pass: "Net worth", not "Net Worth".
    const line = lineWith('{label:"Net worth",value:');
    t.ok(line.length > 0, "1a the Net worth tile is in App.jsx");
    const colour = colourOf(line, "netWorth");
    const vm = /value:`([^`]+)`/.exec(line);
    t.ok(colour && vm, "1b …with a colour and a value this test can run");
    // Fail the assertion above rather than throwing here: a renamed label should read as one clear
    // failure, not a stack trace that stops the whole gate at suite 61.
    if (!colour || !vm) { t.summary("netWorthSign"); return; }
    const value = new Function("netWorth", "formatCompactMoney", `return \`${vm[1]}\`;`);

    t.eq(value(-14500, formatCompactMoney), "-$14.5k", "1c NEGATIVE: the figure carries the minus");
    t.ok(NEGATIVE.has(colour(C, -14500)), "1d …and is painted in the negative colour, not teal");
    t.eq(colour(C, -14500), "red", "1e …specifically C.red");

    t.eq(value(0, formatCompactMoney), "+$0.0k", "1f ZERO: no minus sign");
    t.ok(!NEGATIVE.has(colour(C, 0)), "1g …and zero is not painted as a loss");
    t.eq(colour(C, 0), "teal", "1h …it stays teal");

    t.eq(value(14500, formatCompactMoney), "+$14.5k", "1i POSITIVE: unchanged, still teal");
    t.eq(colour(C, 14500), "teal", "1j …the positive case did not regress");
    t.ok(colour(C, -14500) !== colour(C, 14500), "1k …so opposite positions never look the same");
  }

  // ── 2. The Net Worth Trend tile ──────────────────────────────────────────────────────────────
  {
    const line = lineWith('<CountUp to={Math.abs(netWorth)}');
    t.ok(line.length > 0, "2a the trend tile's headline is in App.jsx");
    const colour = colourOf(line, "netWorth");
    t.ok(colour, "2b …with a colour this test can run");
    t.eq(colour(C, -14500), "redBright", "2c NEGATIVE: the trend headline is negative-coloured");
    t.eq(colour(C, 0), "tealBright", "2d ZERO: neutral, not a loss");
    t.eq(colour(C, 14500), "tealBright", "2e POSITIVE: unchanged");
    // The sign glyph itself was already correct here; pin it so the pair cannot drift apart again.
    t.ok(/\{netWorth>=0\?"\+":"-"\}/.test(line), "2f …and the figure still prints its own sign beside the colour");
  }

  // ── 3. The Worth tab headline ────────────────────────────────────────────────────────────────
  {
    const line = lineWith("<CountUp to={Math.abs(realNetWorth)}");
    t.ok(line.length > 0, "3a the Worth tab headline is in App.jsx");
    const colour = colourOf(line, "realNetWorth");
    t.ok(colour, "3b …with a colour this test can run");
    t.eq(colour(C, -14500), "redBright", "3c NEGATIVE: negative-coloured");
    t.eq(colour(C, 0), "tealBright", "3d ZERO: neutral");
    t.eq(colour(C, 14500), "tealBright", "3e POSITIVE: unchanged");
    t.ok(/\{realNetWorth>=0\?"\+":"-"\}/.test(line), "3f …sign glyph intact");
  }

  // ── 4. No net-worth surface is left painting by nothing ──────────────────────────────────────
  {
    // Any line that renders a net-worth figure must decide its colour from that figure.
    const suspects = app.split("\n").filter(l =>
      /CountUp to=\{Math\.abs\((real)?[Nn]etWorth\)\}|formatCompactMoney\(netWorth\)/.test(l));
    t.eq(suspects.length, 3, "4a there are exactly three net-worth figures on screen");
    for (const [i, l] of suspects.entries()) {
      t.ok(/color:(real)?[Nn]etWorth<0\?/.test(l), `4b[${i}] …and each one colours by its own sign`);
    }
  }

  t.summary("netWorthSign.test");
})();
