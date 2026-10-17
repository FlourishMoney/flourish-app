// tests/androidBack.test.cjs
// -----------------------------------------------------------------------------
// VERSION 1.1, ITEM 8c: ANDROID'S BACK KEY GOES BACK ONE SCREEN.
//
// The smoke test of vc14 found the back key in Settings leaving the app. Now (src/lib/backButton.js): a dialog
// or registered sheet closes first; then the app goes back one screen at a time, Settings included, down to
// Today; on Today with nothing open, or on the store paywall, the app goes to the background with its state.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");

(async () => {
  const t = create();
  const B = await import("../src/lib/backButton.js");

  // ── The app's own screens ───────────────────────────────────────────────────────────────────
  t.eq(B.backAction({ showSettings: true, screen: "home" }), "closeSettings", "c1 back in Settings closes Settings: it no longer leaves the app");
  t.eq(B.backAction({ showSettings: true, pendingPlaid: "add" }), "closeBankConsent", "c2 the bank consent sheet over Settings closes first");
  t.eq([B.backAction({ showNotifs: true }), B.backAction({ showWhatIf: true }), B.backAction({ showWrapped: true }), B.backAction({ showCheckIn: true }), B.backAction({ showUpgrade: true }), B.backAction({ showPaywall: true })],
    ["closeNotifications", "closeWhatIf", "closeWrapped", "closeCheckIn", "closeUpgrade", "closePaywall"], "c3 every full-screen overlay closes, one at a time");
  t.eq(["privacy", "terms", "support", "widget", "family", "coach", "watch", "do", "budget", "goals", "credit"].map((screen) => B.backAction({ screen })), Array(11).fill("home"),
    "c4 a page or a tab goes back to Today");
  t.eq([B.backAction({ screen: "home" }), B.backAction({})], [null, null], "c5 on Today with nothing open, nothing is left to go back from: the app goes to the background");
  t.eq([B.backAction({ paywallUp: true, showSettings: true }), B.backAction({ paywallUp: true, paywallLegal: "terms" })], [null, "closePaywallLegal"],
    "c6 the store paywall is never dismissed by back (the Terms page inside it is)");
  t.eq(B.backAction({ showSettings: true, showNotifs: true }), "closeSettings", "c7 one step per press: the top layer only");

  // ── Layers on top ──────────────────────────────────────────────────────────────────────────
  const calls = [];
  const offA = B.pushBackHandler(() => { calls.push("sheet"); return true; });
  const offB = B.pushBackHandler(() => { calls.push("dialog"); return true; });
  t.eq([B.handleBackLayers(), calls], [true, ["dialog"]], "c8 the topmost layer takes the key, and only it");
  offB();
  t.eq([B.handleBackLayers(), calls], [true, ["dialog", "sheet"]], "c9 …then the one below, once the top one has gone");
  offA();
  const offC = B.pushBackHandler(() => { throw new Error("broken"); });
  t.eq(B.handleBackLayers(), false, "c10 a broken layer never traps the key");
  offC();
  t.eq(B.handleBackLayers(), false, "c11 with no layer open, the app's own back runs");

  // ── The wiring ─────────────────────────────────────────────────────────────────────────────
  const APP = read("src", "App.jsx");
  const fx = APP.slice(APP.indexOf("const backStateRef = useRef({});"), APP.indexOf("const backStateRef = useRef({});") + 2400);
  t.ok(/if\(window\.Capacitor\?\.getPlatform\?\.\(\)!=="android"\) return;/.test(fx) && /CapApp\.addListener\("backButton"/.test(fx), "c12 Android only, through @capacitor/app's backButton");
  t.ok(/if\(handleBackLayers\(\)\) return;\s*const act = backAction\(backStateRef\.current\);\s*if\(!act\)\{ CapApp\.minimizeApp\(\); return; \}/.test(fx), "c13 layers first, then one screen back, and at the start the app goes to the background (not closed)");
  t.ok(/closeSettings: \(\)=>\{ setShowSettings\(false\); setPendingPlaid\(null\); \}/.test(fx) && /home: \(\)=>\{[\s\S]*?setScreen\("home"\); \},/.test(fx), "c14 closing Settings and going home are the app's own state changes");
  t.ok(/return pushBackHandler\(\(\) => \{ const r = m\._resolve; setM\(null\);/.test(APP), "c15 an open dialog (ModalHost) closes on back, exactly as Escape closes it");
  const pkg = JSON.parse(read("package.json"));
  t.ok(/^\^8\./.test(pkg.dependencies["@capacitor/app"] || "") && /CapacitorApp"/.test(read("ios", "App", "CapApp-SPM", "Package.swift")) && /:capacitor-app'/.test(read("android", "capacitor.settings.gradle")),
    "c16 @capacitor/app 8 is a dependency and registered in both native projects");
  t.summary("androidBack.test");
})();
