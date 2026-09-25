// tests/deleteAccountPage.test.cjs
// -----------------------------------------------------------------------------
// GOOGLE PLAY REQUIRES A PUBLIC ACCOUNT-DELETION PAGE, AND A REVIEWER FOLLOWS IT LITERALLY.
//
// Two ways this page fails. It can stop being reachable — a route edit removes a submission
// requirement with nothing to notice — or it can describe an app that no longer exists: a label
// that was renamed, a step that was added, a promise the deletion code does not keep.
//
// So this file checks the page against the REAL Settings labels and the REAL delete handler, not
// against a copy of its own words.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const root = (...p) => path.join(__dirname, "..", ...p);
const APP = fs.readFileSync(root("src", "App.jsx"), "utf8");
const PLAID = fs.readFileSync(root("netlify", "functions", "plaid.js"), "utf8");
const PAGE = APP.slice(APP.indexOf("function DeleteAccount({onBack})"), APP.indexOf("function TermsOfService"));

(async () => {
  const t = create();

  // ── 1. reachable, and public ─────────────────────────────────────────────────────────────────
  t.ok(PAGE.length > 500, "1a the page exists");
  t.ok(/if \(path === "\/delete-account"\) return "delete-account";/.test(APP), "1b /delete-account routes to it");
  t.ok(/screen==="delete-account"/.test(APP), "1c …and the screen renders it");
  // The render must sit ABOVE the AuthScreen gate, next to /privacy and /terms — Play opens the
  // page with no account, and behind the gate it would show a login form instead.
  const routeAt = APP.indexOf('screen==="delete-account"');
  const authGateAt = APP.indexOf("return <AuthScreen onAuth=");
  t.ok(authGateAt > 0, "1d the sign-in gate is where this test thinks it is");
  t.ok(routeAt > 0 && routeAt < authGateAt,
    "1e …and /delete-account renders before it, so it opens with no account");
  t.ok(APP.indexOf('screen==="privacy"') < routeAt && routeAt < authGateAt,
    "1f it is grouped with the other public legal pages, which are served the same way");
  t.ok(/href="\/delete-account"/.test(APP), "1g the privacy page links to it");

  // ── 2. the steps match the app ───────────────────────────────────────────────────────────────
  // The Settings button's real label, read from the Settings screen itself.
  const settings = APP.slice(APP.indexOf('{/* ── Delete all data'), APP.indexOf('{/* ── Delete all data') + 900);
  const label = (settings.match(/<Btn label="([^"]+)" onClick=\{onDeleteData/) || [])[1];
  t.eq(label, "Delete Account", "2a the Settings button is labelled Delete Account");
  t.ok(PAGE.includes(`<strong style={{color:C.cream}}>${label}</strong>`),
    "2b …and the page names that exact label, so a reviewer looking for it finds it");
  t.ok(/its own red section|in the <strong[^>]*>Delete Account<\/strong> section/.test(PAGE)
    || /Delete Account<\/strong> section, below "Your Data"/.test(PAGE),
    "2c it says where the button really is — the Your Data card holds only the export button");
  // The confirmation dialog is a step. A reviewer who stops before it reports deletion as broken.
  const confirmTitle = (APP.match(/confirmModal\(\{title:"(Delete your account\?)"/) || [])[1];
  t.eq(confirmTitle, "Delete your account?", "2d deleting really does open a confirmation box");
  t.ok(PAGE.includes(confirmTitle), "2e …and the page lists confirming it as a step");

  // ── 3. a way to delete without the app, which is the point of the page ───────────────────────
  t.ok(/mailto:/.test(PAGE), "3a there is an email route for someone who cannot open the app");
  t.ok(/do not need the app/i.test(PAGE), "3b …and the page says so up front");

  // ── 4. the promises match what the code does ─────────────────────────────────────────────────
  // Plaid revocation is best-effort by design: a provider hiccup must not trap someone in an
  // account they cannot delete. The page must not promise the revocation itself.
  t.ok(/plaid_remove/.test(PLAID) && /step: "plaid_remove"/.test(PLAID),
    "4a /item/remove failures are recorded rather than fatal — that is the real behaviour");
  t.ok(/we ask the provider to revoke/i.test(PAGE),
    "4b so the page promises our tokens are deleted and revocation is requested, not guaranteed");
  t.ok(!/so no further data can be fetched\./.test(PAGE),
    "4c …and no longer claims fetching is impossible, which a failed revocation would make untrue");
  // Nothing in the deletion path touches Stripe, so "nothing is kept" was untrue.
  t.eq(/stripe/i.test(PLAID), false, "4d the deletion handler does not touch the payment processor");
  t.ok(/payment processor also keeps its own\s*\n?\s*billing record/.test(PAGE.replace(/\s+/g, " ").replace(/ /g, " "))
    || /payment processor also keeps its own/.test(PAGE.replace(/\s+/g, " ")),
    "4e so the page says the processor keeps its own record rather than claiming nothing is kept");
  t.ok(!/^\s*Nothing, except the few records/m.test(PAGE), "4f the absolute 'Nothing' is gone");
  // Third parties named in the privacy policy also keep their own copies.
  t.ok(/retention rules require/.test(PAGE), "4g …as do the services that processed data for us");

  // ── 5. the date is not in the future ─────────────────────────────────────────────────────────
  const last = (PAGE.match(/const last="([^"]+)"/) || [])[1];
  t.ok(!!last, "5a the page carries a last-updated date");
  t.ok(new Date(last).getTime() <= Date.now(), `5b …and it is not in the future (${last})`);

  t.summary("deleteAccountPage.test");
})();
