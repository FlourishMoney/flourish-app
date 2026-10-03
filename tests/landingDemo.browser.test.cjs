// tests/landingDemo.browser.test.cjs
// -----------------------------------------------------------------------------
// THE LANDING PAGE'S SCREENSHOTS START THE DEMO (landing-screens, A1).
//
// Tapping a screenshot in the "real app" strip did nothing. Each of the four now opens the demo with
// the Canadian sample household, the same action as the hero's "preview the app with … sample data"
// link, and a visible "Try the interactive demo" button sits under the strip. Checked in Chromium on
// the built page at 430px: each screenshot and the button, by tap, start the demo; one screenshot and
// the button by keyboard (Tab focus, Enter); and every one is at least 44 x 44.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const CAPTIONS = ["Safe to spend until payday", "Every bill and payday, up to 90 days ahead", "A 15-minute weekly money meeting", "Tap safe to spend to see the math"];

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("LANDING DEMO (browser)"); return; }
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "flourish-landingdemo-"));
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: "https://placeholder.invalid", VITE_SUPABASE_PUBLISHABLE_KEY: "placeholder" } });
  const server = http.createServer((req, res) => {
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await playwright.chromium.launch();

  // A new context each time: the welcome page, with only the first-visit intro and the tour marked
  // as seen (both come after the demo has started, and are tested elsewhere).
  const fresh = async () => {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem("flourish_first_visit_done", "1"); localStorage.setItem("flourish_tour_done", "1"); } catch (e) {} });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.getByText("This is flourish. No mockups.").waitFor();
    return { ctx, page };
  };
  // The demo has started: its AI disclosure appears first, then the demo itself.
  const demoStarted = async (page) => {
    try {
      await page.getByText("About AI in Flourish", { exact: false }).first().waitFor();
      await page.getByText("I Understand & Accept").first().click();
      await page.getByText("Demo mode", { exact: false }).first().waitFor();
      return true;
    } catch { return false; }
  };

  const targets = [...CAPTIONS.map(c => ({ name: `the "${c}" screenshot`, label: `${c}: try the interactive demo` })), { name: "the \"Try the interactive demo\" button", label: "Try the interactive demo" }];
  for (const tg of targets) {
    const { ctx, page } = await fresh();
    try {
      const btn = page.getByRole("button", { name: tg.label, exact: true });
      t.eq(await btn.count(), 1, `0 ${tg.name} is a button`);
      const box = await btn.boundingBox();
      t.ok(box && box.width >= 44 && box.height >= 44, `1 ${tg.name} is at least 44 x 44 (${box ? `${Math.round(box.width)} x ${Math.round(box.height)}` : "not found"})`);
      await btn.scrollIntoViewIfNeeded(); await btn.tap();
      t.ok(await demoStarted(page), `2 tapping ${tg.name} starts the demo`);
      if (tg.label !== "Try the interactive demo") t.ok(await page.getByText("Hey Alex", { exact: false }).first().isVisible().catch(() => false), `2b …with the Canadian sample household`);
    } catch (e) { t.ok(false, `${tg.name}: ${String(e.message).split("\n")[0].slice(0, 140)}`); }
    await ctx.close();
  }
  // Keyboard: focus by Tab, start with Enter.
  for (const label of [`${CAPTIONS[0]}: try the interactive demo`, "Try the interactive demo"]) {
    const { ctx, page } = await fresh();
    try {
      let focused = "";
      for (let i = 0; i < 60 && focused !== label; i++) {
        await page.keyboard.press("Tab");
        focused = await page.evaluate(() => document.activeElement && (document.activeElement.getAttribute("aria-label") || document.activeElement.textContent || "").trim());
      }
      t.eq(focused, label, `3 "${label}" can be reached with Tab`);
      await page.keyboard.press("Enter");
      t.ok(await demoStarted(page), `4 …and Enter starts the demo`);
    } catch (e) { t.ok(false, `keyboard ${label}: ${String(e.message).split("\n")[0].slice(0, 140)}`); }
    await ctx.close();
  }
  await browser.close(); server.close();
  t.summary("LANDING DEMO (browser)");
})();
