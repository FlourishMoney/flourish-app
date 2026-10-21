// tests/sentryBreadcrumbs.test.cjs
// -----------------------------------------------------------------------------
// NO MONEY FIGURE AND NO EMAIL ADDRESS REACHES SENTRY FROM A BREADCRUMB (Privacy Policy, 2026-10-21).
//
// Sentry records console calls, clicks and requests as breadcrumbs and sends them with the next error. The old
// scrub cleaned a breadcrumb's message only; a console breadcrumb's data (the call's raw arguments) went as it was.
//   1  a console breadcrumb: amounts in any form ($1,944.00, 1,944, 2345.67, a plain 2345, a number argument) and
//      email addresses are removed from its message and its data, and the words around them stay;
//   2  other breadcrumbs (a request, a click): their data is scrubbed like an event's extra;
//   3  the same scrub runs as a breadcrumb is recorded (beforeBreadcrumb) and before an event is sent (beforeSend);
//   4  the income detection log no longer prints the amount, and no console call in src prints an amount or an
//      email address.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const MONEY = /\$\s?\d|\d,\d{3}|\b\d+\.\d{2}\b|(?<![\w.-])\d{3,}(?![\w.-])/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const dirty = (x) => { const s = JSON.stringify(x); return MONEY.test(s.replace(/"timestamp":\d+(\.\d+)?/g, "")) || EMAIL.test(s); };

(async () => {
  const t = create();
  const R = await import("../src/lib/errorReporting.js");

  // ── 1. A console breadcrumb ───────────────────────────────────────────────────────────────────
  const consoleCrumb = { category: "console", level: "error", timestamp: 1792555200,
    message: "[income] detection: 2345/biweekly → SUGGEST for person@example.com, balance $1,944.00, 1,944 and 2345.67",
    data: { logger: "console", arguments: ["[income] detection:", "2345/biweekly", 1944, { amount: 2345.67, to: "person@example.com" }, "→", "SUGGEST"] } };
  const c = R.scrubBreadcrumb(consoleCrumb);
  t.ok(!dirty(c.message) && !dirty(c.data), `1a no amount or address is left in a console breadcrumb (${c.message})`);
  t.ok(/\[income\] detection:/.test(c.message) && /biweekly/.test(c.message) && c.data.logger === "console" && c.data.arguments[0] === "[income] detection:" && c.data.arguments[5] === "SUGGEST",
    "1b …and the words around them stay, so the breadcrumb is still useful");
  t.eq([consoleCrumb.data.arguments[2], consoleCrumb.message.includes("2345")], [1944, true], "1c (the original breadcrumb object is not modified; a scrubbed copy is returned)");

  // ── 2. Other breadcrumbs ──────────────────────────────────────────────────────────────────────
  const fetchCrumb = R.scrubBreadcrumb({ category: "fetch", data: { method: "POST", url: "https://flourishmoney.app/api/beta", status_code: 200, note: "sent to person@example.com for $79.99" } });
  t.ok(!EMAIL.test(JSON.stringify(fetchCrumb)) && !/\$79\.99/.test(JSON.stringify(fetchCrumb)) && fetchCrumb.data.status_code === 200 && fetchCrumb.data.url === "https://flourishmoney.app/api/beta",
    "2a a request breadcrumb's data is scrubbed (address and amount), and its status and URL stay");
  t.eq(R.scrubBreadcrumb({ category: "ui.click", message: "button.fll-btn" }).message, "button.fll-btn", "2b a click breadcrumb is untouched");

  // ── 3. Both hooks ─────────────────────────────────────────────────────────────────────────────
  const ev = R.beforeSendEvent({ message: "x", breadcrumbs: [consoleCrumb, { category: "fetch", data: { note: "person@example.com" } }] });
  t.ok(ev && !dirty(ev.breadcrumbs), "3a beforeSend scrubs every breadcrumb that goes with an event");
  const src = fs.readFileSync(path.join(REPO, "src", "lib", "errorReporting.js"), "utf8");
  t.ok(/beforeBreadcrumb: scrubBreadcrumb,/.test(src) && /beforeSend: beforeSendEvent,/.test(src), "3b Sentry.init scrubs breadcrumbs as they are recorded and again before sending");

  // ── 4. The console calls ──────────────────────────────────────────────────────────────────────
  const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  t.ok(/console\.error\("\[income\] detection:", detected \? detected\.freq : "none",/.test(APP) && !/console\.\w+\([^;]*perDeposit/.test(APP), "4a the income detection log prints the cadence only, never the amount");
  const files = ["App.jsx", ...fs.readdirSync(path.join(REPO, "src", "lib")).map((f) => path.join("lib", f))].filter((f) => /\.jsx?$/.test(f));
  const calls = files.flatMap((f) => (fs.readFileSync(path.join(REPO, "src", f), "utf8").match(/console\.(log|warn|error|info|debug)\([^;]*\)/g) || []).map((c2) => `${f}: ${c2.slice(0, 120)}`));
  const bad = calls.filter((c2) => /perDeposit|\.amount\b|amountCents|\.balance\b|safeToSpend|\.email\b|userEmail|\bemail\s*[,)]|\$\{[^}]*(amount|balance|income|email)[^}]*\}/i.test(c2));
  t.eq(bad, [], `4b no console call in src prints an amount or an email address (${calls.length} calls)`);
  t.summary("sentryBreadcrumbs.test");
})();
