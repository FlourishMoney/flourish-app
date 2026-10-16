// tests/phoneScroll.browser.test.cjs
// -----------------------------------------------------------------------------
// EVERY TAB SCROLLS UNDER A FINGER, AT PHONE SIZE (hotfix vc15).
//
// The Play build vc14 froze on a real Android phone: in the demo, no tab could be scrolled up or down,
// while the tab bar still worked. The phone layout's content column was a scroll container that never
// scrolls (overflow-y auto, no height limit, so the page is what scrolls) and it carried
// overscroll-behavior: contain. Current Chromium (Chrome and Android System WebView) applies
// overscroll-behavior to a scroll container even when it cannot scroll, so every swipe that started on
// the content stopped there and never reached the page. Older WebViews (the emulators' 113 to 133)
// chained it to the page anyway, which is why an emulator smoke test passed.
//
// Here the demo build runs in Playwright's Chromium at 390x844 with touch, and on each tab and on
// Settings a real touch scroll gesture (CDP Input.synthesizeScrollGesture, the same path a finger takes)
// and a mouse wheel must each move the screen. Before the fix both moved nothing on every tab.
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs"); // removed when this test ends, pass or fail
const { create } = require("./_runner.cjs");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

function buildApp() {
  if (process.env.LAYOUT_DIST) return process.env.LAYOUT_DIST;
  const out = tempDir("phonescroll");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://placeholder.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "placeholder" } });
  return out;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };
function serve(dir) {
  const server = http.createServer((req, res) => {
    let f = path.join(dir, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}
const TAB = (p, name) => p.getByRole("button").filter({ hasText: new RegExp("^" + name + "(\\s*\\d+)?$") }).last().click();

// How far everything on screen has scrolled: the page, plus any element that scrolls its own contents
// (the coach's conversation does). A gesture that moves anything moves this number.
const SCROLLED = () => {
  let n = window.scrollY;
  for (const el of document.querySelectorAll("*")) if (el.scrollTop) n += el.scrollTop;
  return Math.round(n);
};
// Back to the top of the page and of every inner scroller, so each gesture starts from rest.
const TO_TOP = () => { window.scrollTo(0, 0); for (const el of document.querySelectorAll("*")) if (el.scrollTop) el.scrollTop = 0; };

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("PHONE SCROLL (browser)"); return; }
  const dist = buildApp();
  const { server, port } = await serve(dist);
  const browser = await playwright.chromium.launch();
  const W = 390, H = 844;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem("flourish_first_visit_done", "1"); localStorage.setItem("flourish_tour_done", "1"); } catch (e) {} });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
  // A finger's swipe up from the middle of the content (well above the tab bar), 400px, at finger speed.
  const swipe = () => cdp.send("Input.synthesizeScrollGesture", { x: W / 2, y: 560, yDistance: -400, xDistance: 0, gestureSourceType: "touch", speed: 1200 });
  const check = async (label) => {
    await p.evaluate(TO_TOP); await p.waitForTimeout(300);
    const room = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    t.ok(room > 40, `${label}: (the screen is taller than the phone, by ${room}px, so it has somewhere to scroll)`);
    const need = Math.min(100, room - 10);
    const before = await p.evaluate(SCROLLED);
    await swipe(); await p.waitForTimeout(500);
    const touched = await p.evaluate(SCROLLED);
    t.ok(touched - before >= need, `${label}: a finger's swipe scrolls it (moved ${touched - before}px)`);
    await p.evaluate(TO_TOP); await p.waitForTimeout(300);
    await p.mouse.move(W / 2, 560); await p.mouse.wheel(0, 400); await p.waitForTimeout(500);
    const wheeled = await p.evaluate(SCROLLED);
    t.ok(wheeled >= need, `${label}: a mouse wheel scrolls it too (moved ${wheeled}px)`);
  };
  try {
    await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await p.getByText("Try the demo with", { exact: false }).first().click({ timeout: 30000 });
    await p.getByText("Demo mode", { exact: false }).first().waitFor({ timeout: 40000 });
    await p.waitForTimeout(800);
    for (const [name, label] of [["Today", "1 Today"], ["Watch", "2 Watch"], ["Do", "3 Do"], ["Learn", "4 Learn"], ["Meet", "5 Meet"]]) {
      await TAB(p, name); await p.waitForTimeout(700);
      await check(label);
    }
    await p.getByRole("button", { name: "Settings", exact: true }).first().click(); await p.waitForTimeout(700);
    await check("6 Settings");
    t.eq(errors, [], "7 no page errors");
  } catch (e) {
    t.ok(false, "the walk through the tabs finished: " + String(e && e.message || e).slice(0, 160));
  } finally {
    await browser.close(); server.close();
  }
  t.summary("PHONE SCROLL (browser)");
})();
