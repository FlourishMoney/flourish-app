// tests/sentryRelease.test.cjs
// -----------------------------------------------------------------------------
// EVERY EVENT MUST CARRY THE DEPLOY IT CAME FROM.
//
// Sentry's Releases page stays empty until events arrive with a `release`. Without it, an error
// cannot be tied to a deploy: you know something broke, not which build broke it. The SHA is
// already baked at build time (vite.config.js reads Netlify's COMMIT_REF in production), so it is
// the natural release id — and it is the same string the app prints as "Build <sha>" in Settings,
// which is how the founder checks the two agree.
//
// A local build with no SHA must NOT create a release: "unknown" on the Releases page is worse than
// an honest absence, because it looks like a deploy that never happened.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "errorReporting.js"), "utf8");
  const vite = fs.readFileSync(path.join(__dirname, "..", "vite.config.js"), "utf8");

  // ── 1. the release reaches Sentry.init ───────────────────────────────────────────────────────
  const init = src.slice(src.indexOf("Sentry.init({"), src.indexOf("_sentry = Sentry"));
  t.ok(init.length > 0, "1a Sentry.init is where it was");
  t.ok(/release:/.test(init), "1b init sets a release — without one the Releases page stays empty");
  t.ok(/buildRelease\(\)/.test(init), "1c …from the build SHA, not a hand-typed version");

  // ── 2. the SHA is a real one or nothing ─────────────────────────────────────────────────────
  const fn = src.slice(src.indexOf("function buildRelease()"), src.indexOf("export async function initErrorReporting"));
  t.ok(/VITE_BUILD_SHA/.test(fn), "2a the release is the baked build SHA");
  t.ok(/"unknown"/.test(fn) && /"dev"/.test(fn), "2b …and a placeholder SHA is refused, so no junk release is created");
  t.ok(/\? sha : null/.test(fn), "2c …by returning null rather than a string");

  // ── 3. production actually has a SHA to bake ────────────────────────────────────────────────
  // Netlify sets COMMIT_REF on every build, so the production bundle always carries a real SHA.
  t.ok(/COMMIT_REF/.test(vite), "3a vite takes the SHA from Netlify's COMMIT_REF");
  t.ok(/'import\.meta\.env\.VITE_BUILD_SHA': JSON\.stringify\(BUILD_SHA\)/.test(vite),
    "3b …and bakes it in statically, so the runtime read cannot be undefined in a real build");

  // ── 4. nothing secret is introduced ─────────────────────────────────────────────────────────
  t.ok(!/SENTRY_AUTH_TOKEN|sntrys_|sntryu_/.test(src), "4a no Sentry token is referenced — the release needs no new secret");

  // ── 5. the environment says which Netlify build sent it (2026-10-15) ─────────────────────────
  // The build mode is "production" on every Netlify build, so a deploy-preview crash used to report as a
  // production error. Netlify's CONTEXT is baked in at build time and becomes the environment.
  t.ok(/environment: sentryEnvironment\(import\.meta\.env\.VITE_DEPLOY_CONTEXT, import\.meta\.env\.MODE\),/.test(init) && !/environment: import\.meta\.env\.MODE/.test(init), "5a the environment is chosen by sentryEnvironment(), not the bare build mode");
  t.ok(/const DEPLOY_CONTEXT = \(process\.env\.CONTEXT \|\| ''\)\.trim\(\)/.test(vite) && /'import\.meta\.env\.VITE_DEPLOY_CONTEXT': JSON\.stringify\(DEPLOY_CONTEXT\)/.test(vite),
    "5b vite bakes Netlify's CONTEXT into the bundle at build time");
  {
    const E = await import("../src/lib/errorReporting.js").catch(() => null);
    if (E && E.sentryEnvironment) {
      t.eq(["production", "deploy-preview", "branch-deploy", "", "dev", undefined].map(c => E.sentryEnvironment(c, "production")),
        ["production", "deploy-preview", "branch-deploy", "production", "production", "production"],
        "5c production, deploy-preview and branch-deploy are tagged separately; a native or local build keeps the build mode");
      t.eq(E.sentryEnvironment("", "development"), "development", "5d …so local development stays \"development\"");
    } else {
      t.ok(/export function sentryEnvironment\(context, mode\)/.test(src)
        && /SENTRY_CONTEXTS\.includes\(context\) \? context : mode/.test(src), "5c the environment is the Netlify context when it is one of the three, the build mode otherwise");
    }
  }
  t.ok(!/SENTRY_AUTH_TOKEN|sntrys_|sntryu_/.test(vite), "5e no Sentry token in the build config either: no new secret");

  t.summary("sentryRelease.test");
})();
