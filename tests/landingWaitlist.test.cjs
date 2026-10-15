// tests/landingWaitlist.test.cjs
// -----------------------------------------------------------------------------
// THE LANDING'S WAITLIST AREA AFTER THE LAUNCH (billing day; wording approved by ChatGPT and Grok, 2026-10-15).
//
// From the one /api/founding answer ({ spotsLeft, openSignup }) the landing's hero form and bottom form show:
//   signup shut: the page exactly as it is today;
//   signup open, founding spots left: "Get my founding spot" and the founding spot line (version 2026-10-26),
//     no "Be first to know" heading or launch promise above the bottom form, and the founding block without
//     "Join the waitlist." and "Payments open October 26.";
//   signup open, all 50 taken: no form, no founding block (tests/landingWaitlist.test.cjs section 5 and the
//     browser checks add the "Create your account" button).
// Pinned:
//   1. the rule, for every answer (anything unclear is today's page);
//   2. the one /api/founding read: both answers from it, a 503 still says whether signup is open, nothing
//      unreadable is guessed;
//   3. the founding block's words after the launch (two stale bits out, nothing added);
//   4. the form, rendered: today's words, and the founding spot words with the founding spot version;
//   5. the landing: one shared read, each part shown in its state.
// The built page is checked in Chromium in tests/landingDemo.browser.test.cjs section 11.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const TODAY_LINE = "We'll email you when flourish launches in Canada, plus a few updates before then. Unsubscribe any time. Who we are: see Contact below.";
const FOUNDING_LINE = "We'll email you your founding price link. We won't send other marketing emails from this form. Unsubscribe any time. Who we are: see Contact below.";

(async () => {
  const t = create();
  const U = await import("../src/lib/signupUi.js");
  const O = await import("../src/lib/foundingOffer.js");

  // ── 1. the rule ─────────────────────────────────────────────────────────────────────────────────
  const area = (answer, extra = {}) => U.landingWaitlistArea({ answer, ...extra });
  for (const [answer, want, why] of [
    [{ openSignup: false, spotsLeft: 35 }, "waitlist", "signup shut, spots left: today's page"],
    [{ openSignup: false, spotsLeft: 0 }, "waitlist", "signup shut, 0 left: today's page"],
    [{ openSignup: true, spotsLeft: 35 }, "founding", "signup open, spots left: the founding spot form"],
    [{ openSignup: true, spotsLeft: 1 }, "founding", "signup open, the last spot: the founding spot form"],
    [{ openSignup: true, spotsLeft: null }, "founding", "signup open, count not read: the founding spot form (the server still decides the number)"],
    [{ openSignup: true, spotsLeft: 0 }, "account", "signup open, all 50 taken: Create your account"],
    [{ openSignup: null, spotsLeft: 0 }, "waitlist", "the answer said nothing about signup: today's page"],
    [{ spotsLeft: null, openSignup: null }, "waitlist", "no answer at all (a failure): today's page"],
    [{ openSignup: "true", spotsLeft: 0 }, "waitlist", "a string \"true\" is not open"],
  ]) t.eq(area(answer, { now: Date.parse("2026-10-15T12:00:00-04:00") }), want, `1a ${why}`);
  t.eq(area({ openSignup: true, spotsLeft: 0 }, { native: true }), "waitlist", "1b a store app: never anything but today's (it shows no landing form)");

  // ── 2. the one /api/founding read ───────────────────────────────────────────────────────────────
  const res = (status, body, opts = {}) => async () => ({ ok: status < 300, status, json: async () => { if (opts.html) throw new SyntaxError("Unexpected token <"); return body; } });
  t.eq(await O.fetchFoundingAnswer(res(200, { spotsLeft: 12, openSignup: true })), { spotsLeft: 12, openSignup: true }, "2a both answers from one read");
  t.eq(await O.fetchFoundingAnswer(res(200, { spotsLeft: 12, openSignup: false })), { spotsLeft: 12, openSignup: false }, "2b shut, read as shut");
  t.eq(await O.fetchFoundingAnswer(res(503, { error: "unavailable", openSignup: true })), { spotsLeft: null, openSignup: true }, "2c a 503 has no count, but still says signup is open");
  t.eq(await O.fetchFoundingAnswer(res(200, { spotsLeft: 12 })), { spotsLeft: 12, openSignup: null }, "2d an answer without openSignup says nothing about it");
  t.eq(await O.fetchFoundingAnswer(res(200, null, { html: true })), { spotsLeft: null, openSignup: null }, "2e a page instead of JSON: nothing");
  t.eq(await O.fetchFoundingAnswer(async () => { throw new TypeError("offline"); }), { spotsLeft: null, openSignup: null }, "2f offline: nothing");
  t.eq([O.openSignupFrom({ openSignup: "true" }), O.openSignupFrom({ openSignup: 1 }), O.openSignupFrom(null)], [null, null, null], "2g only a real boolean counts");
  t.eq(await O.fetchFoundingSpots(res(503, { spotsLeft: 7, openSignup: true })), null, "2h the count is never taken from a failed answer");

  // ── 3. the founding block's words after the launch ──────────────────────────────────────────────
  const before = O.foundingOfferCopy(), after = O.foundingOfferCopy({ launched: true });
  t.eq(before.join, "Join the waitlist. The first 50 households on the waitlist get the founding price. Payments open October 26. Joining is free.", "3a signup shut: the words as today");
  t.eq([after.join, after.phoneJoin], ["The first 50 households on the waitlist get the founding price. Joining is free.", "The first 50 households on the waitlist get the founding price. Joining is free."],
    "3b after the launch: \"Join the waitlist.\" and \"Payments open October 26.\" out, nothing added");
  t.eq([after.heading, after.price, after.regular, after.phoneHeading], [before.heading, before.price, before.regular, before.phoneHeading], "3c …and every other line unchanged");

  // ── 4. the form, rendered ───────────────────────────────────────────────────────────────────────
  let A = {};
  try { A = loadApp(["WaitlistForm"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  if (A.WaitlistForm) {
    const today = textOf(A.render(A.h(A.WaitlistForm, { source: "hero" })));
    t.ok(today.includes("Join the waitlist") && today.includes(TODAY_LINE) && !today.includes("founding"), "4a today's form: \"Join the waitlist\" and today's line");
    const html = A.render(A.h(A.WaitlistForm, { source: "hero", founding: true }));
    const txt = textOf(html);
    t.ok(txt.includes("Get my founding spot") && !txt.includes("Join the waitlist"), "4b the founding spot form: \"Get my founding spot\"");
    t.ok(txt.includes(FOUNDING_LINE) && !txt.includes(TODAY_LINE), "4c …and the founding spot line under it, word for word");
    t.ok(/<a class="fll-contact-link" href="#contact"[^>]*>Contact<\/a> below\./.test(html), "4d …with \"Contact\" linking to the page's Contact block");
    const form = APP.slice(APP.indexOf("function WaitlistForm("), APP.indexOf("\n}\n", APP.indexOf("function WaitlistForm(")));
    t.ok(/\{founding \? "We'll email you your founding price link\." : "We'll email you when flourish launches in Canada\."\}/.test(form),
      "4e the thank-you after the founding spot form: \"We'll email you your founding price link.\"");
    t.ok(/\{busy \? "Joining…" : founding \? "Get my founding spot" : "Join the waitlist"\}/.test(form), "4f the button's words in both modes");
  }

  // ── 5. the landing ──────────────────────────────────────────────────────────────────────────────
  const auth = APP.slice(APP.indexOf("function AuthScreen("), APP.indexOf("\n}\n", APP.indexOf("function AuthScreen(")));
  t.ok(/sharedFoundingAnswer\(\)\.then\(a => \{ if \(live\) setFoundingAnswer\(a\); \}\);/.test(auth) && !/signup_status[\s\S]{0,40}sharedSignupStatus|sharedSignupStatus/.test(APP),
    "5a the landing reads the one shared /api/founding answer (no signup_status call of its own)");
  t.ok(/if \(isNativeApp\(\)\) return undefined;\s*let live = true;\s*sharedFoundingAnswer\(\)/.test(auth), "5b web only: a store app asks nothing");
  t.eq((APP.match(/<WaitlistForm /g) || []).length, 2, "5c two waitlist forms on the landing (hero, bottom)");
  t.ok(/\{waitlistForms && <WaitlistForm source="hero" founding=\{waitlistArea === "founding"\}\/>\}/.test(auth), "5d the hero form: today's or the founding spot form, by state");
  t.ok(/\{waitlistForms && <FoundingOffer launched=\{waitlistArea === "founding"\}\/>\}/.test(auth), "5e the founding block, with its after-launch words in the founding state");
  const second = auth.slice(auth.indexOf("{/* Second email capture */}"), auth.indexOf("{/* Footer */}"));
  t.ok(/\{waitlistArea === "waitlist" && <>\s*<h2 className="fll-h2"[^>]*>Be first to know\.<\/h2>\s*<p className="fll-lede"[^>]*>Join the waitlist and we'll email you the moment flourish launches in Canada\.<\/p>\s*<\/>\}/.test(second)
    && /<WaitlistForm source="bottom_cta" founding=\{waitlistArea === "founding"\}\/>/.test(second), "5f the bottom form: the launch heading and promise only on today's page");
  t.ok(/if \(!showAuth \|\| askedStatus\.current\) return;/.test(auth), "5g the sign-up card's own status check is unchanged");

  // ── 6. all 50 taken: "Create your account" (approved by ChatGPT and Grok, 2026-10-15) ──────────────
  const hero = auth.slice(auth.indexOf('<div className="fll-hero-form">'), auth.indexOf("<FoundingOffer", auth.indexOf('<div className="fll-hero-form">')));
  t.ok(/\{waitlistArea === "account" && \(\s*<div className="fll-capture fll-account">\s*<style dangerouslySetInnerHTML=\{\{ __html: WAITLIST_FORM_CSS \}\}\/>\s*<button type="button" className="fll-btn" onClick=\{goSignup\}>Create your account<\/button>\s*<p className="fll-consent">Subscriptions are paid and used on flourishmoney\.app\. Not yet available in the iPhone and Android apps\.<\/p>\s*<\/div>\s*\)\}/.test(hero),
    "6a the hero, only when all 50 are taken: one button, \"Create your account\", that opens sign-up, and the approved line under it");
  t.eq((APP.match(/>Create your account</g) || []).length, 1, "6b …the only such button");
  t.ok(/const goSignup = \(\) => \{ setMode\("signup"\);[^}]*setShowAuth\(true\); \};/.test(auth), "6c goSignup is the sign-up opener the page already uses");

  t.summary("landingWaitlist.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
