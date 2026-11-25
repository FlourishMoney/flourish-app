// e2e/nightly/touchesPlans.cjs
// -----------------------------------------------------------------------------
// DOES THIS PULL REQUEST CHANGE THE PLANS? (the nightly's first job, 2026-11-25). Free v1 (PR #158) changed the
// website's plans screen and no pull request run of the nightly saw it: the nightly broke the next night. So a pull
// request runs the nightly when it changes the test itself, the plans' rules and words (src/lib/trialPlanFirst.js,
// src/lib/upgradeFlow.js, src/lib/freeWords.js), or the plans screens in src/App.jsx. GitHub's path filter is per file
// and App.jsx is most of the app, so for App.jsx this reads the diff: a change inside UpgradeScreen, StorePaywall or
// Paywall, or a changed line that names how the app decides to show them. Every night and by hand, it always runs.
// Writes run=true|false to GITHUB_OUTPUT.
// -----------------------------------------------------------------------------
"use strict";

const ALWAYS = [/^e2e\/nightly\//, /^\.github\/workflows\/nightly-e2e\.yml$/, /^src\/lib\/(trialPlanFirst|upgradeFlow|freeWords)\.js$/];
// The plans screens: a hunk whose enclosing function (git's hunk header) is one of these.
const PLAN_FUNCTION = /^(?:export\s+(?:default\s+)?)?function\s+(UpgradeScreen|StorePaywall|Paywall)\b/;
// A changed line anywhere in App.jsx that names the plans, or how the app decides to show them.
const PLAN_MARKER = /UpgradeScreen|StorePaywall|<Paywall\b|plansRequired|plansStageNow|plansFirstStage|freePlansClose|PLANS_DELETE_LABEL|data-plans-|trialfirst-plans|free-plans-|UPGRADE_COPY|PAYWALL_COPY|showUpgrade|openUpgrade/;

/** True when a diff of src/App.jsx changes the plans screens or where the app decides to show them. */
function appDiffTouchesPlans(diff) {
  let inPlans = false;
  for (const line of String(diff || "").split("\n")) {
    if (line.startsWith("@@")) { inPlans = PLAN_FUNCTION.test(line.replace(/^@@[^@]*@@\s?/, "")); continue; }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if ((line[0] === "+" || line[0] === "-") && (inPlans || PLAN_MARKER.test(line))) return true;
  }
  return false;
}

/** Should the walk run? event: GitHub's event name; files: the pull request's changed paths; appDiff: its App.jsx diff. */
function shouldRun({ event, action = "", label = "", files = [], appDiff = "" }) {
  if (event !== "pull_request") return true;
  if (action === "labeled") return label === "nightly-fire-drill";
  if (files.some((f) => ALWAYS.some((re) => re.test(f)))) return true;
  return files.includes("src/App.jsx") && appDiffTouchesPlans(appDiff);
}

module.exports = { shouldRun, appDiffTouchesPlans };

if (require.main === module) {
  const { execFileSync } = require("child_process");
  const fs = require("fs");
  const event = process.env.GITHUB_EVENT_NAME || "";
  let files = [], appDiff = "";
  if (event === "pull_request") {
    const range = `${process.env.BASE_SHA}...${process.env.HEAD_SHA || "HEAD"}`;
    const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    files = git(["diff", "--name-only", range]).split("\n").filter(Boolean);
    if (files.includes("src/App.jsx")) appDiff = git(["diff", range, "--", "src/App.jsx"]);
  }
  const run = shouldRun({ event, action: process.env.EVENT_ACTION || "", label: process.env.EVENT_LABEL || "", files, appDiff });
  console.log(run ? `✓ the nightly runs (${event}${files.length ? `, ${files.length} file(s) changed` : ""})` : "– the nightly is not needed: this pull request does not change the plans or the test");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
}
