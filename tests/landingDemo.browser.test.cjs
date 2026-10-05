// tests/landingDemo.browser.test.cjs
// -----------------------------------------------------------------------------
// THE LANDING PAGE'S SCREENSHOTS START THE DEMO (landing-screens, A1).
//
// Tapping a screenshot in the "real app" strip did nothing. Each of the four now opens the demo with
// the Canadian sample household, the same action as the hero's "Try the demo with Canadian sample data"
// button, and a visible "Try the interactive demo" button sits under the strip. Checked in Chromium on
// the built page at 430px: each screenshot and the button, by tap, start the demo; one screenshot and
// the button by keyboard (Tab focus, Enter); and every one is at least 44 x 44.
//
// The hero (landing-hero): the safe-to-spend card cropped from the real capture, and the outlined
// "Try the demo with Canadian sample data →" button under the form, both start the demo too. At 390 x 844
// the hero reads pill, H1, subline, card, form; the card's top is on screen without scrolling; the
// email field, the Join button and the demo button sit inside the page's side padding; the demo button is
// at least 48 px tall and full width; one consent line sits under the Join button.
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

  const HERO_CARD = "Safe to spend until next payday, $1,944, sample data: try the demo with Canadian sample data";
  const HERO_DEMO = "Try the demo with Canadian sample data →";
  const targets = [...CAPTIONS.map(c => ({ name: `the "${c}" screenshot`, label: `${c}: try the interactive demo` })), { name: "the \"Try the interactive demo\" button", label: "Try the interactive demo" },
    { name: "the hero's safe-to-spend card", label: HERO_CARD }, { name: "the hero's demo button", label: HERO_DEMO }];
  for (const tg of targets) {
    const { ctx, page } = await fresh();
    try {
      const btn = page.getByRole("button", { name: tg.label, exact: true });
      t.eq(await btn.count(), 1, `0 ${tg.name} is a button`);
      const box = await btn.boundingBox();
      t.ok(box && box.width >= 44 && box.height >= 44, `1 ${tg.name} is at least 44 x 44 (${box ? `${Math.round(box.width)} x ${Math.round(box.height)}` : "not found"})`);
      await btn.scrollIntoViewIfNeeded(); await btn.tap();
      t.ok(await demoStarted(page), `2 tapping ${tg.name} starts the demo`);
      if (tg.label !== "Try the interactive demo" && tg.label !== HERO_DEMO) t.ok(await page.getByText("Hey Alex", { exact: false }).first().isVisible().catch(() => false), `2b …with the Canadian sample household`);
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
  // ── The hero at 390 x 844 (a phone) and 1440 x 900 (a desktop) ───────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.getByText("This is flourish. No mockups.").waitFor();
    await page.locator(".fll-hero-card img").evaluate(img => img.decode());
    const m = await page.evaluate(() => {
      const hero = document.querySelector(".fll-hero"), r = (el) => el && el.getBoundingClientRect();
      const q = (s) => hero.querySelector(s);
      const parts = { pill: r(q(".fll-badge")), h1: r(q(".fll-h1")), sub: r(q(".fll-sub")), card: r(q(".fll-hero-card img")), input: r(q(".fll-input")), join: r(q(".fll-btn")), consent: r(q(".fll-consent")), demo: r(q(".fll-demo")) };
      const pad = parseFloat(getComputedStyle(hero).paddingLeft);
      return { parts, pad, scrollW: document.documentElement.scrollWidth, consent: q(".fll-consent").textContent, cardSrc: q(".fll-hero-card img").getAttribute("src"),
        h1: q(".fll-h1").innerHTML, emColor: getComputedStyle(q(".fll-h1 em")).color, emStyle: getComputedStyle(q(".fll-h1 em")).fontStyle, h1Font: getComputedStyle(q(".fll-h1")).fontFamily };
    });
    const p = m.parts;
    t.ok(p.pill.top < p.h1.top && p.h1.top < p.sub.top && p.sub.top < p.card.top && p.card.top < p.input.top, "6a at 390px the hero reads pill, H1, subline, card, then the form");
    t.ok(p.card.top < 844, `6b the card's top is on screen without scrolling (top at ${Math.round(p.card.top)}px of 844)`);
    t.ok(m.pad >= 16 && [p.input, p.join, p.demo].every(b => b.left >= m.pad - 0.5 && b.right <= 390 - m.pad + 0.5) && m.scrollW <= 390,
      `6c the email field, Join and the demo button sit inside the ${m.pad}px side padding (field ${Math.round(p.input.left)} to ${Math.round(p.input.right)}), and nothing scrolls sideways`);
    t.ok(p.demo.height >= 48 && Math.abs(p.demo.width - p.join.width) < 1 && p.demo.top > p.join.bottom, `6d the demo button is under Join, full width, at least 48px tall (${Math.round(p.demo.width)} x ${Math.round(p.demo.height)})`);
    t.ok(p.consent.top >= p.join.bottom && p.consent.bottom <= p.demo.top, "6e one consent line sits under the Join button");
    t.ok(/^Stop doing the money math <em>in your head\.<\/em>$/.test(m.h1) && m.emStyle === "italic" && /rgb\(46, 139, 46\)/.test(m.emColor) && /Playfair Display/.test(m.h1Font),
      "6f the H1 is the ad's line, with \"in your head.\" in the serif italic green");
    t.eq(m.cardSrc, "/app-screens/hero-card.jpg", "6g the card is the crop of the real capture");
    await ctx.close();
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const d = await dctx.newPage(); d.setDefaultTimeout(15000);
    await d.goto(base, { waitUntil: "domcontentloaded" });
    await d.getByText("This is flourish. No mockups.").waitFor();
    const dm = await d.evaluate(() => { const r = (s) => document.querySelector(".fll-hero " + s).getBoundingClientRect(); return { h1: r(".fll-h1"), form: r(".fll-input"), card: r(".fll-hero-card img") }; });
    t.ok(dm.card.left > dm.h1.right && dm.card.left > dm.form.right && dm.form.top > dm.h1.top && dm.card.top < 900,
      "6h at 1440px the hero is two columns: text and form on the left, the card on the right, above the fold");
    await dctx.close();
  }
  await browser.close(); server.close();
  t.summary("LANDING DEMO (browser)");
})();
