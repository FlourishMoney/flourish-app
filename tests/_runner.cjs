// tests/_runner.cjs — minimal test runner for the MATH-LOCK suites.
//
// CJS so the suites are plain `node tests/x.test.cjs`; the lib modules are ESM, loaded via dynamic
// `await import()` inside each suite (package.json is not type:module). Each suite calls create() for
// its own isolated counters, asserts with exact values, and summary() sets process.exitCode on any
// failure so the CI gate (`npm run test:math`, chained with &&) fails the build.
"use strict";

function create() {
  let pass = 0, fail = 0;
  const fails = [];

  const fmt = (v) => {
    try { return JSON.stringify(v); } catch { return String(v); }
  };

  return {
    // Deep-equal via JSON — sufficient for the SCALARS and scalar-arrays the suites compare. CAVEAT
    // for future authors: JSON.stringify is key-order sensitive, drops `undefined` keys, and maps
    // NaN/Infinity → null, so eq() on object literals can false-pass/false-fail. Use approx() for
    // floats/NaN and ok() for object-shape checks; don't eq() rich objects.
    eq(actual, expected, msg) {
      if (fmt(actual) === fmt(expected)) pass++;
      else { fail++; fails.push(`${msg}\n      expected: ${fmt(expected)}\n      actual:   ${fmt(actual)}`); }
    },
    // Float-tolerant equality (for compound interest / rate math where exact decimal isn't meaningful).
    approx(actual, expected, tol, msg) {
      if (typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= tol) pass++;
      else { fail++; fails.push(`${msg}: expected ~${expected} (±${tol}), got ${fmt(actual)}`); }
    },
    ok(cond, msg) {
      if (cond) pass++;
      else { fail++; fails.push(msg); }
    },
    // Assert a function throws (or, with want=false, does NOT throw).
    throws(fn, msg, want = true) {
      let threw = false;
      try { fn(); } catch { threw = true; }
      if (threw === want) pass++;
      else { fail++; fails.push(`${msg}: expected ${want ? "throw" : "no throw"}, got ${threw ? "throw" : "no throw"}`); }
    },
    summary(label) {
      const total = pass + fail;
      if (fail === 0) {
        console.log(`  ✓ ${label}: ${pass}/${total} passed`);
      } else {
        console.log(`  ✗ ${label}: ${fail}/${total} FAILED`);
        for (const f of fails) console.log(`    • ${f}`);
        process.exitCode = 1;
      }
      return fail;
    },
  };
}

// Cents-based helpers — the scope mandates a cents helper for any compound/amortization math so
// float drift never accumulates into a wrong dollar. Exposed for suites that re-derive expected values.
const toCents = (dollars) => Math.round(Number(dollars) * 100);
const fromCents = (cents) => cents / 100;

module.exports = { create, toCents, fromCents };
