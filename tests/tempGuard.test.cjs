// tests/tempGuard.test.cjs — THE LAST STEP OF THE GATE: no test leaves a temp folder behind.
// -----------------------------------------------------------------------------
// The browser tests left about 1,000 flourish-* folders in the system temp folder and filled this Mac's
// disk (2026-10-07). Every test now makes its folders through tests/_tmp.cjs, which removes them when
// the test's process ends, pass or fail. This checks:
//   1. no test calls fs.mkdtempSync itself (so every folder is one _tmp.cjs knows to remove);
//   2. _tmp.cjs really removes its folders: after a pass, a failing exit code, and an uncaught throw;
//   3. nothing named flourish-<this run>-* is left in the temp folder once the whole gate has run.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const TESTS = __dirname;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const t = create();

// ── 1. every temp folder goes through _tmp.cjs ──────────────────────────────────────────────────
{
  const direct = fs.readdirSync(TESTS).filter(f => /\.c?js$/.test(f) && f !== "_tmp.cjs" && f !== "tempGuard.test.cjs")
    .filter(f => /\bmkdtemp(?:Sync)?\s*\(/.test(strip(fs.readFileSync(path.join(TESTS, f), "utf8"))));
  t.eq(direct, [], "1a no test makes a temp folder itself; they all ask tests/_tmp.cjs");
  const users = fs.readdirSync(TESTS).filter(f => /\.c?js$/.test(f)).filter(f => /tempDir\(/.test(fs.readFileSync(path.join(TESTS, f), "utf8")) && f !== "_tmp.cjs" && f !== "tempGuard.test.cjs");
  t.ok(users.length >= 8, `1b the tests that need a folder use tempDir (${users.length})`);
}

// ── 2. _tmp.cjs removes its folders however the test ends ───────────────────────────────────────
{
  const run = `guardself${process.pid}`;
  const child = (ending) => spawnSync(process.execPath, ["-e", `
    const fs = require("fs"); const { tempDir } = require(${JSON.stringify(path.join(TESTS, "_tmp.cjs"))});
    const d = tempDir("selftest"); fs.writeFileSync(d + "/f.txt", "x"); fs.mkdirSync(d + "/sub"); console.log(d);
    ${ending}`], { env: { ...process.env, FLOURISH_TEST_RUN: run }, encoding: "utf8" });
  for (const [ending, why, code] of [["", "a passing test", 0], ["process.exitCode = 1;", "a failing test (exit code 1)", 1],
    ["throw new Error('boom');", "a test that throws", 1], ["Promise.reject(new Error('boom'));", "an unhandled rejection", 1]]) {
    const r = child(ending);
    const dir = (r.stdout || "").trim().split("\n")[0];
    t.ok(dir.includes(`flourish-${run}-selftest-`) && r.status === code && !fs.existsSync(dir),
      `2 after ${why}, its temp folder is gone (exit ${r.status})`);
  }
}

// ── 3. nothing from this gate run is left ───────────────────────────────────────────────────────
{
  const run = process.env.FLOURISH_TEST_RUN;
  const left = run ? fs.readdirSync(os.tmpdir()).filter(n => n.startsWith(`flourish-${run}-`)) : [];
  t.eq(left, [], run ? `3a this gate run (${run}) left no flourish-* folder in ${os.tmpdir()}` : "3a (run outside the gate: nothing to check)");
}

t.summary("tempGuard.test");
