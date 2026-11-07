// src/lib/privacyLaunchWords.js
// -----------------------------------------------------------------------------
// THE PRIVACY POLICY'S NEWSLETTER WORDS (approved by ChatGPT and Grok, 2026-11-05: ~/Documents/Flourish/04 Plans/
// PRIVACY-WORDS-APPROVED-2026-11-05.md), word for word. They show only from the day the newsletter goes live: the row in
// public.newsletter_launch (migration 0037), read through /api/newsletter, opens the forms and turns these on together and
// gives the policy its new "Last updated" date. Until then the policy is exactly as it was. Every app version reads the same
// row, so a store build doesn't need replacing to show them. A store app never names the website: nothing here does.
// -----------------------------------------------------------------------------

export const POLICY_WORDS = Object.freeze({
  newsletter: "If you sign up for Canadian money dates this week, our weekly email, we collect your email address, a record that you ticked the consent box, the exact wording you agreed to, the date and time you agreed, whether you confirmed from the email we send you, the page or app screen you signed up from, and the type of browser or app you used (for example Safari, Chrome or the flourish app). We do not store your IP address with your sign-up. You are not added to the list until you confirm from that email, and every email we send has a one-click unsubscribe. The newsletter is separate from having a flourish account: signing up for one does not sign you up for the other, and people already on the waitlist are not added to it.",
  cameFrom: "when you reach us through one of our own links, posts or store listings, that link can carry a short code naming the post or picture it came from. On our public web pages we record that a visit happened and that someone tapped through to the App Store or Google Play, along with that code. On Android, Google Play can pass the campaign code to the app the first time you open it, and we store that code with your account so we can tell which of our own posts led to that account. We keep it for as long as your account exists, and it is deleted with your account. The code describes the marketing source, not a personal characteristic about you. We do not combine it with information from other companies, store an advertising identifier with it, or use it to build an advertising profile.",
  testers: "if you were given a tester code and you enter it when you sign up, we store that code and the date you entered it on your account. If you answer the questions we show testers in the app, your answers are saved to your account. We use the answers to improve flourish. We do not publish them, give them to advertisers or tie anything you answer to a rating or review. Our service providers may process them only as needed to run flourish, as described below.",
  ipSentence: "We use it briefly to limit repeated account sign-ups, newsletter sign-ups and coach requests, which protects your account and the service from abuse.",
  use: "We use your newsletter email address only to send you Canadian money dates this week and to show, if we are ever asked, that you agreed to receive it. We do not use it to advertise other companies, and we never sell or rent it.",
  keep: "If you sign up for the newsletter, we keep your email address until you unsubscribe. We keep the record of your consent and unsubscribe for three years after you unsubscribe as part of our CASL compliance records, so we can show when and how you agreed and when you withdrew your consent. Unsubscribing stops the weekly email straight away and does not delete your flourish account.",
  resend: "sends account emails, waitlist emails, and the weekly newsletter, including its confirmation and unsubscribe links",
  googlePlay: "when you install the Android app from one of our own links, Google Play passes us the campaign code that link carried (Google Play Install Referrer)",
  analytics: "We also keep our own count, on our own servers, of page visits and taps through to the App Store or Google Play, with the campaign code described above. We do not store an IP address, cookie or other identifier with those counts.",
  // Section 6, the bullet after "Website analytics" (website only), approved 2026-11-06 (claude/CLARITY-WORDS-APPROVED-2026-11-06.md),
  // word for word after its "Microsoft Clarity:" label. "Microsoft's privacy statement" in it becomes the link (MICROSOFT_PRIVACY_URL).
  clarity: "on our public website pages only, we use Microsoft Clarity heatmaps and session recordings to understand how visitors use a page, such as where they tap and how far they scroll, so we can improve those pages. Clarity is not used in the flourish app, on sign-in or sign-up pages, at checkout, or on any page shown while you are signed in, and it does not load for visitors in Quebec, the European Economic Area, the United Kingdom or Switzerland. We use Clarity's Strict masking setting, which masks all text on the page, and we have turned off Clarity cookies, so Clarity does not use those cookies to link page views into multi-page sessions. Clarity receives interaction and technical information, including information used for IP-based location and information about the visitor's browser and device. Microsoft's privacy statement applies to Microsoft's handling of that information.",
  age: "The newsletter is also intended for people aged 18 and over.",
  address: "PO Box 29, Foxboro ON K0K 2B0",
});

export const MICROSOFT_PRIVACY_TEXT = "Microsoft's privacy statement";
export const MICROSOFT_PRIVACY_URL = "https://privacy.microsoft.com/privacystatement";

// The Clarity bullet as [before, link text, after], so the policy can link "Microsoft's privacy statement". No link text: [all].
export function microsoftLinkParts(text) {
  const t = String(text || "");
  const i = t.indexOf(MICROSOFT_PRIVACY_TEXT);
  return i < 0 ? [t] : [t.slice(0, i), MICROSOFT_PRIVACY_TEXT, t.slice(i + MICROSOFT_PRIVACY_TEXT.length)];
}

// "2026-11-12" to "November 12, 2026". null for anything else, which keeps the policy as it was.
export function policyDateLabel(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(d);
}
