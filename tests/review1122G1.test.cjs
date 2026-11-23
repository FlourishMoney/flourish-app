// tests/review1122G1.test.cjs
// -----------------------------------------------------------------------------
// FULL-APP REVIEW 2026-11-22, Gemini G1 (called a blocker): "in the native app, magic-link and confirm emails use
// window.location.origin (capacitor://localhost), so they cannot route back to the app."
//
// NOT REAL. Checked against the real code, the live site and both store builds (1.1.6 and 1.1.7 carry the same lines):
//   - a store app never offers the magic link (the button is not rendered there), so its return address is only ever
//     a browser's own origin;
//   - both "send the confirmation again" buttons go through the server, which sends every confirmation to one fixed
//     https page on the website; the app's own origin is not part of that mail at all;
//   - signing up goes through the server too (no client-side signUp, so no client return address);
//   - a password reset started in a store app returns to the website, never to capacitor://localhost.
// This file holds those four facts in place.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const REPO = path.join(__dirname, "..");

(async () => {
  const t = create();
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const beta = fs.readFileSync(path.join(REPO, "netlify", "functions", "beta.js"), "utf8");
  const R = await import("../src/lib/authRedirect.js");
  const code = app.split("\n").filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).join("\n");   // comment lines are not code
  const fn = (name) => { const i = app.indexOf(`const ${name} = async () => {`); const j = app.indexOf("\n  };", i); return i < 0 ? "" : app.slice(i, j); };

  // ── 1. the magic link ──────────────────────────────────────────────────────────────────────────
  const uses = code.split("\n").filter((l) => /emailRedirectTo/.test(l));
  t.eq(uses.length, 1, "G1a the app sets an email's return address in exactly one place");
  t.ok(fn("handleMagicLink").includes(uses[0].trim()), "G1b …and that place is the magic link");
  const buttons = app.split("\n").filter((l) => /onClick=\{handleMagicLink\}/.test(l));
  t.eq(buttons.length, 1, "G1c the magic link has one button");
  t.ok(/\{!isNativeApp\(\) && <button onClick=\{handleMagicLink\}/.test(buttons[0] || ""), "G1d a store app does not render it, so its return address is only ever a browser's own origin");
  t.ok(!/handleMagicLink\(\)/.test(code), "G1e nothing else calls it");

  // ── 2. the confirmation email ──────────────────────────────────────────────────────────────────
  for (const name of ["handleResendConfirm", "handleResend"]) {
    const body = fn(name);
    t.ok(/action: "resend_confirmation"/.test(body) && /\/api\/beta/.test(body), `G1f ${name}: the server sends the mail`);
    t.ok(!/supabase\.auth\./.test(body) && !/location\.origin/.test(body.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")), `G1g ${name}: the app's own origin is not sent`);
  }
  t.ok(/const CONFIRM_REDIRECT = "https:\/\/flourishmoney\.app\/confirmed";/.test(beta), "G1h the server's confirmation link lands on one fixed https page of the website");
  t.ok(/options: \{ emailRedirectTo: CONFIRM_REDIRECT \}/.test(beta), "G1i …for every confirmation it sends");
  t.ok(!/emailRedirectTo:\s*(body|event|origin|req)/.test(beta), "G1j never an address the caller supplied");

  // ── 3. signing up ──────────────────────────────────────────────────────────────────────────────
  t.ok(!/supabase\.auth\.signUp\(/.test(code) && !/supabase\.auth\.resend\(/.test(code), "G1k the app never signs up or resends straight to Supabase");

  // ── 4. the password reset, from inside a store app ─────────────────────────────────────────────
  const shell = (origin, platform) => ({ location: { origin, protocol: origin.split("//")[0] }, Capacitor: { isNativePlatform: () => true, getPlatform: () => platform } });
  for (const [origin, platform] of [["capacitor://localhost", "ios"], ["https://localhost", "android"]]) {
    const to = R.passwordResetRedirect(shell(origin, platform));
    t.ok(to.startsWith("https://flourishmoney.app/") && !to.includes("localhost"), `G1l a reset started in the ${platform} app returns to the website (${to})`);
  }
  t.ok(/resetPasswordForEmail\(email, \{ redirectTo: passwordResetRedirect\(\) \}\)/.test(code), "G1m …and the app asks for exactly that");

  t.summary("review1122G1");
})().catch((e) => { console.error(e); process.exit(1); });
