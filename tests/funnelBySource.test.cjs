// tests/funnelBySource.test.cjs
// -----------------------------------------------------------------------------
// SOURCE AND CREATIVE ON THE HOME PAGE (migration 0043, docs/ops/MEASUREMENT.md).
//   1  the visit's src and cr: from the address, then the browser session; never in a store app
//   2  the home page's two store badges carry them the way /get does (ct cut to Apple's 30, the Play referrer)
//   3  a badge tap is our own count with src and cr only; the landing view sends them to beta.js
//   4  beta.js counts the home visit by src and cr beside its 0027 count, and never a main-button tap
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

(async () => {
  const t = create();
  const A = await import(path.join(ROOT, "src/lib/attribution.js"));
  const L = await import(path.join(ROOT, "src/lib/storeLinks.js"));
  const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) || null, setItem: (k, v) => m.set(k, v) }; };

  // ── 1. the visit's own src and cr ──────────────────────────────────────────────────────────────────────
  t.eq(A.landingAttribution("?src=Pinterest&cr=benefits-nov-a", mem()), { src: "pinterest", cr: "benefits-nov-a" }, "1a from the address, lowercased");
  t.eq(A.landingAttribution("?cr=reel_7", mem()), { src: "direct", cr: "reel_7" }, "1b a cr alone goes under direct, as /get does");
  t.eq(A.landingAttribution("", mem({ [A.WEB_KEY]: JSON.stringify({ src: "ig", cr: "reel_7" }) })), { src: "ig", cr: "reel_7" }, "1c after a reload, from the browser session");
  t.eq(A.landingAttribution("?src=<script>&cr=a%20b", mem()), null, "1d anything that is not a plain short word is dropped");
  t.eq(A.landingAttribution("", mem()), null, "1e no code, nothing");
  globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } };
  t.eq(A.landingAttribution("?src=ig", mem()), null, "1f never in a store app");
  delete globalThis.window;

  // ── 2. the badges ──────────────────────────────────────────────────────────────────────────────────────
  const [apple, play] = L.storeBadgesFor("direct", { src: "pinterest", cr: "benefits-nov-a" }).map((b) => b.href);
  t.eq(apple, `${L.APP_STORE_URL}?pt=128816288&ct=pinterest_benefits-nov-a&mt=8`, "2a App Store: the campaign link, ct = src_cr");
  t.eq(play, `${L.PLAY_STORE_URL}&referrer=utm_source%3Dpinterest%26utm_campaign%3Dbenefits-nov-a`, "2b Google Play: referrer=utm_source%3D{src}%26utm_campaign%3D{cr}");
  const long = L.storeBadgesFor("direct", { src: "pinterest", cr: "a-very-long-creative-name-here" })[0].href;
  t.eq(long.split("ct=")[1].split("&")[0], "pinterest_a-very-long-creative", "2c ct is cut to the 30 characters App Store Connect allows");
  t.eq(L.storeBadgesFor("direct", { src: "ig", cr: null })[1].href, `${L.PLAY_STORE_URL}&referrer=utm_source%3Dig`, "2d no cr: no utm_campaign");
  t.eq(L.storeBadgesFor("shop-trenton-bag", { src: "ig", cr: "x" })[0].href, `${L.APP_STORE_URL}?pt=128816288&ct=shop-trenton-bag&mt=8`, "2e a shop QR code keeps its own printed link");
  t.eq(L.storeBadgesFor("direct", null).map((b) => b.href), [L.APP_STORE_URL, L.PLAY_STORE_URL], "2f no code: the plain links, as before");
  t.eq(L.storeBadgesFor("direct", { src: "Bad Tag", cr: "x" }).map((b) => b.href), [L.APP_STORE_URL, L.PLAY_STORE_URL], "2g nothing typed into the address reaches a store link");
  const get = fs.readFileSync(path.join(ROOT, "public/get/get.js"), "utf8");
  t.ok(/APPLE_CT_MAX = 30/.test(get) && L.APPLE_CT_MAX === 30, "2h /get and the home page cut ct at the same 30");

  // ── 3. what the page sends ─────────────────────────────────────────────────────────────────────────────
  const beacons = [];
  const beacon = (url, blob) => { beacons.push({ url, blob }); return true; };
  t.eq(A.countStoreClick({ src: "ig", cr: "reel_7" }, { beacon }), true, "3a a badge tap is sent");
  const body = JSON.parse(await beacons[0].blob.text());
  t.eq([beacons[0].url, body], ["/api/attribution", { event: "store_click", src: "ig", cr: "reel_7" }], "3b …to our own count, with the event, src and cr only");
  A.countStoreClick(null, { beacon });
  t.eq(JSON.parse(await beacons[1].blob.text()), { event: "store_click", src: "", cr: "" }, "3c no code: counted as direct by the server");
  const app = fs.readFileSync(path.join(ROOT, "src/App.jsx"), "utf8");
  t.ok(/storeBadgesFor\(captureWaitlistSrc\(\), landingAttribution\(\)\)/.test(app), "3d the home page's badges use the visit's src and cr");
  t.ok(/countStoreClick\(landingAttribution\(\)\)/.test(app), "3e …and a tap on one is counted");
  const lc = fs.readFileSync(path.join(ROOT, "src/lib/landingCounts.js"), "utf8");
  t.ok(/attribution: landingAttribution\(\)/.test(lc), "3f the landing view carries the visit's src and cr to beta.js");

  // ── 4. beta.js ─────────────────────────────────────────────────────────────────────────────────────────
  const beta = fs.readFileSync(path.join(ROOT, "netlify/functions/beta.js"), "utf8");
  const block = beta.slice(beta.indexOf('if (action === "landing_count")'), beta.indexOf('if (action === "waitlist_count")'));
  t.ok(/if \(body\.event === "landing_view"\)/.test(block) && /name: "home_visit", attribution: body\.attribution/.test(block), "4a a landing view is also a home_visit by src and cr");
  t.ok(/bumpLandingCount\(/.test(block), "4b …beside its 0027 count, which is unchanged");
  const lib = require("../netlify/functions/_lib/attribution.js");
  t.ok(lib.COUNT_EVENTS.includes("home_visit") && !lib.PUBLIC_EVENTS.includes("home_visit"), "4c home_visit is counted by the server, not accepted from /api/attribution");
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true }; };
  await lib.bumpAttributionCount({ supabaseUrl: "https://x", secretKey: "k", name: "home_visit", attribution: { src: "IG", cr: "<b>" }, platform: "ios", fetchImpl });
  t.eq(calls[0], { p_event: "home_visit", p_src: "ig", p_cr: "none", p_platform: "ios" }, "4d the database gets the event, a clean src and cr and the platform, nothing else");

  t.summary("FUNNEL BY SOURCE");
})();
