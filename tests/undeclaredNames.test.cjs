// tests/undeclaredNames.test.cjs
// -----------------------------------------------------------------------------
// EVERY NAME THE APP READS MUST BE DECLARED WHERE IT IS READ.
//
// Two screens threw ReferenceError every time they rendered for a household with a budget:
//   - Do → Goals → Budget read `actuals`, which nothing has declared since 44a6cc9;
//   - Do → Budget (BudgetScreen) read `activeGoals`, which only Goals declares.
// An undeclared name is valid syntax (JavaScript looks it up on the global object when the line
// runs), so `vite build` passed both, and hookOrder.test only checks names that ARE declared.
//
// This resolves every name read in src/ against the scopes around it, with @babel/traverse's scope
// model. A name no scope declares must be a JavaScript builtin (Babel knows those) or one of the
// browser globals listed below; anything else fails with its file and line.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

// The browser globals the app reads without declaring. A new browser API goes on this list. It is
// short on purpose: `name`, `status`, `event` and `location` are browser globals too, and a local
// that lost its declaration under one of those names would quietly read the global instead.
const BROWSER_GLOBALS = new Set([
  "window", "document", "navigator", "localStorage", "console", "fetch",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "getComputedStyle",
  "URL", "URLSearchParams", "Blob", "CustomEvent", "ResizeObserver", "caches",
]);

(async () => {
  const t = create();
  const REPO = path.join(__dirname, "..");
  let parser = null, traverse = null;
  try {
    parser = require(path.join(REPO, "node_modules", "@babel", "parser"));
    traverse = require(path.join(REPO, "node_modules", "@babel", "traverse")).default;
  } catch { /* reported below */ }
  t.ok(!!(parser && traverse), "the check can load @babel/parser and @babel/traverse");
  if (!parser || !traverse) return t.summary("undeclaredNames.test");

  // Each read of a name that no enclosing scope declares, as "line name". `typeof x` is exempt: it
  // is how code asks whether a global exists, and it cannot throw.
  let reads = 0;
  const undeclared = (code) => {
    const found = [];
    traverse(parser.parse(code, { sourceType: "module", plugins: ["jsx"] }), {
      ReferencedIdentifier(p) {
        reads++;
        const name = p.node.name;
        if (p.scope.hasBinding(name) || BROWSER_GLOBALS.has(name)) return;
        if (p.parentPath.isUnaryExpression({ operator: "typeof" })) return;
        found.push(`${p.node.loc.start.line} ${name}`);
      },
    });
    return found;
  };

  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(js|jsx)$/.test(e.name)) files.push(rel);
    }
  })("src");

  const problems = [];
  for (const rel of files) {
    for (const f of undeclared(fs.readFileSync(path.join(REPO, rel), "utf8"))) problems.push(`${rel}:${f}`);
  }
  t.eq(problems, [], "every name src/ reads is declared in scope, a JavaScript builtin, or a listed browser global");
  t.ok(files.includes("src/App.jsx") && reads > 10000, `the check actually read src/ (${files.length} files, ${reads} name reads)`);

  // The check must be able to fail, and must not fail on what is fine.
  t.eq(undeclared("function Goals(){ const activeGoals = []; return activeGoals; }\nfunction BudgetScreen(){ return activeGoals.length; }"),
    ["2 activeGoals"], "sanity: a name declared only in another function is caught");
  t.eq(undeclared("function Goals(){ const saving = actuals.Groceries || 0; return saving; }"),
    ["1 actuals"], "sanity: a name declared nowhere is caught");
  t.eq(undeclared("import { x } from 'y';\n" +
    "function Row({ label, value = x }) { const [a, ...rest] = [1]; try { a(); } catch (e) { return <Cell k={e} />; }\n" +
    "  return <div>{label}{value}{rest}{Math.max(a, NaN)}{typeof maybeGlobal}</div>; }\n" +
    "const Cell = () => null;"),
    [], "sanity: imports, parameters, defaults, destructuring, catch bindings, components, builtins and typeof are not flagged");

  t.summary("undeclaredNames.test");
})();
