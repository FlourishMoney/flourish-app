// tests/planCopy.test.cjs
// -----------------------------------------------------------------------------
// NO SAVING CLAIMS IN PLAN OR CHECKOUT COPY (billing day; approved by ChatGPT and Grok, 2026-10-15).
//
// A plan is shown as its price and its billing period, and nothing else: no "Save N%" badge, no
// "save N% versus monthly" note, no "regular price", no monthly equivalent of the annual price. Checked on
// what a person actually sees and on the source, so a branch the renders below do not reach is covered too:
//   1. the old Paywall (shown while billing is off): the two prices and their billing periods only;
//   2. the checkout screen (UpgradeScreen), its plans, its founding confirmation card, its notices and
//      error messages, and the upgrade gate (PremiumGate), billing on and off;
//   3. every email this repository sends (welcome, founding link, Canada launch, confirmation);
//   4. the source of those screens and of src/lib/billingVisibility.js, comments aside;
//   5. the rule is not blind: it catches the words it is meant to catch.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

// "save" (any form) with a percent near it, either way round; and "regular price".
const SAVE_PERCENT = /\bsav(?:e|es|ed|ing|ings)\b[^\n]{0,60}%|%[^\n]{0,30}\bsav(?:e|es|ed|ing|ings)\b/i;
const REGULAR_PRICE = /\bregular\s+price/i;
const bad = (s) => [SAVE_PERCENT.test(s) && "save plus a percent", REGULAR_PRICE.test(s) && "regular price"].filter(Boolean);
const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const withoutComments = (src) => src.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
// A top-level function's source, up to the next top-level function.
const body = (name) => { const i = APP.indexOf(`\nfunction ${name}(`); return i < 0 ? "" : APP.slice(i, APP.indexOf("\nfunction ", i + 10)); };

(async () => {
  const t = create();
  const vis = await import("../src/lib/billingVisibility.js");
  const ON = { enabled: true, founding: { available: true, confirmEmail: false, cohortLimit: 50 } };
  const CONFIRM = { enabled: true, founding: { available: false, confirmEmail: true, cohortLimit: 50 } };
  const PLAIN = { enabled: true, founding: { available: false, confirmEmail: false, cohortLimit: 50 } };

  let A = {};
  try { A = loadApp(["Paywall", "UpgradeScreen", "PremiumGate"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }

  // ── 1. the old Paywall ──────────────────────────────────────────────────────────────────────────
  if (A.Paywall) {
    for (const country of ["CA", "US"]) {
      const txt = textOf(A.render(A.h(A.Paywall, { onClose: () => {}, onPromoValid: () => {}, country })));
      t.eq(bad(txt), [], `1a the old Paywall (${country}): no saving, no regular price`);
      t.ok(!/%/.test(txt), `1b …no percentage at all (${country})`);
      t.ok(!/billed annually/i.test(txt), `1c …and no monthly equivalent of the annual price (${country})`);
    }
    const ca = textOf(A.render(A.h(A.Paywall, { onClose: () => {}, onPromoValid: () => {}, country: "CA" })));
    t.eq([...new Set(ca.match(/\$\d[\d,]*(?:\.\d+)?(?:\/(?:yr|mo))?/g))], ["$99.99/yr", "$11.99/mo"],
      "1d the two prices, each with its billing period, and no other figure (the trial line repeats the chosen one)");
    t.ok(ca.includes("Billed yearly"), "1e …the annual one billed yearly");
    t.ok(!/annualSavingsPercent|monthlyEquivalentOfAnnual/.test(APP), "1f the app no longer works out a saving or a monthly equivalent");
  }

  // ── 2. the checkout screen, its notices and errors, and the upgrade gate ───────────────────────
  const seen = [];
  if (A.UpgradeScreen) {
    for (const [why, status] of [["founding offered", ON], ["confirmation card", CONFIRM], ["no founding price", PLAIN]]) {
      const txt = textOf(A.render(A.h(A.UpgradeScreen, { status, mode: "plans", notice: null, onClose: () => {} })));
      seen.push(txt);
      t.eq(bad(txt), [], `2a the checkout screen (${why}): no saving, no regular price`);
    }
    t.ok(seen[0].includes("$99.99 a year") && seen[0].includes("$11.99 a month") && seen[0].includes("$79.99 a year"), "2b (the checkout screen rendered its plans)");
  }
  for (const p of vis.offeredPlans({ status: ON })) {
    t.eq(bad([p.label, p.price, p.note, p.sub].filter(Boolean).join(" ")), [], `2c the ${p.key} plan: no saving, no regular price`);
  }
  const notices = ["?billing=success", "?billing=cancel", "?billing=portal_return"].map(q => vis.billingReturnNotice(q)).filter(Boolean).map(n => n.text);
  const errors = [{ status: 403, error: "founding_not_eligible" }, { status: 500 }, { error: "network" }, {}].map(e => vis.checkoutErrorText(e));
  t.eq(bad([...notices, ...errors, ...Object.values(vis.FOUNDING_CONFIRM_COPY), vis.FOUNDING_REFUSED_TEXT].join("\n")), [], "2d the notices, the error messages and the confirmation card's words");
  if (A.PremiumGate) {
    for (const billingOn of [true, false]) {
      const txt = textOf(A.render(A.h(A.PremiumGate, { feature: "Credit Coaching", desc: "Factor by factor.", onUpgrade: () => {}, billingOn })));
      t.eq(bad(txt), [], `2e the upgrade gate (billing ${billingOn ? "on" : "off"})`);
    }
  }

  // ── 3. every email ──────────────────────────────────────────────────────────────────────────────
  {
    const saved = { ...process.env };
    process.env.SUPABASE_SECRET_KEY = "test-service-role";
    delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;
    const ID = "3b1f7e20-5c44-4b1e-9a77-0c2d6e8f1a23";
    const row = { id: ID, founding_position: 7, is_test: false, unsubscribed_at: null, consent_version: "2026-10-06" };
    const lib = (f) => require(path.join(REPO, "netlify", "functions", "_lib", f));
    const W = lib("waitlistWelcome.js"), E = lib("foundingLinkEmail.js"), F = lib("foundingConfirm.js");
    const emails = [
      ["the welcome email", W.welcomeEmailPayload("a@example.test", ID, 7)],
      ["the founding link email", E.foundingLinkEmailPayload("a@example.test", row)],
      ["the Canada launch email", E.foundingLinkEmailPayload("a@example.test", { ...row, consent_version: "pre-2026-10-01" }, { launched: true })],
      ["the confirmation email", F.foundingConfirmEmailPayload("a@example.test", "https://flourishmoney.app/api/founding-confirm?u=x&x=1&t=y")],
    ];
    for (const [name, p] of emails) {
      t.ok(!!p, `(${name} was built)`);
      if (p) t.eq(bad(`${p.subject}\n${p.text}\n${p.html}`), [], `3 ${name}: no saving, no regular price`);
    }
    process.env = saved;
  }

  // ── 4. the source, comments aside ───────────────────────────────────────────────────────────────
  for (const [name, src] of [
    ["Paywall", body("Paywall")],
    ["UpgradeScreen", body("UpgradeScreen")],
    ["PremiumGate", body("PremiumGate")],
    ["src/lib/billingVisibility.js", fs.readFileSync(path.join(REPO, "src", "lib", "billingVisibility.js"), "utf8")],
  ]) {
    t.ok(src.length > 400, `(${name} source found)`);
    t.eq(bad(withoutComments(src)), [], `4 ${name}: no saving with a percent, no regular price, in any branch`);
  }

  // ── 5. the rule is not blind ────────────────────────────────────────────────────────────────────
  t.eq(["Save 31%", "CAD plus tax · save 31% versus monthly", "Save ${annualSavingsPercent(country)}%", "Regular price: $99.99 a year", "31% savings", "Saving 20%"].map(s => bad(s).length > 0),
    [true, true, true, true, true, true], "5a it catches each saving claim and the regular price");
  t.eq(["Save changes", "Billed yearly", "$99.99/yr", "CAD plus tax", "Back from Stripe's billing portal.", "You can cancel any time."].map(s => bad(s).length > 0),
    [false, false, false, false, false, false], "5b …and not ordinary words");

  t.summary("planCopy.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
