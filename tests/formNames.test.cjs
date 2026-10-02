// tests/formNames.test.cjs
// -----------------------------------------------------------------------------
// EVERY FORM CONTROL HAS A NAME (prompt 4b item 4).
//
// The full axe sweep (a11y.browser.test.cjs) found 21 selects, 16 inputs and a send button with no
// accessible name: a screen reader announced "combo box" or "slider" and nothing else. This reads
// App.jsx and fails on any <select>, <input> or <textarea> that has none of: aria-label,
// aria-labelledby, an id (for a <label htmlFor>), a placeholder (axe's fallback name), or a <label>
// wrapped round it. Hidden and file inputs are exempt. It covers screens the sweep cannot reach.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

// The whole opening tag, braces and all (attribute values hold JSX expressions with ">" in them).
function* openingTags(src, name) {
  const re = new RegExp(`<${name}\\b`, "g");
  let m;
  while ((m = re.exec(src))) {
    let depth = 0, j = m.index + m[0].length;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    yield { at: m.index, tag: src.slice(m.index, j + 1) };
  }
}

(async () => {
  const t = create();
  const unnamed = [];
  let seen = 0;
  for (const name of ["select", "input", "textarea"]) {
    for (const { at, tag } of openingTags(APP, name)) {
      seen++;
      if (/aria-label|aria-labelledby|placeholder=|\bid=|type="hidden"|type="file"/.test(tag)) continue;
      const before = APP.slice(Math.max(0, at - 600), at);
      if (before.lastIndexOf("<label") > before.lastIndexOf("</label>")) continue;   // wrapped in a <label>
      unnamed.push(`App.jsx:${APP.slice(0, at).split("\n").length} ${tag.replace(/\s+/g, " ").slice(0, 90)}`);
    }
  }
  t.ok(seen > 60, `sanity: the scan reads the app's form controls (${seen})`);
  t.eq(unnamed, [], "every select, input and textarea has an accessible name");
  t.ok(/aria-label="Send"\s/.test(APP), "the coach's icon-only send button is named");
  t.summary("formNames.test");
})();
