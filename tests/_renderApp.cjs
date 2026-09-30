// tests/_renderApp.cjs — render real components from src/App.jsx without a browser.
//
// src/App.jsx plus the named components a suite asks for, bundled with esbuild and loaded with
// react-dom/server, so a suite can check what a screen actually says. The same approach as
// budgetGoalsRender.test.cjs, shared by the QA-surgical suites. Nothing is written to disk.
"use strict";
const fs = require("fs");
const path = require("path");
const Module = require("module");

const REPO = path.join(__dirname, "..");

function loadApp(names, { native = false } = {}) {
  const esbuild = require(path.join(REPO, "node_modules", "esbuild"));
  const contents = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8") + `
export { ${names.map((n) => `${n} as __${n}`).join(", ")} };
export { renderToStaticMarkup as __render } from "react-dom/server";
export { createElement as __h } from "react";
`;
  const { outputFiles } = esbuild.buildSync({
    stdin: { contents, resolveDir: path.join(REPO, "src"), sourcefile: "App.jsx", loader: "jsx" },
    absWorkingDir: REPO, bundle: true, platform: "node", format: "cjs", jsx: "automatic",
    write: false, logLevel: "error", sourcemap: "inline", sourcesContent: false,
    external: ["@sentry/react", "pdfjs-dist", "pdfjs-dist/*", "@capacitor-community/in-app-review"],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://placeholder.invalid"),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("placeholder"),
      "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(""),
      "import.meta.env.VITE_BUILD_SHA": JSON.stringify("test"),
      "import.meta.env.MODE": JSON.stringify("test"),
    },
  });
  const store = new Map();
  const browser = {
    window: globalThis,
    innerWidth: 390,
    navigator: { userAgent: "", language: "en-CA" },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    ...(native ? { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } } : {}),
  };
  for (const [k, value] of Object.entries(browser)) Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  process.setSourceMapsEnabled(true);
  const file = path.join(REPO, "render-bundle.cjs");
  const m = new Module(file, module);
  m.filename = file; m.paths = Module._nodeModulePaths(REPO);
  m._compile(outputFiles[0].text, file);
  const out = { render: m.exports.__render, h: m.exports.__h, store };
  for (const n of names) out[n] = m.exports[`__${n}`];
  return out;
}

const textOf = (html) => html.replace(/<[^>]*>/g, " ")
  .replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
const describe = (e) => `${e && e.name}: ${e && e.message} ${(String(e && e.stack).split("\n").find((l) => l.includes("App.jsx")) || "").trim()}`;

module.exports = { loadApp, textOf, describe, REPO };
