// tests/apiRoutes.test.cjs
// -----------------------------------------------------------------------------
// EVERY /api/ PATH THE APP, THE WEBSITE OR THE STORE BUILDS CALL HAS A ROUTE (2026-11-10).
// #125 shipped calls to /api/meeting with no redirect in netlify.toml: the SPA fallback answered (a GET got the page, a
// POST 404), so no meeting could load or save on the live site, and no other suite saw it (they run against stand-ins).
// This reads every "/api/<name>" in src/, public/ and index.html (the store builds are built from src/) and holds each
// to one of:
//   a netlify.toml redirect from "/api/<name>" to "/.netlify/functions/<fn>", status 200, where netlify/functions/<fn>.js
//   (or a folder of that name) exists, and the redirect comes before the SPA fallback; or
//   an edge function or function that declares the path itself (config = { path: "/api/<name>" }).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
function walk(dir, out = []) {
  const abs = path.join(REPO, dir);
  if (!fs.existsSync(abs)) return out;
  for (const f of fs.readdirSync(abs)) {
    const rel = path.join(dir, f);
    const st = fs.statSync(path.join(REPO, rel));
    if (st.isDirectory()) { if (f !== "node_modules") walk(rel, out); }
    else if (/\.(js|jsx|mjs|cjs|html)$/.test(f)) out.push(rel);
  }
  return out;
}

const t = create();
const files = [...walk("src"), ...walk("public"), "index.html"];
const used = new Map();
for (const f of files) for (const m of read(f).matchAll(/\/api\/([a-z0-9-]+)/g)) { if (!used.has(m[1])) used.set(m[1], f); }

const toml = read("netlify.toml");
const spaAt = toml.indexOf('from   = "/*"');
const redirects = new Map();
for (const m of toml.matchAll(/\[\[redirects\]\]\s*\n\s*from\s*=\s*"\/api\/([a-z0-9-]+)"\s*\n\s*to\s*=\s*"\/\.netlify\/functions\/([a-z0-9-]+)"\s*\n\s*status\s*=\s*200/g)) {
  redirects.set(m[1], { fn: m[2], at: m.index });
}
const declared = new Set();
for (const dir of ["netlify/functions", "netlify/edge-functions"]) {
  for (const f of walk(dir)) for (const m of read(f).matchAll(/path:\s*"\/api\/([a-z0-9-]+)"/g)) declared.add(m[1]);
}
const fnExists = (fn) => fs.existsSync(path.join(REPO, "netlify", "functions", `${fn}.js`)) || fs.existsSync(path.join(REPO, "netlify", "functions", fn));

t.ok(used.size >= 10 && spaAt > 0, `the app and the website call ${used.size} /api/ paths, and netlify.toml has its SPA fallback`);
const missing = [];
for (const [name, where] of used) {
  const r = redirects.get(name);
  const ok = declared.has(name) || (!!r && fnExists(r.fn) && r.at < spaAt);
  if (!ok) missing.push(`/api/${name} (first in ${where})`);
}
t.eq(missing, [], "every /api/ path called has a route to a function that exists, before the SPA fallback");
t.ok(redirects.has("meeting") && redirects.get("meeting").fn === "meeting", "/api/meeting goes to netlify/functions/meeting.js");
t.summary("apiRoutes.test");
