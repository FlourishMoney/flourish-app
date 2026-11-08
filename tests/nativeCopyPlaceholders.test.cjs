// tests/nativeCopyPlaceholders.test.cjs
// -----------------------------------------------------------------------------
// NO STORE ARCHIVE FROM A PLACEHOLDER (2026-11-08). `npm run build:native` refuses a "[WORDS: id]" placeholder,
// but an Xcode or Android Studio archive could still be made after a plain `npm run build && npx cap sync`, and
// neither Xcode nor Gradle runs the check. Capacitor runs package.json's "capacitor:copy:before" before every
// `cap copy` and `cap sync` (8.x, tasks/copy.js), and a hook that fails stops the copy. This runs Capacitor's own
// hook runner on a project with and without a placeholder.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { tempDir } = require("./_tmp.cjs");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

(async () => {
  const t = create();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  t.eq(pkg.scripts["capacitor:copy:before"], "node scripts/check-pending-words.mjs dist", "1a cap copy and cap sync check dist for placeholders first");
  const cliCopy = fs.readFileSync(require.resolve("@capacitor/cli/dist/tasks/copy.js"), "utf8");
  const cliSync = fs.readFileSync(require.resolve("@capacitor/cli/dist/tasks/sync.js"), "utf8");
  t.ok(/runHooks\)\(config, platformName, config\.app\.rootDir, 'capacitor:copy:before'\)/.test(cliCopy), "1b this Capacitor runs the hook before it copies");
  t.ok(/copy_1\.copy\)\(config, platformName/.test(cliSync), "1c …and sync copies through the same task");

  const { runPlatformHook } = require("@capacitor/cli/dist/common.js");
  const project = (content) => {
    const dir = tempDir("capcopy");
    fs.mkdirSync(path.join(dir, "dist"));
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.copyFileSync(path.join(ROOT, "scripts", "check-pending-words.mjs"), path.join(dir, "scripts", "check-pending-words.mjs"));
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", scripts: { "capacitor:copy:before": pkg.scripts["capacitor:copy:before"] } }));
    fs.writeFileSync(path.join(dir, "dist", "index.js"), content);
    return dir;
  };
  const config = (dir) => ({ app: { rootDir: dir, webDirAbs: path.join(dir, "dist"), extConfig: {} } });
  const quiet = async (fn) => { const w = process.stderr.write; process.stderr.write = () => true; try { return await fn(); } finally { process.stderr.write = w; } };
  const run = (dir) => quiet(() => runPlatformHook(config(dir), "ios", dir, "capacitor:copy:before").then(() => "copied", (e) => String(e.message)));

  const held = await run(project('const s = "[WORDS: balance-live]";'));
  t.ok(/capacitor:copy:before hook on ios failed with error code: 1/.test(held), "2a a dist with a placeholder: the copy is refused");
  t.eq(await run(project('const s = "Bank balances now show when they were last updated.";')), "copied", "2b a dist without one copies as before");

  t.summary("NATIVE COPY PLACEHOLDERS");
})();
