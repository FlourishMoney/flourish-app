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
};
const APP_STORE = "https://apps.apple.com/ca/app/flourish-money-handled/id6792967778";
const PLAY = "https://play.google.com/store/apps/details?id=com.flourishmoney.app";

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
    ["an Android phone", UA.android, 0, PLAY, "Android to Google Play"],
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
    await page.waitForURL(PLAY);
    t.eq(props(sent), [["Get link", `${base}/get`, { way: "Android to Google Play", ref: "other" }]], "3a an unknown ref is \"other\", and no parameter reaches Plausible");
    t.ok(!JSON.stringify(sent).includes("example.ca") && !JSON.stringify(sent).includes("abc"), "3b …no address, no token anywhere in what was sent");
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

  await browser.close();
  server.close();
  t.summary("FOUNDING STORE LINK (browser)");
})();
