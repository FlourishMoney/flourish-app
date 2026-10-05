// tests/budgetEdit.browser.test.cjs
// -----------------------------------------------------------------------------
// GOALS → BUDGET'S EDIT BUTTON OPENS THE BUDGET EDITOR (KNOWN-DEFECTS #51).
//
// The button wrote two app-data keys nothing read, so tapping it did nothing: a full-size control
// that is dead. It now takes the household to Do → Budget with its editor open ("Save Plan").
//
// A tap is the only honest test of a dead control, so this builds the demo app and taps it in
// Chromium, the same way layout.browser.test does. LAYOUT_DIST reuses an existing build.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

function buildApp() {
  if (process.env.LAYOUT_DIST) return process.env.LAYOUT_DIST;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "flourish-budget-edit-"));
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://placeholder.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "placeholder" } });
  return out;
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
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

(async () => {
  const t = create();
  const playwright = require("playwright");
  const dist = buildApp();
  const { server, port } = await serve(dist);
  let browser;
  try { browser = await playwright.chromium.launch(); }
  catch (e) { t.ok(false, `chromium launches (run: npx playwright install chromium): ${String(e.message).split("\n")[0]}`); server.close(); t.summary("budgetEdit.browser"); return; }
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem("flourish_first_visit_done", "1"); localStorage.setItem("flourish_tour_done", "1"); } catch (e) {} });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.getByText("Try the demo with", { exact: false }).first().click({ timeout: 30000 });
    await page.getByText("I Understand & Accept").first().click({ timeout: 30000 });
    await page.getByText("Demo mode", { exact: false }).first().waitFor({ timeout: 40000 });

    // Do → Goals → its Budget tab.
    await page.getByRole("button").filter({ hasText: /^Do$/ }).last().click();
    await page.getByText("Goals", { exact: true }).first().click();
    await page.getByRole("button", { name: "Budget", exact: true }).last().click();
    await page.getByText("Monthly Category Budgets").first().waitFor({ timeout: 10000 });
    t.eq(await page.getByText("Save Plan", { exact: true }).count(), 0, "1a (before the tap, no budget editor is open)");

    const edit = page.getByRole("button", { name: "Edit", exact: true }).first();
    t.eq(await edit.count(), 1, "1b Goals → Budget has its Edit button");
    const box = await edit.boundingBox();
    t.ok(box && box.height >= 44, `1c …44px tall (${box && Math.round(box.height)}px)`);
    await edit.click();
    await page.waitForTimeout(800);

    t.ok(await page.getByText("Save Plan", { exact: true }).first().isVisible().catch(() => false), "1d tapping Edit opens the budget editor (Do → Budget, \"Save Plan\")");
    t.eq(await page.getByText("Monthly Category Budgets").count(), 0, "1e …on Do → Budget, having left Goals → Budget");
    const stored = await page.evaluate(() => { try { return Object.keys(JSON.parse(localStorage.getItem("flourish_v1")).appData || {}); } catch (e) { return []; } });
    t.ok(!stored.includes("_budgetEditOpen") && !stored.includes("_budgetEditSeed"), "1f …and the tap writes no unused keys into the household's data");
    t.eq(errors, [], "1g no script errors");
    await ctx.close();
  } catch (e) {
    t.ok(false, `the Edit flow runs: ${String(e.message).split("\n")[0]}`);
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("budgetEdit.browser");
})();
