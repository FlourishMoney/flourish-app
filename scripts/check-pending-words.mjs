#!/usr/bin/env node
// scripts/check-pending-words.mjs
// -----------------------------------------------------------------------------
// NOTHING SHIPS WITH A "[WORDS: id]" PLACEHOLDER (2026-10-29). Words still to come show as placeholders
// (src/lib/pendingWords.js, netlify/functions/_lib/pendingWords.js; docs/product/FOUNDING-SEATS-WORDS.md lists
// them). This refuses a build that still holds one: the production web deploy (netlify.toml [context.production])
// and every store build (npm run build:native). A deploy preview and the test gate still build, so the screens can
// be seen and tested while the words are written.
//
//   node scripts/check-pending-words.mjs <dir or file>...     exit 1, naming each id, when any is found
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";

const TEXT = /\.(html?|js|mjs|cjs|css|json|txt|xml|svg|webmanifest)$/i;
const RX = /\[WORDS:\s*([a-z0-9-]+)/g;

function walk(p, out) {
  let st;
  try { st = fs.statSync(p); } catch { return out; }
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(p)) if (f !== "node_modules") walk(path.join(p, f), out);
  } else if (TEXT.test(p)) {
    const src = fs.readFileSync(p, "utf8");
    for (const m of src.matchAll(RX)) out.push([p, m[1]]);
  }
  return out;
}

const targets = process.argv.slice(2);
if (!targets.length) { console.error("usage: check-pending-words.mjs <dir or file>..."); process.exit(2); }
const missing = targets.filter((t) => !fs.existsSync(t));
if (missing.length) { console.error(`  ✗ not found: ${missing.join(", ")}`); process.exit(1); }
const hits = targets.flatMap((t) => walk(t, []));
if (hits.length) {
  const ids = [...new Set(hits.map(([, id]) => id))].sort();
  console.error(`  ✗ words still to come, so this build is refused: ${ids.length} placeholder${ids.length === 1 ? "" : "s"}`);
  for (const id of ids) console.error(`    [WORDS: ${id}]  in ${[...new Set(hits.filter(([, i]) => i === id).map(([f]) => path.relative(process.cwd(), f)))].join(", ")}`);
  process.exit(1);
}
console.log(`  ✓ no [WORDS: placeholder in ${targets.join(", ")}`);
