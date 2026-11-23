// tests/review1122Round2.test.cjs
// -----------------------------------------------------------------------------
// ROUND 2 of the full-app review (2026-11-22: ChatGPT, Grok and Gemini on fix-review-1122 at 4032405).
//   N1 (the webhook takeover race) is in review1122Pay.test.cjs; N2 (holdings: identity, and the round where every
//   bank answers with nothing) is in review1122Bank.test.cjs and review1122Holdings.test.cjs, beside what they extend.
// Here:
//   1  the three lines approved on 2026-11-22, word for word, and where each is shown
//   2  P9-07 (was "partly"): the AI Coach switch waits for the server on BOTH ways of turning it on
//   3  Gemini's low (NOT REAL): the household save already passes on a failed save of the person's own keys
//   4  P2-02 (was "partly"): the purchase guards read the same dates the plan check does
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const { loadApp, describe } = require("./_renderApp.cjs");
const REPO = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const fnText = (name) => { const at = APP.indexOf(`\nfunction ${name}(`); if (at < 0) return ""; const next = APP.indexOf("\nfunction ", at + 10); return APP.slice(at, next < 0 ? undefined : next); };
const safe = (fn) => { try { return fn(); } catch (e) { return `THREW ${String(e && e.message).slice(0, 80)}`; } };

const DISCONNECT = "Disconnect {Bank}? We'll remove its accounts, transactions, card debts and investments from flourish.";
const OVER_100 = "This payment would take over 100 years to pay off the debt. Try a bigger payment to see a payoff date.";
const AI_FAILED = "We couldn't turn on the AI coach just now. Try again in a moment.";

(async () => {
  const t = create();
  let W = {};
  try { W = await import("../src/lib/reviewWords.js"); } catch { W = {}; }
  const F = await import("../src/lib/financialCalculations.js");
  const settings = fnText("Settings");

  // ── 1a. Disconnecting a bank ───────────────────────────────────────────────────────────────────
  {
    const said = (bank) => safe(() => `${W.bankDisconnectTitle(bank)} ${W.BANK_DISCONNECT_BODY}`);
    t.eq(said("Tangerine"), DISCONNECT.replace("{Bank}", "Tangerine"), "W1a the confirm reads, word for word: Disconnect Tangerine? We'll remove its accounts, transactions, card debts and investments from flourish.");
    t.eq(said("RBC Royal Bank"), DISCONNECT.replace("{Bank}", "RBC Royal Bank"), "W1b …with whatever the bank is called");
    t.ok(/confirmModal\(\{title:bankDisconnectTitle\(b\.institution_name \|\| "this bank"\),message:BANK_DISCONNECT_BODY,confirmLabel:"Disconnect",destructive:true\}\)/.test(settings),
      "W1c Settings asks with exactly that title and body before it disconnects anything");
    t.eq((APP.match(/title:`Disconnect \$\{/g) || []).length, 0, "W1d no other disconnect question is left with the old title alone");
    const handler = settings.slice(settings.indexOf("bankDisconnectTitle("), settings.indexOf("bankDisconnectTitle(") + 3200);
    t.ok(/onDisconnectBank\?\.\(\); return;/.test(handler) && /dropBankData\(prev, a => a\._item === b\.item_id\)/.test(handler), "W1e the same question covers both ways a bank goes: the last bank, and one of several");
  }

  // ── 1b. A debt that would take over 100 years ──────────────────────────────────────────────────
  {
    t.eq(W.DEBT_OVER_100_YEARS, OVER_100, "W2a the approved line, word for word");
    let A = {};
    try { A = loadApp(["debtResultSentence"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A.debtResultSentence) {
      const sim = (o) => F.simulateDebtPayoffBoost(o);
      const both = sim({ balance: 20000, apr: 0.99, currentPayment: 20, extraPayment: 1 });       // 176 years, and 160
      t.eq(A.debtResultSentence(both, 1, 20), OVER_100, "W2b $20,000 at 0.99% paying $21 a month (about 160 years): the approved line, and nothing else");
      const underwater = sim({ balance: 20000, apr: 24, currentPayment: 100, extraPayment: 301 });  // $400 of interest a month; $401 covers it by $1
      t.ok(underwater.boosted.beyondHorizon === true || Number.isFinite(underwater.boosted.monthsToPayoff), "W2c (a payment that barely covers the interest either clears in time or is marked as over 100 years)");
      if (underwater.boosted.beyondHorizon) t.eq(A.debtResultSentence(underwater, 301, 100), OVER_100, "W2d today's payment does not cover the interest and the bigger one would take over 100 years: the same line");
      const never = sim({ balance: 20000, apr: 24, currentPayment: 100, extraPayment: 50 });
      t.ok(/does not cover the interest, so the balance is not paid off\.$/.test(A.debtResultSentence(never, 50, 100)), "W2e a payment that does not cover the interest keeps its own line: that reason is true there");
      const clears = sim({ balance: 20000, apr: 0.99, currentPayment: 20, extraPayment: 200 });
      t.ok(/pays it off by /.test(A.debtResultSentence(clears, 200, 20)) && !A.debtResultSentence(clears, 200, 20).includes("100 years"), "W2f a bigger payment that does clear the debt still gets its payoff date");
      const usual = sim({ balance: 1000, apr: 12, currentPayment: 100, extraPayment: 50 });
      t.ok(!A.debtResultSentence(usual, 50, 100).includes("100 years"), "W2g the usual case is untouched");
    } else t.ok(false, "W2b What-If's sentence could not be loaded");
  }

  // ── 1c and 2. The AI Coach could not be turned on ──────────────────────────────────────────────
  {
    t.eq(W.AI_TURN_ON_FAILED, AI_FAILED, "W3a the approved line, word for word");
    const modal = settings.slice(settings.indexOf("{pendingAIConsent&&<AIConsentModal"), settings.indexOf("{pendingAIConsent&&<AIConsentModal") + 700);
    t.ok(/setAiTurnOnFailed\(ok === false\);\s*if \(ok === false\) return;/.test(modal) && /failed=\{aiTurnOnFailed\}/.test(modal), "W3b Enable AI Coach that could not reach the server: the sheet stays open and is told to show the line");
    const sheet = fnText("AIConsentModal");
    t.ok(/function AIConsentModal\(\{ onEnable, onCancel, failed = false \}\)/.test(sheet) && /\{failed&&<div role="alert"[^>]*>\{AI_TURN_ON_FAILED\}<\/div>\}/.test(sheet), "W3c the sheet shows it, as an alert a screen reader announces");
    t.ok(/\{aiTurnOnFailed&&!pendingAIConsent&&<div role="alert"[^>]*>\{AI_TURN_ON_FAILED\}<\/div>\}/.test(settings), "W3d the switch itself shows it when it could not turn on (the already-consented way)");
    const toggle = settings.slice(settings.indexOf('<Toggle label="AI Coach"'), settings.indexOf('<Toggle label="AI Coach"') + 1500);
    t.ok(/onChange=\{async \(v\)=>\{/.test(toggle) && /setAiTurnOnFailed\(false\);/.test(toggle), "W3e each new try clears the line first");
    t.eq((APP.match(/AI_TURN_ON_FAILED/g) || []).length, 3, "W3f the line is shown in those two places only (and imported once)");
    t.ok(!/\[WORDS:/.test(APP), "W3g no placeholder is left in the app");
  }

  // ── 3. Gemini's low: a failed save of the person's own keys is not reported as a good save ─────
  {
    const i = APP.indexOf("const saveHousehold = async ("); const j = APP.indexOf("\n  };", i);
    const save = APP.slice(i, j);
    const good = save.match(/\{ ok: true \}/g) || [];
    t.eq(good.length, 1, "GL-a the household save has one place that answers \"saved\"");
    t.ok(/return personalErr \? \{ ok: false, error: personalErr \} : \{ ok: true \};/.test(save), "GL-b …and it answers that only when the person's own keys saved too; otherwise the answer is a failure that carries their error");
    t.ok(/if \(!mine\.ok\) \{ personalErr = mine\.error \|\| new Error\("personal_keys"\);/.test(save), "GL-c the error is kept the moment that save fails");
    // (Live main, eec2c36, has the same return at src/App.jsx:18587: nothing was being dropped there either.)
  }

  // ── 4. P2-02: the purchase guards read the dates the plan check reads ──────────────────────────
  {
    const { isPaidSubscription } = require("../netlify/functions/_lib/planRules.js");
    const { holdsHousehold } = require("../netlify/functions/_lib/stripeLive.js");
    const DAY = 86400000, now = Date.now();
    const old = { provider: "stripe", status: "active", current_period_end: null, plan_key: "monthly", last_event_at: new Date(now - 60 * DAY).toISOString(), updated_at: new Date(now - 60 * DAY).toISOString() };
    t.eq([isPaidSubscription(old, now), holdsHousehold(old, isPaidSubscription)], [false, false], "P2-02s a website row with no paid-to date, silent for 60 days: not paid, and it no longer blocks a new purchase");
    const { last_event_at, updated_at, plan_key, ...bare } = old;
    t.eq(isPaidSubscription(bare, now), true, "P2-02t (read WITHOUT its dates the same row still counted, which is why every guard must read them)");
    const billing = read("netlify/functions/billing.js"), hook = read("netlify/functions/stripe-webhook.js");
    const reads = [...billing.matchAll(/from\("subscriptions"\)\.select\("([^"]+)"\)/g), ...hook.matchAll(/from\("subscriptions"\)\.select\("([^"]+)"\)/g)].map((m) => m[1]);
    const decides = reads.filter((cols) => /\bstatus\b/.test(cols) && /\bcurrent_period_end\b/.test(cols) && !/^cancel_at_period_end/.test(cols));
    const stripeSide = decides.filter((cols) => !/^provider, status, current_period_end$/.test(cols) && !/^user_id, last_event_at/.test(cols));
    t.ok(stripeSide.length >= 4 && stripeSide.every((cols) => /\blast_event_at\b/.test(cols) && /\bupdated_at\b/.test(cols) && /\bplan_key\b/.test(cols)),
      `P2-02u every read that decides "is this website subscription live" takes plan_key, last_event_at and updated_at (${stripeSide.length} reads)`);
  }

  t.summary("review1122Round2");
})().catch((e) => { console.error(e); process.exit(1); });
