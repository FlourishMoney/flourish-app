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
// The founding list form's small print (the trial-first landing, approved Oct 22; consent version 2026-10-22).
const FOUNDING_LINE = "We'll email you your founding price link, and no other marketing. Unsubscribe any time. Who we are: see Contact below.";

(async () => {
  const t = create();
  const U = await import("../src/lib/signupUi.js");
  const O = await import("../src/lib/foundingOffer.js");

  // ── 1. the rule ─────────────────────────────────────────────────────────────────────────────────
  const area = (answer, extra = {}) => U.landingWaitlistArea({ answer, ...extra });
  // 2026-10-22 (no waitlist flash): flourish launched on October 20, so the trial-first page is the default. Only a
  // real answer with openSignup false shows the signup-shut page; only a real spotsLeft 0 shows the spots-full page.
  for (const [answer, want, why] of [
    [null, "founding", "no answer yet: the trial-first page, from the first paint"],
    [{ spotsLeft: null, openSignup: null }, "founding", "the call failed or timed out: the trial-first page"],
    [{ openSignup: true, spotsLeft: 35 }, "founding", "signup open, spots left: the trial-first page"],
    [{ openSignup: true, spotsLeft: 1 }, "founding", "signup open, the last spot: the trial-first page"],
    [{ openSignup: true, spotsLeft: null }, "founding", "signup open, count not read: the trial-first page"],
    [{ openSignup: null, spotsLeft: 35 }, "founding", "the answer said nothing about signup: the trial-first page"],
    [{ openSignup: "false", spotsLeft: 35 }, "founding", "a string \"false\" is not an answer that signup is shut"],
    [{ openSignup: false, spotsLeft: 35 }, "waitlist", "an actual answer, signup shut: the signup-shut page"],
    [{ openSignup: false, spotsLeft: 0 }, "waitlist", "an actual answer, signup shut, 0 left: the signup-shut page"],
    [{ openSignup: true, spotsLeft: 0 }, "account", "an actual answer, all 50 taken: Create your account"],
    [{ openSignup: null, spotsLeft: 0 }, "account", "a real count of 0 with nothing said about signup: Create your account"],
  ]) t.eq(area(answer), want, `1a ${why}`);
  t.eq(area({ openSignup: true, spotsLeft: 0 }, { native: true }), "waitlist", "1b a store app: never anything but \"waitlist\" (it shows no landing form)");
  t.ok(!("LAUNCH_DAY" in U) && !("LANDING_HOLD_MS" in U) && !/now\b|Date\./.test(String(U.landingWaitlistArea)), "1c no date gate and no hold: the date plays no part");
  t.eq(["2026-10-15T12:00:00-04:00", "2026-10-27T10:00:00-04:00"].map(() => area(null)), ["founding", "founding"], "1d before and after October 26 alike, no answer means the trial-first page");

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
    t.ok(txt.includes("Join the founding list") && !txt.includes("Join the waitlist") && !txt.includes("Get my founding spot"), "4b the founding list form: \"Join the founding list\"");
    t.ok(txt.indexOf("Joining is free. No payment now.") >= 0 && txt.indexOf("Joining is free. No payment now.") < txt.indexOf("Join the founding list") && !today.includes("No payment now"),
      "4b2 …with \"Joining is free. No payment now.\" above its button (the founding form only)");
    t.ok(/<label class="fll-label" for="fll-email-hero">Email address<\/label>/.test(html) && /id="fll-email-hero"/.test(html) && /Email address/.test(A.render(A.h(A.WaitlistForm, { source: "calendar" }))),
      "4b3 a visible \"Email address\" label on the email box, in both forms");
    t.ok(txt.includes(FOUNDING_LINE) && !txt.includes(TODAY_LINE), "4c …and the founding spot line under it, word for word");
    t.ok(/<a class="fll-contact-link" href="#contact"[^>]*>Contact<\/a> below\./.test(html), "4d …with \"Contact\" linking to the page's Contact block");
    const form = APP.slice(APP.indexOf("function WaitlistForm("), APP.indexOf("\n}\n", APP.indexOf("function WaitlistForm(")));
    t.ok(/\{founding \? "We'll email you your founding price link\." : "We'll email you when flourish launches in Canada\."\}/.test(form),
      "4e the thank-you after the founding spot form: \"We'll email you your founding price link.\"");
    t.ok(/\{busy \? "Joining…" : founding \? "Join the founding list" : "Join the waitlist"\}/.test(form), "4f the button's words in both modes");
  }

  // ── 5. the landing ──────────────────────────────────────────────────────────────────────────────
  const auth = APP.slice(APP.indexOf("function AuthScreen("), APP.indexOf("\n}\n", APP.indexOf("function AuthScreen(")));
  t.ok(/sharedFoundingAnswer\(\)\.then\(a => \{ if \(live\) setFoundingAnswer\(a\); \}\);/.test(auth) && !/sharedSignupStatus/.test(APP),
    "5a the landing reads the one shared /api/founding answer (no signup_status call of its own)");
  t.ok(/if \(isNativeApp\(\)\) return undefined;\s*let live = true;\s*sharedFoundingAnswer\(\)\.then\(a => \{ if \(live\) setFoundingAnswer\(a\); \}\);/.test(auth), "5b web only: a store app asks nothing; the answer, when it comes, is the page's state");
  // The trial-first landing (approved Oct 22): with signup shut, today's waitlist forms in the hero and at the
  // bottom; with founding spots open, one founding list form, inside the price box, and the main button instead.
  t.eq((APP.match(/<WaitlistForm /g) || []).length, 3, "5c three waitlist forms in the code: today's in the hero and at the bottom, and the founding list form in the price box");
  t.ok(/\{waitlistArea === "waitlist" && <WaitlistForm source="hero"\/>\}/.test(auth)
    && /<FoundingOffer launched=\{waitlistArea !== "waitlist"\}>\s*\{foundingOpen && <WaitlistForm source="hero" founding onCreateAccount=\{goSignup\}\/>\}\s*<\/FoundingOffer>/.test(auth),
    "5d the hero: today's form with signup shut; the founding list form inside the price box on the trial-first page");
  t.ok(/\{waitlistForms && \(\s*<FoundingOffer launched=\{waitlistArea !== "waitlist"\}>/.test(auth), "5e the price box, with its after-launch words on the trial-first page");
  t.ok(/const trialFirst = waitlistArea === "founding";/.test(auth) && (auth.match(/<TrialButton onClick=\{goSignup\}\/>/g) || []).length === 2,
    "5e2 the main button, top and bottom, on the trial-first page");
  const second = auth.slice(auth.indexOf("{/* Second email capture */}"), auth.indexOf("{/* Footer */}"));
  t.ok(/\{waitlistArea === "waitlist" && \(\s*<div className="fll-wrap fll-section"[^>]*>\s*<div className="fll-cta2">\s*<h2 className="fll-h2"[^>]*>Be first to know\.<\/h2>\s*<p className="fll-lede"[^>]*>Join the waitlist and we'll email you the moment flourish launches in Canada\.<\/p>\s*<WaitlistForm source="bottom_cta"\/>/.test(second)
    && /\{trialFirst && \(\s*<div className="fll-wrap fll-section"[^>]*>\s*<div className="fll-cta2">\s*<TrialButton onClick=\{goSignup\}\/>/.test(second),
    "5f the bottom: the launch heading, promise and form only on today's page; the main button while founding spots are open");
  t.ok(/if \(!showAuth \|\| askedStatus\.current\) return;/.test(auth), "5g the sign-up card's own status check is unchanged");

  // ── 6. all 50 taken: "Create your account" (approved by ChatGPT and Grok, 2026-10-15) ──────────────
  const hero = auth.slice(auth.indexOf('<div className="fll-hero-form">'), auth.indexOf("<FoundingOffer", auth.indexOf('<div className="fll-hero-form">')));
  t.ok(/\{waitlistArea === "account" && \(\s*<div className="fll-capture fll-account">\s*<style dangerouslySetInnerHTML=\{\{ __html: WAITLIST_FORM_CSS \}\}\/>\s*<button type="button" className="fll-btn" onClick=\{goSignup\}>Create your account<\/button>\s*<p className="fll-consent">Subscriptions are paid and used on flourishmoney\.app\. Not yet available in the iPhone and Android apps\.<\/p>\s*<\/div>\s*\)\}/.test(hero),
    "6a the hero, only when all 50 are taken: one button, \"Create your account\", that opens sign-up, and the approved line under it");
  t.eq((APP.match(/>Create your account</g) || []).length, 2, "6b …the only such buttons: this one, and the one under \"The founding spots just filled up\" (section 8)");
  t.ok(/const goSignup = \(\) => \{ setMode\("signup"\);[^}]*setShowAuth\(true\); \};/.test(auth), "6c goSignup is the sign-up opener the page already uses");

  // ── 7. no hold (2026-10-22): the trial-first page from the first paint; the answer, when it comes, decides ──
  t.ok(!/landingNow|LANDING_HOLD_MS|LAUNCH_DAY|setTimeout\(\(\) => settle/.test(auth) && /landingWaitlistArea\(\{ answer: foundingAnswer, native: isNativeApp\(\) \}\)/.test(auth),
    "7a no date read and no timer: the state is the answer alone");
  t.ok(!/fll-held|waitlistHeld|held=\{/.test(APP), "7b nothing is held or hidden while the answer is awaited");
  if (A.WaitlistForm) {
    t.ok(!/aria-hidden="true"/.test(A.render(A.h(A.WaitlistForm, { source: "hero", founding: true }))), "7c the founding list form renders visible");
  }
  const FO = await import("../src/lib/foundingOffer.js");
  t.eq([FO.foundingListLine(null), FO.foundingListLine(undefined), FO.foundingListLine("35"), FO.foundingListLine(0)], [null, null, null, null],
    "7d the count line: none before a real number (no placeholder, no made-up count), and none at 0");
  t.eq(FO.foundingListLine(35), "Founding price: $79.99 a year plus tax for the first 50 households on the founding list. 35 of 50 left.", "7e …and the whole line once 35 is read");

  // ── 8. the two post-launch messages (approved by ChatGPT and Grok, 2026-10-15) ───────────────────────
  {
    const form = APP.slice(APP.indexOf("function WaitlistForm("), APP.indexOf("\n}\n", APP.indexOf("function WaitlistForm(")));
    t.ok(/if \(data\.spotsFull === true\) setStatus\("full"\);\s*else if \(data\.joined\)/.test(form), "8a the server saying the spots filled up comes first, before \"joined\"");
    t.ok(/if \(status === "full"\) \{[\s\S]{0,260}<div className="fll-done-t">The founding spots just filled up<\/div>\s*<div className="fll-done-b">You can still create your account at flourishmoney\.app\.<\/div>\s*\{onCreateAccount && <button type="button" className="fll-btn" onClick=\{onCreateAccount\}>Create your account<\/button>\}/.test(form),
      "8b in place of the thank-you: the title, the line and \"Create your account\", word for word");
    t.ok(/\{status === "already" \? "You're already on the list!" : founding \? "Your founding spot is saved" : "You're on the list"\}/.test(form),
      "8c the thank-you title after \"Get my founding spot\": \"Your founding spot is saved\"; before launch unchanged");
    t.ok(/\{founding \? "We'll email you your founding price link\." : "We'll email you when flourish launches in Canada\."\}/.test(form), "8d …the line under it unchanged");
  }

  t.summary("landingWaitlist.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
