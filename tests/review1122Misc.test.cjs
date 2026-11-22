// tests/review1122Misc.test.cjs
// -----------------------------------------------------------------------------
// THE FULL-APP REVIEW OF 2026-11-22 (ChatGPT, Grok, Gemini): THE SMALLER FINDINGS, EACH CHECKED AGAINST THE CODE.
//
// A finding that is REAL has assertions that failed before its fix. A finding that is NOT REAL has assertions that
// show the guard the reviewer did not see. Every id below is the reviewer's own.
//
//   G2     reordering the dashboard and hiding a card do not undo each other            NOT REAL
//   P2-08  what reaches the AI provider: US SSNs, dotted and bracketed phone numbers,
//          postal codes and street addresses went out as typed                           REAL, fixed
//   P2-09  a counter the server could not read showed a store app the weekly limit      REAL (narrow), fixed
//   P9-07  the AI Coach switch turned on before the server had the consent               REAL, fixed
//   P10-07 a revoke the server never got was never sent again (also Grok's medium)       REAL, fixed
//   P7-03  two notification reschedules could run through each other                     REAL, fixed
//   P8-06  approving a child's chore: Kids is parked, nothing renders it                 NOT REAL
//   P9-05  changing the country: stamped accounts are never relabelled                   NOT REAL (by design)
//   P1-09  the Android sample test expected the template's package name                  REAL, fixed
//   P1-10  the gift card printed "undefined 99, 2026" for an impossible date             REAL, fixed
//   P3-11  signup answered with the database's own error text                            REAL, fixed
//   Grok   a goal added in Settings had no id                                            REAL, fixed
//   G15, G16, G17, G18, P1-04, P1-05, Grok's activation key and plans-offered            NOT REAL
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const APP = read("src", "App.jsx");
// The text of one top-level function of App.jsx, from its "function Name(" to the next top-level "function ".
const fnText = (name) => {
  const at = APP.indexOf(`\nfunction ${name}(`);
  if (at < 0) return "";
  const next = APP.indexOf("\nfunction ", at + 10);
  return APP.slice(at, next < 0 ? undefined : next);
};
const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
};

(async () => {
  const t = create();

  // ── G2. Reorder and hide are two separate stores, and both are keyed by card id ──────────────────────────────
  {
    const custom = fnText("DashCustomize");
    t.ok(/findIndex\(t=>t\.id===id\)/.test(custom) && !/hidden/.test(custom.replace(/\/\/.*$/gm, "").replace(/Show or hide cards in Settings[^<]*/, "")),
      "G2a the reorder sheet moves a card found by its id, and never touches the hidden list");
    const settings = APP.slice(APP.indexOf('if(sectionKey==="dashboard")'), APP.indexOf('if(sectionKey==="dashboard")') + 1400);
    t.ok(/dashboardLayout: \{ \.\.\.\(prev\.dashboardLayout \|\| \{\}\), hidden: next \}/.test(settings) && !/setDashLayout|flourish_dash_layout/.test(settings),
      "G2b hiding a card writes only dashboardLayout.hidden (the rest of it kept), and never the order");
    t.ok(/const tileOrder = dashLayout \? dashLayout\.map\(t=>t\.id\)/.test(APP) && /const isVisible = id => .*dashboardLayout\?\.hidden/.test(APP),
      "G2c the dashboard takes its order from the ids in the saved order and its visibility from the hidden list");
    // The same two steps as the app, on plain data: reorder, then hide, then show again.
    let order = ["hero", "bento", "healthrow", "networth"].map((id) => ({ id, visible: true, locked: false }));
    const moveUp = (prev, id) => { const idx = prev.findIndex((x) => x.id === id); if (idx <= 0) return prev; const next = [...prev]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; return next; };
    order = moveUp(order, "networth");
    let data = { dashboardLayout: {} };
    const setHide = (prev, id, hide) => { const cur = Array.isArray(prev.dashboardLayout?.hidden) ? prev.dashboardLayout.hidden : []; const next = hide ? Array.from(new Set([...cur, id])) : cur.filter((x) => x !== id); return { ...prev, dashboardLayout: { ...(prev.dashboardLayout || {}), hidden: next } }; };
    data = setHide(data, "healthrow", true); data = setHide(data, "healthrow", false);
    t.eq(order.map((x) => x.id), ["hero", "bento", "networth", "healthrow"], "G2d a card hidden and shown again is still where the person put it");
  }

  // ── P2-08. What reaches the AI provider ─────────────────────────────────────────────────────────────────────
  {
    const R = require("../netlify/functions/_lib/coachRedact.js");
    const send = (text) => R.redactProviderBody({ system: "s", messages: [{ role: "user", content: text }] }, []).messages[0].content;
    t.ok(!/123-45-6789/.test(send("My SSN is 123-45-6789, is that needed?")), "P2-08a a US social security number (3-2-4) does not go out as typed");
    t.ok(!/555[.\- ]0123|416/.test(send("Call me at 416.555.0123 tomorrow")), "P2-08b a phone number written with dots does not go out");
    t.ok(!/416|555/.test(send("My number is (416) 555-0123.")), "P2-08c a phone number with a bracketed area code goes out with no part of it");
    t.ok(!/416|555/.test(send("Reach me on +1 (416) 555-0123")), "P2-08d …the same with a country code");
    t.ok(!/M5V|2T6/i.test(send("I live at M5V 2T6 and rent is high")) && !/k1a0b1/i.test(send("postal code k1a0b1")), "P2-08e a Canadian postal code does not go out, spaced or not, in either case");
    t.ok(!/Main Street|123 Main/.test(send("We moved to 123 Main Street last year")), "P2-08f a street address does not go out");
    t.ok(!/KING ST|45 KING/.test(send("TIM HORTONS 45 KING ST W TORONTO 4.25")), "P2-08g …nor one inside a bank's line for a purchase");
    t.ok(!/22 maple avenue/i.test(send("my address is 22 maple avenue")), "P2-08h …nor one typed in small letters");
    // Sends less, never different: what is not a contact detail goes out exactly as before.
    const KEEP = ["Safe to spend is $1,234.56 until Nov 28, 2026.", "Rent 1,800.00 is due on 2026-12-01.", "A 30 day window, 3 paydays, 12 bills.",
      "You have 2 accounts at 1 bank.", "Pay $50 each way and keep 5 for the road.", "Visa ending 4242, limit 5,000.", "RRSP room is 31,560 for 2026.",
      "On May 1, 2027 the mortgage renews at 4.89%.", "We have 2 cars and the street is quiet.", "March 15 2026: 3 payments this way."];
    for (const [i, s] of KEEP.entries()) t.eq(send(s), s, `P2-08i${i + 1} unchanged: ${s}`);
    t.eq(send("Account 1234567890 and me@example.com"), "Account ••••7890 and [email]", "P2-08j account numbers and email addresses are masked as they were");
    t.eq(R.redactAccountNumbers("SIN 123-456-789"), "SIN ••••6789", "P2-08k the account-number rule itself is unchanged (the app's copy is held to the same answers)");
  }

  // ── P2-09. A counter that could not be read is not this week's limit ──────────────────────────────────────────
  {
    const coach = read("netlify", "functions", "coach.js");
    const emergency = coach.slice(coach.indexOf("usage RPC error (failing closed to IP backstop)"), coach.indexOf("Healthy-mode per-IP abuse/cost cap"));
    t.ok(/error: "rate_limited", reason: "unavailable", message: "Coach is briefly unavailable\. Please try again in a few minutes\."/.test(emergency),
      "P2-09a when the counter cannot be read the refusal says so (reason \"unavailable\"), with the same status, error and words as before");
    const chat = fnText("AICoach");
    const at = chat.indexOf("if(res.status === 429){");
    const block = chat.slice(at, at + 1900);
    t.ok(/const refusal = isNativeApp\(\) && j\.reason === "unavailable" && j\.message \? j\.message : limitMsg;/.test(block) && /content: refusal\}/.test(block) && !/content: limitMsg\}/.test(block),
      "P2-09b a store app prints its weekly-limit line for a limit, and the server's own \"briefly unavailable\" line when the server could not check");
    t.ok(!/reason: "unavailable"/.test(read("netlify", "functions", "_lib", "coachLimits.js")),
      "P2-09c the free plan's own rule is untouched: a weekly counter that cannot be read is still the weekly limit, in the same words (decided 2026-10)");
  }

  // ── P9-07. The AI Coach switch turns on only once the server has the consent ─────────────────────────────────
  {
    const settings = fnText("Settings");
    const modal = settings.slice(settings.indexOf("{pendingAIConsent&&<AIConsentModal"), settings.indexOf("{pendingAIConsent&&<AIConsentModal") + 500);
    t.ok(/onEnable=\{async\s*\(\)\s*=>\s*\{[^}]*await onAcceptAIConsent\?\.\(\)/.test(modal) && /if\s*\(ok === false\) return;/.test(modal),
      "P9-07a Enable AI Coach waits for the server to record the consent, and stays where it is when that fails");
    t.ok(/applyAICoachEnabled\(true, true\); setPendingAIConsent\(false\);/.test(modal), "P9-07b …and only then turns the switch on and closes");
    const apply = settings.slice(settings.indexOf("const applyAICoachEnabled="), settings.indexOf("const applyAICoachEnabled=") + 420);
    t.ok(/if \(v && !granted\) onAcceptAIConsent\?\.\(\);/.test(apply), "P9-07c someone who already consented and only switched AI off keeps the quick switch (the consent is sent again as before)");
  }

  // ── P10-07 (and Grok's medium). A revoke the server never got is sent again ───────────────────────────────────
  {
    const H = await import("../src/lib/consentHeal.js");
    t.ok(typeof H.noteRevokeResult === "function" && typeof H.revokePending === "function" && typeof H.clearRevokePending === "function",
      "P10-07a the app can remember a revoke that did not reach the server");
    if (typeof H.noteRevokeResult === "function") {
      const s = fakeStorage();
      H.noteRevokeResult({ ok: false, hadJwt: true }, s, "user-a");
      t.eq(H.revokePending(s, "user-a"), true, "P10-07b a signed-in revoke that failed is remembered for that account");
      t.eq(H.revokePending(s, "user-b"), false, "P10-07c …and never sent for another account on the same device");
      H.noteRevokeResult({ ok: true, hadJwt: true }, s, "user-a");
      t.eq(H.revokePending(s, "user-a"), false, "P10-07d once the server has it, it is forgotten");
      const demo = fakeStorage();
      H.noteRevokeResult({ ok: false, hadJwt: false }, demo, null);
      t.eq(demo._m.size, 0, "P10-07e the demo (no account) has nothing to send again");
      const again = fakeStorage();
      H.noteRevokeResult({ ok: false, hadJwt: true }, again, "user-a");
      H.clearRevokePending(again);
      t.eq(H.revokePending(again, "user-a"), false, "P10-07f agreeing again cancels the waiting revoke, so a later retry cannot undo the new consent");
      t.eq(H.revokePending({ getItem() { throw new Error("blocked"); } }, "user-a"), false, "P10-07g storage that throws is read as nothing waiting");
    }
    const root = APP.slice(APP.indexOf("export default function FlourishApp()"));
    const decline = root.slice(root.indexOf("const declineAIDisclosure ="), root.indexOf("const revokeAIConsent ="));
    const revoke = root.slice(root.indexOf("const revokeAIConsent ="), root.indexOf("const acceptAIConsentServer ="));
    t.ok(/postCoachConsent\("revoke_consent"\)\.then\(\s*\(?res\)?\s*=>\s*noteRevokeResult\(res, deviceStorage\(\), user\?\.id\)\)/.test(decline),
      "P10-07h \"Don't use AI\" notes whether the server got the revoke");
    t.ok(/const res = await postCoachConsent\("revoke_consent"\);[\s\S]*noteRevokeResult\(res, deviceStorage\(\), user\?\.id\)/.test(revoke),
      "P10-07i Revoke AI consent in Settings does too, and AI still goes off on this device whatever the network did");
    t.ok(/if\s*\(!user\?\.id \|\| !isOnline \|\| !revokePending\(deviceStorage\(\), user\.id\)\) return;[\s\S]{0,200}postCoachConsent\("revoke_consent"\)/.test(root),
      "P10-07j a waiting revoke is sent again when the account is signed in and online");
    const accept = root.slice(root.indexOf("const acceptAIDisclosure ="), root.indexOf("const declineAIDisclosure ="));
    const acceptServer = root.slice(root.indexOf("const acceptAIConsentServer ="), root.indexOf("const requireAIDisclosure ="));
    t.ok(/clearRevokePending\(deviceStorage\(\)\)/.test(accept) && /clearRevokePending\(deviceStorage\(\)\)/.test(acceptServer),
      "P10-07k agreeing (at the disclosure or in Settings) clears a waiting revoke");
  }

  // ── P7-03. Notification reschedules run one at a time, and only the newest waits ─────────────────────────────
  {
    let L = null;
    try { L = await import("../src/lib/latestOnly.js"); } catch { L = null; }
    t.ok(!!L && typeof L.latestOnly === "function", "P7-03a there is one queue for work that must not overlap");
    if (L && typeof L.latestOnly === "function") {
      const log = [];
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      // The reschedule as the app does it: cancel a type, then schedule that data's reminders, type by type.
      const job = async (name, slow) => { for (const ty of ["bill", "low"]) { log.push(`${name}:cancel:${ty}`); await sleep(slow); log.push(`${name}:schedule:${ty}`); await sleep(slow); } };
      // The control: called as the app called it before (nothing between two runs), the old run's reminders land
      // after the new run has cancelled that type. This is the overlap the review described.
      { const a0 = job("old", 15); await sleep(5); const c0 = job("new", 1); await Promise.all([a0, c0]);
        t.ok(log.indexOf("old:schedule:bill") > log.indexOf("new:cancel:bill"), "P7-03 control: without the queue the old run schedules a type after the new run cancelled it");
        log.length = 0; }
      const run = L.latestOnly(job);
      const a = run("old", 15); await sleep(5);
      const b = run("mid", 1); const c = run("new", 1);
      await Promise.all([a, b, c]);
      const firstNew = log.findIndex((x) => x.startsWith("new:")), lastOld = log.map((x) => x.startsWith("old:")).lastIndexOf(true);
      t.ok(firstNew > lastOld, "P7-03b a newer run starts only after the older one has finished: none of the old run's reminders land after the new run's cancels");
      t.ok(!log.some((x) => x.startsWith("mid:")), "P7-03c a run that was overtaken before it started is skipped (its data is already out of date)");
      t.eq(log.slice(-1)[0], "new:schedule:low", "P7-03d the newest data is what ends up scheduled");
      const boom = L.latestOnly(async (x) => { if (x === "bad") throw new Error("plugin"); log.push("after-error"); });
      await boom("bad").catch(() => {}); await boom("good");
      t.eq(log.slice(-1)[0], "after-error", "P7-03e a run that fails does not block the next one");
    }
    t.ok(/const reconcileNotifications = latestOnly\(/.test(APP) && !/\nasync function reconcileNotifications\(/.test(APP),
      "P7-03f the app's notification reschedule goes through that queue");
  }

  // ── P8-06. Kids is parked: nothing renders the approve button or the child's screen ───────────────────────────
  {
    t.ok(/if \(path === "\/kids"\) \{ try \{ window\.history\.replaceState\(null, "", "\/"\); \} catch \{[^}]*\} return "home"; \}/.test(APP), "P8-06a /kids redirects to the home screen in every build");
    t.ok(!/<KidsMiniSite\b/.test(APP), "P8-06b the child's screen (KidsMiniSite) is rendered nowhere");
    const family = fnText("Family");
    t.ok(/const meetTabs=\[\["meeting",isCouple\?"Money Meeting":"Check-In"\]\];/.test(family) && !/meetTabs\.push\(\["kids"/.test(family),
      "P8-06c Meet offers one tab, so the kids tab that holds the approve button cannot be opened");
    t.ok(!/\.approved/.test(fnText("KidsMiniSite")), "P8-06d …and the child's screen never read whether a chore was approved");
  }

  // ── P9-05. A country change never relabels a stamped account ─────────────────────────────────────────────────
  {
    const F = await import("../src/lib/financialCalculations.js");
    const before = { profile: { country: "CA" } }, after = { profile: { country: "US" } };
    const bank = { id: "a1", balance: 1000, currency: "CAD" }, typed = { id: "a2", balance: 500 };
    t.eq([F.baseCurrencyOf(before), F.baseCurrencyOf(after)], ["CAD", "USD"], "P9-05a the country sets the household's own currency");
    t.eq([F.isBaseCurrencyAccount(bank, before), F.isBaseCurrencyAccount(bank, after)], [true, false],
      "P9-05b a bank account stamped CAD is not counted as US dollars after the change: it is set aside as another currency, not relabelled");
    t.eq(F.isBaseCurrencyAccount(typed, after), true, "P9-05c a figure the person typed has no currency of its own: it is in their currency, whichever country they say they live in");
    t.eq(F.baseCurrencyOf({ profile: { country: "US", baseCurrency: "CAD" } }), "CAD", "P9-05d currency can already be held apart from residence (profile.baseCurrency wins)");
  }

  // ── P1-09. The Android sample test names this app ───────────────────────────────────────────────────────────
  {
    const gradle = read("android", "app", "build.gradle");
    const appId = (gradle.match(/applicationId "([^"]+)"/) || [])[1];
    const sample = read("android", "app", "src", "androidTest", "java", "com", "getcapacitor", "myapp", "ExampleInstrumentedTest.java");
    t.ok(!!appId && sample.includes(`assertEquals("${appId}", appContext.getPackageName());`), `P1-09a the instrumented sample test expects this app's id (${appId})`);
  }

  // ── P1-10. The printable gift card and an impossible date ────────────────────────────────────────────────────
  {
    const src = read("public", "gift", "card.js");
    const card = (hash) => {
      const els = {};
      const el = (sel) => (els[sel] = els[sel] || { hidden: true, textContent: "", addEventListener() {} });
      const WORDS = { "gift-card-start-on": "Starts {date}", "gift-card-start-now": "Starts today", "gift-plan-flourish-name": "a year of flourish", "gift-card-for": "For {name}", "gift-card-from": "From {from}" };
      const tpl = { content: { querySelector: (q) => { const id = (q.match(/data-id="([^"]+)"/) || [])[1]; return WORDS[id] ? { textContent: WORDS[id] } : null; } } };
      const document = { querySelector: (sel) => (sel === "#words" ? tpl : el(sel)) };
      vm.runInNewContext(src, { document, location: { hash }, window: { print() {} }, URLSearchParams, String, Number, Object, Date });
      return els["#start"] ? els["#start"].textContent : null;
    };
    t.eq(card("#c=ABCDEFGHJKMN&s=2026-12-25"), "Starts December 25, 2026", "P1-10a a real date prints as a date");
    t.eq(card("#c=ABCDEFGHJKMN&s=2026-99-99"), "Starts today", "P1-10b month 99 never prints \"undefined 99, 2026\"");
    t.eq(card("#c=ABCDEFGHJKMN&s=2026-02-30"), "Starts today", "P1-10c February 30 is not a date either");
    t.eq(card("#c=ABCDEFGHJKMN&s=2028-02-29"), "Starts February 29, 2028", "P1-10d a leap day is");
    t.eq(card("#c=ABCDEFGHJKMN"), "Starts today", "P1-10e no date at all is unchanged");
  }

  // ── P3-11. Signup never answers with the database's own error text ───────────────────────────────────────────
  {
    const beta = read("netlify", "functions", "beta.js");
    t.ok(!/detail: \(e\.message \|\| ""\)\.slice\(0, 200\)/.test(beta) && !/error: "create_failed", message: createErr\.message/.test(beta) && !/JSON\.stringify\(\{ error: err\.message, allowed: true \}\)/.test(beta),
      "P3-11a no answer carries an error's message text (reserve_failed, create_failed, create_threw, the last-resort 502)");
    t.ok(/error: "reserve_failed"/.test(beta) && /error: "create_failed"/.test(beta) && /error: "create_threw"/.test(beta), "P3-11b the error names the app words itself from are unchanged");
    t.ok(/console\.error\("\[beta:signup\] reserve_beta_seat failed:", e\.message\)/.test(beta) && /console\.error\("\[beta:signup\] createUser failed:", createErr\.message\)/.test(beta),
      "P3-11c the full text still goes to the server log, where support reads it");
    let safe = null;
    try { safe = require("../netlify/functions/beta.js").safeErrorCode; } catch { safe = null; }
    t.ok(typeof safe === "function", "P3-11d what does go back is a short code");
    if (typeof safe === "function") {
      t.eq(safe({ code: "23505", message: 'duplicate key value violates unique constraint "beta_signups_email_key"' }), "23505", "P3-11e a database code passes");
      t.eq(safe({ code: "over_request_rate_limit", message: "x" }), "over_request_rate_limit", "P3-11f an auth code passes");
      t.eq(safe({ message: "relation \"public.beta_signups\" does not exist" }), undefined, "P3-11g no code, nothing");
      t.eq(safe({ code: "has spaces and \"quotes\"" }), undefined, "P3-11h anything that is not a plain short code is dropped");
    }
  }

  // ── Grok low. A goal added in Settings gets an id, like a goal added on the Goals screen ─────────────────────
  {
    const g = fnText("InlineGoalEditor");
    t.ok(/goals:\[\.\.\.\(prev\.goals\|\|\[\]\), \{\.\.\.form, id:Date\.now\(\)\}\]/.test(g), "GrokL-goal-a a goal saved from Settings carries an id (the Goals screen's own rule)");
  }

  // ── NOT REAL, each held to the guard that makes it so ────────────────────────────────────────────────────────
  {
    // G15: nothing waits on the cache clean-up, and nothing reloads after it.
    const main = read("src", "main.jsx");
    const sw = main.slice(main.indexOf('"serviceWorker" in navigator'), main.indexOf("class ErrorBoundary"));
    t.ok(/caches\.keys\(\)\.then\(keys => keys\.forEach\(k => caches\.delete\(k\)\)\)\.catch\(\(\) => \{\}\)/.test(sw) && !/reload\(/.test(sw.replace(/\/\/.*$/gm, "")),
      "G15a the old service worker's caches are cleared in the background: no reload and no later step depends on it finishing");
    // G16: the count means "a number is on the screen", and it is gated on real balance data.
    t.ok(/const numberShown = hasCashAccount && !noIncome && !ssView\.needsSetup;/.test(fnText("FirstVisitScreen")),
      "G16a first_number_shown fires only when a number is really on the screen (a cash account, income, and no setup state)");
    // G17: the nonce is made only for Apple's own sheet on an iPhone, where the page is a secure context.
    const social = read("src", "lib", "socialSignIn.js");
    t.eq((social.match(/await nonces\(\)/g) || []).length, 1, "G17a crypto.subtle is used in one place");
    const at = social.indexOf("await nonces()");
    t.ok(/appleSignIn/.test(social.slice(Math.max(0, at - 600), at)), "G17b …inside the iPhone-only Apple sheet branch (capacitor://localhost is a secure context); the website and Android never make a nonce");
    // G18: when the copy fails the caller shows the link.
    const S = await import("../src/lib/share.js");
    t.eq(await S.shareFlourish({ platform: "ios", nativeShare: async () => { throw new Error("plugin missing"); }, copy: async () => { throw new Error("NotAllowedError"); } }), "failed",
      "G18a a share and a copy that both fail answer \"failed\"…");
    t.ok(/shareFlourish\(/.test(APP) && /"failed"/.test(APP.slice(APP.indexOf("shareFlourish("), APP.indexOf("shareFlourish(") + 900)), "G18b …and the app then shows the link to copy by hand");
    // P1-04: the pinch lock is the brief's, for the store apps' web view (tests/textScale.test.cjs 5b, a11y.browser.test.cjs).
    t.ok(/user-scalable=no/.test(read("index.html")) && /user-scalable=no/.test(read("tests", "textScale.test.cjs")), "P1-04a pinch zoom is locked on purpose (the store apps cannot zoom back out), and text size follows the phone's setting instead");
    // P1-05: the stores cannot carry a code; a computer's link does.
    const get = read("public", "get", "get.js");
    t.ok(/the stores can't hold a code/.test(get) && /"c=" \+ creatorCode/.test(get), "P1-05a a creator's code goes on with the website's link, and by design not to a store (the app's sign-up form asks for it)");
    // Grok: the activation key is taken back when the request fails.
    const A = await import("../src/lib/activation.js");
    const store = fakeStorage();
    const sent = await A.sendActivationOnce("safe_view", { getSession: async () => ({ userId: "u1", jwt: "j" }), storage: store, fetchImpl: async () => { throw new Error("offline"); } });
    t.eq([sent, store._m.size], [false, 0], "GrokL-activation-a a metric that failed to send is not marked sent, so the next open sends it");
    // Grok: plans offered once. Storage that throws means "once" cannot be kept, so the screen is not opened at all.
    const T = await import("../src/lib/trialPlanFirst.js");
    t.eq(T.plansOfferedBefore({ getItem() { throw new Error("blocked"); } }, "u1"), true,
      "GrokL-plans-a with storage blocked the one-time plans screen is not opened (the other answer opens it on every launch, because the note that it was shown cannot be kept either)");
  }

  t.summary("review 2026-11-22: the smaller findings");
})().catch((e) => { console.error(e); process.exit(1); });
