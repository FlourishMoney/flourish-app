// tests/renderedCopy.test.cjs
// -----------------------------------------------------------------------------
// NO USER EVER SEES "${TAX_DATA...}".
//
// The benefits audit moved dozens of tip and benefit strings from plain quotes to
// template literals. One of them shipped as `$${'{'}TAX_DATA.CA.FHSA_ANNUAL...}`,
// which is valid JavaScript — it interpolates the string "{" — so the build passed,
// the gate passed, and the FHSA tip rendered the literal text
//     "you can contribute up to ${TAX_DATA.CA.FHSA_ANNUAL.value.toLocaleString()}/year"
// to every Canadian user.
//
// This file renders the copy the way the app does and reads the result.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
// The keys that carry user-facing copy in the tip / benefit / account-card data.
const COPY_KEYS = ["title", "name", "body", "savings", "amount", "eligible", "annualLimit", "taxNote", "tip", "key", "fullName"];

(async () => {
  const taxData = await import("../src/lib/taxData.js");
  const t = create();
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");

  // ── 1. The exact shape that caused it ────────────────────────────────────────────────────────
  // A brace escaped as a string ({'{'} or {"{"}) inside a template literal is never intentional
  // here: it renders a literal "{" followed by unevaluated source.
  for (const [needle, what] of [["{'{'}", "single-quoted"], ['{"{"}', "double-quoted"]]) {
    const n = app.split(needle).length - 1;
    t.eq(n, 0, `1 no ${what} escaped brace in App.jsx, which renders as unevaluated source`);
  }

  // ── 2. Render every copy string and read it ──────────────────────────────────────────────────
  // Each literal is evaluated with the same values the app has. Anything that needs other
  // variables (profile, cfg, a loop item) cannot be rendered standalone and is counted, not
  // guessed at — but it still gets the source-level check in section 3.
  const literal = "(`(?:[^`\\\\]|\\\\.)*`|\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*')";
  const scope = { TAX_DATA: taxData.TAX_DATA, creditWorth: taxData.creditWorth, ccbMonthly: taxData.ccbMonthly };
  const rendered = [], skipped = [];
  for (const key of COPY_KEYS) {
    const re = new RegExp(key + ":" + literal, "g");
    let m;
    while ((m = re.exec(app)) !== null) {
      const src = m[1];
      if (!src.includes("${")) { rendered.push([key, src.slice(1, -1)]); continue; }
      try {
        const out = new Function(...Object.keys(scope), "return " + src)(...Object.values(scope));
        rendered.push([key, String(out)]);
      } catch (e) { skipped.push(`${key}: ${String(e.message).slice(0, 40)}`); }
    }
  }
  t.ok(rendered.length > 150, `2a rendered ${rendered.length} copy strings the way the app renders them`);

  const leaked = rendered.filter(([, out]) => out.includes("${") || /\bTAX_DATA\b|creditWorth\(|ccbMonthly\(/.test(out));
  t.eq(leaked.map(([k, o]) => `${k}: ${o.slice(0, 70)}`).join(" | ") || "(none)", "(none)",
    "2b no rendered string shows a user unevaluated source");
  const emptyish = rendered.filter(([, out]) => /\$\s*(\/|per|\b(yr|mo)\b)|\$,|\$\.|\bundefined\b|\bNaN\b|\[object/.test(out));
  t.eq(emptyish.map(([k, o]) => `${k}: ${o.slice(0, 70)}`).join(" | ") || "(none)", "(none)",
    "2c …and none renders a dangling $, undefined, NaN or [object Object]");

  // ── 3. The strings that cannot be rendered standalone still must not carry the bug's shape ───
  t.ok(skipped.length < rendered.length / 2, `3a most copy renders standalone (${skipped.length} need other variables)`);
  const suspicious = [];
  for (const key of COPY_KEYS) {
    const re = new RegExp(key + ":" + literal, "g");
    let m;
    while ((m = re.exec(app)) !== null) {
      // NOTE: `$${x}` is correct and intended — a literal dollar sign followed by an
      // interpolation. Only a brace escaped as a STRING is the bug.
      if (/\{'\{'\}|\{"\{"\}|\{`\{`\}/.test(m[1])) suspicious.push(`${key}: ${m[1].slice(0, 60)}`);
    }
  }
  t.eq(suspicious.join(" | ") || "(none)", "(none)", "3b no copy literal escapes a brace as a string, which is what rendered as source");

  // ── 4. A double-quoted string can never interpolate ──────────────────────────────────────────
  // Sections 1-3 only look at the tip/benefit data keys. The same bug reappeared in the coach's
  // system prompt, where "FIRST-TIME BUYER ELIGIBLE: FHSA ($${TAX_DATA...})" sat inside DOUBLE
  // QUOTES — so the model was sent the source text instead of $8,000 — and nothing caught it,
  // because that string is not behind a copy key. It shipped: the deployed bundle carried the
  // literal "${TAX_DATA.CA.FHSA_ANNUAL.value.toLocaleString()}".
  //
  // Deciding this needs to know whether each interpolation sits in a template literal or in a
  // quoted string, which needs a scanner, not a regex. Two earlier attempts failed on real code:
  // matching quoted strings with a regex treated every apostrophe in prose ("CRA's limits") as a
  // delimiter, and walking back to the nearest quote was fooled by double quotes INSIDE an
  // interpolation (`.join(", ")`, `.toLocaleString("en-US")`).
  //
  // So: a small forward scanner tracking backticks, ${…} nesting, double quotes and comments.
  // Single quotes are ignored on purpose — an apostrophe in prose is not a delimiter, and this
  // file never opens a TAX_DATA interpolation inside a single-quoted string.
  {
    const ctx = [];                       // stack: "tpl" | "interp" | "dq"
    const dqAt = new Set();               // indexes that sit inside a double-quoted string
    for (let i = 0; i < app.length; i++) {
      const c = app[i], top = ctx[ctx.length - 1];
      if (c === "\\") { i++; continue; }                                     // escape
      if (top === "dq") { dqAt.add(i); if (c === '"') ctx.pop(); continue; }
      if (top === "tpl") {
        if (c === "`") ctx.pop();
        else if (c === "$" && app[i + 1] === "{") { ctx.push("interp"); i++; }
        continue;
      }
      // code, or inside ${ } which behaves like code
      if (c === "/" && app[i + 1] === "/") { i = app.indexOf("\n", i); if (i < 0) break; continue; }
      if (c === "/" && app[i + 1] === "*") { i = app.indexOf("*/", i) + 1; if (i < 1) break; continue; }
      if (c === "`") ctx.push("tpl");
      else if (c === '"') ctx.push("dq");
      else if (top === "interp" && c === "}") ctx.pop();
    }
    const bad = [];
    const re = /\$\{(?:TAX_DATA|creditWorth|ccbMonthly)\b/g;
    let m;
    while ((m = re.exec(app)) !== null) {
      if (!dqAt.has(m.index)) continue;
      bad.push(`App.jsx:${app.slice(0, m.index).split("\n").length} ${app.slice(m.index, m.index + 44)}`);
    }
    t.eq(bad.join(" | ") || "(none)", "(none)",
      "4a every TAX_DATA interpolation sits in a template literal, not a double-quoted string");
  }

  t.summary("renderedCopy.test");
})();
