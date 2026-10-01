// tests/retiredBenefitName.test.cjs
// -----------------------------------------------------------------------------
// THE GST/HST CREDIT NO LONGER EXISTS.
//
// In July 2026 the Canada Groceries and Essentials Benefit replaced it, and the CRA's own page now
// reads "No longer available". An app that lists it as a benefit someone can get is wrong in a way a
// reviewer, or a family counting on it, can check.
//
// So no user-visible string under src/ may name "GST/HST credit". There used to be one exception, a
// sentence saying it was REPLACED ("The CGEB replaced the GST/HST credit in July 2026"); the
// prelaunch-copy batch (2026-10-01) removed those too, so there is no exception now: any mention
// fails, history included. tests/caFigures.test.cjs also scans src/, netlify/ and docs/ as plain text.
//
// Only what a person can read is checked (string literals, template text, JSX text); comments and
// data keys may still say the old name.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const OLD = /GST\/HST credit/i;
const HISTORY = /\breplaced the GST\/HST credit\b/gi; // no longer allowed: counted only to prove there are none

function userVisibleStrings(file, parser) {
  const out = [];
  const ast = parser.parse(fs.readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx"] });
  (function walk(n, parent) {
    if (!n || typeof n.type !== "string") return;
    let text = null;
    if (n.type === "StringLiteral") text = n.value;
    else if (n.type === "JSXText") text = n.value;
    else if (n.type === "TemplateElement") text = n.value.cooked ?? n.value.raw;
    // An object KEY is not copy, and a StringLiteral used as a property key is not printed.
    const isKey = parent && parent.type === "ObjectProperty" && parent.key === n;
    // taxData.CGEB.replaced is a record of what the CGEB replaced, and nothing prints it (checked
    // below). If anything ever reads it, that check fails and this exemption has to be revisited.
    const isReplacedRecord = parent && parent.type === "ObjectProperty" && parent.value === n && parent.key && (parent.key.name || parent.key.value) === "replaced";
    if (text && !isKey && !isReplacedRecord) out.push({ text, line: n.loc.start.line });
    for (const k of Object.keys(n)) {
      if (["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "extra"].includes(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === "string" && walk(x, n));
      else if (v && typeof v.type === "string") walk(v, n);
    }
  })(ast.program, null);
  return out;
}

(async () => {
  const t = create();
  const REPO = path.join(__dirname, "..");
  const parser = require(path.join(REPO, "node_modules", "@babel", "parser"));

  const files = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx?|mjs)$/.test(f)) files.push(p);
    }
  })(path.join(REPO, "src"));
  t.ok(files.length >= 20, `sanity: every source file under src/ is read (${files.length})`);

  const hits = [];
  let history = 0;
  for (const f of files) {
    for (const { text, line } of userVisibleStrings(f, parser)) {
      history += (text.match(HISTORY) || []).length;
      if (OLD.test(text)) hits.push(`${path.relative(REPO, f)}:${line} "${text.trim().slice(0, 90)}"`);
    }
  }
  t.eq(hits, [], "no user-visible string under src/ names the GST/HST credit, not even as history");
  const readers = files.filter((f) => /\.replaced\b|\["replaced"\]/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(REPO, f));
  t.eq(readers, [], "nothing reads taxData's CGEB.replaced record, so its old name is never printed");
  t.eq(history, 0, "the history sentences (\"replaced the GST/HST credit\") are gone too: there is no exception");

  // With no exception, every form is caught.
  const probe = (s) => OLD.test(s);
  t.eq(probe("CCB, GST/HST credit, Trillium"), true, "a list that names it is caught");
  t.eq(probe("It replaced the GST/HST credit in July 2026."), true, "a sentence saying it was replaced is caught too");
  t.eq(probe("The CGEB replaced the GST/HST credit. Apply for the GST/HST credit now."), true, "…and one that offers it");

  // The feature list names the benefit that exists.
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  t.ok(app.includes('desc:isCA?"CCB, Canada Groceries and Essentials Benefit, Trillium, RRSP, TFSA, FHSA: which rule applies to you and why"'),
       "the paywall's Benefits explained line names the Canada Groceries and Essentials Benefit");
  const doc = fs.readFileSync(path.join(REPO, "docs", "product", "COPY-CHANGES.md"), "utf8");
  t.ok(doc.includes("**CCB, Canada Groceries and Essentials Benefit, Trillium, RRSP, TFSA, FHSA: which rule applies to you and why**"),
       "COPY-CHANGES.md records the same line");

  t.summary("retiredBenefitName.test");
})();
