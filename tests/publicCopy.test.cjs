// tests/publicCopy.test.cjs
// -----------------------------------------------------------------------------
// WHAT THE PUBLIC IS TOLD FLOURISH IS.
//
// Flourish ships to the App Store and Play as a native app. Nothing anyone sees may say it opens in
// a browser, that there is nothing to download, or call it a PWA or a "web app" — that is how it is
// built, not what it is, and on a store listing it reads as a reason not to install anything.
//
// This scans the copy as the copy, not the source: every file is parsed, so the string literals, the
// template text and the JSX text are checked while the comments around them are not. The comments
// must be free to say "the web app", because that is the accurate word for what Capacitor wraps.
//
// index.html is checked separately, and only where a person could read it: the title and the meta
// content that search results and link previews show. The standard meta NAMES are not copy —
// `apple-mobile-web-app-capable` is how iOS is asked for a full-screen shell, and renaming it would
// break the thing it configures.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

// Each: [regex, what it would be claiming]
const FORBIDDEN = [
  [/\bPWA\b/i, "calls the product a PWA"],
  [/\bweb ?app\b/i, "calls the product a web app"],
  [/\bprogressive web\b/i, "calls the product a progressive web app"],
  [/\bin (?:your|the|a) browser\b/i, "says it runs in a browser"],
  [/\bfrom (?:your|the) browser\b/i, "says it runs from a browser"],
  [/\bbrowser[- ]based\b/i, "calls the product browser-based"],
  [/\bno (?:download|downloads|install|installs|installation)\b/i, "says there is nothing to download or install"],
  [/\bnothing to (?:download|install)\b/i, "says there is nothing to download or install"],
  [/\bwithout (?:downloading|installing)\b/i, "says it works without installing"],
  [/\bno app store\b/i, "says the app store is not needed"],
  [/\bno need to (?:download|install)\b/i, "says there is no need to install"],
];

(async () => {
  const t = create();
  const REPO = path.join(__dirname, "..");
  let parser;
  try { parser = require(path.join(REPO, "node_modules", "@babel", "parser")); } catch { parser = null; }
  t.ok(!!parser, "the copy check can load @babel/parser (installed with @vitejs/plugin-react)");

  // ── 1. Every user-visible string in src/ ──────────────────────────────────────────────────────
  if (parser) {
    const srcDir = path.join(REPO, "src");
    const files = [
      path.join(srcDir, "App.jsx"),
      path.join(srcDir, "main.jsx"),
      ...fs.readdirSync(path.join(srcDir, "lib")).filter(f => /\.jsx?$/.test(f)).map(f => path.join(srcDir, "lib", f)),
    ];
    const hits = [];
    for (const file of files) {
      const ast = parser.parse(fs.readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx"] });
      (function walk(n, parent) {
        if (!n || typeof n.type !== "string") return;
        const text = n.type === "StringLiteral" ? n.value
          : n.type === "TemplateElement" ? (n.value.cooked ?? n.value.raw)
          : n.type === "JSXText" ? n.value : null;
        // A JSX attribute VALUE that is a meta/link name is configuration, not copy. There are none
        // in src/ today; this keeps the check honest if one is ever added.
        const isMetaName = parent && parent.type === "JSXAttribute" && /^(name|property|rel|httpEquiv)$/.test(parent.name?.name || "");
        if (text && !isMetaName) {
          for (const [rx, what] of FORBIDDEN) {
            if (rx.test(text)) hits.push(`${path.basename(file)}:${n.loc.start.line} ${what}: "${text.trim().slice(0, 70)}"`);
          }
        }
        for (const k of Object.keys(n)) {
          if (["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "extra"].includes(k)) continue;
          const v = n[k];
          if (Array.isArray(v)) v.forEach(x => x && typeof x.type === "string" && walk(x, n));
          else if (v && typeof v.type === "string") walk(v, n);
        }
      })(ast.program, null);
    }
    t.eq(hits, [], `no user-visible string in src/ makes a browser, download or PWA claim (${files.length} files)`);

    // The check cannot pass by scanning nothing: it must be reading real copy.
    const app = fs.readFileSync(path.join(srcDir, "App.jsx"), "utf8");
    t.ok(/Coming soon to iOS, Android, and Windows/.test(app), "sanity: the landing still names the platforms it ships on");
  }

  // ── 2. index.html, where a person can read it ─────────────────────────────────────────────────
  {
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    t.ok(title.trim().length > 0, "index.html has a title");
    // Meta CONTENT is copy (a search result or a link preview shows it); meta NAMES are configuration.
    const metaContent = [...html.matchAll(/<meta[^>]*\b(?:name|property)="(?:description|og:[^"]*|twitter:[^"]*)"[^>]*content="([^"]*)"/gi)].map(m => m[1]);
    const bodyText = (html.match(/<body[\s\S]*?<\/body>/) || [""])[0].replace(/<[^>]*>/g, " ");
    const readable = [title, ...metaContent, bodyText].join("\n");
    const htmlHits = FORBIDDEN.filter(([rx]) => rx.test(readable)).map(([, what]) => what);
    t.eq(htmlHits, [], "index.html's readable copy makes no browser, download or PWA claim");
    // The meta names themselves are untouched: they configure the iOS shell.
    t.ok(/name="apple-mobile-web-app-capable"/.test(html), "…and the standard apple-mobile-web-app-capable meta is still there");
  }

  // ── 3. public/, which is served verbatim ──────────────────────────────────────────────────────
  {
    const pub = path.join(REPO, "public");
    const served = fs.readdirSync(pub).filter(f => /\.(html|txt|webmanifest|json)$/i.test(f));
    const hits = [];
    for (const f of served) {
      const body = fs.readFileSync(path.join(pub, f), "utf8");
      for (const [rx, what] of FORBIDDEN) if (rx.test(body)) hits.push(`${f}: ${what}`);
    }
    t.eq(hits, [], `nothing served from public/ makes such a claim (${served.length} text files)`);
  }

  t.summary("publicCopy.test");
})();
