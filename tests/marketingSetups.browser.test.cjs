// tests/marketingSetups.browser.test.cjs
// -----------------------------------------------------------------------------
// /get WITH src AND cr, AND THE NEWSLETTER PAGE, IN A REAL BROWSER (2026-11-04). The stores and plausible.io are stand-ins.
//   1  iPhone: the App Store's campaign link, ct = src_cr, cut to 30 characters; a landing visit and a store click are counted
//   2  Android: Play's referrer=utm_source%3D{src}%26utm_campaign%3D{cr}
//   3  a computer stays; a badge counts a store click; the website link carries src and cr on
//   4  anything not a plain word is dropped and reaches no store and no count; older ?ref= links keep their exact links
//   5  the newsletter page: hidden until open, the box unticked, no tick no send
//   6  both pages fit 320 px
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const http = require("http");

const PUBLIC = path.join(__dirname, "..", "public");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};
const APP_STORE = "https://apps.apple.com/ca/app/flourish-money-handled/id6792967778";
const PLAY = "https://play.google.com/store/apps/details?id=com.flourishmoney.app";

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("MARKETING SETUPS (browser)"); return; }
  let counted = [], posted = [], open_ = false;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let p = decodeURIComponent(url.pathname);
    if (p === "/api/attribution") { let b = ""; req.on("data", (d) => { b += d; }); req.on("end", () => { counted.push(JSON.parse(b)); res.writeHead(204); res.end(); }); return; }
    if (p === "/api/newsletter") {
      if (req.method === "POST") { let b = ""; req.on("data", (d) => { b += d; }); req.on("end", () => { posted.push(JSON.parse(b)); res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); }); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(open_ ? { open: true, name: "n", version: "v1", wording: "The exact wording." } : { open: false }));
      return;
    }
    if (p === "/get" || p === "/get/") p = "/get/index.html";
    if (p === "/newsletter/") p = "/newsletter/index.html";
    if (p === "/") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<p>the website</p>"); return; }
    const f = path.join(PUBLIC, p);
    if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch();
  const open = async (ua, width = 390) => {
    counted = [];
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, userAgent: ua });
    await ctx.route("https://plausible.io/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
    await ctx.route(/apps\.apple\.com|play\.google\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>store</p>" }));
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    return { ctx, page };
  };
  const settle = async (page, n) => { for (let i = 0; i < 40 && counted.length < n; i++) await page.waitForTimeout(50); };
  const ev = () => counted.map((c) => [c.event, c.src, c.cr]);
  try {
    {
      const { ctx, page } = await open(UA.iphone);
      await page.goto(`${base}/get?src=IG&cr=reel_7`);
      await page.waitForURL(`${APP_STORE}?pt=128816288&ct=ig_reel_7&mt=8`);
      await settle(page, 2);
      t.eq(ev(), [["landing_visit", "ig", "reel_7"], ["store_click", "ig", "reel_7"]], "1a an iPhone goes to the campaign link, and both events are counted");
      await ctx.close();
    }
    {
      const { ctx, page } = await open(UA.iphone);
      const long = "a".repeat(25);
      await page.goto(`${base}/get?src=${long}&cr=creative9`);
      await page.waitForURL(/apps\.apple\.com/);
      const ct = new URL(page.url()).searchParams.get("ct");
      t.eq([ct.length, ct], [30, `${long}_creative9`.slice(0, 30)], "1b ct is cut to the 30 characters App Store Connect allows");
      await ctx.close();
    }
    {
      const { ctx, page } = await open(UA.android);
      await page.goto(`${base}/get?src=tt&cr=c2`);
      await page.waitForURL(`${PLAY}&referrer=utm_source%3Dtt%26utm_campaign%3Dc2`);
      await settle(page, 2);
      t.eq(ev(), [["landing_visit", "tt", "c2"], ["store_click", "tt", "c2"]], "2a Android: Play's referrer, in the exact form asked for, and both events");
      await ctx.close();
    }
    {
      const { ctx, page } = await open(UA.mac, 1440);
      await page.goto(`${base}/get?src=press&cr=c3`);
      await settle(page, 1);
      t.eq(ev(), [["landing_visit", "press", "c3"]], "3a a computer stays: a visit, no click yet");
      t.eq(await page.getAttribute("#website", "href"), "/?src=press&cr=c3", "3b the website link carries src and cr to the signup");
      t.eq(await page.getAttribute("#app-store", "href"), `${APP_STORE}?pt=128816288&ct=press_c3&mt=8`, "3c the App Store badge is tagged");
      t.eq(await page.getAttribute("#google-play", "href"), `${PLAY}&referrer=utm_source%3Dpress%26utm_campaign%3Dc3`, "3d the Play badge too");
      await page.click("#google-play");
      await page.waitForURL(/play\.google\.com/);
      await settle(page, 2);
      t.eq(ev()[1], ["store_click", "press", "c3"], "3e a badge counts a store click");
      await ctx.close();
    }
    {
      const { ctx, page } = await open(UA.android);
      await page.goto(`${base}/get?src=someone%40example.ca&cr=%3Cb%3E&email=someone%40example.ca`);
      await page.waitForURL(/play\.google\.com/);
      await settle(page, 2);
      t.ok(!/example|someone|%3Cb/.test(page.url()), "4a what isn't a plain word never reaches a store");
      t.ok(!JSON.stringify(counted).includes("example") && !JSON.stringify(counted).includes("<b>"), "4b …nor a count");
      await ctx.close();
    }
    {
      const { ctx, page } = await open(UA.android);
      await page.goto(`${base}/get?ref=founding`);
      await page.waitForURL(`${PLAY}&referrer=utm_source%3Dfounding%26utm_medium%3Dsocial%26utm_campaign%3Dfounding`);
      await settle(page, 2);
      t.eq(ev()[0], ["landing_visit", "founding", ""], "4c a sent ?ref= link keeps its exact store link, and is counted under its tag");
      await ctx.close();
    }
    {
      const { ctx, page } = await open(UA.iphone);
      await page.goto(`${base}/get?ref=shop-trenton-bag`);
      await page.waitForURL(`${APP_STORE}?pt=128816288&ct=shop-trenton-bag&mt=8`);
      t.ok(true, "4d a printed shop QR code keeps its exact store link");
      await ctx.close();
    }
    {
      open_ = false;
      const { ctx, page } = await open(UA.iphone);
      await page.goto(`${base}/newsletter/`);
      await page.waitForTimeout(200);
      t.eq([await page.isVisible("#form"), await page.isVisible("#closed")], [false, true], "5a not open: no form");
      await ctx.close();
      open_ = true; posted = [];
      const b = await open(UA.iphone, 320);
      await b.page.goto(`${base}/newsletter/`);
      await b.page.waitForSelector("#form:not([hidden])");
      t.eq([await b.page.textContent("#wording"), await b.page.isChecked("#consent")], ["The exact wording.", false], "5b the server's wording, and the box unticked");
      await b.page.fill("#email", "reader@example.ca");
      await b.page.click("#submit");
      await b.page.waitForTimeout(100);
      t.eq([posted.length, await b.page.isVisible("#error")], [0, true], "5c no tick, nothing sent");
      await b.page.check("#consent");
      await b.page.click("#submit");
      await b.page.waitForSelector("#done:not([hidden])");
      t.eq(posted, [{ email: "reader@example.ca", consent: true, version: "v1", source: "site_newsletter" }], "5d a tick sends the consent, version and source");
      const wide = await b.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      t.eq(wide, 0, "6a the newsletter page fits 320 px");
      await b.ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("MARKETING SETUPS (browser)");
})();
