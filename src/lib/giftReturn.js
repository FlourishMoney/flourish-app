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

// Words (docs/review/GIFT-COPY.md), placeholders until approved. Empty in a native build.
export const GIFT_SIGN_IN_NOTE = NATIVE_BUILD ? "" : "[WORDS: gift-signin-note]";
export const GIFT_SETTINGS_LINE = NATIVE_BUILD ? "" : "[WORDS: gift-settings-line]";

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
