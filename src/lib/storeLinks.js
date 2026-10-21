// src/lib/storeLinks.js
// -----------------------------------------------------------------------------
// WHERE THE APPS ARE (the website's store badges, 2026-10-21). Flourish is on the App Store (since
// 2026-10-20) and Google Play (since 2026-10-16). The landing page links to both with the stores' own
// badges, unaltered: Apple's download-on-the-app-store.svg (developer.apple.com, App Store marketing
// guidelines) and Google's GetItOnGooglePlay_Badge_Web_color_English.svg (Google's Partner Marketing Hub,
// "Google Play Badge guidelines"; English, there is no Canadian variant), both in public/store-badges/.
// tests/landingStoreBadges.test.cjs pins the links, the words, the files and where they show.
// -----------------------------------------------------------------------------

export const APP_STORE_URL = "https://apps.apple.com/ca/app/flourish-money-handled/id6792967778";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.flourishmoney.app";

// Apple's badge first (Apple: "Place the App Store badge first in any lineup of badges"), and one pair per page:
// Apple allows one App Store badge per layout, so they show under the hero form only (2026-10-21).
export const STORE_BADGES = Object.freeze([
  Object.freeze({ store: "app_store", href: APP_STORE_URL, src: "/store-badges/download-on-the-app-store.svg", alt: "Download on the App Store", width: 120, height: 40 }),
  Object.freeze({ store: "play_store", href: PLAY_STORE_URL, src: "/store-badges/GetItOnGooglePlay_Badge_Web_color_English.svg", alt: "Get it on Google Play", width: 135, height: 40 }),
]);
