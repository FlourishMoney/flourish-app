// tests/aiGate.test.cjs — Step 8: with AI off, no coach call site reaches the network.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

function setFlag(val) {
  const store = new Map();
  if (val !== undefined) store.set("flourish_ai_coach_enabled", val);
  global.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null) } };
}

(async () => {
  const { aiEnabled, ensureAiEnabled } = await import("../src/lib/aiGate.js");

  setFlag(undefined); t.ok(aiEnabled(), "1a default (unset) → enabled");
  setFlag("1");       t.ok(aiEnabled(), "1b '1' → enabled");
  setFlag("0");       t.ok(!aiEnabled(), "1c '0' → disabled");

  setFlag("0"); t.throws(() => ensureAiEnabled(), "2a ensureAiEnabled throws when off");
  setFlag("1"); t.throws(() => ensureAiEnabled(), "2b does not throw when on", false);

  // THE Step-8 guarantee: a call site that guards with ensureAiEnabled cannot reach its fetch when off.
  setFlag("0");
  let reachedFetch = false;
  const gatedCallSite = () => { ensureAiEnabled(); reachedFetch = true; return "sent"; };
  t.throws(gatedCallSite, "3a gated call site throws with AI off");
  t.ok(!reachedFetch, "3b …and never reached the fetch");

  setFlag("1");
  reachedFetch = false;
  gatedCallSite();
  t.ok(reachedFetch, "3c with AI on, the call proceeds");

  // custom message preserved (the simulator's catch keys on "AI disabled")
  setFlag("0");
  let msg = "";
  try { ensureAiEnabled("AI disabled"); } catch (e) { msg = e.message; }
  t.eq(msg, "AI disabled", "4a custom message preserved");

  t.summary("aiGate");
})();
