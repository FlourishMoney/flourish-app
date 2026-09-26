// tests/hookOrder.test.cjs
// -----------------------------------------------------------------------------
// A HOOK MAY NOT NAME A VALUE THAT DOES NOT EXIST YET.
//
// A useEffect was added above the useState it depended on:
//
//     useEffect(() => { if (!showAuth) return; ... }, [showAuth]);   // line 13051
//     const [showAuth, setShowAuth] = useState(isNativeApp());       // line 13079
//
// The dependency array is an ordinary expression, evaluated while the component renders, so it read
// `showAuth` inside its temporal dead zone and threw ReferenceError EVERY time. AuthScreen is what an
// unauthenticated visitor sees, so that was the login screen, the sign-up screen and the launch screen
// of both store apps, all replaced by the error boundary. `vite build` was happy: it is valid syntax.
//
// Every test in this repo is a handler test or a string test, and neither renders a component, so
// nothing caught it. This does, for the whole file at once: for each function, every identifier named
// in a hook's dependency array must be declared before that hook, not after.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const HOOKS = new Set(["useEffect", "useLayoutEffect", "useMemo", "useCallback"]);

(async () => {
  const t = create();
  const REPO = path.join(__dirname, "..");
  let parser;
  try { parser = require(path.join(REPO, "node_modules", "@babel", "parser")); } catch { parser = null; }
  t.ok(!!parser, "the hook check can load @babel/parser");
  if (!parser) return t.summary("hookOrder.test");

  const files = ["src/App.jsx", "src/main.jsx"];
  const problems = [];
  let hooksSeen = 0;

  for (const rel of files) {
    const code = fs.readFileSync(path.join(REPO, rel), "utf8");
    const ast = parser.parse(code, { sourceType: "module", plugins: ["jsx"] });

    // Every function body in the file, as its own scope.
    const bodies = [];
    (function collect(n) {
      if (!n || typeof n.type !== "string") return;
      if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type) && n.body && n.body.type === "BlockStatement") {
        bodies.push(n.body);
      }
      for (const k of Object.keys(n)) {
        if (["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "extra"].includes(k)) continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(x => x && typeof x.type === "string" && collect(x));
        else if (v && typeof v.type === "string") collect(v);
      }
    })(ast.program);

    for (const body of bodies) {
      // The const/let/class names this body declares, and where. `var` is hoisted and initialised to
      // undefined, so it cannot throw here and is deliberately not collected.
      const declaredAt = new Map();
      for (const stmt of body.body) {
        if (stmt.type === "VariableDeclaration" && stmt.kind !== "var") {
          for (const d of stmt.declarations) {
            const names = [];
            (function walkId(p) {
              if (!p) return;
              if (p.type === "Identifier") names.push(p.name);
              else if (p.type === "ObjectPattern") p.properties.forEach(pr => walkId(pr.value || pr.argument));
              else if (p.type === "ArrayPattern") p.elements.forEach(e => e && walkId(e.type === "RestElement" ? e.argument : e));
              else if (p.type === "AssignmentPattern") walkId(p.left);
              else if (p.type === "RestElement") walkId(p.argument);
            })(d.id);
            for (const nm of names) if (!declaredAt.has(nm)) declaredAt.set(nm, stmt.start);
          }
        }
      }

      // Hook calls made DIRECTLY in this body (not inside a nested function).
      for (const stmt of body.body) {
        (function findHooks(n, depth) {
          if (!n || typeof n.type !== "string") return;
          if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type) && depth > 0) return;
          if (n.type === "CallExpression" && n.callee.type === "Identifier" && HOOKS.has(n.callee.name)) {
            const deps = n.arguments[1];
            if (deps && deps.type === "ArrayExpression") {
              hooksSeen++;
              for (const el of deps.elements) {
                // Only bare identifiers; `a.b.c` reads `a`, so take the root of a member chain.
                let root = el;
                while (root && root.type === "MemberExpression") root = root.object;
                if (!root || root.type !== "Identifier") continue;
                const at = declaredAt.get(root.name);
                if (at != null && at > n.start) {
                  const line = code.slice(0, n.start).split("\n").length;
                  const declLine = code.slice(0, at).split("\n").length;
                  problems.push(`${rel}:${line} ${n.callee.name}([… ${root.name} …]) runs before ${root.name} is declared on line ${declLine}`);
                }
              }
            }
          }
          for (const k of Object.keys(n)) {
            if (["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "extra"].includes(k)) continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach(x => x && typeof x.type === "string" && findHooks(x, depth + 1));
            else if (v && typeof v.type === "string") findHooks(v, depth + 1);
          }
        })(stmt, 0);
      }
    }
  }

  t.eq(problems, [], "no hook dependency array names a const or let declared later in the same function");
  t.ok(hooksSeen > 40, `the check actually read the file (${hooksSeen} dependency arrays)`);

  // The check must be able to fail: the exact shape that shipped, run through the same logic.
  {
    const broken = "function C(){ useEffect(() => { if (!showAuth) return; }, [showAuth]); const [showAuth, setShowAuth] = useState(false); return null; }";
    const ast = parser.parse(broken, { sourceType: "module", plugins: ["jsx"] });
    const body = ast.program.body[0].body;
    const declared = new Map();
    for (const stmt of body.body) {
      if (stmt.type === "VariableDeclaration" && stmt.kind !== "var") {
        for (const d of stmt.declarations) (d.id.elements || []).forEach(e => e && declared.set(e.name, stmt.start));
      }
    }
    const call = body.body[0].expression;
    const dep = call.arguments[1].elements[0];
    t.ok(declared.get(dep.name) > call.start, "sanity: the shape that shipped is detected as out of order");
  }

  t.summary("hookOrder.test");
})();
