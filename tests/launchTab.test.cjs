// tests/launchTab.test.cjs
// -----------------------------------------------------------------------------
// A COLD LAUNCH OPENS TODAY. EVERY TIME, ON EVERY PLATFORM.
//
// Opening an app should not resume an argument you were having with it three days ago. Whatever
// tab you last poked at, a fresh launch starts where the app makes sense from: Today.
//
// The distinction that matters is between a SESSION and a PROCESS:
//   switching tabs, backgrounding the phone, coming back    -> the tab you were on is kept,
//                                                              because the React tree is alive;
//   killing the app, or a reload on the web                 -> Today, because the state is new.
//
// Holding the tab in memory gives exactly that split for free. Writing it to localStorage — which
// is what this used to do — breaks it, because localStorage outlives the process and nothing else
// in it knows a launch happened.
//
// Two things still outrank the default, and must: a deep link asked for a specific page, and a
// password-reset link carries a token that has to be handled before anything is shown.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

// Compile the REAL launch-screen decision out of App.jsx and run it against each platform's
// window, rather than restating what it ought to do.
const body = APP.slice(APP.indexOf("const initialScreen = (() => {"), APP.indexOf("})();", APP.indexOf("const initialScreen")) + 5);
const expr = body.slice(body.indexOf("(() =>"));
const launchScreen = (win) => new Function("window", `return ${expr}`)(win);

const win = (url) => { const u = new URL(url); return { location: { pathname: u.pathname, hash: u.hash, search: u.search, protocol: u.protocol } }; };
const IOS = (p = "/") => win(`capacitor://localhost${p}`);
const ANDROID = (p = "/") => win(`https://localhost${p}`);
const WEB = (p = "/") => win(`https://flourishmoney.app${p}`);

(async () => {
  const t = create();

  // ── 1. a cold launch opens Today, on all three ───────────────────────────────────────────────
  t.eq(launchScreen(IOS()), "home", "1a iOS cold launch opens Today");
  t.eq(launchScreen(ANDROID()), "home", "1b Android cold launch opens Today");
  t.eq(launchScreen(WEB()), "home", "1c the web opens Today");
  t.eq(launchScreen(WEB("/")), launchScreen(IOS()), "1d …and all three agree, so no platform drifts");

  // ── 2. the tab is not remembered across a launch ─────────────────────────────────────────────
  // The Today/Decisions choice is component state and nothing else. No read, no write, no key.
  t.ok(/const \[dashTab, setDashTab\] = useState\("today"\);/.test(APP),
    "2a the tab starts at Today from a literal, not from storage");
  t.ok(!/localStorage\.getItem\("flourish_dash_tab"\)/.test(APP), "2b nothing reads the old key");
  t.ok(!/localStorage\.setItem\("flourish_dash_tab"/.test(APP), "2c nothing writes it either");
  t.ok(!/flourish_account_existed_pre_paywall.*decisions|isNewUser \? "decisions"/.test(APP),
    "2d and no first-visit nudge opens a tab other than Today on a cold launch");
  // Nothing anywhere may persist the tab, under any key. A session is the widest scope allowed.
  const tabWriters = (APP.match(/localStorage\.setItem\("[^"]*(tab|screen)[^"]*"/g) || []);
  t.eq(tabWriters.join(",") || "(none)", "(none)",
    "2e no localStorage key persists a tab or screen at all — localStorage outlives the process");
  t.ok(!/sessionStorage/.test(APP),
    "2f and it is not moved to sessionStorage either: a web RELOAD is a fresh process, but " +
    "sessionStorage survives one, so the tab would come back when it should not");

  // ── 3. a deep link still wins ────────────────────────────────────────────────────────────────
  for (const [p, want] of [["/privacy", "privacy"], ["/terms", "terms"], ["/delete-account", "delete-account"], ["/kids", "kids"]]) {
    t.eq(launchScreen(WEB(p)), want, `3a ${p} opens its own page, not Today`);
  }
  t.eq(launchScreen(WEB("/delete-account/")), "delete-account", "3b a trailing slash still resolves");
  t.eq(launchScreen(WEB("/Delete-Account")), "delete-account", "3c so does the wrong case");
  t.eq(launchScreen(WEB("/delete-account?src=play")), "delete-account", "3d a query string does not break it");
  t.eq(launchScreen(WEB("/something-else")), "home", "3e (control) an unknown path falls back to Today");
  // Play opens /delete-account cold, with no session. It must not be swallowed by the default.
  t.eq(launchScreen(IOS("/delete-account")), "delete-account", "3f …including inside a store app");

  // ── 4. the password-reset link outranks everything ───────────────────────────────────────────
  // The recovery token establishes a temporary session and has to be spent on the reset screen;
  // landing on Today instead would strand the person with a token they cannot use.
  t.ok(/const \[recoveryMode,setRecoveryMode\]=useState\(\(\)=>\{ try \{ return window\.location\.hash\.includes\("type=recovery"\)/.test(APP),
    "4a a recovery hash is detected at launch");
  const recoveryAt = APP.indexOf('if(recoveryMode)return <ResetPasswordScreen');
  const screenAt = APP.indexOf('if(screen==="privacy")return');
  t.ok(recoveryAt > 0 && screenAt > 0, "4b both the recovery screen and the page routes render");
  t.ok(recoveryAt > screenAt,
    "4c the legal pages are matched first (they are public and must open without a session), and " +
    "recovery is checked before the app proper, so a reset link is never lost to the Today default");
  t.ok(/if \(event === "PASSWORD_RECOVERY"\) setRecoveryMode\(true\)/.test(APP),
    "4d …and a recovery event arriving later also wins");

  // ── 5. within a session, the tab is the user's ───────────────────────────────────────────────
  // setDashTab is only ever called from something the user pressed. If a boot-time effect started
  // setting it, "resuming keeps the tab" would stop being true.
  const dash = APP.slice(APP.indexOf("function Dashboard({data,"), APP.indexOf("function Dashboard({data,") + 60000);
  const setters = (dash.match(/setDashTab\([^)]*\)/g) || []);
  t.ok(setters.length > 0, "5a the tab can be changed");
  const inEffect = /useEffect\([^)]*setDashTab/.test(dash);
  t.eq(inEffect, false, "5b …but never from an effect, so nothing moves it behind the user's back");

  t.summary("launchTab.test");
})();
