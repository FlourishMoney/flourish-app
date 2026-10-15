// tests/landingWaitlist.test.cjs
// -----------------------------------------------------------------------------
// THE LANDING'S WAITLIST FORMS GO ONCE SIGNUP IS OPEN AND THE FOUNDING SPOTS ARE FULL (billing day, 2026-10-15).
//
// The waitlist consent promises an email at launch. After the launch (signup open) the only waitlist email
// is the founding link email, which a household gets only if it joins while a founding spot is left
// (tests/launchEmail.test.cjs section 6). So with signup open and 0 spots left, a joiner would get nothing:
// the hero form, the "Be first to know" form and the founding block (which says "Join the waitlist") go.
// While spots remain the form stays: joining is the only way to a founding spot. Pinned:
//   1. the rule: only "open" AND a read "0 left" hides the forms; anything less certain keeps them;
//   2. the landing's signup_status read: once per page, never throws, anything but a clear yes is "no";
//   3. the landing asks it only after the founding count reads 0 (no extra call per visitor while spots
//      remain), web only, and every waitlist form on the landing is behind the rule.
// The built page is checked in Chromium in tests/landingDemo.browser.test.cjs section 11.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");

(async () => {
  const t = create();
  const U = await import("../src/lib/signupUi.js");

  // ── 1. the rule ─────────────────────────────────────────────────────────────────────────────────
  const cases = [
    [{ openSignup: true, spotsLeft: 0 }, false, "signup open, 0 spots left: the forms go"],
    [{ openSignup: true, spotsLeft: 12 }, true, "signup open, spots left: the form stays (the way to a founding spot)"],
    [{ openSignup: true, spotsLeft: null }, true, "signup open, count not read: stays"],
    [{ openSignup: false, spotsLeft: 0 }, true, "signup shut, 0 left: stays (launch news is still to come)"],
    [{ openSignup: null, spotsLeft: 0 }, true, "not asked yet: stays"],
    [{ openSignup: "true", spotsLeft: 0 }, true, "a string \"true\" is not a yes"],
    [{ openSignup: true, spotsLeft: "0" }, true, "a string \"0\" is not a count"],
    [{}, true, "nothing known: stays"],
    [undefined, true, "no argument: stays"],
  ];
  for (const [input, want, why] of cases) t.eq(U.showWaitlistForms(input), want, `1 ${why}`);

  // ── 2. the landing's signup_status read ─────────────────────────────────────────────────────────
  const stub = (answer) => {
    const calls = [];
    const f = async (url, opts) => { calls.push({ url, opts }); if (answer instanceof Error) throw answer; return { json: async () => answer }; };
    return { f, calls };
  };
  {
    U._resetSharedSignupStatus();
    const { f, calls } = stub({ openSignup: true });
    const [a, b] = await Promise.all([U.sharedSignupStatus("https://x.test", f), U.sharedSignupStatus("https://x.test", f)]);
    t.eq([a, b, calls.length], [true, true, 1], "2a two asks, one request, the same answer");
    t.eq([calls[0].url, calls[0].opts.method, JSON.parse(calls[0].opts.body)], ["https://x.test/api/beta", "POST", { action: "signup_status" }], "2b it asks beta.js for signup_status");
  }
  for (const [why, answer] of [["a clear no", { openSignup: false }], ["an empty body", {}], ["a string \"true\"", { openSignup: "true" }], ["a network failure", new Error("offline")]]) {
    U._resetSharedSignupStatus();
    t.eq(await U.sharedSignupStatus("", stub(answer).f), false, `2c ${why}: no`);
  }
  {
    U._resetSharedSignupStatus();
    const f = async () => ({ json: async () => { throw new SyntaxError("Unexpected token <"); } });
    t.eq(await U.sharedSignupStatus("", f), false, "2d a page instead of JSON: no");
    U._resetSharedSignupStatus();
  }

  // ── 3. the landing ──────────────────────────────────────────────────────────────────────────────
  const auth = APP.slice(APP.indexOf("function AuthScreen("), APP.indexOf("\n}\n", APP.indexOf("function AuthScreen(")));
  const gate = auth.slice(auth.indexOf("const [waitlistGate, setWaitlistGate]"), auth.indexOf("const waitlistForms = showWaitlistForms(waitlistGate);") + 60);
  t.ok(gate.length > 200, "(the landing's waitlist gate found)");
  t.ok(/if \(isNativeApp\(\)\) return undefined;/.test(gate), "3a web only: a store app asks nothing");
  t.ok(/sharedFoundingSpots\(\)\.then\(spotsLeft => \{\s*if \(spotsLeft !== 0\) \{[\s\S]{0,120}?return undefined; \}\s*return sharedSignupStatus\(API_BASE\)/.test(gate),
    "3b signup_status is asked only after the founding count reads 0 (no extra call per visitor while spots remain)");
  t.eq((APP.match(/<WaitlistForm /g) || []).length, 2, "3c the landing has two waitlist forms (hero, \"Be first to know\")");
  t.ok(/\{waitlistForms && <WaitlistForm source="hero"\/>\}/.test(auth), "3d the hero form is behind the rule");
  t.ok(/\{waitlistForms && <FoundingOffer\/>\}/.test(auth), "3e …and the founding block that says \"Join the waitlist\"");
  const second = auth.slice(auth.indexOf("{/* Second email capture */}"), auth.indexOf("{/* Footer */}"));
  t.ok(/^\{\/\* Second email capture \*\/\}\s*\{waitlistForms && \(/.test(second) && second.includes('<WaitlistForm source="bottom_cta"/>') && second.includes("Be first to know."),
    "3f …and the whole \"Be first to know\" section, heading included");
  t.ok(/if \(!showAuth \|\| askedStatus\.current\) return;/.test(auth), "3g the sign-up card's own status check is unchanged (asked when the card opens)");

  t.summary("landingWaitlist.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
