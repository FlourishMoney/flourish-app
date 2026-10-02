// tests/_copyStrings.cjs — every user-facing string in src, with its file and line.
// -----------------------------------------------------------------------------
// Parses src/*.jsx and src/lib/*.js with @babel/parser (installed with @vitejs/plugin-react, pinned in
// package-lock.json) and returns the prose a household can read: string literals, template literals
// (each ${...} becomes "…") and JSX text. It leaves out what is not copy:
//   - imports, object keys, JSX attribute values that are not text (className, style, key, id, href…),
//     comparison operands ("x" === y), and strings with no space (codes, keys, CSS values);
//   - the AI's instructions: any string inside a variable, property or argument named like a prompt
//     (prompt, system, systemPrompt, instructions, rules, context sent to the model), which the
//     household never sees;
//   - console output and thrown or captured errors.
// Used by sourcedFigures.test.cjs (prompt 3d) to keep money instructions out of the copy.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { parse } = require("@babel/parser");

const REPO = path.join(__dirname, "..");
const NON_TEXT_ATTRS = new Set(["className", "style", "key", "id", "href", "src", "type", "name", "role", "rel", "target", "d", "viewBox", "fill", "stroke",
  "strokeWidth", "strokeLinecap", "fontFamily", "fontWeight", "textAnchor", "inputMode", "autoComplete", "pattern", "method", "action", "htmlFor", "transform"]);
const PROMPT_NAME = /prompt|system|instruction|^rules$|RULES|context$|guard|TRUST/i;
const NON_COPY_CALLEE = /^(console\.\w+|captureError|captureMessage|Error|TypeError|RangeError|localStorage\.\w+|sessionStorage\.\w+|JSON\.\w+|fetch|require|import|addEventListener|removeEventListener|querySelector\w*|setAttribute|getAttribute|dispatchEvent|CustomEvent|RegExp|Sentry\.\w+|new Date|Date)$/;

function calleeName(n) {
  if (!n) return "";
  if (n.type === "Identifier") return n.name;
  if (n.type === "MemberExpression") return `${calleeName(n.object)}.${n.property && (n.property.name || n.property.value)}`;
  return "";
}

function collect(file) {
  const src = fs.readFileSync(file, "utf8");
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });
  const out = [];
  const push = (text, node) => {
    const t = String(text).replace(/\s+/g, " ").trim();
    if (!t || !/[A-Za-z]{2}/.test(t) || !/\s/.test(t)) return;
    out.push({ file: path.relative(REPO, file), line: node.loc.start.line, text: t });
  };
  const walk = (node, ctx) => {
    if (!node || typeof node.type !== "string") return;
    switch (node.type) {
      case "ImportDeclaration": case "ExportAllDeclaration": return;
      case "VariableDeclarator":
        walk(node.init, { ...ctx, prompt: ctx.prompt || (node.id && PROMPT_NAME.test(node.id.name || "")) });
        return;
      case "ObjectProperty": {
        const k = node.key && (node.key.name || node.key.value);
        if (!node.computed) walk(node.value, { ...ctx, prompt: ctx.prompt || PROMPT_NAME.test(String(k || "")) });
        else { walk(node.key, ctx); walk(node.value, ctx); }
        return;
      }
      case "AssignmentExpression": {
        const left = calleeName(node.left);
        walk(node.right, { ...ctx, prompt: ctx.prompt || PROMPT_NAME.test(left) });
        return;
      }
      case "CallExpression": case "NewExpression": {
        const c = calleeName(node.callee);
        if (NON_COPY_CALLEE.test(c) || /^(console|captureError)/.test(c)) return;
        walk(node.callee, ctx);
        for (const a of node.arguments) walk(a, ctx);
        return;
      }
      case "ThrowStatement": return;
      case "BinaryExpression":
        if (/^(===|!==|==|!=)$/.test(node.operator)) return;
        break;
      case "SwitchCase": for (const c of node.consequent) walk(c, ctx); return;
      case "JSXAttribute": {
        const n = node.name && node.name.name;
        if (NON_TEXT_ATTRS.has(n) || /^on[A-Z]/.test(n) || /^aria-(hidden|controls|labelledby|describedby)$/.test(n)) return;
        walk(node.value, ctx);
        return;
      }
      case "StringLiteral": if (!ctx.prompt) push(node.value, node); return;
      case "TemplateLiteral": if (!ctx.prompt) push(node.quasis.map(q => q.value.cooked).join("…"), node); for (const e of node.expressions) walk(e, ctx); return;
      case "JSXText": push(node.value, node); return;
      case "TaggedTemplateExpression": return;
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end" || key === "leadingComments" || key === "trailingComments" || key === "innerComments") continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach(x => walk(x, ctx));
      else if (v && typeof v.type === "string") walk(v, ctx);
    }
  };
  walk(ast.program, { prompt: false });
  return out;
}

function copyStrings() {
  const files = [path.join(REPO, "src", "App.jsx"), path.join(REPO, "src", "main.jsx"),
    ...fs.readdirSync(path.join(REPO, "src", "lib")).filter(f => f.endsWith(".js")).map(f => path.join(REPO, "src", "lib", f))];
  return files.flatMap(collect);
}

// Sentences of a string, each with its first word.
function sentences(text) {
  return String(text).split(/(?<=[.!?:])\s+|\s+[·•|]\s+|\n/).map(s => s.replace(/^[^A-Za-z"'(]+/, "").trim()).filter(Boolean);
}

// The advice scan's rules (prompt 3d): a sentence may not start with a money instruction verb, and
// no string may hold a verdict. Shared by sourcedFigures.test.cjs section 11 and testerSuggestions.
const MONEY_VERBS = ["Pay", "Invest", "Increase", "Open", "Avoid", "Hold", "Save", "Spend", "Cut", "Move", "Transfer", "Put", "Build", "Contribute", "Max", "Maximize",
  "Reduce", "Cancel", "Consolidate", "Refinance", "Negotiate", "Compare", "Prioritize", "Consider", "Delay", "Wait", "Limit", "Lower", "Raise", "Pause", "Redirect",
  "Allocate", "Automate", "Withdraw", "Fund", "Stop", "Keep", "Claim", "File", "Apply", "Track", "Trim", "Boost", "Earn", "Borrow", "Buy", "Sell", "Register", "Gather",
  "Calculate", "Contact", "Get", "Start", "Use", "Don't", "Never", "Always", "Shop", "Switch", "Lock", "Set aside", "Plan", "Protect", "Grow", "Clear", "Tackle", "Skip",
  "Celebrate", "Commit"];
const STARTS = new RegExp(`^(?:${MONEY_VERBS.join("|")})\\b`);
const VERDICT = /\b(should|shouldn't|worth (?:it|doing|claiming|getting|reviewing|checking)|best value|the best|recommend(?:ed|s)?|make sure|you must|must file|can afford|can't afford|go for it|think twice|not right now|free money|on the table|pro tip|high priority|unclaimed)\b/i;

// True when a piece of copy breaks either rule.
function adviceProblems(text) {
  const why = sentences(text).filter((x) => STARTS.test(x)).map((x) => `starts "${x.split(" ").slice(0, 3).join(" ")}"`);
  const v = String(text).match(VERDICT); if (v) why.push(`verdict "${v[0]}"`);
  return why;
}

module.exports = { copyStrings, sentences, adviceProblems, MONEY_VERBS, STARTS, VERDICT, REPO };
