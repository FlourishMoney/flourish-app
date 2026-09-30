// tests/round3Fixes.test.cjs
// -----------------------------------------------------------------------------
// ROUND-3 REVIEW FIXES (account deletion, item 3, is deleteAccountFn.test).
//
//   1. The coach explains and compares; it never directs. The listing promises it "doesn't make
//      decisions for you", and the prompts told it to lead with the action, name the category to cut
//      and give an affordable / not affordable verdict.
//   2. The weekly check-in asks the coach to explain one pattern, and promises no score change.
//   4. After the Plaid tokens move server-side, the device copies are removed.
//   5. The not-advice line sits on Meet, the check-in sheet and the demo coach.
//   6. The unlabelled icon buttons have names; the tappable cards work from the keyboard; the active
//      tab says it is the current page.
//   7. Native PremiumGate: one neutral line (nativeParity.test holds the copy).
//   8. The App Review account opens on the sample household, matched by a hash of its email.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadApp, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const slice = (from, len) => { const i = APP.indexOf(from); return i < 0 ? "" : APP.slice(i, i + len); };
const fnBody = (sig) => { const i = APP.indexOf(sig); return i < 0 ? "" : APP.slice(i, APP.indexOf("\n}\n", i)); };

(async () => {
  const t = create();

  // ── 1. The coach explains; it does not direct ────────────────────────────────────────────────
  {
    const P = require("../netlify/functions/_lib/coachPrompt.js");
    const DIRECTIVE = /which category to cut|most protective concrete action|ONE concrete next step|help them decide|prioritize what needs attention|one small next step/i;
    t.eq([P.COACH_RULES, P.CHAT_INTRO, P.buildCheckinSystem("x")[0].text].filter((x) => DIRECTIVE.test(x)).length, 0,
      "1a the server prompts no longer tell the coach to pick the action, the category or the next step");
    t.ok(/Explain, don't direct/.test(P.COACH_RULES) && /ask the user what they want/i.test(P.COACH_RULES), "1b rule 3: explain, compare the computed trade-offs, ask what the user wants");
    t.ok(/10\. Purchases[^\n]*Give no verdict[^\n]*"Safe to spend after it"|10\. Purchases[^\n]*"Safe to spend after it"[^\n]*Give no verdict/.test(P.COACH_RULES),
      "1b2 the no-verdict purchase rule is in the server's rules, where it has instruction weight (the app's context is data)");
    t.ok(/without adding them up/.test(P.COACH_RULES), "1b3 rule 9 quotes the snapshot's lines rather than totalling them");
    t.ok(/You do not make decisions for them/.test(P.CHAT_INTRO), "1c the intro says the decision is the user's");
    t.ok(!/GST\/HST credit/.test(P.COACH_RULES), "1d rule 4 no longer names the retired GST/HST credit");
    t.ok(/explain one pattern in this week's numbers/.test(P.buildCheckinSystem("x")[0].text), "1e the check-in system explains one pattern");

    const coach = fnBody("function AICoach(");
    t.ok(coach.length > 5000, "1f (the in-app coach prompt was read)");
    t.eq((coach.match(/Be decisive|Lead with the action|act now|ELIGIBLE|ARE REQUIRED|it's affordable|isn't affordable|Do NOT recommend buying|what needs attention first/g) || []), [],
      "1g the in-app prompt has no \"be decisive\", \"act now\", ELIGIBLE / REQUIRED, affordability verdict or \"what needs attention first\"");
    t.ok(/may be relevant; check eligibility at canada\.ca/.test(coach) && /check eligibility at irs\.gov/.test(coach), "1h programs read \"may be relevant; check eligibility at canada.ca / irs.gov\"");
    t.ok(/Explain, don't direct\./.test(coach) && /Give no verdict/.test(coach), "1i the role and the affordability rule explain and compare");
    t.ok(!/what needs attention first/.test(APP), "1j no welcome or feature copy promises to say what needs attention first");

    const DE = await import("../src/lib/decisionEngine.js");
    const D = await import("../src/lib/demoFixture.js");
    const TODAY = new Date("2026-09-29T12:00:00");
    const d = { accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA"), incomes: D.buildDemoIncomes(TODAY, "CA"),
      bills: D.buildDemoBills(TODAY, "CA"), transactions: D.buildDemoTxns(TODAY, "CA"), profile: D.demoProfileFor("CA") };
    t.eq(DE.coachPurchaseLine(d, "Can I afford a $600 phone?", TODAY),
      "- Purchase in the user's latest message: $600 | Safe to spend after it (computed by Flourish): $1,344",
      "1k a purchase question carries the amount and what Flourish computes is left ($1,944 less $600)");
    t.eq(DE.coachPurchaseLine(d, "Can I afford a $2,500 laptop?", TODAY).endsWith("-$556"), true, "1l …negative when it goes past safe to spend");
    t.eq(DE.coachPurchaseLine(d, "How is my spending this month?", TODAY), "", "1m no line for a question that is not a purchase");
    t.eq(DE.coachPurchaseLine(d, "When do I get my $2,600 paycheque?", TODAY), "", "1m2 …nor for a question about pay");
    t.eq(DE.coachPurchaseLine(d, "Can I buy 2 tickets at $150 each?", TODAY), "", "1m3 none when the amount would need multiplying");
    t.eq(DE.coachPurchaseLine(d, "Should I buy a $600 or $900 phone?", TODAY), "", "1m4 none when there are two amounts to choose between");
    t.ok(DE.coachPurchaseLine(d, "Can I afford a $1.5k couch", TODAY).includes(": $1,500 |"), "1m5 \"$1.5k\" is $1,500, not $2");
    t.eq(DE.coachPurchaseLine({ ...d, incomes: [] }, "Can I buy a $600 phone?", TODAY), "", "1n none when Today shows no figure");
    t.ok(/context: buildContext\(text\)/.test(coach) && /coachPurchaseLine\(data, userText\)/.test(coach), "1o the coach request passes the message to the context");
  }

  // ── 2. The weekly check-in ───────────────────────────────────────────────────────────────────
  {
    const w = fnBody("function WeeklyCheckInModal(");
    t.ok(w.length > 2000, "2a (the check-in was read)");
    t.ok(!/2-5 points/.test(w) && !/\+3 points this week/.test(w), "2b no \"improve your score by 2-5 points\" and no hardcoded \"+3 points this week\"");
    t.ok(/explain ONE pattern in this week's numbers/.test(w) && /Do not tell the user what to do/.test(w), "2c the prompt asks for one pattern explained, no instruction");
    t.ok(/<NotAdviceLine\/>/.test(w), "2d the sheet carries the not-advice line");
  }

  // ── 4, 5, 6. Render-level checks ─────────────────────────────────────────────────────────────
  let A = {};
  try { A = loadApp(["migrateLocalStorageTokensToSupabase", "supabase", "pressable", "NotAdviceLine", "NOT_ADVICE"]); }
  catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }

  // 4. token cleanup
  if (A.migrateLocalStorageTokensToSupabase) {
    const ls = globalThis.localStorage;
    const reset = (entries) => { for (const k of ["flourish_plaid_token", "flourish_plaid_tokens", "flourish_d1e_migrated"]) ls.removeItem(k); for (const [k, v] of Object.entries(entries)) ls.setItem(k, v); };
    const realFetch = globalThis.fetch;
    let sent = null, fail = false;
    globalThis.fetch = async (_url, opts) => { sent = JSON.parse(opts.body); if (fail) return { ok: false, status: 400, json: async () => ({ error: "bad" }) };
      return { ok: true, status: 200, json: async () => ({ successes: [{ item_id: "i1" }], failures: [] }) }; };
    A.supabase.auth.getSession = async () => ({ data: { session: { access_token: "jwt" } } });
    const quiet = { l: console.log, w: console.warn, e: console.error }; console.log = console.warn = console.error = () => {};
    try {
      reset({ flourish_plaid_token: "access-legacy", flourish_plaid_tokens: JSON.stringify([{ token: "access-a", institution: "Bank A" }]) });
      await A.migrateLocalStorageTokensToSupabase();
      t.eq(sent && sent.action, "migrate_items", "4a the tokens are sent to migrate_items");
      t.eq([ls.getItem("flourish_plaid_token"), ls.getItem("flourish_plaid_tokens"), ls.getItem("flourish_d1e_migrated")], [null, null, "1"],
        "4b after a successful migration both token keys are removed");

      reset({ flourish_plaid_token: "access-legacy" }); fail = true;
      await A.migrateLocalStorageTokensToSupabase();
      t.eq([ls.getItem("flourish_plaid_token"), ls.getItem("flourish_d1e_migrated")], ["access-legacy", null], "4c a failed migration keeps the token for the next try");
      fail = false;

      reset({ flourish_d1e_migrated: "1", flourish_plaid_tokens: JSON.stringify([{ token: "access-left" }]) }); sent = null;
      await A.migrateLocalStorageTokensToSupabase();
      t.eq([ls.getItem("flourish_plaid_tokens"), sent], [null, null], "4d a device migrated earlier has its leftover copy removed, with no request");
    } finally { globalThis.fetch = realFetch; Object.assign(console, { log: quiet.l, warn: quiet.w, error: quiet.e }); }
  }

  // 5. the not-advice line
  {
    t.eq(A.NOT_ADVICE, "Flourish explains your numbers. It is not financial advice.", "5a the line");
    t.ok(/<NotAdviceLine/.test(fnBody("function MeetAgenda(")), "5b on Meet");
    const coach = fnBody("function AICoach(");
    const demoBranch = coach.slice(coach.indexOf("demoCoachExchanges(data"), coach.indexOf(") : (<>"));
    t.ok(/<NotAdviceLine\/>/.test(demoBranch), "5c on the demo coach");
    const D = await import("../src/lib/demoFixture.js");
    const { demoCoachExchanges } = await import("../src/lib/demoCoach.js");
    const T = new Date("2026-09-29T12:00:00");
    const all = demoCoachExchanges({ accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA"), incomes: D.buildDemoIncomes(T, "CA"),
      bills: D.buildDemoBills(T, "CA"), transactions: D.buildDemoTxns(T, "CA"), profile: D.demoProfileFor("CA") }, T).map((x) => x.a).join(" ");
    t.ok(!/worth attacking/.test(all) && /is up to you/.test(all), "5d the scripted demo coach compares the debt options and leaves the choice to the user");
  }

  // 6. accessibility
  {
    if (A.pressable) {
      let hits = 0; const fn = () => { hits++; };
      const p = A.pressable(fn);
      t.eq([p.role, p.tabIndex], ["button", 0], "6a a tappable card is a focusable button");
      const ev = (key, self = true) => { const el = {}; return { key, target: self ? el : {}, currentTarget: el, preventDefault() {} }; };
      p.onKeyDown(ev("Enter")); p.onKeyDown(ev(" ")); p.onKeyDown(ev("a")); p.onKeyDown(ev("Enter", false));
      t.eq(hits, 2, "6b Enter and Space press it; other keys, and keys aimed at a button inside it, do not");
      t.eq(Object.keys(A.pressable(undefined)).length, 0, "6c a card with no action stays a plain div");
    }
    t.ok(/return <div onClick=\{onClick\} \{\.\.\.pressable\(onClick\)\}/.test(APP), "6d Card (Budget category cards and every tappable card) uses it");
    t.ok(/onClick=\{\(\)=>setScreen\("plan"\)\} \{\.\.\.pressable\(\(\)=>setScreen\("plan"\),\{role:"group",label:"Safe to spend\. Press Enter to open your plan\."\}\)\}/.test(APP),
      "6e the Safe-to-spend hero is keyboard-operable as a named group, not role=button, because it holds its own input and buttons");
    if (A.pressable) {
      const g = A.pressable(() => {}, { role: "group", label: "L" });
      t.eq([g.role, g.tabIndex, g["aria-label"]], ["group", 0, "L"], "6e2 (the group form is focusable and named)");
    }
    t.ok(/<Card style=\{\{cursor:"pointer"\}\} onClick=\{editBudget\?undefined:\(\)=>handleToggle\(\)\}>/.test(APP),
      "6e3 a Budget category card is a button only when it holds no budget input (not while editing)");
    t.ok(/onClick=\{\(\)=>setScreen\("home"\)\} aria-label="Back"/.test(APP), "6f the coach's back arrow is labelled");
    t.ok(/aria-label="Clear chat history"/.test(APP), "6g …and its clear-history button");
    t.ok(/aria-label="Flourish home"/.test(APP) && /setShowSettings\(true\);\}\} aria-label="Settings"/.test(APP), "6h the desktop logo and Settings are labelled");
    t.eq((APP.match(/setShowNotifs\(true\);\}\} aria-label="Notifications"/g) || []).length, 2, "6i both notification bells are labelled");
    t.eq((APP.match(/aria-current=\{active\?"page":undefined\}/g) || []).length, 2, "6j the active tab says it is the current page, in the bottom bar and the desktop sidebar");
  }

  // ── 8. The App Review account ────────────────────────────────────────────────────────────────
  {
    const S = await import("../src/lib/sampleHouseholdAccount.js");
    t.ok(/^[0-9a-f]{64}$/.test(S.REVIEW_ACCOUNT_SHA256), "8a the review account is kept as a SHA-256 hash");
    const synthetic = "reviewer@example.invalid";
    const h = crypto.createHash("sha256").update(synthetic).digest("hex");
    t.eq(await S.isReviewAccount("  Reviewer@Example.INVALID \n", [h]), true, "8b matching trims and lowercases before hashing");
    t.eq(await S.isReviewAccount("someone@example.invalid", [h]), false, "8c another email does not match");
    t.eq(await S.isReviewAccount("", [h]), false, "8d nor does no email");
    const samples = ["", "abc", synthetic, "a".repeat(55), "b".repeat(64), "é€ mixed 😀", "x".repeat(300)];
    t.ok(samples.every((x) => S.sha256HexSync(x) === crypto.createHash("sha256").update(x).digest("hex")),
      "8d2 the plain-JavaScript SHA-256 (for a WebView without Web Crypto) matches Node's");
    const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true, writable: true });
    try { t.eq(await S.isReviewAccount(synthetic.toUpperCase(), [h]), true, "8d3 …and matching still works with no crypto.subtle"); }
    finally { if (saved) Object.defineProperty(globalThis, "crypto", saved); }
    t.eq(await S.isReviewAccount(S.SCREENSHOT_EMAIL), false, "8e the screenshot account is not the review account…");
    t.eq(S.SCREENSHOT_EMAIL, "snap@flourish.app", "8f …and keeps its own path, unchanged");
    const hydrate = slice("const loadSampleHousehold = () => {", 4000);
    t.ok(/if \(normalizeEmail\(user\.email\) === SCREENSHOT_EMAIL\) \{ loadSampleHousehold\(\); return; \}/.test(hydrate), "8g the screenshot account still loads the sample household");
    const reviewAt = hydrate.indexOf("if (await isReviewAccount(user.email))"), fetchAt = hydrate.indexOf("await fetchUserData(");
    t.ok(reviewAt > 0 && reviewAt < fetchAt, "8h the review account loads the same household, decided before any database read");
    // The real address is not in the repository, so the match against it runs only where it is
    // supplied (REVIEW_ACCOUNT_EMAIL), locally, before a build.
    if (process.env.REVIEW_ACCOUNT_EMAIL) {
      t.eq(await S.isReviewAccount(process.env.REVIEW_ACCOUNT_EMAIL), true, "8i the review account's own email matches the committed hash");
    }
  }

  t.summary("round3Fixes.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
