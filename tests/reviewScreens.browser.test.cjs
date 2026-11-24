// tests/reviewScreens.browser.test.cjs
// -----------------------------------------------------------------------------
// THE FIRST NUMBER'S STORE REVIEW ASK NEVER SHOWS AFTER ITS SCREEN HAS GONE (review round 3, R3-1).
//
// The real Today (Dashboard) and the real first-number screen (FirstVisitScreen), bundled from src/App.jsx and mounted
// with React in Chromium as a phone app (Capacitor sees the iOS bridge). The native review plugin is a stand-in that
// takes as long as the test likes to load. About 3 seconds after the number shows the wait's timer fires and the plugin
// starts loading; the screen is then unmounted, the plugin finishes, and the store must not be asked, nor the moment
// spent (it comes again the next time the number shows). Left mounted, each screen still asks, once.
// Each case is its own page, so nothing (the session's one ask included) carries from one to the next. Nothing leaves
// this machine: every request but the test page's own is refused.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ORIGIN = "http://review-screens.test";

function bundle() {
  const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));
  const contents = fs.readFileSync(path.join(ROOT, "src", "App.jsx"), "utf8") + `
import { createRoot as __createRoot } from "react-dom/client";
import { createElement as __h } from "react";
import { flushSync as __flushSync } from "react-dom";
import { _setReviewPluginLoaderForTest as __setLoader, REVIEW_STORAGE_KEY as __KEY } from "./lib/reviewPrompt.js";
window.__review = { Dashboard, FirstVisitScreen, buildDemoState, createRoot: __createRoot, h: __h, flushSync: __flushSync, setLoader: __setLoader, KEY: __KEY };
`;
  const env = { VITE_SUPABASE_URL: "https://placeholder.invalid", VITE_SUPABASE_PUBLISHABLE_KEY: "placeholder", VITE_SENTRY_DSN: "",
    VITE_BUILD_SHA: "test", MODE: "test", VITE_NATIVE_BUILD: "true" };
  const { outputFiles } = esbuild.buildSync({
    stdin: { contents, resolveDir: path.join(ROOT, "src"), sourcefile: "App.jsx", loader: "jsx" },
    absWorkingDir: ROOT, bundle: true, platform: "browser", format: "iife", jsx: "automatic", write: false, logLevel: "error",
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl", ".webp": "dataurl", ".css": "empty" },
    define: { "import.meta.env": JSON.stringify(env), "process.env.NODE_ENV": JSON.stringify("development") },
  });
  return outputFiles[0].text;
}

// In the page: mount the screen, wait for the plugin to start loading, then unmount (or not), let it finish, and read
// back how often the store was asked and whether the moment was spent.
async function runCase(page, { screen, unmount }) {
  return page.evaluate(async ({ screen, unmount }) => {
    const R = window.__review;
    localStorage.clear();   // the pages share this origin's storage: each case starts on a fresh install
    let enter, release;
    const started = new Promise((r) => { enter = r; }), loaded = new Promise((r) => { release = r; });
    const asks = [];
    R.setLoader(async () => { enter(); await loaded; return { requestReview: async () => { asks.push(Date.now()); } }; });
    const el = document.createElement("div"); document.body.appendChild(el);
    const root = R.createRoot(el);
    const noop = () => {};
    const data = { ...R.buildDemoState("CA"), demo: false };
    const props = screen === "Dashboard"
      ? { data, setAppData: noop, setScreen: noop, setShowNotifs: noop, onUpgrade: noop, onWhatIf: noop }
      : { data, onDismiss: noop, onNumberShown: noop };
    R.flushSync(() => root.render(R.h(R[screen], props)));
    const got = await Promise.race([started.then(() => "loading"), new Promise((r) => setTimeout(() => r("never reached the plugin"), 10000))]);
    if (unmount) root.unmount();
    release();
    await new Promise((r) => setTimeout(r, 200));
    if (!unmount) root.unmount();
    let rec = null;
    try { rec = JSON.parse(localStorage.getItem(R.KEY) || "null"); } catch {}
    return { got, asks: asks.length, spent: !!(rec && rec.moments && rec.moments.first_safe), asked: rec && rec.askedAt ? rec.askedAt.length : 0 };
  }, { screen, unmount });
}

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("REVIEW SCREENS (browser)"); return; }
  let js = "";
  try { js = bundle(); } catch (e) { t.ok(false, `App.jsx bundles for the browser: ${e.message}`); t.summary("REVIEW SCREENS (browser)"); return; }
  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext();
    await ctx.route("**/*", (r) => r.abort());   // nothing leaves this machine…
    await ctx.route(`${ORIGIN}/**`, (r) => {     // …but the test page (later routes are tried first)
      const u = new URL(r.request().url());
      if (u.pathname === "/app.js") return r.fulfill({ status: 200, contentType: "text/javascript", body: js });
      return r.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><meta charset="utf-8"><body><script src="/app.js"></script></body>' });
    });
    // A phone app: Capacitor's core replaces window.Capacitor as it loads, and reads the platform from the iOS bridge.
    await ctx.addInitScript(() => { window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }; });
    const errors = [];
    const fresh = async () => {
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e && e.message || e)));
      await page.goto(`${ORIGIN}/`);
      await page.waitForFunction(() => !!window.__review);
      return page;
    };
    for (const [screen, name] of [["Dashboard", "Today"], ["FirstVisitScreen", "the first-number screen"]]) {
      let page = await fresh();
      const gone = await runCase(page, { screen, unmount: true });
      t.eq(gone.got, "loading", `${name}: the wait reached the plugin (the timer had fired)`);
      t.eq([gone.asks, gone.spent, gone.asked], [0, false, 0], `R3-1 ${name} unmounted while the plugin loads: no ask, and the moment is not spent`);
      await page.close();
      page = await fresh();
      const stays = await runCase(page, { screen, unmount: false });
      t.eq(stays.got, "loading", `${name} (left on screen): the wait reached the plugin`);
      t.eq([stays.asks, stays.spent, stays.asked], [1, true, 1], `R3-1 ${name} left on screen: it still asks, once`);
      await page.close();
    }
    t.eq(errors, [], "no page errors");
  } finally {
    await browser.close();
  }
  t.summary("REVIEW SCREENS (browser)");
})().catch((e) => { console.error(e); process.exitCode = 1; });
