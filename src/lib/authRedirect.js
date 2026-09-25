// src/lib/authRedirect.js
// -----------------------------------------------------------------------------
// WHERE A PASSWORD-RESET LINK COMES BACK TO.
//
// An auth email is opened in the system browser, never inside the store app, so the link cannot
// come back to capacitor://localhost — that scheme means nothing outside the shell, and Supabase
// would reject it against the redirect allow-list anyway. Both store apps therefore send people to
// the website, they set the new password there, and they return to the app to log in.
//
// Universal links (an https:// link that opens the app directly) are the better answer and are a
// later update; they need the Apple App Site Association and Android assetlinks.json files hosted
// on flourishmoney.app. See docs/ops/AUTH-EMAIL.md.
//
// The query marker is the only channel there is: the browser and the app share no storage, so the
// website cannot otherwise know the reset began in the app. If Supabase ever strips it the page
// simply behaves as it does for a web visitor — the password is still updated either way.
//
// Pure: the window is passed in, so a store app and a browser can both be tested.
// -----------------------------------------------------------------------------

import { isNativeApp } from "./billingVisibility.js";

// The one production origin. Native has no usable origin of its own, so it cannot be derived.
export const WEB_ORIGIN = "https://flourishmoney.app";

// The marker that says "this reset started in a store app".
export const RESET_FROM_KEY = "reset_from";
export const RESET_FROM_APP = "app";

// Shown on the website after the password is updated, when the reset began in the app. The person
// is in a browser and their app is still logged out; tell them the one thing left to do.
export const PASSWORD_UPDATED_IN_APP =
  "Your password is updated. Open the Flourish app and log in with your new password.";

// Where supabase.auth.resetPasswordForEmail should send the person back to.
// Native: always the website, with the marker. Web: its own origin, so deploy previews keep working.
export function passwordResetRedirect(win = typeof window === "undefined" ? undefined : window) {
  if (isNativeApp(win)) return `${WEB_ORIGIN}/?${RESET_FROM_KEY}=${RESET_FROM_APP}`;
  try {
    return win?.location?.origin || WEB_ORIGIN;
  } catch {
    return WEB_ORIGIN;
  }
}

// Did this reset start in a store app? Reads the query string the link came back with.
export function startedInApp(search) {
  try {
    const q = String(search || "").replace(/^\?/, "");
    return new URLSearchParams(q).get(RESET_FROM_KEY) === RESET_FROM_APP;
  } catch {
    return false;
  }
}
