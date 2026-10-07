// tests/a11y.browser.test.cjs
// -----------------------------------------------------------------------------
// AN AUTOMATED ACCESSIBILITY CHECK OVER EVERY SCREEN (tester suggestions item 8; prompt 4b item 4).
//
// axe-core (a dev dependency) runs in Chromium at 430px over every screen a person can reach, as two
// people, each in the light and the dark theme:
//   the demo                 the sample household, through "Try the demo with … sample data";
//   a signed-in new account  onboarded, with no bank, bills, income, debts or goals. It is served by
//                            tests/_mockSupabase.cjs from this test's own server: no real account,
//                            nothing sent anywhere.
// The screens: Today and Decisions, Watch Plan and Activity, Do (Budget, Goals and every Goals tab,
// Credit), Learn, Meet, Settings and every section and sheet it opens, Notifications, How we got this
// (Today, Watch, the range summary, Meet), Can I afford this, What-If, Check-In, the tour, the FAQ and
// the feedback form. Every WCAG 2.x A and AA rule axe automates must pass, with one exception, named
// here so it cannot widen quietly:
//
//   meta-viewport  index.html sets maximum-scale=1, user-scalable=no on purpose: inside the
//                  Capacitor WebView a pinch-zoomed app cannot zoom back out. Text still scales
//                  with the phone's own text size (lib/textScale.js, applied at startup and checked
//                  below), and iOS Safari ignores the lock on the open web.
//
// Each pass is pinned to its theme (demo-fixes C9). The app keeps its theme in localStorage and follows
// the system setting until someone picks one; under Chromium's emulated colour scheme a reload could
// flip a "dark" pass to light, so every sheet opened after one (Settings, its dialogs, Check-In) was
// scanned in the light theme while reported as dark. Two dark-theme contrast failures hid that way.
// Each pass now starts with its theme chosen, and check 6 confirms every screen was scanned in it.
//
// What axe cannot see is covered elsewhere: 44px tap targets and spacing by layout.browser.test.cjs,
// and text at 1.3x by the same sweep. Icon-only buttons are checked here: axe accepts "✕" as a name.
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs"); // removed when this test ends, pass or fail
const { create } = require("./_runner.cjs");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const MOCK = require("./_mockSupabase.cjs");

const ROOT = path.join(__dirname, "..");
const WIDTH = 430;
const EXCLUDED_RULES = ["meta-viewport"];

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };

const TAB = (p, name) => p.getByRole("button").filter({ hasText: new RegExp("^" + name + "(\\s*\\d+)?$") }).last().click();
const ARIA = (p, name) => p.getByRole("button", { name, exact: true }).first().click();
const TXT = (p, s, exact = false) => p.getByText(s, { exact }).first().click();
const NTH = (p, name, n) => p.getByRole("button", { name, exact: true }).nth(n).click();
const goals = (p, sub) => async () => { await TAB(p, "Do"); await TXT(p, "Goals", true); if (sub) await sub(); };

// who: "demo" or "empty" (both when unset). overlay: reload first, so a sheet opens on a clean screen.
const VIEWS = [
  { name: "Today",                 go: (p) => TAB(p, "Today") },
  { name: "Today/Decisions",       go: async (p) => { await TAB(p, "Today"); await TXT(p, "Decisions", true); } },
  { name: "Watch/Plan",            go: (p) => TAB(p, "Watch") },
  { name: "Watch/Activity",        go: async (p) => { await TAB(p, "Watch"); await TXT(p, "Activity", true); } },
  { name: "Do/Budget",             go: (p) => TAB(p, "Do") },
  { name: "Do/Goals",              go: (p) => goals(p)() },
  { name: "Do/Goals/My Goals",     go: (p) => goals(p, () => TXT(p, "My Goals", true))() },
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
  { name: "Settings",              overlay: true, go: (p) => ARIA(p, "Settings") },
  { name: "Settings/What's new",   overlay: true, go: async (p) => { await ARIA(p, "Settings"); await TXT(p, "What's new", true); } },
  { name: "Settings/Support + FAQ", overlay: true, go: async (p) => { await ARIA(p, "Settings"); await TXT(p, "Open Support", true); await TXT(p, "What is safe to spend?", true); } },
  { name: "Settings/Send feedback", overlay: true, go: async (p) => { await ARIA(p, "Settings"); await TXT(p, "Send feedback", true); } },
  ...["Profile & Income", "Connected Accounts", "Manage Bills", "Manage Debts", "Savings Goals", "Family Settings", "Dashboard"].map(label =>
    ({ name: `Settings/${label}`, overlay: true, go: async (p) => { await ARIA(p, "Settings"); await TXT(p, label, true); } })),
  { name: "Settings/Home Screen Widget", overlay: true, go: async (p) => { await ARIA(p, "Settings"); await TXT(p, "Home Screen Widget"); } },
  { name: "Settings/Delete Account", overlay: true, go: async (p) => { await ARIA(p, "Settings"); await ARIA(p, "Delete Account"); } },
  { name: "Notifications",         overlay: true, go: (p) => ARIA(p, "Notifications") },
  { name: "How we got this: Today", who: "demo", overlay: true, go: async (p) => { await TAB(p, "Today"); await ARIA(p, "How Flourish got this number"); } },
  { name: "How we got this: Today's pace", overlay: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "Explain this →"); } },
  { name: "How we got this: Watch", overlay: true, go: async (p) => { await TAB(p, "Watch"); await ARIA(p, "How Flourish got this number"); } },
  { name: "How we got this: range", overlay: true, go: async (p) => { await TAB(p, "Watch"); await p.locator('button[aria-label^="Lowest balance"]').first().click(); } },
  // A new account's Meet has no figure to open (one setup line, prompt 4d), so this is the demo's.
  { name: "How we got this: Meet",  who: "demo", overlay: true, go: async (p) => { await TAB(p, "Meet"); await p.locator('button[aria-label$="How Flourish got it"], button[aria-label$=": how Flourish got it"]').first().click(); } },
  { name: "Glossary",              overlay: true, go: async (p) => { await TAB(p, "Today"); await ARIA(p, "What Safe to spend means"); } },
  { name: "Can I afford this: fits", who: "demo", overlay: true, go: async (p) => { await TAB(p, "Today"); await p.getByPlaceholder("0.00").first().fill("40"); } },
  { name: "Can I afford this: over", who: "demo", overlay: true, go: async (p) => { await TAB(p, "Today"); await p.getByPlaceholder("0.00").first().fill("9000"); } },
  { name: "What-If",               overlay: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "What if? →"); } },
  { name: "Check-In",              overlay: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "Check-In ✦"); } },
  { name: "Reorder dashboard",     overlay: true, go: async (p) => { await TAB(p, "Today"); await TXT(p, "⠿ Reorder"); } },
  { name: "Add bill",              overlay: true, go: async (p) => { await TAB(p, "Watch"); await TXT(p, "+ Add Bill"); } },
  { name: "Expected money",        overlay: true, go: async (p) => { await TAB(p, "Watch"); await TXT(p, "+ Add", true); } },
  { name: "Daily spend",           overlay: true, go: async (p) => { await TAB(p, "Watch"); await TXT(p, "What the forecast is built from"); await ARIA(p, "Edit Est. daily spend"); } },
  { name: "Clear chat",            overlay: true, go: async (p) => { await TAB(p, "Learn"); await ARIA(p, "Clear chat history"); } },
  { name: "Tour step 1",           tour: true, go: async () => {} },
  { name: "Tour last step",        tour: true, go: async (p) => { for (let i = 0; i < 4; i++) { await TXT(p, "Next →"); await p.waitForTimeout(350); } } },
];

function buildApp(supabaseUrl) {
  const out = tempDir("a11y");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  return out;
}

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("A11Y (browser)"); return; }
  const axePath = require.resolve("axe-core/axe.min.js");
  let dist = null;
  // One local server: the built app, and the mock Supabase the build points at.
  const server = http.createServer((req, res) => {
    if (MOCK.handle(req, res)) return;
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = buildApp(base);
  const browser = await playwright.chromium.launch();

  const open = async (who, scheme, tour) => {
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    await ctx.addInitScript(([who, tour, key, session, scheme]) => { try {
      // The pass's theme, chosen, so a reload cannot fall back to another (check 6).
      localStorage.setItem("flourish_theme", scheme); localStorage.setItem("flourish_theme_manual", "1");
      localStorage.setItem("flourish_first_visit_done", "1");
      if (!tour) localStorage.setItem("flourish_tour_done", "1");
      if (who === "empty") localStorage.setItem(key, session);
    } catch (e) {} }, [who, !!tour, MOCK.storageKey(base), JSON.stringify(MOCK.makeSession()), scheme]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const ready = async () => {
      if (who === "demo") {
        // The demo survives a reload; only the first load goes through the welcome page.
        const demo = page.getByText("Demo mode", { exact: false }).first(), welcome = page.getByText("Try the demo with", { exact: false }).first();
        await demo.or(welcome).waitFor({ timeout: 40000 });
        if (!(await demo.isVisible())) {
          await welcome.click();
          await demo.waitFor({ timeout: 40000 });
        }
      } else {
        await page.getByText(tour ? "Step 1 of 5" : "Getting set up", { exact: false }).first().waitFor({ timeout: 40000 });
      }
      await page.waitForTimeout(500);
    };
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await ready();
    const reload = async () => { await page.reload({ waitUntil: "domcontentloaded" }); await ready(); };
    return { ctx, page, reload };
  };

  const scan = async (page) => {
    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async (excluded) => {
      const rules = {}; for (const id of excluded) rules[id] = { enabled: false };
      const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, rules, resultTypes: ["violations"] });
      return res.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length,
        nodes: x.nodes.slice(0, 4).map((nd) => `${nd.target.join(" ")} :: ${(nd.failureSummary || "").split("\n").slice(1, 2).join(" ").trim().slice(0, 150)} :: ${(document.querySelector(nd.target[0])?.textContent || "").trim().slice(0, 50)}`) }));
    }, EXCLUDED_RULES);
    // axe accepts "✕" or "‹" as a button's name. An icon-only button needs a name in words.
    const icons = await page.evaluate(() => [...document.querySelectorAll("button, [role=button]")]
      .filter((b) => b.getClientRects().length && !/[\p{L}\p{N}]/u.test(b.textContent || ""))
      .filter((b) => !/\p{L}/u.test(b.getAttribute("aria-label") || b.getAttribute("title") || (b.getAttribute("aria-labelledby") ? (document.getElementById(b.getAttribute("aria-labelledby"))?.textContent || "") : "")))
      .map((b) => `${(b.textContent || "").trim() || "(empty)"} :: ${b.outerHTML.replace(/style="[^"]*"/g, "").slice(0, 100)}`));
    return { violations, icons };
  };

  // Four passes in parallel: demo and new account, light and dark.
  const passes = [];
  for (const who of ["demo", "empty"]) for (const scheme of ["light", "dark"]) passes.push({ who, scheme });
  let tsa = "";
  const results = (await Promise.all(passes.map(async ({ who, scheme }) => {
    const out = [];
    const main = await open(who, scheme, false);
    let tourCtx = null;
    if (who === "demo" && scheme === "light") tsa = await main.page.evaluate(() => document.documentElement.style.webkitTextSizeAdjust || document.documentElement.style.textSizeAdjust || "");
    for (const v of VIEWS.filter((x) => !x.who || x.who === who)) {
      const label = `${v.name} (${who}, ${scheme})`;
      try {
        let page = main.page;
        if (v.tour) { if (tourCtx) await tourCtx.ctx.close(); tourCtx = await open(who, scheme, true); page = tourCtx.page; }
        else if (v.overlay) await main.reload();
        await v.go(page);
        await page.waitForTimeout(600);
        const theme = await page.evaluate(() => { try { return localStorage.getItem("flourish_theme"); } catch { return null; } });
        out.push({ view: label, scheme, theme, ...(await scan(page)) });
      } catch (e) {
        out.push({ view: label, unreachable: String(e.message).split("\n")[0].slice(0, 160) });
        try { await main.reload(); } catch {}
      }
    }
    await main.ctx.close(); if (tourCtx) await tourCtx.ctx.close();
    return out;
  }))).flat();
  await browser.close(); server.close();
  if (process.env.A11Y_JSON) fs.writeFileSync(process.env.A11Y_JSON, JSON.stringify(results, null, 1));

  t.ok(results.length >= 4 * 40, `0 the sweep covered ${results.length} screen-and-theme combinations`);
  t.eq(results.filter((r) => r.unreachable).map((r) => `${r.view}: ${r.unreachable}`), [], "1 every screen in the check opened");
  for (const r of results.filter((x) => !x.unreachable)) {
    t.eq(r.violations.map((v) => `${v.id} (${v.impact}, ${v.n}): ${v.nodes.join(" | ")}`), [], `2 ${r.view}: no WCAG 2.x A/AA violation axe can find`);
    t.eq(r.icons, [], `5 ${r.view}: every icon-only button has a name in words`);
  }
  t.eq(results.filter((r) => !r.unreachable && r.theme !== r.scheme).map((r) => `${r.view}: rendered ${r.theme || "unknown"}`), [],
    "6 every screen was scanned in its pass's theme (a dark pass used to fall back to light after a reload)");
  t.ok(/^\d+%$/.test(tsa), `3 text scales with the system text size: the root's text-size-adjust is set at startup (${tsa || "unset"})`);
  t.eq(EXCLUDED_RULES, ["meta-viewport"], "4 one rule is excluded, and only that one (the native pinch-zoom lock, see the header)");
  t.summary("A11Y (browser)");
})();
