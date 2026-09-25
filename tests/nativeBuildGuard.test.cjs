// tests/nativeBuildGuard.test.cjs
// -----------------------------------------------------------------------------
// A STORE BUILD WITHOUT ITS CONFIGURATION MUST NOT GET AS FAR AS A PHONE.
//
// iOS 1.0.0 (526891) and Android 1.0.0 (2) shipped on 2026-09-25 built in a shell with no VITE_*
// variables. Vite does not treat that as an error: it replaces import.meta.env.VITE_SUPABASE_URL
// with undefined, the build succeeds, the bundle is a normal size, and `cap sync` copies it into
// the app. On the phone, createClient(undefined, undefined) throws "supabaseUrl is required" while
// the module graph is still evaluating — before React mounts — so the screen is white, nothing is
// tappable, and nothing is logged anywhere a person would look.
//
// Two defences, tested here by RUNNING them rather than by reading them:
//   the build guard, which refuses to produce such a build;
//   the boot fallback, which turns the white screen into a sentence if one ever exists.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { execFileSync } = require("node:child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "check-native-build.mjs");
const MAIN = fs.readFileSync(path.join(ROOT, "src", "main.jsx"), "utf8");

// Run the guard in a throwaway directory so the repo's own .env files cannot make it pass.
function runGuard(env, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-"));
  try {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), body);
    }
    const args = [SCRIPT, ...(files["dist/assets/app.js"] !== undefined ? ["--artifact"] : ["--env"])];
    const out = execFileSync(process.execPath, args, {
      cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env, NODE_ENV: "production" },
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || "") + (e.stderr || "") };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const URL_V = "https://example-project.supabase.co";
const KEY_V = "test-publishable-key-not-a-real-one";
const GOOD = { VITE_SUPABASE_URL: URL_V, VITE_SUPABASE_PUBLISHABLE_KEY: KEY_V };

(async () => {
  const t = create();

  // ── 1. the guard refuses the build that shipped ──────────────────────────────────────────────
  {
    const r = runGuard({ VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" });
    t.ok(r.code !== 0, "1a an empty shell fails the check — the exact case that shipped");
    t.ok(/VITE_SUPABASE_URL/.test(r.out), "1b …and the message names the variable that is missing");
    t.ok(/white screen/i.test(r.out), "1c …and says what it would have done to a phone");
  }
  {
    const r = runGuard({ ...GOOD, VITE_SUPABASE_PUBLISHABLE_KEY: "" });
    t.ok(r.code !== 0, "1d one of the two missing is still a failure");
    t.ok(/VITE_SUPABASE_PUBLISHABLE_KEY/.test(r.out) && !/MISSING\s+VITE_SUPABASE_URL/.test(r.out),
      "1e …and only the missing one is named");
  }
  {
    const r = runGuard({ ...GOOD, VITE_SUPABASE_URL: "   " });
    t.ok(r.code !== 0, "1f whitespace is not a value");
  }
  {
    const r = runGuard(GOOD);
    t.eq(r.code, 0, "1g (control) both set passes, so the guard is not simply always failing");
  }

  // ── 2. it never prints a value ───────────────────────────────────────────────────────────────
  {
    const r = runGuard(GOOD);
    t.ok(!r.out.includes(URL_V), "2a the URL is not printed, only its name");
    t.ok(!r.out.includes(KEY_V), "2b nor is the key — this output goes into CI logs");
    t.ok(/SET/.test(r.out), "2c it reports SET, which is what a log may carry");
  }

  // ── 3. the artifact check catches a variable that was set but did not reach the bundle ───────
  // A typo'd name, the wrong mode, or an .env outside Vite's root all look like a healthy build.
  {
    const r = runGuard(GOOD, { "dist/assets/app.js": `const u=${JSON.stringify(URL_V)},k=${JSON.stringify(KEY_V)};` });
    t.eq(r.code, 0, "3a a bundle containing both values passes");
  }
  {
    const r = runGuard(GOOD, { "dist/assets/app.js": "const u=void 0,k=void 0;" });
    t.ok(r.code !== 0, "3b a bundle where they were replaced by undefined fails, though the env is fine");
    t.ok(/NOT IN BUNDLE/.test(r.out), "3c …and says which one never arrived");
  }
  {
    const r = runGuard(GOOD, { "dist/assets/app.js": `const u=${JSON.stringify(URL_V)};` });
    t.ok(r.code !== 0, "3d one of the two reaching the bundle is not enough");
  }

  // ── 4. the build cannot be run for a store without the guard ─────────────────────────────────
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  t.ok(/check-native-build\.mjs --env/.test(pkg.scripts["build:native"] || ""),
    "4a build:native checks before building");
  t.ok(/check-native-build\.mjs --artifact/.test(pkg.scripts["build:native"] || ""),
    "4b …and checks the artifact after");
  const ship = fs.readFileSync(path.join(ROOT, "scripts", "ship-ios.sh"), "utf8");
  t.ok(/npm run build:native/.test(ship), "4c the iOS ship script uses it");
  t.ok(!/VITE_BUILD_SHA="\$SHA" npm run build \|\|/.test(ship), "4d …and no longer the unguarded build");

  // ── 5. the boot fallback: a module-eval throw must still show something ──────────────────────
  // A React error boundary cannot help here. It is a component, so it has to be rendered to catch
  // anything, and a static `import App` throws before the file that renders it runs at all.
  t.ok(!/^import App/m.test(MAIN), "5a App is not a static import any more");
  t.ok(/import\('\.\/App\.jsx'\)/.test(MAIN), "5b it is imported at runtime, inside a promise");
  t.ok(/\.catch\(\(error\) => \{/.test(MAIN), "5c …which is caught");
  t.ok(/root\.render\(<BootFailure \/>\)/.test(MAIN), "5d …and renders a screen instead of nothing");
  t.ok(/Something went wrong, please restart/.test(MAIN), "5e the wording Amanda asked for");
  t.ok(/captureError\(error, \{ area: "boot" \}\)/.test(MAIN), "5f and the failure is reported, not just shown");
  // The fallback must not depend on anything that might be the thing that broke.
  const fb = MAIN.slice(MAIN.indexOf("function BootFailure"), MAIN.indexOf("// App is imported at RUNTIME"));
  t.ok(!/\bC\.|from ['"]\.\//.test(fb), "5g it uses no theme, component or import of its own");
  t.ok(/ErrorBoundary clearState=\{clearState\}/.test(MAIN),
    "5h the render-time boundary still runs, and gets clearState passed in rather than importing it");

  t.summary("nativeBuildGuard.test");
})();
