// tests/supportPage.test.cjs
// -----------------------------------------------------------------------------
// APPLE REQUIRES THE SUPPORT URL TO SHOW REAL CONTACT INFORMATION.
//
// /support is that URL. It must open cold with no account (a reviewer has none), carry the email,
// the operator's name and mailing address from the one constant that holds them, and link to the
// privacy policy and the account-deletion page. The landing footer and Settings both lead to it.
//
// The operator constant is not pinned to a value here: it starts as "TO BE FILLED BY AMANDA" and
// Amanda replaces it. What is checked is that the page shows whatever the constant says, so filling
// it in is one edit in one place.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

const body = APP.slice(APP.indexOf("const initialScreen = (() => {"), APP.indexOf("})();", APP.indexOf("const initialScreen")) + 5);
const expr = body.slice(body.indexOf("(() =>"));
const launchScreen = (url) => { const u = new URL(url); return new Function("window", `return ${expr}`)({ location: { pathname: u.pathname, hash: u.hash, search: u.search, protocol: u.protocol } }); };

(async () => {
  const t = create();
  const C = await import("../src/lib/supportContact.js");

  // ── 1. The route opens cold, on the web and inside a store app ────────────────────────────────
  t.eq(launchScreen("https://flourishmoney.app/support"), "support", "1a /support opens the support page");
  t.eq(launchScreen("https://flourishmoney.app/Support/"), "support", "1b wrong case and a trailing slash still resolve");
  t.eq(launchScreen("capacitor://localhost/support"), "support", "1c …and inside the iOS shell");
  t.ok(/if\(screen==="support"\)return <div style=\{legalShell\}><SupportPage onBack=/.test(APP), "1d the screen renders SupportPage in the legal shell");
  const routeAt = APP.indexOf('if(screen==="support")return');
  const gateAt = APP.indexOf("// ── Auth gate");
  t.ok(routeAt > 0 && gateAt > routeAt, "1e …before the auth gate, so it needs no account");

  // ── 2. What the page says ─────────────────────────────────────────────────────────────────────
  const page = APP.slice(APP.indexOf("function SupportPage({onBack}){"), APP.indexOf("function DeleteAccount({onBack}){"));
  t.ok(page.length > 200, "2a SupportPage exists");
  t.eq(C.SUPPORT_EMAIL, "hello@flourishmoney.app", "2b the support email is hello@flourishmoney.app");
  t.ok(/href=\{`mailto:\$\{SUPPORT_EMAIL\}`\}/.test(page) && /\{SUPPORT_EMAIL\}<\/a>/.test(page), "2c …as a mailto link showing the address");
  t.ok(/\{SUPPORT_OPERATOR_NAME_AND_ADDRESS\}/.test(page), "2d the operator name and address come from the one constant");
  t.ok(typeof C.SUPPORT_OPERATOR_NAME_AND_ADDRESS === "string" && C.SUPPORT_OPERATOR_NAME_AND_ADDRESS.trim().length > 0, "2e …which is never empty");
  t.ok(/whiteSpace:"pre-line"/.test(page), "2f …and keeps its line breaks, so an address reads as an address");
  t.ok(/href="\/privacy"/.test(page), "2g it links to the privacy policy");
  t.ok(/href="\/delete-account"/.test(page), "2h it links to account deletion");
  t.ok(/Last updated/.test(page) && /← Back/.test(page) && /fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900/.test(page),
       "2i same header as /privacy and /delete-account");
  // Nothing on this page may be a promise nobody has made (a reply time, an office, a phone line).
  t.ok(!/within \d|hours?\b|business days?|phone|call us|24\/7/i.test(page), "2j no reply-time, phone or hours claim");
  const app = APP;
  t.eq((app.match(/TO BE FILLED BY AMANDA/g) || []).length, 0, "2k the placeholder lives only in supportContact.js, never inline in App.jsx");

  // ── 3. The ways in ────────────────────────────────────────────────────────────────────────────
  const footer = APP.slice(APP.indexOf('<div className="fll-foot">'), APP.indexOf('<div className="fll-foot">') + 700);
  t.ok(/<a href="\/support">Support<\/a>/.test(footer), "3a the landing footer links to /support");
  t.ok(/<Btn label="Open Support" onClick=\{\(\)=>navToScreen&&navToScreen\("support"\)\}/.test(APP), "3b Settings opens it in the app");

  if (C.SUPPORT_OPERATOR_NAME_AND_ADDRESS === "TO BE FILLED BY AMANDA") {
    console.log("  note: SUPPORT_OPERATOR_NAME_AND_ADDRESS in src/lib/supportContact.js is still the placeholder");
  }
  t.summary("supportPage.test");
})();
