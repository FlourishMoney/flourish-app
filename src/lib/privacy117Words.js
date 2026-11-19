// src/lib/privacy117Words.js
// -----------------------------------------------------------------------------
// THE PRIVACY POLICY'S 1.1.7 WORDS (approved by Amanda, 2026-11-19), word for word: Sign in with Apple and Google, the
// Before you start record (migration 0049 legal_consents) and the Apple refresh token (0049 apple_tokens). They are part of
// the page in this build on the website and in the store apps alike (a store app shows its own bundled copy of the page).
// PRIVACY_117_DATE is the policy's "Last updated" from this change: the day it deploys. The page shows the later of it and
// the newsletter launch's date (/api/newsletter policyDate), and the Before you start record keeps the same date
// (lib/legalConsent.js privacyVersion). tests/privacy117.test.cjs holds all of this.
// -----------------------------------------------------------------------------

export const PRIVACY_117_WORDS = Object.freeze({
  signInLabel: "Signing in with Apple or Google:",
  signIn: "If you choose Continue with Apple or Continue with Google, we receive an account ID from Apple or Google and the email address they give us. If you use Apple's Hide My Email, that is a private address Apple creates, and our emails reach you through Apple. From Google we also receive the name on your Google account and a link to its profile picture. We store that link but do not use it to load or display your picture. We never receive your Apple or Google password.",
  agreementLabel: "Your agreement to our Terms and this Privacy Policy:",
  agreement: "When you tap Get started on the Before you start step, we record that you agreed, the words you were shown, the dates of the Terms and Privacy Policy you agreed to, when those words were shown, when your agreement was recorded, and whether you were on the website, iPhone or Android. We do not store your IP address with this record. We keep it for as long as your account exists so we can show what you agreed to and when, and it is deleted with your account.",
  appleLabel: "Apple sign-in:",
  apple: "If you sign in with Apple, we keep a refresh token from Apple in encrypted form. We use it only to revoke the Sign in with Apple connection for flourish when you delete your flourish account. The token is deleted with your account.",
});

// The day this deploys (YYYY-MM-DD). Set it to the real deploy day before deploying.
export const PRIVACY_117_DATE = "2026-11-19";

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The policy's date: the later of the newsletter launch's date and this change's. Same-shape dates compare as text. */
export function privacyDate(policyDate) {
  return isDate(policyDate) && policyDate > PRIVACY_117_DATE ? policyDate : PRIVACY_117_DATE;
}
