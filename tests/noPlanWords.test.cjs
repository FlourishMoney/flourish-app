// tests/noPlanWords.test.cjs
// -----------------------------------------------------------------------------
// NO FREE PLAN: THE WORDS STILL TO BE WRITTEN (founder's decision, 2026-10-23).
//
// No new user-facing words were written for the change. Each line it needs is a [WORDS: …] placeholder, and every
// one is listed, exactly, in docs/product/NO-FREE-PLAN-WORDS.md, which also lists (without changing them) the public
// lines that still promise a free plan. This holds the two together: a placeholder in the code that the list does
// not name fails, and so does one the list names that the code no longer has. When the approved words are swapped
// in, the placeholder leaves both.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");

(async () => {
  const t = create();
  const DOC = read("docs", "product", "NO-FREE-PLAN-WORDS.md");
  const files = ["src/App.jsx", ...fs.readdirSync(path.join(REPO, "src", "lib")).map((f) => `src/lib/${f}`),
    ...fs.readdirSync(path.join(REPO, "netlify", "functions")).filter((f) => f.endsWith(".js")).map((f) => `netlify/functions/${f}`),
    ...fs.readdirSync(path.join(REPO, "netlify", "functions", "_lib")).map((f) => `netlify/functions/_lib/${f}`)];
  const inCode = new Set();
  for (const f of files) {
    // ${…} in a template placeholder is written <date> in the list.
    for (const m of read(f).matchAll(/\[WORDS: [^\]"`]*\]/g)) inCode.add(m[0].replace(/\$\{[^}]+\}/g, "<date>"));
  }
  const inDoc = new Set([...DOC.matchAll(/`(\[WORDS: [^\]`]*\])`/g)].map((m) => m[1]));
  t.ok(inCode.size >= 6, `1a the code carries its placeholders (${inCode.size})`);
  t.eq([...inCode].filter((w) => !inDoc.has(w)), [], "1b every placeholder in the code is listed in docs/product/NO-FREE-PLAN-WORDS.md");
  t.eq([...inDoc].filter((w) => !inCode.has(w)), [], "1c …and the list names none the code no longer has");

  const G = await import("../src/lib/paywallGate.js");
  const S = require("../netlify/functions/_lib/planGate.js");
  for (const w of [...G.NO_PLAN_PLACEHOLDERS, S.PLAN_REQUIRED_MESSAGE, S.PLAN_UNKNOWN_MESSAGE]) {
    t.ok(inDoc.has(w), `2a listed: ${w}`);
  }
  for (const heading of ["### In-app paywall", "### Terms of Service", "### Privacy policy", "### Landing page", "### Server messages", "### Emails", "### App Store and Google Play"]) {
    t.ok(DOC.includes(heading), `3a the free-plan line list covers: ${heading.slice(4)}`);
  }
  // Each listed line is still in the code, word for word, so the list is not a memory of an older tree.
  for (const [file, line] of [["src/lib/freePlan.js", "This part isn't included in the free plan."], ["src/App.jsx", "Core features are available at no charge with a 14-day trial of premium features."],
    ["src/App.jsx", "Keep the free plan"], ["src/lib/storeOffer.js", "lifts the free plan's limits on the coach and What-If."], ["netlify/functions/_lib/coachLimits.js", "isn't part of the free plan"],
    ["netlify/functions/plaid.js", "Free plan supports one bank."], ["src/App.jsx", "Create your free account"], ["docs/ops/LEGAL-PACKET.md", "Business model: free tier"]]) {
    t.ok(read(...file.split("/")).includes(line), `3b still in ${file}, unchanged: ${line}`);
  }
  t.summary("noPlanWords");
})();
