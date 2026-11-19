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
//   3  the workflow runs nightly and by hand, uses only its two named secrets, and keeps the pictures whatever happens;
//   4  a failure says which step broke where GitHub's own failure email will show it (an error annotation and the run's summary);
//   6  the fire drill: a run can be failed on purpose (by hand, or by a label on a pull request) to prove the alert
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
  t.eq([...new Set([...wf.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))].sort(), ["PLAID_CLIENT_ID", "PLAID_SANDBOX_SECRET"], "3b its secrets, by name: these two and no other");
  t.ok(/PLAID_ENV: sandbox/.test(wf) && !/PLAID_ENV: (?!sandbox)/.test(wf) && !wf.includes(S.PRODUCTION_SUPABASE_HOST) && !/SUPABASE_URL: /.test(wf), "3c Plaid's sandbox only, and no Supabase address but the one the run starts");
  t.ok(/- name: Keep the pictures\n\s+if: always\(\)\n\s+uses: actions\/upload-artifact@v4/.test(wf), "3d the pictures are kept whatever happens");
  t.ok(/permissions:\n  contents: read/.test(wf) && /timeout-minutes: \d+/.test(wf), "3f it can read the repo and nothing else, and cannot run for ever");

  // ── 4. The alert: GitHub's own failure email, which carries the run's error annotations ─────────────
  t.ok(!fs.existsSync(path.join(REPO, "e2e", "nightly", "notify.cjs")) && !/RESEND|notify\.cjs|resend/i.test(wf), "4a no email of our own: GitHub's failure email is the alert (no Resend key, no notify step)");
  const lines = R.alertLines({ device: "Android app", step: "connect a bank (Plaid sandbox)", message: "Plaid's window stopped changing.\nsecond line", others: ["website: first number"], passed: ["iPhone app"] });
  t.eq(lines.annotation, "::error title=Nightly test broke at%3A connect a bank (Plaid sandbox)::Android app failed at \"connect a bank (Plaid sandbox)\". Plaid's window stopped changing. second line Also failed: website: first number.",
    "4b one error annotation names the step and the device (GitHub puts it in the failure email and on the run)");
  const drill = R.alertLines({ device: "iPhone app", step: R.DRILL_STEP, message: "100% on purpose: a, b" });
  t.eq(drill.annotation.split("::")[1], "error title=Nightly test broke at%3A fire drill (a failure made on purpose%2C to test this alert)",
    "4b2 the title keeps its commas and colons (GitHub cuts a title at a bare comma)");
  t.ok(drill.annotation.endsWith("::iPhone app failed at \"fire drill (a failure made on purpose, to test this alert)\". 100%25 on purpose: a, b"), "4b3 the message keeps them as they are, % escaped");
  t.ok(lines.summary.startsWith("## Nightly test broke at: connect a bank (Plaid sandbox)\n") && lines.summary.includes("| Android app | connect a bank (Plaid sandbox) |") && lines.summary.includes("Passed: iPhone app"), "4c the run's summary leads with the step that broke");
  t.ok(/if \(process\.env\.GITHUB_ACTIONS === "true"\) \{[^}]*console\.log\(alert\.annotation\)[^}]*GITHUB_STEP_SUMMARY/.test(run), "4d on GitHub, a failure writes both");
  // GitHub's failure email lists each job by name and its annotation COUNT, not the annotation's words (seen
  // 2026-11-19). So the step that broke becomes the name of a job of its own, which the email does show.
  t.eq(lines.jobName, "Broke at: connect a bank (Plaid sandbox), on Android app", "4f the job name the email will show");
  t.ok(/fs\.appendFileSync\(process\.env\.GITHUB_OUTPUT, `broke=\$\{alert\.jobName\}\\n`\)/.test(run), "4g the walk hands that name on as the job's output");
  t.ok(/\n  alert:\n    name: "\$\{\{ needs\.walk\.outputs\.broke \|\| 'Broke at a step that did not report itself' \}\}"\n    needs: walk\n    if: failure\(\) && needs\.walk\.outputs\.broke != ''/.test(wf)
    && /outputs:\n      broke: \$\{\{ steps\.walk\.outputs\.broke \}\}/.test(wf) && /- name: Walk it[^\n]*\n        id: walk/.test(wf) && /BROKE: \$\{\{ needs\.walk\.outputs\.broke \}\}\n        run: \|\n          echo "\$BROKE"\n          exit 1/.test(wf),
    "4h a failed run adds a failed job named after the step that broke, so it is in GitHub's email");
  t.ok(!/[—–]/.test(lines.annotation + lines.summary), "4e no dash used as punctuation");

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

  t.summary("nightlyE2e.test");
})();
