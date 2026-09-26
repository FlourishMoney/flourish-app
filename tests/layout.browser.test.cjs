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
// sheet a person can open:
//
//   1. no two boxes overlap                        (a tap lands on the wrong thing)
//   2. text to control  >= GAP.textToControl (12)  (a tap aimed at a sentence lands on a button)
//   3. control to control >= GAP.controlToControl (8)  (adjacent targets need a miss margin)
//   4. every control is >= LAYOUT.minTap (44) tall
//
// The rule, including what it deliberately does NOT cover, is docs/design/LAYOUT-RULES.md.
//
// WHY THIS IS A BROWSER TEST. Every other suite in the gate is pure and fast. This one builds the app
// and drives Chromium, which costs about a minute. It earns that because the defect class it catches
// does not exist in the source: the numbers that matter are produced by flexbox at a particular
// width with a particular string in the label, and no amount of reading style objects reveals them.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
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

// ─── the measurement, serialised into the page ────────────────────────────────
// Kept as one function with no closure over Node scope: it is stringified by page.evaluate().
function SCAN({ scope, textCtrlMin, ctrlCtrlMin, minTap }) {
  const CTRL_SEL = 'button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="checkbox"], [role="tab"], [role="link"], [contenteditable="true"]';
  const cs = (el) => getComputedStyle(el);

  // When a sheet is open, the page behind it is still in the DOM. Comparing a sheet's button against
  // a heading it is covering would be nonsense, so an overlay scan is scoped to the overlay: the
  // top-most positioned element that covers the screen.
  const overlayRoot = () => {
    const c = [...document.querySelectorAll("body *")].filter((e) => {
      const s = cs(e);
      if (s.position !== "fixed" && s.position !== "absolute") return false;
      const z = parseFloat(s.zIndex);
      if (!Number.isFinite(z) || z < 100) return false;
      const r = e.getBoundingClientRect();
      return r.width >= innerWidth * 0.5 && r.height >= innerHeight * 0.35;
    });
    if (!c.length) return null;
    c.sort((a, b) => parseFloat(cs(b).zIndex) - parseFloat(cs(a).zIndex));
    return c[0];
  };

  const root = scope === "overlay" ? overlayRoot() : document.body;
  if (!root) return { error: "no overlay found on screen" };

  const visible = (el) => {
    const s = cs(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    if (parseFloat(s.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };
  const shown = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) if (!visible(n)) return false;
    return true;
  };
  // Content in different fixed/sticky groups overlaps legitimately: the tab bar scrolls over the page.
  const fixedGroup = (el) => {
    for (let n = el; n; n = n.parentElement) { const p = cs(n).position; if (p === "fixed" || p === "sticky") return n; }
    return null;
  };
  // …and so does content in different scroll containers. A row scrolled out of the top of a sheet's
  // list still HAS a box, and that box sits over the sheet's footer buttons. It is not on screen and
  // no finger can reach it, so comparing the two is meaningless. Two elements are only neighbours if
  // the same scroller clips them both.
  const clipGroup = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = cs(n);
      if (/(auto|scroll|hidden)/.test(s.overflowY) || /(auto|scroll|hidden)/.test(s.overflowX)) return n;
    }
    return null;
  };

  const all = [...root.querySelectorAll("*")];
  // A control is an interactive element containing no other interactive element: the innermost one is
  // what a finger lands on. An outer clickable card is a container, not a control.
  const controls = all.filter((el) => el.matches(CTRL_SEL) && !el.querySelector(CTRL_SEL) && shown(el));
  // Text is an element owning its own text nodes and not living inside a control.
  const texts = all.filter((el) => {
    if (el.closest(CTRL_SEL)) return false;
    if (!shown(el)) return false;
    let own = "";
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    return own.trim().length > 0;
  });

  const label = (el) => (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const r1 = (n) => Math.round(n * 10) / 10;

  // Everything the pair loop needs, computed ONCE per element. The loop is O(controls x texts) —
  // about 20,000 pairs on the Activity tab — and fixedGroup/clipGroup each walk to the root calling
  // getComputedStyle. Done per pair that is a few hundred thousand style resolutions and the suite
  // takes fifteen minutes; cached, the loop is arithmetic.
  const info = new Map();
  const at = (el) => {
    let v = info.get(el);
    if (!v) { v = { box: box(el), fixed: fixedGroup(el), clip: clipGroup(el), label: label(el) }; info.set(el, v); }
    return v;
  };
  // One box wholly inside the other is a glyph drawn ON a control — the "$" prefix inside a money
  // field — not two things sitting next to each other.
  const within = (A, B) => A.l >= B.l - 0.5 && A.r <= B.r + 0.5 && A.t >= B.t - 0.5 && A.b <= B.b + 0.5;

  const V = [];
  const pair = (a, b, min, rule) => {
    const ia = at(a), ib = at(b);
    const A = ia.box, B = ib.box;
    // Cheap arithmetic reject first, which is almost every pair. Separation of `min` or more on
    // EITHER axis is enough: that axis is clear, and it also rules the other axis out, because a
    // pair separated horizontally cannot overlap vertically-as-neighbours (the stacked test needs
    // horizontal overlap) and cannot overlap at all.
    const sx = Math.max(A.l - B.r, B.l - A.r);
    const sy = Math.max(A.t - B.b, B.t - A.b);
    if (sx >= min || sy >= min) return;
    if (ia.fixed !== ib.fixed) return;
    if (ia.clip !== ib.clip) return;
    if (a.contains(b) || b.contains(a)) return;
    if (within(A, B) || within(B, A)) return;
    const ovX = Math.min(A.r, B.r) - Math.max(A.l, B.l);
    const ovY = Math.min(A.b, B.b) - Math.max(A.t, B.t);
    const rec = (kind, gap) => V.push({ kind, rule, gap: r1(gap), need: min, a: ia.label, b: ib.label,
      ax: `${Math.round(A.l)},${Math.round(A.t)} ${Math.round(A.w)}x${Math.round(A.h)}`,
      bx: `${Math.round(B.l)},${Math.round(B.t)} ${Math.round(B.w)}x${Math.round(B.h)}` });
    if (ovX > 0.5 && ovY > 0.5) return rec("overlap", -Math.min(ovX, ovY));
    // side by side: they must share most of a line to be neighbours on the x axis
    if (ovY > 0.5 * Math.min(A.h, B.h)) {
      const g = A.r <= B.l ? B.l - A.r : A.l - B.r;
      if (g >= 0 && g < min - 1e-9) rec("gapX", g);
      return;
    }
    // stacked: they must share most of a column
    if (ovX > 0.5 * Math.min(A.w, B.w)) {
      const g = A.b <= B.t ? B.t - A.b : A.t - B.b;
      if (g >= 0 && g < min - 1e-9) rec("gapY", g);
    }
  };

  for (const c of controls) for (const x of texts) pair(x, c, textCtrlMin, "text-control");
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) pair(controls[i], controls[j], ctrlCtrlMin, "control-control");

  const small = controls.filter((c) => at(c).box.h < minTap).map((c) => ({ h: r1(at(c).box.h), need: minTap, a: at(c).label, tag: c.tagName.toLowerCase() }));

  return { counts: { controls: controls.length, texts: texts.length }, violations: V, small,
    hOverflow: r1(document.documentElement.scrollWidth - innerWidth) };
}

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
  { name: "Sheet Clear chat", scope: "overlay", reload: true, go: async (p) => { await TAB(p, "Learn"); await TXT(p, "🗑️"); } },
  // "Do → Goals" opens on Debt Sim, so My Goals and its form are separate views. The goal form is
  // inline rather than an overlay, so it is scanned at page scope.
  { name: "Do/My Goals", reload: true, go: async (p) => { await TAB(p, "Do"); await TXT(p, "Goals", true); await TXT(p, "My Goals", true); } },
  { name: "Do/My Goals + new goal form", reload: true, go: async (p) => { await TAB(p, "Do"); await TXT(p, "Goals", true); await TXT(p, "My Goals", true); await TXT(p, "+ Add Goal"); } },
];

// ─── build + serve ────────────────────────────────────────────────────────────
function buildApp() {
  if (process.env.LAYOUT_DIST) return process.env.LAYOUT_DIST;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "flourish-layout-"));
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
async function sweep(browser, base, width, scale) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // The welcome tour is a full-screen overlay that would swallow every click.
  await ctx.addInitScript(() => {
    try { localStorage.setItem("flourish_tour_done", "1"); localStorage.setItem("flourish_first_visit_done", "1"); } catch (e) {}
  });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e.message).slice(0, 120)));

  // Google Fonts may be unreachable in CI, so never wait for the network to fall idle.
  const enterDemo = async () => {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.getByText("preview the app with", { exact: false }).first().click({ timeout: 30000 });
    await page.getByText("I Understand & Accept").first().click({ timeout: 30000 });
    await page.getByText("Demo mode", { exact: false }).first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(700);
  };
  await enterDemo();

  const out = [];
  for (const v of VIEWS) {
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
      const res = await page.evaluate(SCAN, { scope: v.scope || "page", textCtrlMin: 12, ctrlCtrlMin: 8, minTap: 44 });
      out.push({ view: v.name, ...res });
    } catch (e) {
      out.push({ view: v.name, unreachable: String(e.message).split("\n")[0].slice(0, 160) });
    }
  }
  await ctx.close();
  return { width, scale, views: out, jsErrors };
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
  for (const w of WIDTHS) for (const s of SCALES) combos.push({ w, s });
  const passes = await pool(combos, CONCURRENCY, ({ w, s }) => sweep(browser, base, w, s));
  await browser.close();
  server.close();
  // A machine-readable dump, for working through a backlog of sites rather than reading a wall of text.
  if (process.env.LAYOUT_JSON) fs.writeFileSync(process.env.LAYOUT_JSON, JSON.stringify(passes, null, 1));

  // ── 2. every view was actually reached ───────────────────────────────────────
  for (const p of passes) {
    const missed = p.views.filter((v) => v.unreachable || v.error);
    t.eq(missed.map((v) => `${v.view}: ${v.unreachable || v.error}`), [],
      `2 [${p.width}px ×${p.scale}] every tab and sheet in the sweep opened`);
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
      t.eq(real.map(show), [], `3 [${p.width}px ×${p.scale}] ${v.view} — spacing`);
      t.eq((v.small || []).map((s) => `<${s.tag}> ${s.h}px tall, needs ${s.need} — "${s.a}"`), [],
        `4 [${p.width}px ×${p.scale}] ${v.view} — tap targets`);
      t.ok(v.hOverflow <= 1, `5 [${p.width}px ×${p.scale}] ${v.view} — no horizontal overflow (${v.hOverflow}px)`);
    }
    t.eq(p.jsErrors, [], `6 [${p.width}px ×${p.scale}] no page errors during the sweep`);
  }

  // ── 7. the sweep was as wide as it claims ────────────────────────────────────
  t.eq(passes.length, WIDTHS.length * SCALES.length, "7a four widths at two text sizes");
  t.eq(measured, WIDTHS.length * SCALES.length * VIEWS.length, "7b every view measured in every pass");
  t.ok(controls > 8 * 150, `7c the sweep saw the whole app, not an error screen (${controls} controls measured)`);

  t.summary("LAYOUT (browser)");
})().catch((e) => { console.error(e); process.exitCode = 1; });
