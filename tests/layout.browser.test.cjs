// tests/layout.browser.test.cjs
// -----------------------------------------------------------------------------
// NOTHING A FINGER AIMS AT IS TOUCHING SOMETHING ELSE.
//
// The row that caused this file: on Today, "✓ Calculated by Flourish" sat flush against the
// "Explain this →" pill — zero pixels between a sentence and a button. Nobody wrote a zero. The row
// said justifyContent:"space-between" and the button said flex:1, so the button grew until there was
// no space left for "space-between" to distribute. The gap was emergent, which is why reviewing the
// source could not find it and why this test measures the rendered page instead.
//
// What it checks, on the real demo build, at four widths and two text sizes, on every tab and every
// sheet a person can open (and again at the iPhone Duo's four viewports, light and dark, with its
// safe-area insets emulated: tests/_duo.cjs):
//
//   1. no two boxes overlap                        (a tap lands on the wrong thing)
//   2. text to control  >= GAP.textToControl (12)  (a tap aimed at a sentence lands on a button)
//   3. control to control >= GAP.controlToControl (8)  (adjacent targets need a miss margin)
//   4. every control is >= LAYOUT.minTap (44) tall
//  10. on the Duo passes, no text or control in the safe-area strip, on any side
//
// The rule, including what it deliberately does NOT cover, is docs/design/LAYOUT-RULES.md.
//
// WHY THIS IS A BROWSER TEST. Every other suite in the gate is pure and fast. This one builds the app
// and drives Chromium, which costs about a minute. It earns that because the defect class it catches
// does not exist in the source: the numbers that matter are produced by flexbox at a particular
// width with a particular string in the label, and no amount of reading style objects reveals them.
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs"); // removed when this test ends, pass or fail
const { create } = require("./_runner.cjs");
const { SCAN } = require("./_layoutScan.cjs");
const { duoPasses, insetLabel, applyInsets, READ_INSETS } = require("./_duo.cjs");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const WIDTHS = [320, 375, 390, 430];
const SCALES = [1, 1.3];
const CONCURRENCY = Number(process.env.LAYOUT_CONCURRENCY || 4);

// Subpixel allowance, in px.
//
// A text box's height is fractional: a 13px line at line-height 1.5 is 19.5px, so a sibling 12px
// below it measures 11.5. That is the token doing its job, not a violation. One pixel of slack
// absorbs it and still fails everything the rule is aimed at — the real offenders measured 0, 4, 6,
// 8 and 10, all of which are more than a pixel short.
const EPS = 1;

// The app is written in px, so changing the root font size does nothing. The honest way to test
// bigger text is to scale every rendered font size and let the page reflow.
function SCALE_TEXT(k) {
  for (const el of document.querySelectorAll("body *")) {
    if (el.dataset.fsScaled) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs) { el.style.fontSize = fs * k + "px"; el.dataset.fsScaled = "1"; }
  }
}

// ─── the views: every tab, and every sheet reachable in demo ──────────────────
// Openers are addressed by the text or aria-label a person sees, so a renamed control fails here
// rather than silently dropping a screen out of the sweep.
const TAB = (p, name) => {
  const l = p.getByRole("button").filter({ hasText: new RegExp("^" + name + "(\\s*\\d+)?$") });
  return l.last().click();
};
const TXT = (p, s, exact = false) => p.getByText(s, { exact }).first().click();
const ARIA = (p, name) => p.getByRole("button", { name, exact: true }).first().click();

const VIEWS = [
  // ── tabs and sub-tabs
  { name: "Today",           go: (p) => TAB(p, "Today") },
  { name: "Today/Decisions", go: async (p) => { await TAB(p, "Today"); await TXT(p, "Decisions", true); } },
  { name: "Watch/Plan",      go: (p) => TAB(p, "Watch") },
  { name: "Watch/Activity",  go: async (p) => { await TAB(p, "Watch"); await TXT(p, "Activity", true); } },
  // watch-meet-fixes: the range summary at its shortest and longest, and the working it opens.
  { name: "Watch/Plan 7d",   reload: true, go: async (p) => { await TAB(p, "Watch"); await ARIA(p, "7d"); } },
  { name: "Watch/Plan 90d",  reload: true, go: async (p) => { await TAB(p, "Watch"); await ARIA(p, "90d"); } },
  { name: "Do/Budget",       go: (p) => TAB(p, "Do") },
  { name: "Do/Goals",        go: async (p) => { await TAB(p, "Do"); await TXT(p, "Goals", true); } },
  { name: "Do/Credit",       go: async (p) => { await TAB(p, "Do"); await TXT(p, "Credit", true); } },
  { name: "Learn",           go: (p) => TAB(p, "Learn") },
  { name: "Meet",            go: (p) => TAB(p, "Meet") },
  // ── full-screen panels
  { name: "Settings",        reload: true, go: (p) => ARIA(p, "Settings") },
  { name: "Notifications",   reload: true, go: (p) => ARIA(p, "Notifications") },
  // ── sheets and modals, scanned inside the overlay
  { name: "Sheet Reorder dashboard", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "⠿ Reorder"); } },
  { name: "Sheet How it's calculated", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "Example · sample data"); } },
  { name: "Sheet Safe-to-spend working", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Today"); await ARIA(p, "How Flourish got this number"); } },
  { name: "Sheet Glossary", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Today"); await ARIA(p, "What Safe to spend means"); } },
  { name: "Sheet Check-In", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "Check-In ✦"); } },
  { name: "Sheet What if", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "What if? →"); } },
  { name: "Sheet Add bill", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Watch"); await TXT(p, "+ Add Bill"); } },
  { name: "Sheet Expected money", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Watch"); await TXT(p, "+ Add", true); } },
  { name: "Sheet Daily spend", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Watch"); await TXT(p, "What the forecast is built from"); await ARIA(p, "Edit Est. daily spend"); } },
  { name: "Sheet Starting balance working", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Watch"); await ARIA(p, "How Flourish got this number"); } },
  { name: "Sheet Range lowest working", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Watch"); await p.locator('button[aria-label^="Lowest balance"]').first().click(); } },
  { name: "Sheet Meet figure working", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Meet"); await p.locator('button[aria-label$="How Flourish got it"]').first().click(); } },
  { name: "Sheet Clear chat", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Learn"); await TXT(p, "🗑️"); } },
  // "Do → Goals" opens on Debt Sim, so My Goals and its form are separate views. The goal form is
  // inline rather than an overlay, so it is scanned at page scope.
  // ── the welcome tour, in a context that lets it appear (see sweep()). It is the first thing a new
  // user touches and it was the last thing this suite looked at. Both steps, because the last one
  // swaps "Next →" for "Done ✓".
  { name: "Tour step 1", tour: true, scope: "overlay", reload: true, go: async () => {} },
  { name: "Tour last step", tour: true, scope: "overlay", reload: true, go: async (p) => {
      // Tester suggestions: five steps now, one per tab, so four Nexts reach the last.
      for (let i = 0; i < 4; i++) { await TXT(p, "Next →"); await p.waitForTimeout(500); } } },
  { name: "Do/My Goals", reload: true, go: async (p) => { await TAB(p, "Do"); await TXT(p, "Goals", true); await TXT(p, "My Goals", true); } },
  { name: "Do/My Goals + new goal form", reload: true, go: async (p) => { await TAB(p, "Do"); await TXT(p, "Goals", true); await TXT(p, "My Goals", true); await TXT(p, "+ Add Goal"); } },
];

// ─── build + serve ────────────────────────────────────────────────────────────
function buildApp() {
  if (process.env.LAYOUT_DIST) return process.env.LAYOUT_DIST;
  const out = tempDir("layout");
  // Placeholder Supabase values only: the demo never authenticates, but the client throws at import
  // without them and the app boots straight into its failure screen.
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://placeholder.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "placeholder" } });
  return out;
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

function serve(dir) {
  const server = http.createServer((req, res) => {
    const clean = decodeURIComponent(req.url.split("?")[0]);
    let f = path.join(dir, clean);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

// ─── one (width, textScale) pass ──────────────────────────────────────────────
// A pass is { width, height, scale } and, on the Duo passes, the theme (scheme) and the emulated
// safe-area insets. The phone passes leave both unset, exactly as they always ran.
async function sweep(browser, base, pass) {
  const { width, height = 844, scale = 1, scheme, insets } = pass;
  const jsErrors = [];

  // Two contexts, because the welcome tour is both a thing to measure and a thing in the way.
  //
  // It is a full-screen overlay that swallows every click, so the sweep suppresses it with
  // flourish_tour_done — and suppressing it is exactly why it went unmeasured until production
  // showed two 39px buttons in it. `suppressTour` is therefore a per-context decision rather than a
  // blanket one, and the tour gets a context where it is allowed to appear. The flag cannot be
  // cleared per-view instead: addInitScript re-runs on every navigation and would put it straight
  // back.
  const open = async (suppressTour) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      ...(scheme ? { colorScheme: scheme } : {}) });
    await ctx.addInitScript(([skipTour, scheme]) => {
      try {
        localStorage.setItem("flourish_first_visit_done", "1");
        if (skipTour) localStorage.setItem("flourish_tour_done", "1");
        // A Duo pass's theme, chosen, so a reload cannot fall back to the other (as in a11y check 6).
        if (scheme) { localStorage.setItem("flourish_theme", scheme); localStorage.setItem("flourish_theme_manual", "1"); }
      } catch (e) {}
    }, [suppressTour, scheme || null]);
    const page = await ctx.newPage();
    if (insets) await applyInsets(ctx, page, insets);
    page.on("pageerror", (e) => jsErrors.push(String(e.message).slice(0, 120)));
    // Google Fonts may be unreachable in CI, so never wait for the network to fall idle.
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.getByText("Try the demo with", { exact: false }).first().click({ timeout: 30000 });
    await page.getByText("Demo mode", { exact: false }).first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(700);
    return { ctx, page };
  };

  const main = await open(true);
  let tour = null;                       // opened lazily: only the tour views need it
  const out = [];
  for (const v of VIEWS) {
    if (v.tour && !tour) tour = await open(false);
    const page = v.tour ? tour.page : main.page;
    if (v.reload) { await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText("Demo mode", { exact: false }).first().waitFor({ timeout: 40000 }); await page.waitForTimeout(500); }
    try {
      await v.go(page);
      await page.waitForTimeout(v.scope === "overlay" ? 700 : 600);
      if (v.scope !== "overlay") await page.evaluate(() => window.scrollTo(0, 0));
      // Lay out anything below the fold before measuring.
      await page.evaluate(async () => {
        const el = document.scrollingElement || document.documentElement;
        for (let y = 0; y < el.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
        window.scrollTo(0, 0);
      });
      if (scale !== 1) { await page.evaluate(SCALE_TEXT, scale); await page.waitForTimeout(300); }
      const safe = insets ? await page.evaluate(READ_INSETS) : null;
      const res = await page.evaluate(SCAN, { scope: v.scope || "page", textCtrlMin: 12, ctrlCtrlMin: 8, minTap: 44, safe });
      const theme = scheme ? await page.evaluate(() => { try { return localStorage.getItem("flourish_theme"); } catch { return null; } }) : null;
      out.push({ view: v.name, safe, theme, ...res });
    } catch (e) {
      out.push({ view: v.name, unreachable: String(e.message).split("\n")[0].slice(0, 160) });
    }
  }
  await main.ctx.close();
  if (tour) await tour.ctx.close();
  return { ...pass, label: pass.label, views: out, jsErrors };
}

const pool = async (items, n, fn) => {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k]); }
  }));
  return res;
};

(async () => {
  const t = create();
  const S = await import("../src/lib/space.js");

  // ── 1. the tokens the rule is written in ─────────────────────────────────────
  t.eq(S.SPACE, { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }, "1a the 8px scale");
  t.eq(S.GAP.textToControl, 12, "1b text never closer than 12 to a control");
  t.eq(S.GAP.controlToControl, 8, "1c control never closer than 8 to a control");
  t.eq(S.LAYOUT.minTap, 44, "1d tap targets are 44");
  t.eq(S.row().flexWrap, "wrap", "1e a mixed row wraps rather than crushing its text");
  t.eq(S.row().columnGap, 12, "1f …with the text-to-control gap across");
  t.eq(S.row().rowGap, 12, "1g …and the same gap when the control drops to its own line");
  t.eq(S.rowControl().flexShrink, 0, "1h the control in such a row never shrinks");
  t.eq(S.rowControl().minHeight, 44, "1i …and is a full tap target");
  t.ok(S.row().flex === undefined && S.rowControl().flex === undefined,
    "1j neither helper offers flex:1 — a growing control is what ate the gap in the first place");

  let playwright;
  try { playwright = require("playwright"); } catch (e) {
    t.ok(false, "2a playwright is installed (npm ci, then npx playwright install chromium)");
    t.summary("LAYOUT (browser)");
    return;
  }

  const dist = buildApp();
  const { server, port } = await serve(dist);
  const base = `http://127.0.0.1:${port}/`;
  let browser;
  try { browser = await playwright.chromium.launch(); } catch (e) {
    t.ok(false, `2a chromium launches (run: npx playwright install chromium) — ${String(e.message).split("\n")[0]}`);
    server.close(); t.summary("LAYOUT (browser)");
    return;
  }

  const combos = [];
  for (const w of WIDTHS) for (const s of SCALES) combos.push({ width: w, scale: s, label: `${w}px ×${s}` });
  const DUO = duoPasses().map((d) => ({ ...d, scale: 1, duo: true,
    label: `${d.name} ${d.width}x${d.height} ${d.scheme} ${d.side} ${insetLabel(d.insets)}` }));
  combos.push(...DUO);
  const passes = await pool(combos, CONCURRENCY, (c) => sweep(browser, base, c));
  await browser.close();
  server.close();
  // A machine-readable dump, for working through a backlog of sites rather than reading a wall of text.
  if (process.env.LAYOUT_JSON) fs.writeFileSync(process.env.LAYOUT_JSON, JSON.stringify(passes, null, 1));

  // ── 2. every view was actually reached ───────────────────────────────────────
  for (const p of passes) {
    const missed = p.views.filter((v) => v.unreachable || v.error);
    t.eq(missed.map((v) => `${v.view}: ${v.unreachable || v.error}`), [],
      `2a [${p.label}] every tab and sheet in the sweep opened`);
    // …and had something in it. A view that measures nothing PASSES every other assertion in this
    // file, which is how Check-In and What If sat in the sweep contributing nothing while holding
    // 30px tap targets. Silence is not a pass.
    const empty = p.views.filter((v) => !v.unreachable && !v.error && (v.counts.controls < 1 || v.counts.texts < 1));
    t.eq(empty.map((v) => `${v.view}: ${v.counts.controls} controls, ${v.counts.texts} texts`), [],
      `2b [${p.label}] …and every one of them had controls and text to measure`);
  }

  // ── 3. the rule itself, per view ─────────────────────────────────────────────
  let measured = 0, controls = 0;
  for (const p of passes) {
    for (const v of p.views) {
      if (v.unreachable || v.error) continue;
      measured++; controls += v.counts.controls;
      const real = (v.violations || []).filter((x) => x.kind === "overlap" || x.gap < x.need - EPS);
      const show = (x) => x.kind === "overlap"
        ? `OVERLAP by ${-x.gap}px — "${x.a}" [${x.ax}] over "${x.b}" [${x.bx}]`
        : `${x.rule} ${x.kind === "gapX" ? "across" : "down"} ${x.gap}px, needs ${x.need} — "${x.a}" [${x.ax}] vs "${x.b}" [${x.bx}]`;
      t.eq(real.map(show), [], `3 [${p.label}] ${v.view} — spacing`);
      t.eq((v.small || []).map((s) => `<${s.tag}> ${s.h}px tall, needs ${s.need} — "${s.a}"`), [],
        `4 [${p.label}] ${v.view} — tap targets`);
      t.ok(v.hOverflow <= 1, `5 [${p.label}] ${v.view} — no horizontal overflow (${v.hOverflow}px)`);
      t.eq((v.clipped || []).map((c) => `<${c.tag}> "${c.text}"`), [],
        `9 [${p.label}] ${v.view} — no text truncated with an ellipsis (rule 3: wrap instead)`);
    }
    t.eq(p.jsErrors, [], `6 [${p.label}] no page errors during the sweep`);
  }

  // ── 10. the iPhone Duo: nothing in the safe-area strip, on any side ──────────
  for (const p of passes.filter((x) => x.duo)) {
    const seen = p.views.filter((v) => !v.unreachable && !v.error);
    t.eq(seen.filter((v) => insetLabel(v.safe || {}) !== insetLabel(p.insets)).map((v) => `${v.view}: env() gave ${insetLabel(v.safe || {})}`), [],
      `10a [${p.label}] env(safe-area-inset-*) reported the emulated insets on every view`);
    t.eq(seen.filter((v) => v.theme !== p.scheme).map((v) => `${v.view}: rendered ${v.theme || "unknown"}`), [],
      `10b [${p.label}] every view was measured in the pass's theme`);
    for (const v of seen) {
      t.eq((v.unsafe || []).map((u) => `<${u.tag}> "${u.a}" [${u.at}]: ${u.bad}`), [],
        `10c [${p.label}] ${v.view} — no text or control in the safe-area strip`);
    }
  }

  // ── 7. the sweep was as wide as it claims ────────────────────────────────────
  t.eq(passes.length, WIDTHS.length * SCALES.length + DUO.length, "7a four widths at two text sizes, and the Duo passes");
  t.eq(DUO.length, 11, "7a' the Duo: four viewports, light and dark, and each side strip mirrored");
  t.eq(measured, passes.length * VIEWS.length, "7b every view measured in every pass");
  t.ok(controls > passes.length * 150, `7c the sweep saw the whole app, not an error screen (${controls} controls measured)`);

  // ── 8. the example tag never wears the live colour ───────────────────────────
  //
  // "Example · sample data" exists to say the numbers are not yours. Rendering it in the green of
  // "Live · Your real data" says the opposite in the louder channel. PR #15 removed that from the
  // Today chip and the Coach header went on doing it, which is how a look drifts back: one site at a
  // time, each one locally reasonable. One tag, one colour, everywhere — asserted on the rendered
  // page, because that is where the drift happens.
  const LIVE_GREENS = ["rgb(0, 204, 133)", "rgb(0, 232, 154)", "rgb(0, 120, 77)", "rgb(0, 122, 72)"];
  const TAG_INKS = ["rgb(245, 204, 106)", "rgb(122, 74, 10)"]; // DARK_C.tagInk, LIGHT_C.tagInk
  const tags = passes.flatMap((p) => p.views.flatMap((v) => (v.exampleTags || []).map((x) => ({ ...x, at: `${p.label} ${v.view}` }))));
  t.ok(tags.length >= 8, `8a the sweep actually saw the example tag (${tags.length} rendered)`);
  t.eq(tags.filter((x) => LIVE_GREENS.includes(x.color)).map((x) => `${x.at}: ${x.color}`), [],
    "8b no example tag renders in a live green");
  t.eq(tags.filter((x) => !TAG_INKS.includes(x.color)).map((x) => `${x.at}: ${x.color}`), [],
    "8c every example tag uses its theme's tagInk, so there is one look rather than four");
  t.eq(tags.filter((x) => x.fontSize < 13).map((x) => `${x.at}: ${x.fontSize}px`), [],
    "8d …and none of them is under the type floor");

  t.summary("LAYOUT (browser)");
})().catch((e) => { console.error(e); process.exitCode = 1; });
