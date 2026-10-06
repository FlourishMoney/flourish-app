// tests/landingDemo.browser.test.cjs
// -----------------------------------------------------------------------------
// THE LANDING PAGE'S SCREENSHOTS START THE DEMO (landing-screens, A1).
//
// Tapping a screenshot in the "real app" strip did nothing. Each of the four now opens the demo with
// the Canadian sample household, the same action as the hero's "Try the demo with Canadian sample data"
// button (landing-contact removed the second button that sat under the strip). Checked in Chromium on
// the built page at 430px: each screenshot and the button, by tap, start the demo; one screenshot and
// the button by keyboard (Tab focus, Enter); and every one is at least 44 x 44.
//
// The hero (landing-hero): the safe-to-spend card cropped from the real capture, and the outlined
// "Try the demo with Canadian sample data →" button, both start the demo too. At 390 x 844 the hero reads
// pill, H1, subline, email field, Join, consent line, card, demo button, read-only line; the field, the
// whole Join button and the card's top are on screen without scrolling; the
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
    await page.getByText("Real screens from the app.").waitFor();
    return { ctx, page };
  };
  // The demo has started (demo-clarity: straight onto Today, no AI disclosure or welcome screen first).
  const demoStarted = async (page) => {
    try {
      await page.getByText("Demo mode", { exact: false }).first().waitFor();
      return !(await page.getByText("About AI in Flourish", { exact: false }).count());
    } catch { return false; }
  };

  const HERO_CARD = "Safe to spend until next payday, $1,944, sample data: try the demo with Canadian sample data";
  const HERO_DEMO = "Try the demo with Canadian sample data →";
  const targets = [...CAPTIONS.map(c => ({ name: `the "${c}" screenshot`, label: `${c}: try the interactive demo` })), { name: "the hero's safe-to-spend card", label: HERO_CARD }, { name: "the hero's demo button", label: HERO_DEMO }];
  for (const tg of targets) {
    const { ctx, page } = await fresh();
    try {
      const btn = page.getByRole("button", { name: tg.label, exact: true });
      t.eq(await btn.count(), 1, `0 ${tg.name} is a button`);
      const box = await btn.boundingBox();
      t.ok(box && box.width >= 44 && box.height >= 44, `1 ${tg.name} is at least 44 x 44 (${box ? `${Math.round(box.width)} x ${Math.round(box.height)}` : "not found"})`);
      await btn.scrollIntoViewIfNeeded(); await btn.tap();
      t.ok(await demoStarted(page), `2 tapping ${tg.name} starts the demo`);
      if (tg.label !== HERO_DEMO) t.ok(await page.getByText("Hey Alex", { exact: false }).first().isVisible().catch(() => false), `2b …with the Canadian sample household`);
    } catch (e) { t.ok(false, `${tg.name}: ${String(e.message).split("\n")[0].slice(0, 140)}`); }
    await ctx.close();
  }
  // Keyboard: focus by Tab, start with Enter.
  for (const label of [`${CAPTIONS[0]}: try the interactive demo`, HERO_DEMO]) {
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
  t.eq(await (async () => { const { ctx, page } = await fresh(); const n = await page.getByRole("button", { name: "Try the interactive demo", exact: true }).count(); await ctx.close(); return n; })(), 0,
    "5 the second demo button under the strip is gone; the hero's button and card are the demo's way in");
  // ── demo-clarity: the demo's first screens, as a new visitor sees them (no flags set) ─────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const scrolledTo = await page.getByRole("button", { name: HERO_DEMO, exact: true }).evaluate(b => { b.scrollIntoView({ block: "center" }); return Math.round(scrollY); });
    await page.getByRole("button", { name: HERO_DEMO, exact: true }).tap();
    await page.getByText("Demo mode", { exact: false }).first().waitFor();
    await page.waitForTimeout(800);
    // The demo starts at the top of Today (not at the landing's scroll); tour step 1 then brings the figure
    // and its breakdown just under the header, so the page may sit a little below 0.
    const top = await page.evaluate(() => { const f = document.querySelector('[data-tour="today"]'), bell = document.querySelector('[aria-label="Notifications"]').getBoundingClientRect().bottom;
      return { y: Math.round(scrollY), fig: f ? Math.round(f.getBoundingClientRect().top) : null, header: Math.round(bell) }; });
    t.ok(scrolledTo > 400 && top.y < 400 && top.fig !== null && top.fig >= top.header && top.fig < 844, `7f tapped from ${scrolledTo}px down the landing, the demo opens on Today (scrolled ${top.y}px) with the $1,944 figure on screen (at ${top.fig}px, header ${top.header}px)`);
    const first = await page.evaluate(() => document.body.innerText);
    t.ok(!/About AI in Flourish/.test(first) && !/You're covered/.test(first), "7a the demo opens on Today: no AI disclosure and no \"You're covered\" screen first");
    t.ok(/Step 1 of 5/.test(first), "7b …with the one intro, the five-step tour");
    const order = await page.evaluate(() => { const t = document.body.innerText; return [t.indexOf("Safe to spend until next payday"), t.indexOf("One thing to know")]; });
    t.ok(order[0] >= 0 && (order[1] < 0 || order[0] < order[1]), "7c the safe-to-spend card is the first card on Today, above \"One thing to know\"");
    t.ok(!/Is this income\?/.test(first), "7d no \"Is this income?\" prompt in the demo");
    t.eq(await page.getByRole("button", { name: "Notifications", exact: true }).first().evaluate(b => b.textContent.trim()).catch(() => "?"), "", "7e no welcome badge on the demo's notifications bell");
    await ctx.close();
  }
  // ── demo-clarity: no tour step covers what it describes (390 x 844 and 430 x 932) ─────────────
  // demo-tour-scroll: and whatever the landing page went through first. The "scrolled" path scrolls to
  // the video block, plays a video and stays more than 3 s (longer than the tour's own retries), then
  // taps "Try the demo" from there without scrolling back up. Before the fix step 1 was never placed on
  // that path and the sheet sat on $1,944. Both paths, reduced motion on and off.
  const RUNS = [];
  for (const rm of ["reduce", "no-preference"]) for (const path of ["top", "scrolled"]) RUNS.push({ vp: { width: 390, height: 844 }, rm, path });
  RUNS.push({ vp: { width: 430, height: 932 }, rm: "no-preference", path: "top" });
  for (const { vp, rm, path: route } of RUNS) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, reducedMotion: rm });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const tag = `${vp.width}x${vp.height} ${route} path, reduced motion ${rm === "reduce" ? "on" : "off"}`;
    if (route === "scrolled") {
      await page.locator(".fll-walk").scrollIntoViewIfNeeded();
      const played = await page.evaluate(async () => { const v = [...document.querySelectorAll(".fll-walk-v")].find(x => x.offsetParent !== null); if (!v) return 0; v.muted = true; try { await v.play(); } catch (e) { return 0; } await new Promise(r => setTimeout(r, 1200)); return v.currentTime; });
      t.ok(played > 0, `10a ${tag}: a video played on the landing page first (${played.toFixed(2)} s)`);
      await page.waitForTimeout(3500);
      t.ok(await page.evaluate(() => scrollY) > 400, `10b ${tag}: the landing is still scrolled down when the demo is opened`);
    }
    await page.getByRole("button", { name: HERO_DEMO, exact: true }).tap();
    await page.getByText("Demo mode", { exact: false }).first().waitFor();
    const names = ["Today", "Watch", "Do", "Learn", "Meet"], targets = ["today", "watch", "do", "coach", "meet"];
    for (let k = 0; k < 5; k++) {
      await page.getByText(`Step ${k + 1} of 5`).waitFor();
      // The tour places a step once the screen's slide-in has ended (about a second on Today with motion
      // on), so the check is polled for up to 4 s, and the time it took is reported.
      const t0 = Date.now(); let m, clear;
      for (;;) {
        m = await page.evaluate((tg) => {
        const els = [...document.querySelectorAll(`[data-tour="${tg}"]`)], sheet = document.getElementById("tour-sheet").getBoundingClientRect();
        if (!els.length) return { missing: true };
        const rs = els.map(e => e.getBoundingClientRect()), top = Math.min(...rs.map(r => r.top)), bottom = Math.max(...rs.map(r => r.bottom));
        let header = document.querySelector('[aria-label="Notifications"]').getBoundingClientRect().bottom;
        // An inner scroller (the coach scrolls under its own bar) clips at its own top.
        for (let p = els[0].parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight + 1) { header = Math.max(header, p.getBoundingClientRect().top); break; } }
        return { top: Math.round(top), bottom: Math.round(bottom), sheetTop: Math.round(sheet.top), sheetBottom: Math.round(sheet.bottom), header: Math.round(header), vh: innerHeight };
      }, targets[k]);
        clear = !m.missing && m.top >= m.header && m.bottom <= m.vh - 90 && (m.bottom <= m.sheetTop || m.top >= m.sheetBottom);
        if (clear || Date.now() - t0 > 4000) break;
        await page.waitForTimeout(100);
      }
      t.ok(clear, `10 ${tag} step ${k + 1} (${names[k]}): what it describes is on screen and not under the sheet (target ${m.top}-${m.bottom}, sheet ${m.sheetTop}-${m.sheetBottom}, header ${m.header}, placed in ${Date.now() - t0} ms)`);
      if (k < 4) await page.getByRole("button", { name: /^Next/ }).last().click();
    }
    await ctx.close();
  }
  // ── demo-clarity: "Why this number?" opens How we got this for the safe-to-spend figure ───────
  {
    const { ctx, page } = await fresh();
    await page.getByRole("button", { name: HERO_DEMO, exact: true }).tap();
    await page.getByText("Demo mode", { exact: false }).first().waitFor();
    await page.getByText("Why this number?", { exact: true }).first().click();
    await page.waitForTimeout(500);
    const txt = await page.evaluate(() => document.body.innerText);
    t.ok(/How Flourish got this\s*\n?\s*Safe to spend until next payday/.test(txt) && !/How it's calculated/.test(txt), "8 \"Why this number?\" opens How we got this for the safe-to-spend figure, not the generic sheet");
    await ctx.close();
  }
  // ── demo-clarity item 8: What-If never shows a $0 purchase (AI off, the demo's "Don't use AI" path) ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem("flourish_tour_done", "1"); localStorage.setItem("flourish_ai_coach_enabled", "0"); } catch (e) {} });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: HERO_DEMO, exact: true }).tap();
    await page.getByText("Demo mode", { exact: false }).first().waitFor();
    await page.getByRole("button", { name: "Decisions", exact: true }).first().click();
    await page.getByText("💸 Buy something").first().click();
    const sim = page.getByRole("button", { name: /Simulate/ }).first();
    await sim.click(); await page.waitForTimeout(800);
    let txt = await page.evaluate(() => document.body.innerText);
    t.ok(!/Spending \$0\b/.test(txt) && /Type the amount too/.test(txt), "8a Simulate on \"Buy a $\" (no amount) asks for the amount; no \"Spending $0\" result");
    await page.getByRole("button", { name: "Buy a $800 laptop", exact: true }).click(); await page.waitForTimeout(1200);
    const input = await page.locator("input[placeholder^='e.g. Buy a $450']").inputValue();
    await sim.click(); await page.waitForTimeout(1500);
    txt = await page.evaluate(() => document.body.innerText);
    t.ok(input === "Buy a $800 laptop" && /Spending \$800 takes safe to spend until payday from \$1,944 to \$1,144\./.test(txt) && !/Spending \$0\b/.test(txt),
      `8b the laptop preset fills the input, and Simulate after it still reads "Spending $800 … from $1,944 to $1,144." (input "${input}")`);
    await ctx.close();
  }
  // ── demo-clarity: "See how it works", three tabbed videos ──────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    const asked = []; page.on("request", r => { if (/\/video\/\w+\.mp4/.test(r.url())) asked.push(r.url()); });
    await page.goto(base, { waitUntil: "load" });
    await page.getByText("Real screens from the app.").waitFor();
    const v = await page.evaluate(() => {
      const box = document.querySelector(".fll-hero .fll-walk"), d = document.querySelector(".fll-hero .fll-demo").getBoundingClientRect();
      const vids = [...box.querySelectorAll("video")].map(x => ({ src: x.getAttribute("src"), poster: x.getAttribute("poster"), label: x.getAttribute("aria-label"), muted: x.muted, playsInline: x.playsInline,
        controls: x.controls, preload: x.getAttribute("preload"), autoplay: x.autoplay, shown: !x.closest("[role=tabpanel]").hidden }));
      return { title: box.querySelector(".fll-walk-t").textContent, tabs: [...box.querySelectorAll("[role=tab]")].map(b => [b.textContent, b.getAttribute("aria-selected")]),
        note: box.querySelector(".fll-walk-note").textContent, vids, above: box.getBoundingClientRect().bottom <= d.top,
        width: Math.max(...[...box.querySelectorAll("video")].map(x => x.getBoundingClientRect().width)), radius: getComputedStyle(box.querySelector("video")).borderTopLeftRadius,
        tabH: Math.min(...[...box.querySelectorAll("[role=tab]")].map(b => b.getBoundingClientRect().height)) };
    });
    t.eq([v.title, v.tabs, v.note], ["See how it works", [["Today", "true"], ["Watch", "false"], ["Meet", "false"]], "Voice is AI-generated. Example, sample data."],
      "9a \"See how it works\": three tabs, Today first, and the note under the block");
    t.eq(v.vids.map(x => [x.src, x.poster, x.shown]), [["/video/today.mp4", "/video/today-poster.jpg", true], ["/video/watch.mp4", "/video/watch-poster.jpg", false], ["/video/meet.mp4", "/video/meet-poster.jpg", false]],
      "9b one video shows at a time, each with its own poster");
    t.ok(v.vids.every(x => x.muted && x.playsInline && x.controls && x.preload === "none" && !x.autoplay && /^How the (Today|Watch|Meet) screen works, with sample data$/.test(x.label)),
      "9c each video is muted, plays inline, has controls, preload none, no autoplay attribute, and a label naming its screen");
    t.ok(v.above && v.width <= 360 && parseFloat(v.radius) > 0 && v.tabH >= 44, "9d the block sits directly above the demo button, videos at most 360px wide with rounded corners, tabs at least 44px tall");
    await page.locator(".fll-walk").scrollIntoViewIfNeeded(); await page.waitForTimeout(1200);
    t.ok(await page.locator(".fll-walk video").first().evaluate(x => x.paused) && asked.length === 0, "9e with reduced motion set nothing plays on its own, and no video file is fetched until asked");
    await page.getByRole("tab", { name: "Watch" }).click();
    t.eq(await page.evaluate(() => [...document.querySelectorAll(".fll-hero .fll-walk [role=tabpanel]")].map(p => !p.hidden)), [false, true, false], "9f choosing Watch shows the Watch video only");
    await ctx.close();
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p2 = await c2.newPage(); const early = []; p2.on("request", r => { if (/\/video\/\w+\.mp4/.test(r.url())) early.push(r.url()); });
    await p2.goto(base, { waitUntil: "load" }); await p2.getByText("Real screens from the app.").waitFor(); await p2.waitForTimeout(800);
    t.eq(early.length, 0, "9g on load, with the block below the fold, no video file is fetched (it cannot compete with the hero for LCP)");
    await p2.locator(".fll-walk").scrollIntoViewIfNeeded(); await p2.waitForTimeout(2500);
    const st = await p2.locator(".fll-walk video").first().evaluate(x => ({ paused: x.paused, muted: x.muted }));
    t.ok(!st.paused && st.muted && early.every(u => /today\.mp4/.test(u)), "9h scrolled into view, the Today video plays, muted, and only it is fetched");
    await c2.close();
  }
  // ── The hero at 390 x 844 (a phone) and 1440 x 900 (a desktop) ───────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.getByText("Real screens from the app.").waitFor();
    await page.locator(".fll-hero-card img").evaluate(img => img.decode());
    const m = await page.evaluate(() => {
      const hero = document.querySelector(".fll-hero"), r = (el) => el && el.getBoundingClientRect();
      const q = (s) => hero.querySelector(s);
      const parts = { pill: r(q(".fll-badge")), h1: r(q(".fll-h1")), sub: r(q(".fll-sub")), card: r(q(".fll-hero-card img")), input: r(q(".fll-input")), join: r(q(".fll-btn")), consent: r(q(".fll-consent")), demo: r(q(".fll-demo")), trust: r(q(".fll-trust")) };
      const pad = parseFloat(getComputedStyle(hero).paddingLeft);
      return { parts, pad, scrollW: document.documentElement.scrollWidth, consent: q(".fll-consent").textContent, cardSrc: q(".fll-hero-card img").getAttribute("src"),
        h1: q(".fll-h1").innerHTML, emColor: getComputedStyle(q(".fll-h1 em")).color, emStyle: getComputedStyle(q(".fll-h1 em")).fontStyle, h1Font: getComputedStyle(q(".fll-h1")).fontFamily };
    });
    const p = m.parts;
    t.ok(p.pill.top < p.h1.top && p.h1.top < p.sub.top && p.sub.top < p.input.top && p.input.top < p.join.top && p.join.top < p.consent.top
      && p.consent.bottom <= p.card.top && p.card.bottom <= p.demo.top && p.demo.bottom <= p.trust.top,
      "6a at 390px the hero reads pill, H1, subline, email field, Join, consent line, card, demo button, read-only line");
    t.ok(p.input.bottom <= 844 && p.join.bottom <= 844, `6b the email field and the whole Join button are on screen without scrolling (Join's bottom at ${Math.round(p.join.bottom)}px of 844)`);
    t.ok(p.card.top < 844, `6b2 …and so is the card's top (at ${Math.round(p.card.top)}px of 844)`);
    t.ok(m.pad >= 16 && [p.input, p.join, p.demo].every(b => b.left >= m.pad - 0.5 && b.right <= 390 - m.pad + 0.5) && m.scrollW <= 390,
      `6c the email field, Join and the demo button sit inside the ${m.pad}px side padding (field ${Math.round(p.input.left)} to ${Math.round(p.input.right)}), and nothing scrolls sideways`);
    t.ok(p.demo.height >= 48 && Math.abs(p.demo.width - p.join.width) < 1 && p.demo.top > p.card.bottom, `6d the demo button is under the card, full width, at least 48px tall (${Math.round(p.demo.width)} x ${Math.round(p.demo.height)})`);
    t.ok(p.consent.top >= p.join.bottom && p.consent.bottom <= p.card.top, "6e one consent line sits directly under the Join button");
    t.ok(/^Stop doing the money math <em>in your head\.<\/em>$/.test(m.h1) && m.emStyle === "italic" && /rgb\(46, 139, 46\)/.test(m.emColor) && /Playfair Display/.test(m.h1Font),
      "6f the H1 is the ad's line, with \"in your head.\" in the serif italic green");
    t.eq(m.cardSrc, "/app-screens/hero-card.jpg", "6g the card is the crop of the real capture");
    await ctx.close();
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const d = await dctx.newPage(); d.setDefaultTimeout(15000);
    await d.goto(base, { waitUntil: "domcontentloaded" });
    await d.getByText("Real screens from the app.").waitFor();
    const dm = await d.evaluate(() => { const r = (s) => document.querySelector(".fll-hero " + s).getBoundingClientRect(); return { h1: r(".fll-h1"), form: r(".fll-input"), card: r(".fll-hero-card img") }; });
    t.ok(dm.card.left > dm.h1.right && dm.card.left > dm.form.right && dm.form.top > dm.h1.top && dm.card.top < 900,
      "6h at 1440px the hero is two columns: text and form on the left, the card on the right, above the fold");
    await dctx.close();
  }
  await browser.close(); server.close();
  t.summary("LANDING DEMO (browser)");
})();
