// tests/authRedirect.test.cjs
// -----------------------------------------------------------------------------
// A RESET LINK MUST COME BACK SOMEWHERE THE PERSON CAN ACTUALLY GO.
//
// Auth emails open in the system browser, never inside the store app. A link pointing at
// capacitor://localhost is meaningless there — the browser cannot open it and Supabase would
// reject it against the redirect allow-list — so a store app's reset link goes to the website,
// the password is set there, and the person returns to the app to log in.
//
// The magic link has no such ending: it logs a browser in, and a browser session cannot become an
// app session. On native it is hidden rather than left as a dead end.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
const IOS = { Capacitor: { getPlatform: () => "ios" }, location: { protocol: "capacitor:", origin: "capacitor://localhost", search: "" } };
const ANDROID = { Capacitor: { getPlatform: () => "android" }, location: { protocol: "http:", origin: "http://localhost", search: "" } };
const WEB = { location: { protocol: "https:", origin: "https://flourishmoney.app", search: "" } };
const PREVIEW = { location: { protocol: "https:", origin: "https://deploy-preview-18--flourish-money.netlify.app", search: "" } };

(async () => {
  const t = create();
  const A = await import("../src/lib/authRedirect.js");

  // ── 1. where the link comes back to ──────────────────────────────────────────────────────────
  for (const [name, win] of [["iOS", IOS], ["Android", ANDROID]]) {
    const url = A.passwordResetRedirect(win);
    t.eq(url, "https://flourishmoney.app/?reset_from=app", `1a ${name} sends the reset link to the website, with the marker`);
    t.ok(url.startsWith("https://"), `1b ${name} never returns a non-https scheme`);
    t.ok(!/capacitor:|localhost|file:/.test(url), `1c ${name} never returns capacitor://localhost — the failure this fixes`);
  }
  t.eq(A.passwordResetRedirect(IOS), A.passwordResetRedirect(ANDROID), "1d both stores return the identical URL");
  t.eq(A.passwordResetRedirect(WEB), "https://flourishmoney.app", "1e the web returns to itself, unmarked");
  t.eq(A.passwordResetRedirect(PREVIEW), "https://deploy-preview-18--flourish-money.netlify.app",
    "1f …including a deploy preview, so previews keep working");
  t.ok(!A.passwordResetRedirect(WEB).includes("reset_from"), "1g the marker is native-only, so the web keeps its normal ending");
  t.eq(A.passwordResetRedirect(undefined), "https://flourishmoney.app", "1h with no window at all it falls back to production, never to undefined");

  // ── 2. reading the marker back on the website ────────────────────────────────────────────────
  t.eq(A.startedInApp("?reset_from=app"), true, "2a the marker is recognised");
  t.eq(A.startedInApp("reset_from=app"), true, "2b …with or without the leading ?");
  t.eq(A.startedInApp("?utm=x&reset_from=app&y=2"), true, "2c …among other params");
  t.eq(A.startedInApp("?reset_from=web"), false, "2d another value is not the marker");
  t.eq(A.startedInApp("?reset_from="), false, "2e nor is an empty one");
  t.eq(A.startedInApp("?other=app"), false, "2f nor is the value on a different key");
  t.eq(A.startedInApp(""), false, "2g a bare web visit is not from the app");
  t.eq(A.startedInApp(undefined), false, "2h and neither is nothing at all");
  // The round trip is what matters: what native sends must read back as "from the app".
  t.eq(A.startedInApp(new URL(A.passwordResetRedirect(IOS)).search), true,
    "2i round trip — the URL native sends is read back as started-in-app");
  t.eq(A.startedInApp(new URL(A.passwordResetRedirect(WEB)).search), false, "2j …and the web's is not");

  // ── 3. what the website says afterwards ──────────────────────────────────────────────────────
  t.eq(A.PASSWORD_UPDATED_IN_APP,
    "Your password is updated. Open the Flourish app and log in with your new password.",
    "3a the copy is exactly what was approved");
  t.ok(/\{fromApp \? PASSWORD_UPDATED_IN_APP : "Taking you to Flourish…"\}/.test(APP),
    "3b the success screen shows it when the reset began in the app, and the normal line otherwise");
  t.ok(/if \(!done \|\| fromApp\) return;/.test(APP),
    "3c …and does not auto-hand-back in that case, so the instruction stays on screen to be read");
  t.ok(/startedInApp\(window\.location\.search\)/.test(APP), "3d the marker is read from the query string");
  t.ok(/const \[fromApp\] = useState\(\(\) =>/.test(APP), "3e …once, at mount, not re-read mid-flow");
  // stripHash keeps the query string: if it dropped it, the marker would vanish before the success
  // screen renders and the person would be told to go somewhere they already are.
  t.ok(/window\.location\.pathname \+ window\.location\.search/.test(APP),
    "3f stripping the recovery hash keeps the query, so the marker survives to the success screen");

  // ── 4. the app uses it, and the magic link is gone from native ───────────────────────────────
  t.ok(/resetPasswordForEmail\(email, \{ redirectTo: passwordResetRedirect\(\) \}\)/.test(APP),
    "4a password reset asks this module where to return, rather than using its own origin");
  t.ok(!/resetPasswordForEmail\(email, \{ redirectTo: window\.location\.origin \}\)/.test(APP),
    "4b the old origin-based redirect is gone");
  t.ok(/\{!isNativeApp\(\) && <button onClick=\{handleMagicLink\}/.test(APP),
    "4c the magic-link button does not render in a store app");
  t.ok(/onClick=\{handleForgotPassword\}/.test(APP) && !/!isNativeApp\(\) && <button onClick=\{handleForgotPassword\}/.test(APP),
    "4d …while Forgot password stays on native, because it ends with a password that works in the app");

  t.summary("authRedirect.test");
})();
