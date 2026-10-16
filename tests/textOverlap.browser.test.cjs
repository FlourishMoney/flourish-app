// tests/textOverlap.browser.test.cjs
// -----------------------------------------------------------------------------
// NO TEXT RUNS INTO OTHER TEXT, UNDER A CONTROL, OR OFF THE EDGE OF ITS BOX, ON ANY SCREEN, AT THE
// NARROWEST PHONE WITH THE LARGEST TEXT WE SUPPORT (overlap-fix).
//
// On the Play build vc15, on a real Android phone with a larger system font, text overlapped in several
// places: on Do, the budget's category names ran under their "$ 840 /mo" amount boxes. Android WebView
// renders every text size bigger under a larger system font (pixel sizes included), so a row that fits
// at 100% squeezes its text column below the width of its longest word, and the word spills out under
// whatever sits next to it. layout.browser.test.cjs did not see it: it compares element boxes, a spilled
// word does not grow its box, and the amount box sits in its own overflow:hidden wrapper, so the pair was
// skipped. This suite measures the rendered lines of text themselves (tests/_textOverlap.cjs).
//
// Who and where, each screen opened fresh, its text scaled, then measured (and photographed when asked):
//   demo      the sample household: every tab and sub-tab, the budget plan once built, Settings and
//             every section it opens, every sheet and modal, the tour;
//   empty     a signed-in account with nothing in it (tests/_mockSupabase.cjs): the empty states, the
//             coach, and two error states (offline, and the coach's server unreachable);
//   new       an account that has just signed up (no saved data): the AI disclosure and onboarding;
//   out       signed out: the welcome page, Log In, Sign Up, Forgot password.
// By default at 320px with text at 130%, and at 160%: about what a phone at 130% showed while the app's own
// text-size-adjust (122%) was stacked on top of the WebView's scaling (lib/textScale.js now applies only
// one). OVERLAP_WIDTHS / OVERLAP_SCALES widen it; OVERLAP_SHOTS=<dir> saves a screenshot of every screen;
// OVERLAP_JSON=<file> writes every finding.
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs"); // removed when this test ends, pass or fail
const { create } = require("./_runner.cjs");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const MOCK = require("./_mockSupabase.cjs");
const { TEXT_OVERLAP, SCALE_TEXT_ONCE } = require("./_textOverlap.cjs");

const ROOT = path.join(__dirname, "..");
const WIDTHS = (process.env.OVERLAP_WIDTHS || "320").split(",").map(Number);
const SCALES = (process.env.OVERLAP_SCALES || "1.3,1.6").split(",").map(Number);
const SHOTS = process.env.OVERLAP_SHOTS || "";
const CONCURRENCY = Number(process.env.OVERLAP_CONCURRENCY || 4);
const pool = async (items, n, fn) => {
  const res = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k]); } }));
  return res;
};
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".mp4": "video/mp4" };

const TAB = (p, name) => p.getByRole("button").filter({ hasText: new RegExp("^" + name + "(\\s*\\d+)?$") }).last().click();
const ARIA = (p, name) => p.getByRole("button", { name, exact: true }).first().click();
const TXT = (p, s, exact = false) => p.getByText(s, { exact }).first().click();
const NTH = (p, name, n) => p.getByRole("button", { name, exact: true }).nth(n).click();
const goals = (p, sub) => async () => { await TAB(p, "Do"); await TXT(p, "Goals", true); if (sub) await sub(); };
const plan = async (p) => { await TAB(p, "Do"); await ARIA(p, "Build Plan"); };

// Onboarding, one screen at a time, after the AI disclosure is accepted. Each screen's way forward, in
// order; a screen's empty fields are filled first (a name, amounts) where its Continue waits for them.
// A forward control that is not found fails the screen as unreachable rather than skipping it.
const ONBOARDING = ["welcome", "you and your household", "connect a bank", "balances", "income", "bills", "debts", "credit score"];
const FORWARD = ["Get Started →", "Continue →", "Enter it myself", "Continue →", "Continue →", "Continue →", "Continue →"];
const FILL = () => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  for (const el of document.querySelectorAll("input")) {
    if (!el.getClientRects().length || el.value || /checkbox|radio|range|date/.test(el.type)) continue;
    set.call(el, el.type === "number" || /amount|\$|balance|income/i.test(`${el.placeholder} ${el.getAttribute("aria-label")}`) ? "1000" : "Sam");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
};
async function onboardingTo(p, n) {
  await p.getByRole("button", { name: "I Understand & Accept", exact: true }).click();
  await p.getByRole("button", { name: FORWARD[0], exact: true }).waitFor();
  for (let i = 0; i < n; i++) {
    await p.evaluate(FILL);
    await p.getByRole("button", { name: FORWARD[i], exact: true }).last().click({ timeout: 5000 });
    await p.waitForTimeout(450);
  }
}

// who: "demo", "empty", "new" or "out"; demo and empty when unset. overlay: measure the sheet on top.
const VIEWS = [
  { name: "Today",                 go: (p) => TAB(p, "Today") },
  { name: "Today/Decisions",       go: async (p) => { await TAB(p, "Today"); await TXT(p, "Decisions", true); } },
  { name: "Watch/Plan",            go: (p) => TAB(p, "Watch") },
  { name: "Watch/Plan 7d",         who: "demo", go: async (p) => { await TAB(p, "Watch"); await ARIA(p, "7d"); } },
  { name: "Watch/Plan 90d",        who: "demo", go: async (p) => { await TAB(p, "Watch"); await ARIA(p, "90d"); } },
  { name: "Watch/Activity",        go: async (p) => { await TAB(p, "Watch"); await TXT(p, "Activity", true); } },
  { name: "Do/Budget",             go: (p) => TAB(p, "Do") },
  { name: "Do/Budget plan",        who: "demo", go: plan },
  { name: "Do/Budget plan + add category", who: "demo", go: async (p) => { await plan(p); await TXT(p, "Add a category"); } },
  { name: "Do/Goals",              go: (p) => goals(p)() },
  { name: "Do/Goals/My Goals",     go: (p) => goals(p, () => TXT(p, "My Goals", true))() },
  { name: "Do/Goals/My Goals + new goal", go: (p) => goals(p, async () => { await TXT(p, "My Goals", true); await TXT(p, "+ Add Goal"); })() },
  { name: "Do/Goals/Debt Sim",     go: (p) => goals(p, () => TXT(p, "Debt Sim", true))() },
  { name: "Do/Goals/Net Worth",    go: (p) => goals(p, () => TXT(p, "Net Worth", true))() },
  { name: "Do/Goals/Retirement",   go: (p) => goals(p, () => TXT(p, "Retirement", true))() },
  { name: "Do/Goals/Wealth",       go: (p) => goals(p, () => TXT(p, "Wealth", true))() },
  { name: "Do/Goals/Budget",       go: (p) => goals(p, () => NTH(p, "Budget", 1))() },
  { name: "Do/Goals/Personality",  go: (p) => goals(p, () => TXT(p, "Personality", true))() },
  { name: "Do/Goals/Tax Tips",     go: (p) => goals(p, () => TXT(p, "Tax Tips", true))() },
  { name: "Do/Goals/Learn",        go: (p) => goals(p, () => NTH(p, "Learn", 0))() },
  { name: "Do/Credit",             go: async (p) => { await TAB(p, "Do"); await TXT(p, "Credit", true); } },
  { name: "Learn",                 go: (p) => TAB(p, "Learn") },
  { name: "Meet",                  go: (p) => TAB(p, "Meet") },
  { name: "Settings",              go: (p) => ARIA(p, "Settings") },
  { name: "Settings/What's new",   overlay: true, go: async (p) => { await ARIA(p, "Settings"); await TXT(p, "What's new", true); } },
  { name: "Settings/Support + FAQ", go: async (p) => { await ARIA(p, "Settings"); await TXT(p, "Open Support", true); } },
  { name: "Settings/Send feedback", overlay: true, go: async (p) => { await ARIA(p, "Settings"); await TXT(p, "Send feedback", true); } },
  ...["Profile & Income", "Connected Accounts", "Manage Bills", "Manage Debts", "Savings Goals", "Family Settings", "Dashboard"].map((label) =>
    ({ name: `Settings/${label}`, go: async (p) => { await ARIA(p, "Settings"); await TXT(p, label, true); } })),
  { name: "Settings/Delete Account", overlay: true, go: async (p) => { await ARIA(p, "Settings"); await ARIA(p, "Delete Account"); } },
  { name: "Notifications",         go: (p) => ARIA(p, "Notifications") },
  { name: "How we got this: Today", who: "demo", overlay: true, go: async (p) => { await TAB(p, "Today"); await ARIA(p, "How Flourish got this number"); } },
  { name: "How we got this: Today's pace", who: "demo", overlay: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "Explain this →"); } },
  { name: "How we got this: Watch", who: "demo", overlay: true, go: async (p) => { await TAB(p, "Watch"); await ARIA(p, "How Flourish got this number"); } },
  { name: "How we got this: range", who: "demo", overlay: true, go: async (p) => { await TAB(p, "Watch"); await p.locator('button[aria-label^="Lowest balance"]').first().click(); } },
  { name: "How we got this: Meet",  who: "demo", overlay: true, go: async (p) => { await TAB(p, "Meet"); await p.locator('button[aria-label$="How Flourish got it"], button[aria-label$=": how Flourish got it"]').first().click(); } },
  { name: "How it's calculated",   who: "demo", overlay: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "Example · sample data"); } },
  { name: "Glossary",              who: "demo", overlay: true, go: async (p) => { await TAB(p, "Today"); await ARIA(p, "What Safe to spend means"); } },
  { name: "Can I afford this: fits", who: "demo", go: async (p) => { await TAB(p, "Today"); await p.getByPlaceholder("0.00").first().fill("40"); } },
  { name: "Can I afford this: over", who: "demo", go: async (p) => { await TAB(p, "Today"); await p.getByPlaceholder("0.00").first().fill("9000"); } },
  { name: "What-If",               who: "demo", go: async (p) => { await TAB(p, "Today"); await TXT(p, "What if? →"); } },
  { name: "Check-In",              who: "demo", go: async (p) => { await TAB(p, "Today"); await TXT(p, "Check-In ✦"); } },
  { name: "Reorder dashboard",     who: "demo", overlay: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "⠿ Reorder"); } },
  { name: "Add bill",              overlay: true, go: async (p) => { await TAB(p, "Watch"); await TXT(p, "+ Add Bill"); } },
  { name: "Expected money",        overlay: true, go: async (p) => { await TAB(p, "Watch"); await TXT(p, "+ Add", true); } },
  { name: "Daily spend",           who: "demo", overlay: true, go: async (p) => { await TAB(p, "Watch"); await TXT(p, "What the forecast is built from"); await ARIA(p, "Edit Est. daily spend"); } },
  { name: "Clear chat",            overlay: true, go: async (p) => { await TAB(p, "Learn"); await ARIA(p, "Clear chat history"); } },
  { name: "Tour step 1",           who: "demo", tour: true, overlay: true, go: async () => {} },
  { name: "Tour last step",        who: "demo", tour: true, overlay: true, go: async (p) => { for (let i = 0; i < 4; i++) { await TXT(p, "Next →"); await p.waitForTimeout(350); } } },
  // A new account's own screens.
  { name: "Enter a balance",       who: "empty", overlay: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "Enter your balances", false); } },
  { name: "Offline",               who: "empty", offline: true, go: async (p) => { await TAB(p, "Today"); } },
  { name: "Coach: server unreachable", who: "empty", go: async (p) => { await TAB(p, "Learn"); const box = p.getByRole("textbox").last(); await box.fill("What does safe to spend mean?"); await box.press("Enter"); await p.waitForTimeout(2500); } },
  // Signed out.
  { name: "Welcome page",          who: "out", go: async () => {} },
  { name: "Log In",                who: "out", go: (p) => TXT(p, "Log in", true) },
  { name: "Sign Up",               who: "out", go: async (p) => { await TXT(p, "Log in", true); await TXT(p, "Sign Up", true); } },
  { name: "Forgot password",       who: "out", go: async (p) => { await TXT(p, "Log in", true); await TXT(p, "Forgot password?", true); } },
  // Just signed up.
  { name: "AI disclosure",         who: "new", fresh: true, go: async () => {} },
  ...ONBOARDING.map((step, n) => ({ name: `Onboarding: ${step}`, who: "new", fresh: true, go: (p) => onboardingTo(p, n) })),
];

function buildApp(supabaseUrl) {
  if (process.env.OVERLAP_DIST) return process.env.OVERLAP_DIST;
  const out = tempDir("overlap");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  return out;
}

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("TEXT OVERLAP (browser)"); return; }
  let dist = null;
  const server = http.createServer((req, res) => {
    if (MOCK.handle(req, res)) return;
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(Number(process.env.OVERLAP_PORT || 0), "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = buildApp(base);
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await playwright.chromium.launch();

  const open = async (who, width, tour) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: SHOTS ? 1 : 2, isMobile: true, hasTouch: true, colorScheme: "light" });
    await ctx.addInitScript(([who, tour, key, session]) => { try {
      localStorage.setItem("flourish_theme", "light"); localStorage.setItem("flourish_theme_manual", "1");
      localStorage.setItem("flourish_first_visit_done", "1");
      if (!tour) localStorage.setItem("flourish_tour_done", "1");
      if (who === "empty" || who === "new") localStorage.setItem(key, session);
    } catch (e) {} }, [who, !!tour, MOCK.storageKey(base), JSON.stringify(MOCK.makeSession())]);
    // Just signed up: the server has no saved data for the account yet.
    if (who === "new") await ctx.route("**/rest/v1/user_data*", (r) => r.request().method() === "GET"
      ? r.fulfill({ status: 200, contentType: "application/json", body: /vnd\.pgrst\.object/.test(r.request().headers().accept || "") ? "null" : "[]" })
      : r.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
    // …and accepting the AI disclosure records consent with the server first.
    if (who === "new") await ctx.route("**/api/coach", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const ready = async () => {
      if (who === "demo") {
        const demo = page.getByText("Demo mode", { exact: false }).first(), welcome = page.getByText("Try the demo with", { exact: false }).first();
        await demo.or(welcome).waitFor({ timeout: 40000 });
        if (!(await demo.isVisible())) { await welcome.click(); await demo.waitFor({ timeout: 40000 }); }
      } else if (who === "empty") {
        await page.getByText(tour ? "Step 1 of 5" : "Getting set up", { exact: false }).first().waitFor({ timeout: 40000 });
      } else if (who === "out") {
        await page.getByText("Try the demo with", { exact: false }).first().waitFor({ timeout: 40000 });
      } else {
        await page.getByRole("button").first().waitFor({ timeout: 40000 });
      }
      await page.waitForTimeout(500);
    };
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await ready();
    const reload = async () => { await ctx.setOffline(false); await page.reload({ waitUntil: "domcontentloaded" }); await ready(); };
    return { ctx, page, reload };
  };

  const passes = [];
  for (const width of WIDTHS) for (const k of SCALES) for (const who of ["demo", "empty", "new", "out"]) passes.push({ who, width, k });
  const results = (await pool(passes, CONCURRENCY, async ({ who, width, k }) => {
    const out = [];
    const main = await open(who, width, false);
    let first = true;
    for (const v of VIEWS.filter((x) => (x.who ? x.who === who : who === "demo" || who === "empty"))) {
      const label = `${v.name} (${who}, ${width}px, text ${Math.round(k * 100)}%)`;
      let ctx = null;
      try {
        let page = main.page;
        // The tour needs a page where it has not been seen; each onboarding screen, an account that has not
        // accepted the disclosure or started onboarding (both are remembered on the device).
        if (v.tour || v.fresh) { ctx = await open(who, width, !!v.tour); page = ctx.page; }
        else if (!first) await main.reload();
        first = false;
        if (v.offline) await main.ctx.setOffline(true);
        await v.go(page);
        await page.waitForTimeout(600);
        await page.evaluate(SCALE_TEXT_ONCE, k);
        await page.waitForTimeout(350);
        await page.evaluate(() => window.scrollTo(0, 0));
        const r = await page.evaluate(TEXT_OVERLAP, { scope: v.overlay ? "overlay" : "page" });
        if (SHOTS) {
          const f = `${v.name.replace(/[^\w]+/g, "-")}__${who}__${width}__${Math.round(k * 100)}.jpg`;
          await page.screenshot({ path: path.join(SHOTS, f), type: "jpeg", quality: 60, fullPage: !v.overlay });
        }
        out.push({ view: label, name: v.name, who, width, k, lines: r.lines, found: r.found });
      } catch (e) {
        out.push({ view: label, name: v.name, who, width, k, unreachable: String(e.message).split("\n")[0].slice(0, 160) });
        try { await main.reload(); } catch {}
      } finally { if (ctx) await ctx.ctx.close(); }
    }
    await main.ctx.close();
    return out;
  })).flat();
  await browser.close(); server.close();
  if (process.env.OVERLAP_JSON) fs.writeFileSync(process.env.OVERLAP_JSON, JSON.stringify(results, null, 1));

  const expected = passes.reduce((n, ps) => n + VIEWS.filter((x) => (x.who ? x.who === ps.who : ps.who === "demo" || ps.who === "empty")).length, 0);
  t.eq(results.length, expected, `0 every screen was visited for every person, width and text size (${results.length})`);
  t.eq(results.filter((r) => r.unreachable).map((r) => `${r.view}: ${r.unreachable}`), [], "1 every screen in the sweep opened");
  for (const r of results.filter((x) => !x.unreachable)) {
    t.ok(r.lines > 0, `2 ${r.view}: the measurement saw the screen's text (${r.lines} lines)`);
    t.eq(r.found.map((f) => `${f.kind}: "${f.a}" / "${f.b}" (${f.by})`), [], `3 ${r.view}: no text runs into other text, under a control, or off the edge of its box`);
  }
  t.summary("TEXT OVERLAP (browser)");
})();
