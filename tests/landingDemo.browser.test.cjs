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
  // ── howto-picker: "See how it works", one player and a grid of eight tiles ─────────────────────
  // Visitors could not tell there were several videos or that they had sound. Now: a subline that says
  // both, one player with a "Play with sound" button over the first frame (no autoplay), and a tile per
  // video with its name and length. A tap plays with sound and shows a sound control.
  const SERIES = [["overview", "Overview", 30], ["getting-started", "Getting started", 30], ["today", "Today", 30], ["decisions", "Decisions", 23], ["watch", "Watch", 22], ["do", "Do", 24], ["learn", "Learn", 17], ["meet", "Meet", 23]];
  for (const [w, h, cols] of [[390, 844, 2], [1440, 900, 4]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 768 ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    const asked = []; page.on("request", r => { if (/\/video\/[\w-]+\.mp4/.test(r.url())) asked.push(r.url().split("/").pop()); });
    await page.goto(base, { waitUntil: "load" });
    await page.getByText("Real screens from the app.").waitFor(); await page.waitForTimeout(1200);
    const v = await page.evaluate(() => {
      const box = document.querySelector(".fll-hero .fll-walk"), d = document.querySelector(".fll-hero .fll-demo").getBoundingClientRect(), vid = box.querySelector("video"), play = box.querySelector(".fll-walk-play");
      const tiles = [...box.querySelectorAll(".fll-walk-tile")];
      return { title: box.querySelector(".fll-walk-t").textContent, sub: box.querySelector(".fll-walk-sub").textContent, note: box.querySelector(".fll-walk-note").textContent,
        videos: box.querySelectorAll("video").length, src: vid.getAttribute("src"), poster: vid.getAttribute("poster"), preload: vid.getAttribute("preload"), autoplay: vid.autoplay, paused: vid.paused,
        play: play && play.textContent.trim(), playLabel: play && play.getAttribute("aria-label"), playH: play && play.getBoundingClientRect().height,
        tiles: tiles.map(t => [t.getAttribute("aria-label"), t.querySelector(".fll-walk-tile-n").textContent, t.querySelector(".fll-walk-tile-s").textContent.trim(), t.querySelector("img").getAttribute("src"), t.getAttribute("aria-pressed")]),
        tileH: Math.min(...tiles.map(t => t.getBoundingClientRect().height)), cols: getComputedStyle(box.querySelector(".fll-walk-grid")).gridTemplateColumns.split(" ").length,
        outline: getComputedStyle(tiles[0]).outlineColor, above: box.getBoundingClientRect().bottom <= d.top,
        pageScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    const tag = `at ${w}px`;
    t.eq([v.title, v.sub, v.note], ["See how it works", "Short videos, 30 seconds or less. Tap one to play with sound.", "Voice is AI-generated. Example, sample data."], `9a ${tag} the heading, the subline and the AI-voice line`);
    t.eq([v.videos, v.src, v.poster, v.preload, v.autoplay, v.paused], [1, "/video/overview.mp4", "/video/overview-poster.jpg", "none", false, true], `9b ${tag} one player, Overview's first frame as its poster, preload none, no autoplay, paused`);
    t.eq([v.play, v.playLabel], ["▶ Play with sound", "Play Overview video, 30 seconds, with sound"], `9c ${tag} the big centred button says it plays with sound`);
    t.eq(v.tiles, SERIES.map(([id, n, s], i) => [`Play ${n} video, ${s} seconds, with sound`, n, `${s} s ▶`, `/video/${id}-poster.jpg`, i === 0 ? "true" : "false"]),
      `9d ${tag} eight tiles in order, each with its poster, name, length, ▶ and a spoken label; Overview selected`);
    t.ok(v.cols === cols && v.tileH >= 44 && v.playH >= 44 && v.outline === "rgb(77, 124, 15)" && v.above && !v.pageScroll,
      `9e ${tag} ${cols} tile columns, 44px targets, the lime outline on the selected tile, the block above the demo button, no sideways page scroll (${JSON.stringify({ cols: v.cols, tileH: v.tileH, outline: v.outline, pageScroll: v.pageScroll })})`);
    t.eq(asked, [], `9f ${tag} no video file is fetched before a tap`);
    await page.getByRole("button", { name: "Play Today video, 30 seconds, with sound" }).click();
    await page.waitForFunction(() => { const x = document.querySelector(".fll-walk video"); return x && !x.paused && x.currentTime > 0.2; }, null, { timeout: 15000 }).catch(() => {});
    const p = await page.evaluate(() => { const x = document.querySelector(".fll-walk video"), s = document.querySelector(".fll-walk-sound"), st = document.querySelector(".fll-walk-stage").getBoundingClientRect();
      return { src: x.getAttribute("src"), playing: !x.paused, muted: x.muted, controls: x.controls, sound: s && s.textContent.trim(), soundH: s && s.getBoundingClientRect().height,
        selected: document.querySelector(".fll-walk-tile[aria-pressed=true] .fll-walk-tile-n").textContent, inView: st.top >= -1 && st.bottom <= innerHeight + 1, playBtn: !!document.querySelector(".fll-walk-play") }; });
    t.eq([p.src, p.playing, p.muted, p.controls, p.sound, p.selected, p.inView, p.playBtn], ["/video/today.mp4", true, false, true, "🔊 Sound on", "Today", true, false],
      `9g ${tag} tapping the Today tile plays it with sound in the player, in view, with controls and a "Sound on" button`);
    await page.locator(".fll-walk-sound").click();
    t.eq(await page.evaluate(() => [document.querySelector(".fll-walk video").muted, document.querySelector(".fll-walk-sound").textContent.trim(), document.querySelector(".fll-walk-sound").getAttribute("aria-pressed")]),
      [true, "🔇 Sound off", "true"], `9h ${tag} the sound button mutes, and says so (44px: ${p.soundH})`);
    await ctx.close();
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
  }
  // ── The founding card above the email field: phones and tablets only (2026-10-07) ─────────────
  {
    const ROWS = ["FOUNDING PRICE · FIRST 50 HOUSEHOLDS", "$79.99 a year", "$99.99 a year", "35 of 50 left",
      "$20 a year less than the regular $99.99.",
      "Plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet in the iPhone and Android apps."];
    // count: a 35 the endpoint read; fail: this server answers /api/founding with the page, which is not
    // a count (a real failure); zero: all spots taken.
    for (const mode of ["count", "fail", "zero"]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage(); page.setDefaultTimeout(15000);
      let calls = 0;
      page.on("request", r => { if (/\/api\/founding/.test(r.url())) calls++; });
      if (mode !== "fail") await page.route("**/api/founding", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ spotsLeft: mode === "zero" ? 0 : 35 }) }));
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.getByText("Real screens from the app.").waitFor();
      await page.locator(".fll-founding").waitFor();
      await page.locator(".fll-hero-card img").evaluate(img => img.decode());
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => {
        const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
        const card = document.querySelector(".fll-founding-card");
        const rows = card ? [".fll-fc-eyebrow", ".fll-fc-price", ".fll-fc-regular", ".fll-fc-pill", ".fll-fc-save", ".fll-fc-small"].map(s => (card.querySelector(s) || {}).textContent || null) : null;
        return { rows, struck: card ? getComputedStyle(card.querySelector(".fll-fc-regular")).textDecorationLine : null,
          card: r(".fll-founding-card"), input: r(".fll-input"), join: r(".fll-btn"), top: r(".fll-hero-card img"),
          live: (document.querySelector("[data-founding-live]") || {}).textContent || null };
      });
      t.eq(calls, 1, `10a ${mode}: one /api/founding request, shared by the card and the block`);
      if (mode === "zero") {
        t.eq(m.rows, null, "10b 0 left: no founding card");
        t.eq(m.live, "Founding spots are full. Join the waitlist for launch news.", "10c …and the block still says the spots are full");
      } else {
        t.eq(m.rows, mode === "count" ? ROWS : ROWS.map((r, k) => (k === 3 ? null : r)),
          mode === "count" ? "10d the card, row by row, with the live count in the pill" : "10e no count read: only the pill is left out");
        t.eq(m.struck, "line-through", `10f ${mode}: the regular price is struck through`);
        t.ok(m.card.top >= 0 && m.card.bottom <= 844 && m.card.bottom <= m.input.top && m.input.top - m.card.bottom <= 16,
          `10g ${mode}: the card is fully on screen (${Math.round(m.card.top)} to ${Math.round(m.card.bottom)}), directly above the email field`);
        t.ok(m.join.bottom <= 844 && m.top.top < 844, `10h ${mode}: Join (bottom ${Math.round(m.join.bottom)}) and the $1,944 card's top (${Math.round(m.top.top)}) stay above the fold`);
        await page.locator(".fll-founding-card").click();
        await page.waitForTimeout(900);
        const top = await page.evaluate(() => document.querySelector(".fll-founding").getBoundingClientRect().top);
        t.ok(top >= -1 && top < 60, `10i ${mode}: tapping the card scrolls to the founding block (its top at ${Math.round(top)}px)`);
      }
      await ctx.close();
    }
    const fctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const fd = await fctx.newPage(); fd.setDefaultTimeout(15000);
    await fd.route("**/api/founding", r => r.fulfill({ status: 200, contentType: "application/json", body: '{"spotsLeft":35}' }));
    await fd.goto(base, { waitUntil: "domcontentloaded" });
    await fd.getByText("Real screens from the app.").waitFor(); await fd.waitForTimeout(800);
    t.eq(await fd.locator(".fll-founding-card").evaluate(e => getComputedStyle(e).display), "none", "10j desktop: the card is not shown");
    await fctx.close();
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
