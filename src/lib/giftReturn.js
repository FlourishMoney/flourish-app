// src/lib/giftReturn.js
// -----------------------------------------------------------------------------
// BACK TO THE GIFT'S REDEEM PAGE AFTER SIGNING IN. WEBSITE ONLY.
//
// The redeem page (public/gift/redeem.html) needs a signed-in account. Signed out, its "Sign in or create an account"
// opens the website's own sign-in at /?gift=redeem. The app remembers that on this device for 7 days (so confirming a
// new account's email, which lands on /confirmed, still ends at the redeem page), opens the sign-in card, and once the
// person is signed in sends them to /gift/redeem.
//
// NEVER IN A STORE APP (Apple 3.1.1: no unlocking with a code, and no way to it, inside the app). A native build is
// compiled with VITE_NATIVE_BUILD=true, which empties every address and every line below, so the iPhone and Android
// bundles hold no gift path and no gift words (scripts/check-native-build.mjs refuses one that does). At run time the
// app also checks isNativeApp() before asking any of this.
// -----------------------------------------------------------------------------

const NATIVE_BUILD = import.meta.env.VITE_NATIVE_BUILD === "true";

export const GIFT_RETURN_PARAM = NATIVE_BUILD ? "" : "gift";
export const GIFT_RETURN_VALUE = NATIVE_BUILD ? "" : "redeem";
export const GIFT_REDEEM_PATH = NATIVE_BUILD ? "" : "/gift/redeem";
export const GIFT_RETURN_KEY = NATIVE_BUILD ? "" : "flourish_gift_return_at";
export const GIFT_RETURN_TTL_MS = 7 * 86400000;

// Words approved 2026-11-20 (docs/review/GIFT-COPY.md; tests/giftWords.test.cjs holds them word for word). Empty in a
// native build.
export const GIFT_SIGN_IN_NOTE = NATIVE_BUILD ? "" : "Sign in or create an account to redeem your gift. You'll come back to the code page after.";
export const GIFT_SETTINGS_LINE = NATIVE_BUILD ? "" : "Your plan is a gift and runs to {date}. Nothing renews.";

// The Terms of Service's "Gifts" section, on the WEBSITE's Terms only (src/App.jsx, after section 7). Never in a store
// app: the apps say nothing about gifts or buying on the web (Apple 3.1.1), so a native build compiles this to null.
export const GIFT_TERMS = NATIVE_BUILD ? null : Object.freeze({
  heading: "Gifts",
  paragraphs: Object.freeze([
    "You can buy a year of flourish as a gift at flourishmoney.app/gift. A gift is a one-time purchase: nothing renews, and redeeming it does not require payment details.",
    "The price is shown on the gift page in Canadian dollars. Sales tax is added at checkout. Stripe processes the payment.",
    "Each gift has one code. A code can be redeemed once, on one flourish account, on our website; it can't be redeemed in the iPhone or Android app. The code doesn't expire.",
    "The 12 months start on the latest of the day the code is redeemed, any start date the buyer chose, or the end of any paid period already on the account. To avoid being charged again, turn off auto-renew where that paid plan was bought: the App Store, Google Play, or Stripe through our website.",
    "If the buyer chose email delivery, we email the gift to the address they gave at 7 a.m. Eastern time on the date they chose. We use that address only to send the gift.",
    "A gift that hasn't been redeemed can be refunded within 30 days of purchase. Write to hello@flourishmoney.app. A refund cancels the code. Once a code is redeemed, the gift can't be refunded or moved to another account.",
    "A gift has no cash value and can't be exchanged for money or credit. Keep the code private until you give it: anyone who has the code can redeem it.",
  ]),
});

// The Privacy Policy's "Gifts" entry (approved 2026-11-20, docs/review/PLUS-COPY-APPROVED-2026-11-20.md, last section), on
// the WEBSITE's policy only (src/App.jsx, section 1, after the 1.1.7 entries), for the same reason as the Terms section.
export const GIFT_PRIVACY = NATIVE_BUILD ? null : Object.freeze({
  label: "Gifts:",
  paragraph: "If you buy a flourish gift on our website, we keep your name and email, the name and email you give us for the person receiving it, your optional message, the dates you choose for sending and starting, and the gift's code and status. Stripe processes the payment, and we never receive your card number. We use the recipient's email only to send that gift on the date you chose, and the email shows your name. When a gift is redeemed, we record which flourish account redeemed it and when. If you give us someone else's name and email, please make sure they would be comfortable getting a gift email from flourish. We keep gift information only as long as we need it to send, redeem, refund or support the gift, or to meet our legal record-keeping requirements.",
});

// The day the Terms' Gifts section and the Privacy Policy's Gifts entry go live on the website (YYYY-MM-DD): the day this
// deploys. SET IT TO THE REAL DEPLOY DAY BEFORE DEPLOYING (docs/ops/GIFT-GO-LIVE.md, step 1). On the website both pages'
// "Last updated" is the later of their own date and this one, and the Before you start record keeps the same dates
// (lib/legalConsent.js). A store app's pages carry no gift words, so their dates do not move: null in a native build.
export const GIFT_LEGAL_DATE = NATIVE_BUILD ? null : "2026-11-20";

/** Does this query string ask to come back to the redeem page? */
export function giftReturnInUrl(search) {
  if (!GIFT_RETURN_PARAM) return false;
  try {
    const q = String(search || "");
    return new URLSearchParams(q.startsWith("?") ? q.slice(1) : q).get(GIFT_RETURN_PARAM) === GIFT_RETURN_VALUE;
  } catch {
    return false;
  }
}

/** The same query string without it ("" when nothing is left). */
export function withoutGiftReturn(search) {
  try {
    const q = String(search || "");
    const p = new URLSearchParams(q.startsWith("?") ? q.slice(1) : q);
    if (GIFT_RETURN_PARAM && p.get(GIFT_RETURN_PARAM) === GIFT_RETURN_VALUE) p.delete(GIFT_RETURN_PARAM);
    const s = p.toString();
    return s ? `?${s}` : "";
  } catch {
    return String(search || "");
  }
}

export function rememberGiftReturn(storage, now = Date.now()) {
  if (!GIFT_RETURN_KEY) return;
  try { storage.setItem(GIFT_RETURN_KEY, String(now)); } catch { /* storage blocked */ }
}
export function forgetGiftReturn(storage) {
  if (!GIFT_RETURN_KEY) return;
  try { storage.removeItem(GIFT_RETURN_KEY); } catch { /* storage blocked */ }
}
/** Was the redeem page asked for on this device in the last 7 days? */
export function giftReturnPending(storage, now = Date.now()) {
  if (!GIFT_RETURN_KEY) return false;
  try {
    const at = Number(storage.getItem(GIFT_RETURN_KEY));
    return Number.isFinite(at) && at > 0 && now - at < GIFT_RETURN_TTL_MS;
  } catch {
    return false;
  }
}

/** Settings' plan line for an account whose plan is a gift (the billing status says covered_by "gift"). */
export function giftSettingsLine(status) {
  if (!GIFT_SETTINGS_LINE || !status || status.covered_by !== "gift" || !status.period_end) return null;
  const d = new Date(status.period_end);
  if (!Number.isFinite(d.getTime())) return null;
  const date = d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" });
  return GIFT_SETTINGS_LINE.replace("{date}", date);
}
