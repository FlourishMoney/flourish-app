// tests/bankLoginClaim.test.cjs
// -----------------------------------------------------------------------------
// "FLOURISH NEVER SEES YOUR BANK LOGIN. YOU SIGN IN WITH YOUR BANK THROUGH PLAID."
//
// The Connect your bank sheet used to say "Plaid never receives your bank login credentials". That
// is not true for every Plaid connection (on a non-OAuth bank, Plaid is exactly who receives them),
// so it cannot ship. The sentence that replaced it is about Flourish, and it is only true while all
// of the following are true. Each is checked here, so the claim cannot quietly become false:
//
//   1. The only way a bank is linked is Plaid's own Link, loaded from Plaid's CDN. Link draws its
//      screens in a frame served by Plaid, which the app's own script cannot read, and the CSP lets
//      nothing but Plaid be framed.
//   2. What comes back from Link, and what the app sends on, is a public_token and the institution's
//      name. No field for a username or password exists anywhere in that path.
//   3. The Plaid function reads only tokens, ids and options from a request, calls only Plaid
//      endpoints that take tokens, and nothing in any Netlify function names a bank username,
//      password or credential.
//   4. The app's only password fields are Flourish's own sign-in and reset-password fields.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const REPO = path.join(__dirname, "..");
  const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const PLAID = fs.readFileSync(path.join(REPO, "netlify", "functions", "plaid.js"), "utf8");
  const TOML = fs.readFileSync(path.join(REPO, "netlify.toml"), "utf8");

  // ── The sentence ──────────────────────────────────────────────────────────────────────────────
  t.ok(!/never receives your bank login/i.test(APP), "0a the unverified Plaid sentence is gone");
  const sheet = APP.slice(APP.indexOf("function BankConsentModal("), APP.indexOf("function BankConsentModal(") + 9000);
  t.ok(/>Connect your bank</.test(sheet), "0b (the sheet is the Connect your bank sheet)");
  t.ok(sheet.includes("Flourish never sees your bank login. You sign in with your bank through Plaid."), "0c it says Flourish never sees your bank login, and that you sign in through Plaid");

  // ── 1. Plaid's Link, from Plaid's CDN, framed only from Plaid ─────────────────────────────────
  t.eq((APP.match(/Plaid\.create\(/g) || []).length, 1, "1a there is one bank-linking path: Plaid.create");
  t.ok(/const SRC = "https:\/\/cdn\.plaid\.com\/link\/v2\/stable\/link-initialize\.js";/.test(APP), "1b Link's script is Plaid's, from cdn.plaid.com");
  const frameSrc = (TOML.match(/frame-src([^;"]*)/) || [, ""])[1].trim().split(/\s+/);
  t.eq(frameSrc.filter((h) => !/(^|\.)plaid\.com$/.test(h.replace(/^\*\./, "x."))), [], `1c the CSP frames nothing but Plaid (${frameSrc.join(" ")})`);

  // ── 2. What comes back and what is sent on ────────────────────────────────────────────────────
  t.ok(/callPlaid\("exchange_token",\{ public_token: publicToken, institution_name: metadata\?\.institution\?\.name\|\|"Your Bank" \}/.test(APP),
       "2a the app sends the public_token and the institution's name, nothing else");
  const linkPath = APP.slice(APP.indexOf("function usePlaidLink") > 0 ? APP.indexOf("function usePlaidLink") : APP.indexOf('const SRC = "https://cdn.plaid.com'), APP.indexOf("return { openPlaidLink"));
  t.ok(linkPath.length > 100 && !/password|username|credential/i.test(linkPath), "2b the Link hook has no username, password or credential field");

  // ── 3. The Plaid function takes tokens, and no function names bank credentials ────────────────
  const bodyFields = [...PLAID.matchAll(/const \{([^}]+)\} = body;|body\.([a-zA-Z_]+)/g)]
    .flatMap((m) => (m[1] ? m[1].split(",").map((x) => x.split("=")[0].trim()) : [m[2]])).filter(Boolean);
  const allowed = new Set(["action", "country", "public_token", "institution_name", "institution_id", "days", "full_resync", "transactions", "item_id", "tokens"]);
  t.eq(bodyFields.filter((f) => !allowed.has(f)), [], `3a plaid.js reads only tokens, ids and options from a request (${[...new Set(bodyFields)].join(", ")})`);
  const endpoints = [...new Set([...PLAID.matchAll(/plaid\(["'`](\/[a-z_/]+)/g)].map((m) => m[1]))].sort();
  const tokenEndpoints = ["/accounts/get", "/investments/holdings/get", "/item/get", "/item/public_token/exchange", "/item/remove", "/liabilities/get", "/link/token/create", "/transactions/enrich", "/transactions/get", "/transactions/sync"];
  t.eq(endpoints.filter((e) => !tokenEndpoints.includes(e)), [], `3b it calls only Plaid endpoints that take tokens (${endpoints.length})`);
  const fnDir = path.join(REPO, "netlify", "functions");
  const fnFiles = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.c?js$/.test(f) && fnFiles.push(p); } })(fnDir);
  const bankCred = /bank[_ ]?(user(name)?|password|login|credential)|online[_ ]?banking|login_id|\busername\b/i;
  t.eq(fnFiles.filter((f) => bankCred.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(REPO, f)), [], "3c no Netlify function names a bank username, password or login");

  // ── 4. The only password fields are Flourish's own ────────────────────────────────────────────
  const owners = [];
  for (const m of APP.matchAll(/type="password"/g)) {
    const before = APP.slice(0, m.index);
    const fn = [...before.matchAll(/\nfunction ([A-Z][A-Za-z]+)\(/g)].pop();
    owners.push(fn ? fn[1] : "?");
  }
  t.eq([...new Set(owners)].sort(), ["AuthScreen", "ResetPasswordScreen"], "4a password fields exist only on Flourish's sign-in and reset-password screens");

  t.summary("bankLoginClaim.test");
})();
