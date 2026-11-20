#!/usr/bin/env node
// scripts/prerender-pages.mjs: the landing's and /support's words as HTML, rendered from the app's own components (2026-11-19).
// -----------------------------------------------------------------------------
// Run as a child process by scripts/build-seo.mjs (renderPages below). It builds scripts/prerender-entry.jsx with Vite's
// SSR build, which compiles src/App.jsx with the project's own config, loads it with the few browser globals its modules
// touch while loading, renders with react-dom/server and prints one JSON line: { home, support, faq, stores }.
//
// App.jsx is not edited: the SSR build appends `export { AuthScreen, SupportPage, faqFor, C }` to its copy of the module,
// in memory. It runs in its own process because App.jsx's module starts timers (the auth client) that would keep a build
// or a test from ending, and because the stand-in globals must never meet a real page.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);

/** Render the two pages in a child process. tpfOn: whether TRIAL_PLAN_FIRST is on for this build. */
export function renderPages({ tpfOn = false, env = process.env } = {}) {
  const out = execFileSync(process.execPath, [SELF, "--render", tpfOn ? "on" : "off"], { cwd: ROOT, env, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] }).toString();
  const line = out.trim().split("\n").pop();
  return JSON.parse(line);
}

function browserless() {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
  const noop = () => {};
  const el = () => ({ style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop, removeEventListener: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });
  const win = {
    location: { href: "https://flourishmoney.app/", origin: "https://flourishmoney.app", protocol: "https:", host: "flourishmoney.app", hostname: "flourishmoney.app", pathname: "/", search: "", hash: "" },
    localStorage: mem(), sessionStorage: mem(),
    navigator: { userAgent: "", language: "en-CA", languages: ["en-CA"] },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    addEventListener: noop, removeEventListener: noop, setTimeout, clearTimeout, history: { replaceState: noop, pushState: noop },
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, scrollTo: noop,
  };
  win.document = { createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop, documentElement: el(), body: el(), head: el(), cookie: "", referrer: "", visibilityState: "visible" };
  win.window = win;
  return win;
}

async function render(tpfOn) {
  const { build } = await import("vite");
  const app = path.join(ROOT, "src", "App.jsx");
  // Inside the repo, so the built module resolves react and react-dom from node_modules.
  // One folder per process, so two builds at once never share one; it is removed once the module is loaded.
  const out = path.join(ROOT, "node_modules", ".cache", `flourish-prerender-${process.pid}`);
  await build({
    root: ROOT, configFile: path.join(ROOT, "vite.config.js"), logLevel: "error", publicDir: false,
    plugins: [{ name: "prerender-exports", enforce: "post", transform(code, id) { return id.split("?")[0] === app ? `${code}\nexport { AuthScreen, SupportPage, faqFor, C };\n` : null; } }],
    build: { ssr: path.join(ROOT, "scripts", "prerender-entry.jsx"), outDir: out, emptyOutDir: true, copyPublicDir: false, rollupOptions: { output: { format: "esm", entryFileNames: "entry.mjs" } } },
  });
  const win = browserless();
  for (const k of ["localStorage", "sessionStorage", "navigator", "location", "matchMedia", "history", "document"]) Object.defineProperty(globalThis, k, { value: win[k], configurable: true, writable: true });
  Object.defineProperty(globalThis, "window", { value: win, configurable: true, writable: true });
  let mod;
  try { mod = await import(pathToFileURL(path.join(out, "entry.mjs")).href); }
  finally { fs.rmSync(out, { recursive: true, force: true }); }
  return { home: mod.renderHome({ tpfOn }), support: mod.renderSupport(), faq: mod.supportFaq(), stores: mod.stores() };
}

if (process.argv[2] === "--render" && path.resolve(process.argv[1] || "") === SELF) {
  render(process.argv[3] === "on").then((r) => {
    fs.writeSync(1, `\n${JSON.stringify(r)}\n`);
    process.exit(0);
  }, (e) => { console.error(e); process.exit(1); });
}
