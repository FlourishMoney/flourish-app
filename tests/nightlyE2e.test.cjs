// tests/nightlyE2e.test.cjs
// -----------------------------------------------------------------------------
// THE NIGHTLY END-TO-END TEST CANNOT REACH PRODUCTION, AND SAYS WHAT BROKE (e2e/nightly, 2026-11-18).
//
// The nightly test itself runs in its own workflow (.github/workflows/nightly-e2e.yml), with a database and a server.
// This checks, in the gate and in a second, the parts that keep it safe and useful:
//   1  its server refuses any setting that could reach production (Supabase anywhere but this machine, Plaid anywhere
//      but the sandbox, a key that can charge, email or bill);
//   2  its browser lets through this machine, the throwaway Supabase and Plaid; answers the store build's API calls
//      locally; treats any other production address as a failure; and blocks the rest;
//   3  the workflow runs nightly and by hand, uses only its three named secrets, keeps the pictures whatever happens,
//      and sends the one email on a failure;
//   4  the email names the device and the step, and goes to hello@flourishmoney.app;
//   6  the fire drill: a run can be failed on purpose (by hand, or by a label on a pull request) to prove the email
//      arrives, and it fails at a step whose name says it was on purpose;
//   5  the server's routes and Content-Security-Policy are netlify.toml's own.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");

(async () => {
  const t = create();
  const S = require(path.join(REPO, "e2e", "nightly", "server.cjs"));
  const R = require(path.join(REPO, "e2e", "nightly", "run.cjs"));
  const N = require(path.join(REPO, "e2e", "nightly", "notify.cjs"));
  const LOCAL = "http://127.0.0.1:55321";

  // ── 1. The server's refusals ─────────────────────────────────────────────────────────────────
  const ok = { SUPABASE_URL: LOCAL, PLAID_ENV: "sandbox" };
  t.eq(S.refusal(ok), null, "1a the throwaway Supabase on this machine and Plaid's sandbox: allowed");
  t.ok(/not this machine/.test(S.refusal({ ...ok, SUPABASE_URL: "https://qhcccjkmvijrybagkvyw.supabase.co" }) || ""), "1b production's Supabase: refused");
  t.ok(/not this machine/.test(S.refusal({ ...ok, SUPABASE_URL: "https://anything.supabase.co" }) || ""), "1c any Supabase that is not this machine: refused");
  t.ok(/SUPABASE_URL/.test(S.refusal({ PLAID_ENV: "sandbox" }) || ""), "1d no Supabase address at all: refused");
  for (const env of ["production", "development", "", undefined]) t.ok(/sandbox/.test(S.refusal({ ...ok, PLAID_ENV: env }) || ""), `1e PLAID_ENV ${JSON.stringify(env)}: refused (only "sandbox" will do)`);
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "REVENUECAT_SECRET_KEY", "ANTHROPIC_API_KEY", "RESEND_API_KEY"]) t.ok((S.refusal({ ...ok, [k]: "x" }) || "").startsWith(k), `1f ${k} set: refused`);

  // ── 2. Where the browser may go ──────────────────────────────────────────────────────────────
  const v = (u) => R.verdict(u, LOCAL);
  t.eq([v("http://localhost:8888/"), v("http://localhost:8888/api/beta"), v("http://localhost:8889/assets/x.js"), v(`${LOCAL}/auth/v1/token`), v("data:image/png;base64,AA")],
    ["allow", "allow", "allow", "allow", "allow"], "2a this machine's two servers and the throwaway Supabase: let through");
  t.eq([v("https://cdn.plaid.com/link/v2/stable/link-initialize.js"), v("https://sandbox.plaid.com/link/workflow/start"), v("https://analytics.plaid.com/x")], ["allow", "allow", "allow"], "2b Plaid's script and sandbox: let through");
  t.eq([v("https://production.plaid.com/item/get"), v("https://development.plaid.com/x")], ["production", "production"], "2c Plaid's production: a failure");
  t.eq([v("https://flourishmoney.app/api/plaid"), v("https://flourishmoney.app/api/beta?x=1")], ["api", "api"], "2d the store build's API calls: answered by the local server, never sent");
  t.eq([v("https://flourishmoney.app/"), v("https://flourishmoney.app/guides/"), v("https://www.flourishmoney.app/api/beta"), v("https://qhcccjkmvijrybagkvyw.supabase.co/rest/v1/profiles"), v("https://other.supabase.co/auth/v1/token")],
    ["production", "production", "production", "production", "production"], "2e the live website, and any hosted Supabase: a failure");
  t.eq([v("https://fonts.googleapis.com/css2"), v("https://plausible.io/js/script.js"), v("https://evilplaid.com/x"), v("http://plaid.com/x"), v("http://localhost:9999/"), v("not a url")],
    ["block", "block", "block", "block", "block", "block"], "2f everything else: blocked");
  const run = read("e2e", "nightly", "run.cjs");
  t.ok(/if \(v === "production"\) \{ st\.production\.push\([^\n]*return route\.abort\(\); \}/.test(run) && /if \(st\.production\.length\) \{[^\n]*throw new StepFailed\(`the app tried to reach production/.test(run),
    "2g a production address is refused and fails the step it happened in");
  t.eq(R.STEPS.length, 9, "2h nine steps, each with a name the email can use");
  t.eq(R.DEVICES.map((d) => [d.key, d.platform, d.origin]), [["iphone", "ios", "capacitor://localhost"], ["android", "android", "https://localhost"], ["website", null, null]],
    "2i three devices: the iPhone app and the Android app with the Origin each sends, and the website");

  // ── 3. The workflow ──────────────────────────────────────────────────────────────────────────
  const wf = read(".github", "workflows", "nightly-e2e.yml");
  t.ok(/\n  schedule:\n    - cron: "\d+ \d+ \* \* \*"/.test(wf) && /\n  workflow_dispatch:/.test(wf), "3a it runs every night, and by hand");
  t.eq([...new Set([...wf.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))].sort(), ["NIGHTLY_RESEND_API_KEY", "PLAID_CLIENT_ID", "PLAID_SANDBOX_SECRET"], "3b its secrets, by name: these three and no other");
  t.ok(/PLAID_ENV: sandbox/.test(wf) && !/PLAID_ENV: (?!sandbox)/.test(wf) && !wf.includes(S.PRODUCTION_SUPABASE_HOST) && !/SUPABASE_URL: /.test(wf), "3c Plaid's sandbox only, and no Supabase address but the one the run starts");
  t.ok(/- name: Keep the pictures\n\s+if: always\(\)\n\s+uses: actions\/upload-artifact@v4/.test(wf), "3d the pictures are kept whatever happens");
  t.ok(/if: failure\(\) && matrix\.bank == 'plaid' && \(github\.event_name != 'pull_request' \|\| contains\(github\.event\.pull_request\.labels\.\*\.name, 'nightly-fire-drill'\)\)[\s\S]{0,300}run: node e2e\/nightly\/notify\.cjs/.test(wf),
    "3e a failed nightly or hand-started run sends the email; a pull request's run only when it carries the fire-drill label");
  t.ok(/permissions:\n  contents: read/.test(wf) && /timeout-minutes: \d+/.test(wf), "3f it can read the repo and nothing else, and cannot run for ever");
  t.ok(/NIGHTLY_RESEND_API_KEY: \$\{\{ secrets\.NIGHTLY_RESEND_API_KEY \}\}/.test(wf.slice(wf.indexOf("Email hello@"))) && !/RESEND/.test(wf.slice(wf.indexOf("jobs:"), wf.indexOf("Email hello@"))),
    "3g the email key is given to the email step alone (the server would refuse to start with it)");

  // ── 4. The email ─────────────────────────────────────────────────────────────────────────────
  const mail = N.compose({ device: "Android app", step: "connect a bank (Plaid sandbox)", message: "Plaid's window stopped changing.", others: ["website: first number"], passed: ["iPhone app"] }, "https://github.com/x/y/actions/runs/1");
  t.eq(N.TO, "hello@flourishmoney.app", "4a it goes to hello@flourishmoney.app");
  t.eq(mail.subject, "flourish nightly test FAILED: connect a bank (Plaid sandbox) (Android app)", "4b the subject names the step and the device");
  t.ok(mail.text.includes("Step that broke: connect a bank (Plaid sandbox)") && mail.text.includes("On: Android app") && mail.text.includes("Also failed: website: first number") && mail.text.includes("Passed: iPhone app")
    && mail.text.includes("https://github.com/x/y/actions/runs/1"), "4c the body says what broke, what else failed, what passed, and links the run");
  t.ok(/did not get as far as its first step/.test(N.compose(null, "u").subject), "4d a run that dies before its first step still gets an email that says so");
  t.ok(!/—|–/.test(mail.subject + mail.text), "4e no dash used as punctuation");

  // ── 5. The server is Netlify's stand-in, from netlify.toml itself ──────────────────────────────────
  const toml = read("netlify.toml");
  const routes = S.apiRoutes(toml);
  t.ok(Object.keys(routes).length >= 16 && routes["/api/plaid"] === "plaid" && routes["/api/beta"] === "beta" && routes["/api/billing"] === "billing" && routes["/api/trial-plan-first"] === "trial-plan-first",
    `5a every /api route in netlify.toml is served (${Object.keys(routes).length})`);
  t.ok(Object.values(routes).every((f) => fs.existsSync(path.join(REPO, "netlify", "functions", `${f}.js`))), "5b …each by a function that exists");
  const csp = S.contentSecurityPolicy(toml, LOCAL);
  t.ok(!csp.includes(S.PRODUCTION_SUPABASE_HOST) && csp.includes("127.0.0.1:55321") && csp.includes("frame-src *.plaid.com") && csp.includes("script-src 'self' cdn.plaid.com"),
    "5c the website is served with the site's own Content-Security-Policy, Supabase's address swapped for the throwaway one");

  // ── 6. The fire drill ────────────────────────────────────────────────────────────────────────
  t.ok(/\n      drill:\n\s+description: "[^"]*on purpose[^"]*"\n\s+type: boolean\n\s+default: false/.test(wf), "6a by hand: a tick box that fails the run on purpose (off unless ticked)");
  t.ok(/E2E_DRILL: \$\{\{ matrix\.bank == 'plaid' && \(github\.event\.inputs\.drill == 'true' \|\| contains\(github\.event\.pull_request\.labels\.\*\.name, 'nightly-fire-drill'\)\) \}\}/.test(wf),
    "6b the drill is on only for the real job, when the box is ticked or the pull request carries the label nightly-fire-drill");
  t.ok(/types: \[opened, synchronize, reopened, labeled\]/.test(wf) && /if: github\.event\.action != 'labeled' \|\| github\.event\.label\.name == 'nightly-fire-drill'/.test(wf), "6c adding that label starts a run; any other label starts none");
  t.eq(typeof R.DRILL_STEP, "string", "6d the drill has a step name of its own");
  t.ok(/on purpose/.test(R.DRILL_STEP || "") && !R.STEPS.includes(R.DRILL_STEP), "6e …that says it was on purpose, and is not one of the nine");
  t.ok(/if \(DRILL\) await step\(DRILL_STEP, async \(\) => \{ throw new Error\(/.test(run) && /const DRILL = process\.env\.E2E_DRILL === "true";/.test(run), "6f only E2E_DRILL exactly \"true\" fails it, right after the fresh visit");
  const notify = read("e2e", "nightly", "notify.cjs");
  t.ok(/NOT SENT: Resend answered \$\{res\.status\}: \$\{why\}/.test(notify) && /sent to \$\{TO\}[^\n]*\$\{sent\.id/.test(notify), "6g the email step says why Resend refused, or the id Resend gave the email (never the key)");

  t.summary("nightlyE2e.test");
})();
