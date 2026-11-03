// tests/foundingStoreLink.browser.test.cjs
// -----------------------------------------------------------------------------
// THE DEVICE LINK IN A REAL BROWSER (public/get/, 2026-10-27): flourishmoney.app/get?ref=founding.
//
// The stores are answered by a stand-in page, and plausible.io by a stand-in for its script that records what the
// real one would send: each call, passed through the transformRequest the page gave plausible.init.
//   1  an iPhone, an iPad (also one that asks for the desktop site) and an Android phone go straight to their store,
//      and each is counted once: "Get link", its way and ref "founding", the page address without its query
//   2  a computer stays on the page: both badges and the website link, nothing counted until a click; each click is
//      counted with its way, then followed (the website to the founding checkout)
//   3  nothing typed into the address reaches Plausible: an unknown ref is "other", an extra parameter is dropped
//   4  Plausible blocked: the phone still goes to its store, within a second
//   5  the page fits a 320 px window without sideways scrolling, light and dark
//   6  the Instagram and Facebook in-app browsers, iPhone and Android, go to their store and are counted the same way
//   7  Android's link carries the Play referrer; only a plain short ref reaches Google
//   8  no flash: on a phone the card is hidden before first paint; a computer's never is; a failed redirect shows it
//   9  the shops' QR codes: each device goes to the tagged link, a computer's badges carry the tag; a near miss does not
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const http = require("http");

const PUBLIC = path.join(__dirname, "..", "public");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const STUB = `(function(){var w=window,o=(w.plausible&&w.plausible.o)||{},q=(w.plausible&&w.plausible.q)||[];
function send(n,a){var p={n:n,u:location.href,r:document.referrer||null};if(a&&a.props)p.p=a.props;var out=o.transformRequest?o.transformRequest(p):p;if(out)w.__record(out);if(a&&a.callback)setTimeout(a.callback,0);}
w.plausible=function(n,a){send(n,a)};w.plausible.o=o;w.plausible.init=function(){};q.forEach(function(a){send(a[0],a[1])});})();`;
const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  instagramIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 402.0.0.34.86 (iPhone15,3; iOS 18_6; en_CA; en; scale=3.00; 1290x2796; 793405268; IABMV/1)",
  facebookIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/530.0.0.41.106;FBBV/765432100;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBID/phone;FBLC/en_CA;FBOP/5]",
  instagramAndroid: "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP4A.250205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/135.0.7049.79 Mobile Safari/537.36 Instagram 402.0.0.34.86 Android (35/15; 420dpi; 1080x2424; Google/google; Pixel 9; tokay; tokay; en_CA; 793405268)",
  facebookAndroid: "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP4A.250205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/135.0.7049.79 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/530.0.0.41.106;]",
};
const APP_STORE = "https://apps.apple.com/ca/app/flourish-money-handled/id6792967778";
const PLAY = "https://play.google.com/store/apps/details?id=com.flourishmoney.app";
const playFor = (source) => `${PLAY}&referrer=utm_source%3D${source}%26utm_medium%3Dsocial%26utm_campaign%3Dfounding`;

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("FOUNDING STORE LINK (browser)"); return; }
  // public/ as Netlify serves it: /get is public/get/index.html.
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/get" || p === "/get/") p = "/get/index.html";
    if (p === "/") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<p>the website</p>"); return; }
    const f = path.join(PUBLIC, p);
    if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch();
  const open = async ({ ua, touch = 0, width = 390, blockPlausible = false, scheme = "light" } = {}) => {
    const sent = [];
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, userAgent: ua, colorScheme: scheme });
    await ctx.exposeBinding("__record", (_src, out) => { sent.push(out); });
    if (touch) await ctx.addInitScript((n) => { Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => n }); }, touch);
    await ctx.route("https://plausible.io/**", (r) => (blockPlausible ? r.abort() : r.fulfill({ status: 200, contentType: "text/javascript", body: STUB })));
    await ctx.route(/apps\.apple\.com|play\.google\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>store</p>" }));
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    return { ctx, page, sent };
  };
  const props = (s) => s.map((x) => [x.n, x.u, x.p]);

  // ── 1. Phones and tablets go straight to their store ──────────────────────────────────────────
  for (const [who, ua, touch, store, way] of [
    ["an iPhone", UA.iphone, 0, APP_STORE, "iPhone or iPad to the App Store"],
    ["an iPad", UA.ipad, 0, APP_STORE, "iPhone or iPad to the App Store"],
    ["an iPad asking for the desktop site", UA.ipadDesktop, 5, APP_STORE, "iPhone or iPad to the App Store"],
    ["an Android phone", UA.android, 0, playFor("founding"), "Android to Google Play"],
  ]) {
    const { ctx, page, sent } = await open({ ua, touch });
    await page.goto(`${base}/get?ref=founding`);
    await page.waitForURL((u) => u.href.startsWith(store.split("?")[0]));
    t.eq(page.url(), store, `1a ${who}: straight to ${store.includes("apple") ? "the App Store" : "Google Play"} listing`);
    t.eq(props(sent), [["Get link", `${base}/get`, { way, ref: "founding" }]], `1b ${who}: counted once, its way and ref only, the page without its query`);
    await ctx.close();
  }

  // ── 2. A computer stays on the page ───────────────────────────────────────────────────────────
  {
    const { ctx, page, sent } = await open({ ua: UA.mac, width: 1440 });
    await page.goto(`${base}/get?ref=founding`);
    await page.waitForTimeout(900);
    t.eq(page.url(), `${base}/get?ref=founding`, "2a a computer stays on the page");
    const shown = await page.evaluate(() => ({
      badges: [...document.querySelectorAll(".badges a")].map((a) => [a.href, a.querySelector("img").alt, a.querySelector("img").complete && a.querySelector("img").naturalWidth > 0]),
      website: document.getElementById("website").getAttribute("href"),
      sizes: [getComputedStyle(document.querySelector("h1")).fontSize, getComputedStyle(document.querySelector(".web")).fontSize],
    }));
    t.eq(shown.badges, [[APP_STORE, "Download on the App Store", true], [PLAY, "Get it on Google Play", true]], "2b one App Store badge, then one Google Play badge, both drawn, each to its listing");
    t.eq([shown.website, shown.sizes], ["/?checkout=founding", ["22px", "14px"]], "2c the website is the smaller second way, to the founding checkout");
    t.eq(sent.length, 0, "2d nothing counted until a click");
    await page.click("#website");
    await page.waitForURL(`${base}/?checkout=founding`);
    t.eq(props(sent), [["Get link", `${base}/get`, { way: "Page: website", ref: "founding" }]], "2e the website link: counted, then followed to /?checkout=founding");
    await ctx.close();
    for (const [id, way, store] of [["#app-store", "Page: App Store badge", APP_STORE], ["#google-play", "Page: Google Play badge", PLAY]]) {
      const o = await open({ ua: UA.mac, width: 1440 });
      await o.page.goto(`${base}/get?ref=founding`);
      await o.page.click(id);
      await o.page.waitForURL(store);
      t.eq(props(o.sent), [["Get link", `${base}/get`, { way, ref: "founding" }]], `2f ${way}: counted, then followed to its listing`);
      await o.ctx.close();
    }
  }

  // ── 3. Nothing typed into the address reaches Plausible ───────────────────────────────────────
  {
    const { ctx, page, sent } = await open({ ua: UA.android });
    await page.goto(`${base}/get?ref=someone%40example.ca&email=someone%40example.ca&t=abc`);
    await page.waitForURL(playFor("other"));
    t.eq(props(sent), [["Get link", `${base}/get`, { way: "Android to Google Play", ref: "other" }]], "3a an unknown ref is \"other\", and no parameter reaches Plausible");
    t.ok(!JSON.stringify(sent).includes("example.ca") && !JSON.stringify(sent).includes("abc"), "3b …no address, no token anywhere in what was sent");
    t.ok(!/example|someone|abc/.test(page.url()), "3b2 …nor in the address Google is sent");
    await ctx.close();
    const o = await open({ ua: UA.mac, width: 1440 });
    await o.page.goto(`${base}/get?ref=other`);
    t.eq(await o.page.getAttribute("#website", "href"), "/", "3c not the founding link: the website link goes to the home page");
    await o.ctx.close();
  }

  // ── 4. Plausible blocked ──────────────────────────────────────────────────────────────────────
  {
    const { ctx, page } = await open({ ua: UA.iphone, blockPlausible: true });
    const started = Date.now();
    await page.goto(`${base}/get?ref=founding`);
    await page.waitForURL(APP_STORE);
    t.ok(Date.now() - started < 3000, `4a Plausible blocked: the iPhone still reaches the App Store (${Date.now() - started} ms)`);
    await ctx.close();
  }

  // ── 5. Fits a narrow window, light and dark ───────────────────────────────────────────────────
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await open({ ua: UA.mac, width: 320, scheme });
    await page.goto(`${base}/get?ref=founding`);
    const fit = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, bg: getComputedStyle(document.body).backgroundColor }));
    t.ok(fit.over <= 0, `5a ${scheme}: no sideways scrolling at 320 px (${fit.over})`);
    t.eq(fit.bg, scheme === "light" ? "rgb(244, 241, 235)" : "rgb(18, 21, 30)", `5b ${scheme}: the page's own background`);
    await ctx.close();
  }

  // ── 6. The Instagram and Facebook in-app browsers ─────────────────────────────────────────────
  for (const [who, ua, ref, store, way] of [
    ["Instagram on iPhone", UA.instagramIos, "instagram", APP_STORE, "iPhone or iPad to the App Store"],
    ["Facebook on iPhone", UA.facebookIos, "facebook", APP_STORE, "iPhone or iPad to the App Store"],
    ["Instagram on Android", UA.instagramAndroid, "instagram", playFor("instagram"), "Android to Google Play"],
    ["Facebook on Android", UA.facebookAndroid, "facebook", playFor("facebook"), "Android to Google Play"],
  ]) {
    const { ctx, page, sent } = await open({ ua });
    await page.goto(`${base}/get?ref=${ref}`);
    await page.waitForURL(store);
    t.eq(page.url(), store, `6a ${who}: straight to its store`);
    t.eq(props(sent), [["Get link", `${base}/get`, { way, ref: "other" }]], `6b ${who}: counted once, before it went, as today's fixed list has it`);
    await ctx.close();
  }

  // ── 7. The Play referrer ─────────────────────────────────────────────────────────────────────
  for (const [query, source] of [["ref=story_1", "story_1"], ["ref=a%26utm_source%3Devil", "other"], [`ref=${"x".repeat(41)}`, "other"], ["", "other"]]) {
    const { ctx, page } = await open({ ua: UA.android });
    await page.goto(`${base}/get?${query}`);
    await page.waitForURL(playFor(source));
    t.eq(new URL(page.url()).searchParams.get("referrer"), `utm_source=${source}&utm_medium=social&utm_campaign=founding`, `7a "${query.slice(0, 24)}": utm_source is ${source}`);
    await ctx.close();
  }

  // ── 8. No flash ──────────────────────────────────────────────────────────────────────────────
  {
    for (const [who, ua, want] of [["an iPhone", UA.iphone, "hidden"], ["Instagram on Android", UA.instagramAndroid, "hidden"], ["a computer", UA.mac, "visible"]]) {
      const o = await open({ ua });
      const seen = [];
      await o.ctx.exposeBinding("__seen", (_src, v) => { seen.push(v); });
      await o.ctx.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { window.__seen(getComputedStyle(document.querySelector("main")).visibility); }, { capture: true, once: true }); });
      await o.page.goto(`${base}/get?ref=founding`, { waitUntil: "commit" });
      for (let i = 0; i < 50 && !seen.length; i++) await new Promise((ok) => setTimeout(ok, 100));
      t.eq(seen[0], want, `8a ${who}: the card is ${want} when the page is first parsed`);
      await o.ctx.close();
    }
    const o = await open({ ua: UA.iphone });
    // A 204 leaves the browser on this page, as a handover to the store app does.
    await o.ctx.route(/apps\.apple\.com|play\.google\.com/, (r) => r.fulfill({ status: 204 }));
    await o.page.goto(`${base}/get?ref=founding`, { waitUntil: "commit" });
    await o.page.waitForFunction(() => getComputedStyle(document.querySelector("main")).visibility === "visible", null, { timeout: 5000 });
    t.ok(await o.page.isVisible("#app-store"), "8b the page is still here after the redirect: the card shows, with its badges");
    await o.ctx.close();
  }

  // ── 9. The shop QR codes ─────────────────────────────────────────────────────────────────────
  const L = await import("../src/lib/storeLinks.js");
  for (const shop of L.STORE_CAMPAIGN_SRCS) {
    const [apple, play] = L.storeBadgesFor(shop).map((b) => b.href);
    t.eq([apple, new URL(play).searchParams.get("referrer")], [`${APP_STORE}?pt=128816288&ct=${shop}&mt=8`, `utm_source=${shop}&utm_medium=qr&utm_campaign=shop`], `9a ${shop}: the links asked for`);
    for (const [who, ua, store, way] of [
      ["an iPhone", UA.iphone, apple, "iPhone or iPad to the App Store"],
      ["an iPad", UA.ipad, apple, "iPhone or iPad to the App Store"],
      ["Instagram on iPhone", UA.instagramIos, apple, "iPhone or iPad to the App Store"],
      ["Facebook on iPhone", UA.facebookIos, apple, "iPhone or iPad to the App Store"],
      ["an Android phone", UA.android, play, "Android to Google Play"],
      ["Instagram on Android", UA.instagramAndroid, play, "Android to Google Play"],
      ["Facebook on Android", UA.facebookAndroid, play, "Android to Google Play"],
    ]) {
      const { ctx, page, sent } = await open({ ua });
      await page.goto(`${base}/get?ref=${shop}`);
      await page.waitForURL(store);
      t.eq(page.url(), store, `9b ${shop}, ${who}: straight to the tagged store link`);
      t.eq(props(sent), [["Get link", `${base}/get`, { way, ref: "other" }]], `9c ${shop}, ${who}: counted once before it went, as any other /get link, with no tag in what was sent`);
      await ctx.close();
    }
    const o = await open({ ua: UA.mac, width: 1440 });
    await o.page.goto(`${base}/get?ref=${shop}`);
    await o.page.waitForTimeout(300);
    t.eq([o.page.url(), await o.page.getAttribute("#app-store", "href"), await o.page.getAttribute("#google-play", "href"), await o.page.getAttribute("#website", "href"), o.sent.length],
      [`${base}/get?ref=${shop}`, apple, play, "/", 0], `9d ${shop}, a computer: stays on the page, both badges carry the tag, nothing counted until a click`);
    await o.ctx.close();
    for (const [id, way, store] of [["#app-store", "Page: App Store badge", apple], ["#google-play", "Page: Google Play badge", play]]) {
      const c = await open({ ua: UA.mac, width: 1440 });
      await c.page.goto(`${base}/get?ref=${shop}`);
      await c.page.click(id);
      await c.page.waitForURL(store);
      t.eq(props(c.sent), [["Get link", `${base}/get`, { way, ref: "other" }]], `9e ${shop}, a computer, ${way}: counted, then followed to the tagged link`);
      await c.ctx.close();
    }
  }
  // Near misses are like any other ref: no campaign link, and Play's referrer as in section 7.
  for (const miss of ["shop-kingston", "SHOP-TRENTON", "shop-trenton2"]) {
    const i = await open({ ua: UA.iphone });
    await i.page.goto(`${base}/get?ref=${miss}`);
    await i.page.waitForURL(APP_STORE);
    t.eq(i.page.url(), APP_STORE, `9f "${miss}", an iPhone: the plain App Store link`);
    await i.ctx.close();
    const a = await open({ ua: UA.android });
    await a.page.goto(`${base}/get?ref=${miss}`);
    await a.page.waitForURL(playFor(miss));
    t.eq(a.page.url(), playFor(miss), `9g "${miss}", Android: treated as any other ref, not as a shop`);
    await a.ctx.close();
    const c = await open({ ua: UA.mac, width: 1440 });
    await c.page.goto(`${base}/get?ref=${miss}`);
    await c.page.waitForTimeout(300);
    t.eq([await c.page.getAttribute("#app-store", "href"), await c.page.getAttribute("#google-play", "href")], [APP_STORE, PLAY], `9h "${miss}", a computer: the plain badges`);
    await c.ctx.close();
  }

  await browser.close();
  server.close();
  t.summary("FOUNDING STORE LINK (browser)");
})();
