// tests/privacy117.test.cjs
// -----------------------------------------------------------------------------
// THE PRIVACY POLICY'S 1.1.7 WORDS (approved by Amanda, 2026-11-19), WORD FOR WORD, IN THEIR PLACES (src/lib/privacy117Words.js).
//
//   1  the three paragraphs, held here as their own copy: the words module equals it, character for character;
//   2  on the rendered page (website, iPhone, Android): each under its label, Sign-in and agreement in section 1 ("what we
//      collect"), Apple sign-in in section 5 ("how we keep your information"), each exactly once;
//   3  no em or en dash, flourish lowercase as approved;
//   4  the date: PRIVACY_117_DATE is a real date, the page shows the later of it and the newsletter launch's date, and
//      the Before you start record (lib/legalConsent.js) keeps the same date the page shows.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { loadApp, textOf, describe } = require("./_renderApp.cjs");

const SIGN_IN = "Signing in with Apple or Google: If you choose Continue with Apple or Continue with Google, we receive an account ID from Apple or Google and the email address they give us. If you use Apple's Hide My Email, that is a private address Apple creates, and our emails reach you through Apple. From Google we also receive the name on your Google account and a link to its profile picture. We store that link but do not use it to load or display your picture. We never receive your Apple or Google password.";
const AGREEMENT = "Your agreement to our Terms and this Privacy Policy: When you tap Get started on the Before you start step, we record that you agreed, the words you were shown, the dates of the Terms and Privacy Policy you agreed to, when those words were shown, when your agreement was recorded, and whether you were on the website, iPhone or Android. We do not store your IP address with this record. We keep it for as long as your account exists so we can show what you agreed to and when, and it is deleted with your account.";
const APPLE = "Apple sign-in: If you sign in with Apple, we keep a refresh token from Apple in encrypted form. We use it only to revoke the Sign in with Apple connection for flourish when you delete your flourish account. The token is deleted with your account.";

(async () => {
  const t = create();
  const M = await import("../src/lib/privacy117Words.js");
  const L = await import("../src/lib/legalConsent.js");
  const { policyDateLabel } = await import("../src/lib/privacyLaunchWords.js");
  const W = M.PRIVACY_117_WORDS;

  // ── 1. The words module, character for character ─────────────────────────────────────────────
  t.eq(`${W.signInLabel} ${W.signIn}`, SIGN_IN, "1a Signing in with Apple or Google, word for word");
  t.eq(`${W.agreementLabel} ${W.agreement}`, AGREEMENT, "1b Your agreement to our Terms and this Privacy Policy, word for word");
  t.eq(`${W.appleLabel} ${W.apple}`, APPLE, "1c Apple sign-in, word for word");
  t.eq(Object.keys(W).sort(), ["agreement", "agreementLabel", "apple", "appleLabel", "signIn", "signInLabel"], "1d nothing else in the module");

  // ── 3. The approved spelling ───────────────────────────────────────────────────────────────────
  for (const [k, x] of [["sign-in", SIGN_IN], ["agreement", AGREEMENT], ["apple", APPLE]]) t.ok(!/[–—]/.test(x), `3a ${k}: no em or en dash`);
  t.ok(!/Flourish/.test(APPLE) && (APPLE.match(/flourish/g) || []).length === 2, "3b flourish lowercase, twice, as approved");

  // ── 2. On the page, in their places, on every platform ────────────────────────────────────────
  let R = null;
  try { R = loadApp(["PrivacyPolicy"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  if (R) {
    const real = globalThis.Capacitor;
    const setPlatform = (pl) => Object.defineProperty(globalThis, "Capacitor", { value: { ...real, getPlatform: () => pl, isNativePlatform: () => pl !== "web" }, configurable: true, writable: true });
    for (const pl of ["web", "ios", "android"]) {
      for (const launchDate of [null, "2026-11-07"]) {
        let page = "";
        setPlatform(pl);
        try { page = textOf(R.render(R.h(R.PrivacyPolicy, { onBack() {}, launchDate }))).replace(/\s+/g, " ").replace(/ :/g, ":"); } finally { setPlatform("web"); }
        const tag = `${pl}${launchDate ? ", newsletter live" : ""}`;
        const once = (x) => page.indexOf(x) >= 0 && page.indexOf(x) === page.lastIndexOf(x);
        t.ok(once(SIGN_IN) && once(AGREEMENT) && once(APPLE), `2a ${tag}: all three paragraphs, word for word, once each`);
        const s1 = page.slice(page.indexOf("1. Information We Collect"), page.indexOf("2. How We Use Your Information"));
        const s5 = page.slice(page.indexOf("5. Data Storage & Security"), page.indexOf("6. Data Sharing"));
        t.ok(s1.includes(SIGN_IN) && s1.includes(AGREEMENT) && s1.indexOf(SIGN_IN) < s1.indexOf(AGREEMENT), `2b ${tag}: sign-in then agreement, in section 1 (what we collect)`);
        t.ok(s5.includes(APPLE) && !s1.includes(APPLE), `2c ${tag}: Apple sign-in in section 5 (how we keep your information)`);
        t.ok(page.includes(`Last updated ${policyDateLabel(M.privacyDate(launchDate))}`), `2d ${tag}: Last updated is privacyDate of the newsletter date`);
      }
    }
  }

  // ── 4. The date ─────────────────────────────────────────────────────────────────────────────────
  const D = M.PRIVACY_117_DATE;
  t.ok(/^\d{4}-\d{2}-\d{2}$/.test(D) && !!policyDateLabel(D) && D >= "2026-11-19", "4a PRIVACY_117_DATE is a real date, no earlier than the words' approval");
  t.eq([M.privacyDate(null), M.privacyDate(""), M.privacyDate("nope"), M.privacyDate("2026-11-07"), M.privacyDate("2099-01-01"), M.privacyDate("2099-13-40"), M.privacyDate("2099-02-30")], [D, D, D, D, "2099-01-01", D, D],
    "4b the later of the newsletter launch date and the 1.1.7 date; anything that is not a real date (shape or calendar) gives the 1.1.7 date");
  t.ok(L.PRIVACY_BASE_DATE === D && ["2026-11-07", null, "2099-01-01"].every((x) => L.privacyVersion(x) === M.privacyDate(x)),
    "4c Before you start records the date the page shows");

  t.summary("privacy117.test");
})();
