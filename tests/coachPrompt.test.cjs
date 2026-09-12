// tests/coachPrompt.test.cjs — Step 4: coach rules merged (not weakened) + prompt-cache structure.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { TRUST_RULES, COACH_RULES, buildChatSystem, systemBlocks } =
    require("../netlify/functions/_lib/coachPrompt.js");

  // ── existing non-negotiable rules preserved (not weakened) ────────────────────────────────────
  t.ok(/Never invent or estimate dollar amounts/.test(TRUST_RULES), "1a number policy kept");
  t.ok(/UNTRUSTED_USER_DATA/.test(TRUST_RULES),                      "1b data-safety policy kept");
  t.ok(/FLOURISH_UPDATE block ONLY when the user/.test(TRUST_RULES), "1c FLOURISH_UPDATE guard kept");

  // ── §9 coach rules merged ─────────────────────────────────────────────────────────────────────
  t.ok(/Flourish calculates; you coach/.test(COACH_RULES), "2a rule 1 (calculate vs coach)");
  t.ok(/not a licensed adviser/.test(COACH_RULES),          "2b rule 4 (boundaries)");
  t.ok(/No praise, no scolding, no exclamation marks/.test(COACH_RULES), "2c rule 6 (tone)");
  t.ok(/Never mention Plaid/.test(COACH_RULES),             "2d rule 7 (never mention Plaid)");

  // ── prompt caching: stable prefix cached, per-user context NOT cached ─────────────────────────
  const blocks = buildChatSystem("BALANCE: $100; INCOME: $4000");
  t.ok(Array.isArray(blocks), "3a system is content blocks (cache-ready)");
  t.eq(blocks[0].cache_control && blocks[0].cache_control.type, "ephemeral", "3b stable block marked ephemeral");
  t.ok(/RULES/.test(blocks[0].text) && /calm, direct money coach/.test(blocks[0].text), "3c stable block holds intro + rules");
  t.ok(!/BALANCE/.test(blocks[0].text), "3d user context is NOT inside the cached block");
  t.eq(blocks[1].cache_control, undefined, "3e context block is NOT cached");
  t.ok(/BALANCE: \$100/.test(blocks[1].text), "3f context block carries the user data");

  const noCtx = buildChatSystem("");
  t.eq(noCtx.length, 1, "3g no context → a single block");
  t.eq(noCtx[0].cache_control && noCtx[0].cache_control.type, "ephemeral", "3h still cached");

  const sb = systemBlocks("STABLE", "VAR");
  t.eq(sb[0].cache_control.type, "ephemeral", "3i systemBlocks caches the stable part");
  t.eq(sb[1].cache_control, undefined,       "3j systemBlocks leaves the variable part uncached");
  t.eq(systemBlocks("only").length, 1,       "3k stable-only → one block");

  t.summary("coachPrompt");
})();
