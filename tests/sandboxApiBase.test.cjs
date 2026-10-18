// tests/sandboxApiBase.test.cjs
// -----------------------------------------------------------------------------
// A SANDBOX TEST BUILD MAY POINT THE STORE APP AT A LOCAL SERVER. A STORE BUILD NEVER CAN.
//
// A store build sends every request to https://flourishmoney.app, whose functions run Plaid's Production
// keys, so Plaid's Sandbox ("Platypus OAuth Bank") cannot be reached from it. For the Sandbox steps in
// docs/ops/PLAID-HOSTED-LINK.md (section 3), a debug build may set VITE_NATIVE_API_BASE to a local
// function server. build:native, the only way a store build is made (docs/ops/NATIVE-BUILDS.md), refuses
// to start while it is set, before and after the bundle is built, and never prints its value.
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs"); // removed when this test ends, pass or fail
const { create } = require("./_runner.cjs");
const { execFileSync } = require("node:child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "check-native-build.mjs");
const GOOD = { VITE_SUPABASE_URL: "https://example-project.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key-not-a-real-one" };
const LOCAL = "http://localhost:8888";

function runGuard(env, files = {}) {
  const dir = tempDir("sandbox-guard");
  try {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), body);
    }
    const args = [SCRIPT, ...(files["dist/assets/app.js"] !== undefined ? ["--artifact"] : ["--env"])];
    const base = { ...process.env };
    delete base.VITE_NATIVE_API_BASE;   // unset, not empty: Vite lets the shell's value, even "", win over .env files
    const out = execFileSync(process.execPath, args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...base, ...env, NODE_ENV: "production" } });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || "") + (e.stderr || "") };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  const t = create();
  const bundle = `const u=${JSON.stringify(GOOD.VITE_SUPABASE_URL)},k=${JSON.stringify(GOOD.VITE_SUPABASE_PUBLISHABLE_KEY)};`;

  t.eq([runGuard(GOOD).code, runGuard(GOOD, { "dist/assets/app.js": bundle }).code], [0, 0], "1a (control) without it, the store build check passes, before and after the bundle");
  let r = runGuard({ ...GOOD, VITE_NATIVE_API_BASE: LOCAL });
  t.ok(r.code !== 0 && /VITE_NATIVE_API_BASE is set/.test(r.out), "1b set in the shell: build:native refuses before building");
  t.ok(!r.out.includes(LOCAL), "1c …and does not print where it pointed");
  r = runGuard({ ...GOOD }, { ".env.local": `VITE_NATIVE_API_BASE=${LOCAL}\n` });
  t.ok(r.code !== 0, "1d set in an .env file Vite reads: refused too");
  r = runGuard({ ...GOOD, VITE_NATIVE_API_BASE: LOCAL }, { "dist/assets/app.js": bundle });
  t.ok(r.code !== 0, "1e and again after the bundle is built");
  t.eq(runGuard({ ...GOOD, VITE_NATIVE_API_BASE: "   " }).code, 0, "1f whitespace is not a value");

  const APP = fs.readFileSync(path.join(ROOT, "src", "App.jsx"), "utf8");
  const base = APP.slice(APP.indexOf("const API_BASE = (() => {"), APP.indexOf("})();", APP.indexOf("const API_BASE = (() => {")));
  t.ok(/const sandboxBase = String\(import\.meta\.env\?\.VITE_NATIVE_API_BASE \|\| ""\)\.trim\(\);/.test(base) && /if \(sandboxBase && isNativeApp\(\)\) return sandboxBase;\s*return isNativeApp\(\) \? "https:\/\/flourishmoney\.app" : "";/.test(base),
    "2a only a store app reads it, and without it a store app talks to https://flourishmoney.app");
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  t.ok(/^node scripts\/check-native-build\.mjs --env && vite build && .*check-native-build\.mjs --artifact$/.test(pkg.scripts["build:native"]), "2b build:native runs the check before and after the bundle");
  t.ok(/Use build:native, never build\./.test(fs.readFileSync(path.join(ROOT, "docs", "ops", "NATIVE-BUILDS.md"), "utf8")), "2c …and is how every store build is made");

  t.summary("sandboxApiBase.test");
})();
