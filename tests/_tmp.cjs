// tests/_tmp.cjs — every temp folder a test makes, removed when that test's process ends.
// -----------------------------------------------------------------------------
// The browser tests used to leave a copy of the built site in the system temp folder on every run,
// and about 1,000 of them filled this Mac's disk (2026-10-07). A test now asks for a folder here, and
// the folder is removed when the process exits: after a pass, after a failure (a failing suite sets
// process.exitCode, and an uncaught throw or rejection still fires "exit"), and on Ctrl-C or SIGTERM.
//
// Names are flourish-<run>-<name>-XXXXXX. <run> is FLOURISH_TEST_RUN, set once for a whole gate run
// (package.json test:math), so tests/tempGuard.test.cjs can check that nothing from THIS run is left,
// without being confused by another run going on at the same time. A test run on its own uses its pid.
// No test calls fs.mkdtempSync itself; tempGuard.test checks that too.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const RUN = (process.env.FLOURISH_TEST_RUN || `p${process.pid}`).replace(/[^\w-]/g, "");
const made = new Set();

function tempDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `flourish-${RUN}-${String(name).replace(/[^\w-]/g, "")}-`));
  made.add(dir);
  return dir;
}

function removeTempDirs() {
  for (const dir of made) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort at exit */ }
  }
  made.clear();
}

process.on("exit", removeTempDirs);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(sig, () => { removeTempDirs(); process.exit(128 + (sig === "SIGINT" ? 2 : sig === "SIGTERM" ? 15 : 1)); });
}

module.exports = { tempDir, removeTempDirs, RUN };
