// src/lib/storeLinks.js
// -----------------------------------------------------------------------------
// WHERE THE APPS ARE (the website's store badges, 2026-10-21). Flourish is on the App Store (since
// 2026-10-20) and Google Play (since 2026-10-16). The landing page links to both with the stores' own
// badges, unaltered: Apple's download-on-the-app-store.svg (developer.apple.com, App Store marketing
// guidelines) and Google's GetItOnGooglePlay_Badge_Web_color_English.svg (Google's Partner Marketing Hub,
// "Google Play Badge guidelines"; English, there is no Canadian variant), both in public/store-badges/.
// tests/landingStoreBadges.test.cjs pins the links, the words, the files and where they show.
//
// THE SHOP QR CODES (2026-11-02). A visit from ?src= one of the six shop tags (each shop's counter and bag) gets badges that
// carry the tag: Apple's campaign link (pt, our provider, and ct, the tag) and a Play referrer. Every other visit,
// the other campaigns included, gets the plain links. Nothing personal goes in either: only the tag.
// -----------------------------------------------------------------------------

export const APP_STORE_URL = "https://apps.apple.com/ca/app/flourish-money-handled/id6792967778";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.flourishmoney.app";

export const STORE_CAMPAIGN_SRCS = Object.freeze(["shop-trenton-counter", "shop-trenton-bag", "shop-napanee-counter", "shop-napanee-bag", "shop-belleville-counter", "shop-belleville-bag"]);
// The App Store Connect provider of the developer account that ships Flourish.
const APPLE_PROVIDER_TOKEN = "128816288";

// Apple's badge first (Apple: "Place the App Store badge first in any lineup of badges"), and one pair per page:
// Apple allows one App Store badge per layout, so they show under the hero form only (2026-10-21).
export const STORE_BADGES = Object.freeze([
  Object.freeze({ store: "app_store", href: APP_STORE_URL, src: "/store-badges/download-on-the-app-store.svg", alt: "Download on the App Store", width: 120, height: 40 }),
  Object.freeze({ store: "play_store", href: PLAY_STORE_URL, src: "/store-badges/GetItOnGooglePlay_Badge_Web_color_English.svg", alt: "Get it on Google Play", width: 135, height: 40 }),
]);

// The badges for a visit from this src. Read like the server reads it (spaces and case do not matter), and anything
// outside STORE_CAMPAIGN_SRCS gets the plain links, so nothing typed into the address reaches a store link.
// A visit with its own src and cr (lib/attribution.js landingAttribution) gets the same tagged links as /get (public/get/get.js):
// Apple's campaign link with ct = src_cr cut to the 30 characters App Store Connect allows, and a Play referrer of
// utm_source=src&utm_campaign=cr. The shop QR codes keep their own links.
export const APPLE_CT_MAX = 30;
const TAG = /^[a-z0-9_-]{1,40}$/;
export function storeBadgesFor(src, attribution) {
  const tag = typeof src === "string" ? src.trim().toLowerCase() : "";
  const a = attribution && TAG.test(String(attribution.src || "")) ? { src: attribution.src, cr: TAG.test(String(attribution.cr || "")) ? attribution.cr : "" } : null;
  if (!STORE_CAMPAIGN_SRCS.includes(tag) && a) {
    const ct = (a.cr ? `${a.src}_${a.cr}` : a.src).slice(0, APPLE_CT_MAX);
    const hrefs = {
      app_store: `${APP_STORE_URL}?pt=${APPLE_PROVIDER_TOKEN}&ct=${ct}&mt=8`,
      play_store: `${PLAY_STORE_URL}&referrer=${encodeURIComponent(`utm_source=${a.src}${a.cr ? `&utm_campaign=${a.cr}` : ""}`)}`,
    };
    return STORE_BADGES.map((b) => ({ ...b, href: hrefs[b.store] }));
  }
  if (!STORE_CAMPAIGN_SRCS.includes(tag)) return STORE_BADGES;
  const hrefs = {
    app_store: `${APP_STORE_URL}?pt=${APPLE_PROVIDER_TOKEN}&ct=${tag}&mt=8`,
    play_store: `${PLAY_STORE_URL}&referrer=${encodeURIComponent(`utm_source=${tag}&utm_medium=qr&utm_campaign=shop`)}`,
  };
  return STORE_BADGES.map((b) => ({ ...b, href: hrefs[b.store] }));
}
