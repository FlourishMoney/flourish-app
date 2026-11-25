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

  // ── 7. The website walks the free plan (Free v1, PR #158; run 45471015886 broke at "Choose your plan") ──────────
  // On the website the free plan connects no bank, the plans open once and close onto the free plan, and Delete
  // Account is in Settings. The store apps keep the required plans, one sandbox bank, and Delete Account there.
  {
    const dev = (k) => R.DEVICES.find((d) => d.key === k);
    const kinds = (k, bank) => (typeof R.stepsFor === "function" ? R.stepsFor(dev(k), bank) : []).map((s) => s.kind);
    const names = (k, bank) => (typeof R.stepsFor === "function" ? R.stepsFor(dev(k), bank) : []).map((s) => s.name);
    for (const k of ["iphone", "android"]) {
      t.eq(kinds(k, "plaid"), ["visit", "signup", "ai-notice", "before-you-start", "plaid", "first-number", "plans-required", "delete-on-plans", "gone"], `7a ${k}: Plaid's sandbox bank, the required plans, Delete Account on them (unchanged)`);
      t.eq(names(k, "plaid"), R.STEPS, `7b ${k}: the same nine step names as before`);
    }
    t.eq(kinds("iphone", "manual")[4], "by-hand", "7c the rehearsal types the phone's balance by hand, as before");
    for (const bank of ["plaid", "manual"]) {
      t.eq(kinds("website", bank), ["visit", "signup", "ai-notice", "before-you-start", "free-bank-line", "first-number", "plans-once", "delete-in-settings", "gone"],
        `7d the website (${bank}): the free plan's bank line instead of a bank, the plans once then the free plan, Delete Account in Settings`);
    }
    t.eq(names("website", "plaid").length, 9, "7e the website still has nine named steps");
    t.ok(names("website", "plaid")[4] !== R.STEPS[4] && names("website", "plaid")[6] !== R.STEPS[6] && names("website", "plaid")[7] !== R.STEPS[7],
      `7f …and the three that differ say so in their names (${names("website", "plaid").slice(4, 8).join(" | ")})`);
    // The approved words come from the app's own files, never typed into the test.
    const { FREE_WORDS } = await import(path.join(REPO, "src", "lib", "freeWords.js"));
    const { UPGRADE_COPY } = await import(path.join(REPO, "src", "lib", "upgradeFlow.js"));
    const words = typeof R.approvedWords === "function" ? await R.approvedWords() : {};
    t.eq([words.headline, words.close, words.bankLine, words.settingsLine], [UPGRADE_COPY.headline, FREE_WORDS["free-plans-close"], FREE_WORDS["free-bank-line"], FREE_WORDS["free-settings-plan-line"]],
      "7g the walk's words are the app's own: the plans' headline (upgradeFlow.js) and the free plan's close button, bank line and Settings line (freeWords.js)");
    t.ok(![UPGRADE_COPY.headline, FREE_WORDS["free-plans-close"], FREE_WORDS["free-bank-line"], FREE_WORDS["free-settings-plan-line"]].some((w) => run.includes(w)), "7h …none of them typed into run.cjs");
    const differ = ["plaid", "by-hand", "free-bank-line", "plans-required", "plans-once", "delete-on-plans", "delete-in-settings"];
    t.eq(differ.filter((k) => ![...kinds("iphone", "plaid"), ...kinds("iphone", "manual"), ...kinds("website", "plaid")].includes(k) || !new RegExp(`kind [!=]== "${k}"`).test(run)), [],
      "7i every kind of step that differs between the devices is used, and the walk has a branch for it");
    t.ok(/kind === "free-bank-line"[\s\S]{0,900}\[data-free-bank\][\s\S]{0,900}\[data-bank-button\][\s\S]{0,2000}Enter it myself/.test(run), "7j the website's bank step: the free-bank line, no Connect button, then the balance by hand");
    t.ok(/kind === "plans-once"[\s\S]{0,900}words\.headline[\s\S]{0,600}\\\$11\\\.99[\s\S]{0,900}words\.close[\s\S]{0,900}words\.settingsLine/.test(run), "7k the website's plans: the headline and $11.99, then \"Continue on the free plan\", then the app, on the free plan (Settings says so)");
    t.ok(/kind === "delete-in-settings"[\s\S]{0,900}"Delete Account"[\s\S]{0,600}Delete your account\?[\s\S]{0,600}"Delete account"/.test(run), "7l the website deletes from Settings, as a website user does now");
  }

  // ── 8. The nightly's server enforces the plan limits the live site does ──────────────────────────────
  t.ok(/\n      ENFORCE_PLAN_LIMITS: "true"\n/.test(wf), "8a the walk runs with ENFORCE_PLAN_LIMITS on, as the live site does (so the website's free plan refuses a bank)");
  t.eq(S.refusal({ ...ok, ENFORCE_PLAN_LIMITS: "true" }), null, "8b …which the server allows");

  // ── 9. A pull request that changes the plans runs the nightly (so a change like #158 cannot slip past it) ────
  // Review round 1 (PR #162): no diff reader. GitHub's path filter decides alone: the test, the plans' rules, words and
  // screens (any change to src/App.jsx), and the server's plan, billing and bank enforcement.
  {
    const PLANS_PATHS = [
      "e2e/nightly/**", ".github/workflows/nightly-e2e.yml",
      // the app: the plans' rules, words, prices and screens
      "src/App.jsx", "src/lib/trialPlanFirst.js", "src/lib/upgradeFlow.js", "src/lib/freeWords.js", "src/lib/freePlan.js", "src/lib/billingVisibility.js", "src/lib/pricing.js",
      // the server: the bank limit (and how it tells the website from a store app), the plan and entitlement, billing
      "netlify/functions/plaid.js", "netlify/functions/_lib/freeBanks.js", "netlify/functions/_lib/freeWords.js", "netlify/functions/_lib/cors.js",
      "netlify/functions/_lib/auth.js", "netlify/functions/_lib/planRules.js", "netlify/functions/_lib/gifts.js", "netlify/functions/_lib/household.js",
      "netlify/functions/_lib/storeSubscriptions.js", "netlify/functions/_lib/trialPlanFirst.js", "netlify/functions/_lib/billingPlans.js",
      "netlify/functions/billing.js", "netlify/functions/trial-plan-first.js",
    ];
    const filter = [...((wf.match(/\n  pull_request:\n[\s\S]*?\n    paths:\n((?:\s+#[^\n]*\n|      - "[^"]+"\n)+)/) || [])[1] || "").matchAll(/- "([^"]+)"/g)].map((m) => m[1]);
    t.eq(PLANS_PATHS.filter((p) => !filter.includes(p)), [], `9a the pull_request path filter has the test, the plans' files and the server's enforcement (${filter.length} paths)`);
    t.ok(PLANS_PATHS.filter((p) => !p.includes("*")).every((p) => fs.existsSync(path.join(REPO, p))), "9b …each a file that exists (a renamed file would silently drop out of the filter)");
    // GitHub's path filter: "**" any depth, otherwise the exact path.
    const matches = (p, f) => (p.endsWith("/**") ? f.startsWith(p.slice(0, -2)) : p === f);
    const triggers = (files) => files.some((f) => filter.some((p) => matches(p, f)));
    const pr158 = fs.readFileSync(path.join(REPO, "tests", "fixtures", "pr158-changed-files.txt"), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    t.ok(pr158.length > 20 && pr158.includes("src/lib/trialPlanFirst.js") && pr158.includes("netlify/functions/_lib/freeBanks.js"), `9c the fixture is #158's changed-file list (${pr158.length} files)`);
    t.eq([triggers(pr158), pr158.filter((f) => filter.some((p) => matches(p, f))).length >= 5], [true, true], "9d #158 would have run the nightly, by several of its files");
    t.eq([triggers(["src/App.jsx"]), triggers(["netlify/functions/plaid.js"]), triggers(["netlify/functions/_lib/freeBanks.js"]), triggers(["README.md", "src/lib/locale.js"])], [true, true, true, false],
      "9e any change to src/App.jsx or the server's bank limit runs it; a change elsewhere does not");
    t.ok(!fs.existsSync(path.join(REPO, "e2e", "nightly", "touchesPlans.cjs")) && !/touchesPlans|\n  changes:|needs: changes/.test(wf), "9f no diff reader and no deciding job: the path filter alone decides");
    t.ok(/\n  walk:\n[\s\S]*?\n    if: github\.event\.action != 'labeled' \|\| github\.event\.label\.name == 'nightly-fire-drill'\n/.test(wf), "9g the walk itself runs on every event but a label other than nightly-fire-drill");
  }

  // ── 10. A label never cancels a running pull request run, except the fire drill (review round 1, MUST 3) ─────
  // A labeled event starts a run of the workflow even when no job will run. With one concurrency group per branch and
  // cancel-in-progress, that run cancelled the walk in progress. Here GitHub's own expressions are evaluated.
  {
    const expr = (src, ctx) => {   // a GitHub expression: ==, !=, &&, ||, format(), property access (missing = null)
      const js = src.replace(/!=/g, "!==").replace(/([^!=])==/g, "$1===").replace(/\b((?:github|needs|matrix)(?:\.[A-Za-z_]+)+)/g, (m) => m.replace(/\./g, "?."));
      let v;
      try { v = new Function("github", "needs", "matrix", "format", `return (${js});`)(ctx, {}, {}, (f, ...a) => f.replace(/\{(\d+)\}/g, (_, i) => String(a[i] ?? ""))); }
      catch (e) { return `<cannot evaluate ${src}: ${e.message}>`; }
      return v === undefined || v === null ? "" : v;
    };
    const tmpl = (s, ctx) => String(s).replace(/\$\{\{\s*([\s\S]*?)\s*\}\}/g, (_, e) => String(expr(e, ctx)));
    const group = (wf.match(/\nconcurrency:\n  group: ([^\n]+)\n  cancel-in-progress: true\n/) || [])[1] || "";
    const walkIf = (wf.match(/\n  walk:\n[\s\S]*?\n    if: ([^\n]+)\n/) || [])[1] || "false";
    const pr = (action, label, run_id) => ({ ref: "refs/pull/162/merge", run_id, event_name: "pull_request", event: { action, ...(label ? { label: { name: label } } : {}) } });
    const running = tmpl(group, pr("synchronize", null, 1001));
    t.ok(group.length > 0 && running.startsWith("nightly-e2e-refs/pull/162/merge"), `10a one group per pull request (${running})`);
    t.ok(tmpl(group, pr("labeled", "documentation", 1002)) !== running, "10b another label: a group of its own, so it cannot cancel the run in progress");
    t.eq(expr(walkIf, pr("labeled", "documentation", 1002)), false, "10c …and it walks nothing");
    t.eq([tmpl(group, pr("labeled", "nightly-fire-drill", 1003)), expr(walkIf, pr("labeled", "nightly-fire-drill", 1003))], [running, true], "10d the fire-drill label: the pull request's group (it replaces the run) and it walks");
    t.eq([tmpl(group, pr("opened", null, 1004)), tmpl(group, pr("reopened", null, 1005))], [running, running], "10e a new push, opening or reopening: the same group, so a newer run replaces an older one, as before");
    t.eq(tmpl(group, { ref: "refs/heads/main", run_id: 9, event_name: "schedule", event: {} }), "nightly-e2e-refs/heads/main", "10f the nightly on main: its own group, as before");
  }

  // ── 11. The website's plans are found by what is visible, not what is in the page (review round 1, SHOULD 5) ───
  {
    const block = (run.match(/kind === "plans-once"[\s\S]*?\n        return;\n/) || [""])[0];
    t.ok(block.length > 0 && /headline\.isVisible\(\)/.test(block) && !/\.count\(\)/.test(block), "11a the plans-once step waits on the headline being visible (isVisible), never on .count()");
  }

  // ── 12. The website's free plan: the server itself refuses a bank (review round 1, SHOULD 6) ─────────────────
  {
    const block = (run.match(/kind === "free-bank-line"[\s\S]*?\n        return;\n/) || [""])[0];
    t.ok(/authorization: `Bearer \$\{token\}`/.test(block) && /action: "create_link_token"/.test(block) && /refusal\.status !== 402 \|\| refusal\.error !== "plan_limit"/.test(block),
      "12a the bank step asks the server for a link token as the signed-in account and requires its free-plan refusal (402, plan_limit)");
    t.ok(/st\.linkTokens/.test(run) && /appLinkTokenRefused\(appTokens\)/.test(block), "12b …and the app's own request for one was refused the same way");
    const plaidSrc = read("netlify", "functions", "plaid.js");
    t.ok(/statusCode: 402, headers: CORS, body: JSON\.stringify\(\{ error: "plan_limit"/.test(plaidSrc), "12c (that is the refusal plaid.js sends)");
  }

  // ── 13. The walk's own probe never counts as the app's request (review round 2, MUST 1) ───────────────────────
  // The page's response listener saw every create_link_token, the walk's direct probe included, so the probe alone
  // could pass "the app's own request was refused". The probe is now tagged and left out, and the app's answers are
  // read (and checked) before the probe is sent.
  {
    const isApp = typeof R.isAppLinkTokenRequest === "function" ? R.isAppLinkTokenRequest : () => true;
    const refused = typeof R.appLinkTokenRefused === "function" ? R.appLinkTokenRefused : () => true;
    const req = (headers, body = { action: "create_link_token", country: "CA" }, url = "http://localhost:8888/api/plaid") => ({ url, headers, postData: JSON.stringify(body) });
    const app = req({ "content-type": "application/json", authorization: "Bearer a" });
    const probe = req({ "content-type": "application/json", authorization: "Bearer a", [String(R.PROBE_HEADER || "x-nightly-probe")]: "1" });
    t.eq([isApp(app), isApp(probe), isApp(req({}, { action: "exchange_public_token" })), isApp(req({}, undefined, "http://localhost:8888/api/beta"))], [true, false, false, false],
      "13a the listener keeps the app's link-token requests only: never the walk's tagged probe, another action or another route");
    t.ok(typeof R.PROBE_HEADER === "string" && R.PROBE_HEADER === R.PROBE_HEADER.toLowerCase() && R.PROBE_HEADER.length > 0, "13b the probe's tag is a lower-case header name (as Playwright reports request headers)");
    // What the listener would record if the app never asked: only the probe went by, and it was refused.
    const seenIfAppNeverAsked = [{ request: probe, status: 402, error: "plan_limit" }].filter((r) => isApp(r.request));
    t.eq([seenIfAppNeverAsked.length, refused(seenIfAppNeverAsked)], [0, false], "13c regression: the probe alone cannot satisfy the app-request check");
    t.eq([refused([{ status: 402, error: "plan_limit" }]), refused([{ status: 200, error: null }]), refused([])], [true, false, false], "13d the app's own request counts only when it was refused with 402 plan_limit");
    const block = (run.match(/kind === "free-bank-line"[\s\S]*?\n        return;\n/) || [""])[0];
    const checked = block.indexOf("appLinkTokenRefused(appTokens)"), probed = block.indexOf('fetch("/api/plaid"');
    t.ok(checked > 0 && probed > checked && /const appTokens = st\.linkTokens\.slice\(\);/.test(block), "13e the app's answers are copied and checked before the probe is sent");
    t.ok(/\[probeHeader\]: "1"/.test(block) && /isAppLinkTokenRequest\(\{ url: r\.url\(\), postData: q\.postData\(\), headers: q\.headers\(\) \}\)/.test(run), "13f the probe carries the tag, and the listener asks isAppLinkTokenRequest");
  }

  // ── 14. The plans' wait takes the first VISIBLE of "Not now" and the headline (review round 2, SHOULD 2) ─────
  {
    const block = (run.match(/kind === "plans-once"[\s\S]*?\n        return;\n/) || [""])[0];
    t.ok(/notNow\.or\(headline\)\.filter\(\{ visible: true \}\)\.first\(\)/.test(block) && !/notNow\.or\(headline\)\.first\(\)/.test(block), "14a a hidden element can no longer be taken ahead of a visible one");
  }

  // ── 15. The README says what a label does (review round 2, SHOULD 3) ─────────────────────────────────────────
  {
    const readme = read("e2e", "nightly", "README.md");
    t.ok(!/never starts or cancels a run/.test(readme) && /still starts a run of the workflow, but it walks nothing and cannot cancel a run in progress/.test(readme),
      "15a another label still starts a run (that walks nothing); the README no longer says it starts none");
  }

  t.summary("nightlyE2e.test");
})();
