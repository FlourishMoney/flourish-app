// src/lib/storeReview.js
// -----------------------------------------------------------------------------
// "RATE FLOURISH" IN SETTINGS (tester suggestions, item 3).
//
// A row the person taps, which opens the store's own review page. Nothing in front of it: no
// "do you like us?" question, no reward. The automatic ask is separate (reviewRules.js).
//
//   Android  the Play listing for com.flourishmoney.app (android/app/build.gradle applicationId).
//   iOS      the App Store "write a review" page, which needs the app's numeric Apple ID. That ID is
//            not in this repo and the app is not on the store yet, so APP_STORE_ID is null and the
//            row is hidden on iOS until it is filled in (App Store Connect → App Information → Apple
//            ID), as decided 2026-10-01.
//   web      no store to review in, so no row.
// The URL is opened by navigating to it: a Capacitor app hands a URL outside its own origin to the
// system, which opens the Play Store or App Store app.
// -----------------------------------------------------------------------------

export const ANDROID_PACKAGE = "com.flourishmoney.app";
export const APP_STORE_ID = null;

export function rateUrl(platform, appStoreId = APP_STORE_ID) {
  if (platform === "android") return `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  if (platform === "ios" && appStoreId && /^\d{6,12}$/.test(String(appStoreId))) return `https://apps.apple.com/app/id${appStoreId}?action=write-review`;
  return null;
}
