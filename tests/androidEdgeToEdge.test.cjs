// tests/androidEdgeToEdge.test.cjs
// -----------------------------------------------------------------------------
// VERSION 1.1, ITEM 8: THE ANDROID SHELL ON ANDROID 15 AND LATER.
//
// (a) Edge to edge. Play's review of vc14 said "Edge-to-edge may not display for all users". From Android 15
//     an app targeting SDK 35+ (ours: 36) is drawn edge to edge, and setting a status or navigation bar colour
//     is deprecated. Checked here:
//       - no deprecated bar attribute or call anywhere in the shell we own (styles, MainActivity, our plugin);
//       - the page receives the insets (viewport-fit=cover, Capacitor SystemBars' insetsHandling not disabled)
//         and pads with them (src/lib/safeArea.js uses env(safe-area-inset-*));
//       - the window behind the transparent bars is the app's own background, light and dark;
//       - the status bar's icons follow the app's theme, on Android only.
//     The deprecated calls Play found live in AndroidX library code no one calls (the splash screen library's
//     Impl31, androidx.activity's EdgeToEdge, androidx.core's setDecorFitsSystemWindows); R8 (item 8b) removes
//     them from the release build (item 8b).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const DEPRECATED = /setStatusBarColor|setNavigationBarColor|setNavigationBarDividerColor|setDecorFitsSystemWindows|android:statusBarColor|android:navigationBarColor|android:windowTranslucentStatus|android:windowTranslucentNavigation|SYSTEM_UI_FLAG_|FLAG_TRANSLUCENT_|windowOptOutEdgeToEdgeEnforcement/;

(async () => {
  const t = create();

  // ── (a) Edge to edge ─────────────────────────────────────────────────────────────────────────
  const shell = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.(java|kt|xml)$/.test(f) && shell.push(p); } })(path.join(REPO, "android", "app", "src", "main"));
  t.ok(shell.length >= 5, `a1 (the scan reads the shell: ${shell.length} files)`);
  t.eq(shell.filter((f) => DEPRECATED.test(fs.readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/\/\/[^\n]*/g, ""))).map((f) => path.relative(REPO, f)), [],
    "a2 no deprecated status or navigation bar attribute or call anywhere in the Android shell we own");
  t.ok(/targetSdkVersion rootProject\.ext\.targetSdkVersion/.test(read("android", "app", "build.gradle")) && /targetSdkVersion = 36/.test(read("android", "variables.gradle")),
    "a3 (the app targets SDK 36, so Android 15 and later draw it edge to edge)");
  t.ok(/viewport-fit=cover/.test(read("index.html")), "a4 the page asks for the full screen (viewport-fit=cover), so Capacitor passes the bars' insets to it");
  const cfg = JSON.parse(read("capacitor.config.json"));
  t.ok(!cfg.plugins || !cfg.plugins.SystemBars || cfg.plugins.SystemBars.insetsHandling !== "disable", "a5 Capacitor's SystemBars inset handling is left on (it pads for an older WebView, passes insets through for a newer one)");
  t.ok(/top: "env\(safe-area-inset-top, 0px\)"/.test(read("src", "lib", "safeArea.js")) && /bottom: "env\(safe-area-inset-bottom, 0px\)"/.test(read("src", "lib", "safeArea.js")), "a6 …and the page pads with those insets (src/lib/safeArea.js)");
  t.ok(/<item name="android:windowBackground">@color\/flourish_window<\/item>/.test(read("android", "app", "src", "main", "res", "values", "styles.xml")), "a7 the window behind the transparent bars is the app's background");
  t.eq([read("android", "app", "src", "main", "res", "values", "colors.xml").match(/flourish_window">(#[0-9A-F]{6})/)[1], read("android", "app", "src", "main", "res", "values-night", "colors.xml").match(/flourish_window">(#[0-9A-F]{6})/)[1]],
    [read("src", "App.jsx").match(/bg:"(#F4F1EB)",surface:"#FDFCFA"/)[1], read("src", "App.jsx").match(/bg:"(#050810)",surface:"#0A1018"/)[1]], "a8 …in light and in dark, the same colours as the app's own themes");
  const APP = read("src", "App.jsx");
  t.ok(/if\(window\.Capacitor\?\.getPlatform\?\.\(\)!=="android"\) return;\s*import\("@capacitor\/core"\)\.then\(\(\{ SystemBars \}\)=>SystemBars\?\.setStyle\?\.\(\{ style: theme==="dark" \? "DARK" : "LIGHT" \}\)\)/.test(APP),
    "a9 the status bar's icons follow the app's theme on Android (light icons on the dark theme), nowhere else");

  // ── (c) The status bar's cover (2026-11-18): the store apps only, and in the page's own colour ────────
  // What it does in the built apps is tests/statusBar.browser.test.cjs; here, that the website can never have it.
  {
    const S = await import(path.join(REPO, "src", "lib", "safeArea.js"));
    const cap = (name) => ({ Capacitor: { getPlatform: () => name } });
    const D = S.drawsBehindStatusBar;
    t.eq([D(cap("android")), D(cap("ios")), D(cap("web")), D({}), D(undefined), D({ Capacitor: {} }), D({ Capacitor: { getPlatform: () => { throw new Error("x"); } } })],
      [true, true, false, false, false, false, false],
      "c1 the page runs behind the status bar in the Android app and the iPhone app: not on the website, not on a page with no Capacitor, and never a throw");
    t.eq(S.statusBarCoverStyle("#F4F1EB"), { position: "fixed", top: 0, left: 0, right: 0, height: "env(safe-area-inset-top, 0px)", background: "#F4F1EB", zIndex: 1 },
      "c2 the cover: fixed to the top, the height of the status bar, the colour it is given, one layer up (so a dialog's backdrop, later in the page, is drawn over it)");
    t.ok(/function StatusBarCover\(\{ bg \}\) \{\s*if \(!drawsBehindStatusBar\(\)\) return null;\s*return <div data-status-bar-cover="" aria-hidden="true" style=\{statusBarCoverStyle\(bg\)\}\/>;\s*\}/.test(APP),
      "c3 it is nothing at all unless this is a store app (so never on the website), and a screen reader skips it");
    const mounts = APP.match(/<StatusBarCover bg=\{[^}]+\}\/>/g) || [];
    t.eq([mounts.length, mounts.filter((m) => m === "<StatusBarCover bg={C.bg}/>").length, mounts.filter((m) => m === '<StatusBarCover bg={showAuth ? AUTH_C.page : "#FDF6EC"}/>').length], [8, 7, 1],
      "c4 it is on the eight screens that scroll with no header of their own: the sign-in screens (in their cream), onboarding, the first number, the AI notice, the legal pages, the two plans screens and the flourish Plus screen (1.1.8)");
    t.ok(/background: showAuth \? AUTH_C\.page : "#FDF6EC",[^\n]*\n\s*<StatusBarCover bg=\{showAuth \? AUTH_C\.page : "#FDF6EC"\}\/>/.test(APP), "c5 …each in the colour of the screen it is on (the sign-in screens' is their own)");
  }

  t.summary("androidEdgeToEdge.test");
})();
