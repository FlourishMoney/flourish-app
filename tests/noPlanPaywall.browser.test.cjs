// tests/noPlanPaywall.browser.test.cjs
// -----------------------------------------------------------------------------
// THE NO-PLAN PAYWALL, IN A REAL BROWSER (founder's decision, 2026-10-23: no free plan).
//
// The website build, a signed-in account served by tests/_mockSupabase.cjs, and a stand-in for billing.js whose
// `access` answer this test sets. Nothing reaches a real server.
//   1  no plan: the paywall covers the app, and the app is still mounted under it
//   2  from it: See plans (the website's checkout screen, inside the paywall), Privacy Policy, Terms and Support
//      (inside it, nothing behind it unmounts), Export my data (a download with the household's data), Sign out
//      and Delete Account (their own confirmations, above it); it has no Close
//   3  NOTHING IS LOST: a bill half typed when the paywall arrives is still there, typed, when the household
//      subscribes, and saves; the household's saved data is the same before and after
//   4  a plan: no paywall
//   5  no answer from the server: no paywall for an account that was entitled (offline is not "no plan")
//   6  the live demo stays free and needs no account: no paywall, and it asks the server for nothing (no billing
//      status, no coach, no Plaid), even with the server saying "no plan"
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { tempDir } = require("./_tmp.cjs");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const MOCK = require("./_mockSupabase.cjs");

const ROOT = path.join(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg" };

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("NO-PLAN PAYWALL (browser)"); return; }
  const P = await import("../src/lib/paywallGate.js");

  // What billing.js answers. `access` is set per step; null means the call fails (offline, blocked).
  let access = { entitled: false, basis: "none", grace_ends_at: null };
  const billingCalls = [];
  const serverCalls = [];      // every call to the app's own functions, for the demo's check
  let dist = null;
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    if (p.startsWith("/api/") || p.startsWith("/.netlify/")) serverCalls.push(p);
    if (p === "/api/billing") {
      let raw = ""; req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        let body = {}; try { body = JSON.parse(raw || "{}"); } catch {}
        billingCalls.push(body.action);
        const json = (status, b) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
        if (access === null) return json(503, { error: "unavailable" });
        if (body.action === "status") return json(200, { enabled: true, provider: null, paid: false, manageable: false, founding: { available: false, cohortLimit: 50, confirmEmail: false }, access });
        return json(404, { error: "not_found" });
      });
      return;
    }
    if (MOCK.handle(req, res)) return;
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = tempDir("noplan");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  const browser = await playwright.chromium.launch();

  const open = async ({ signedIn = true } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
    await ctx.addInitScript(([key, session, signedIn]) => { try {
      localStorage.setItem("flourish_first_visit_done", "1");
      localStorage.setItem("flourish_tour_done", "1");
      if (signedIn) localStorage.setItem(key, session);
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession()), signedIn]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    return { ctx, page };
  };
  const paywall = (page) => page.locator("[data-no-plan]");
  const recheck = (page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const saved = (page) => page.evaluate(() => { try { const b = JSON.parse(localStorage.getItem("flourish_v1") || "null"); return b ? JSON.stringify({ ...b, savedAt: null }) : null; } catch { return null; } });

  try {
    // ── 1 and 2. No plan ─────────────────────────────────────────────────────────────────────────
    {
      access = { entitled: false, basis: "none", grace_ends_at: null };
      const { ctx, page } = await open();
      await paywall(page).waitFor({ timeout: 40000 });
      t.ok(await paywall(page).isVisible(), "1a no plan: the paywall shows");
      t.ok((await page.getByText("Getting set up", { exact: false }).count()) > 0, "1b …over the app, which is still mounted under it");
      t.eq(await page.locator("[data-no-plan] button", { hasText: /^Close$|✕/ }).count(), 0, "1c it has no Close");
      for (const w of [P.NO_PLAN_COPY.heading, P.NO_PLAN_COPY.dataSafe, P.NO_PLAN_COPY.seePlans, P.NO_PLAN_COPY.signOut, P.NO_PLAN_COPY.exportData, P.NO_PLAN_COPY.deleteAccount, P.NO_PLAN_COPY.privacy, P.NO_PLAN_COPY.terms, P.NO_PLAN_COPY.support, P.NO_PLAN_COPY.checkAgain]) {
        t.ok(await paywall(page).getByText(w, { exact: true }).first().isVisible(), `1d it shows: ${w}`);
      }

      await paywall(page).getByRole("button", { name: P.NO_PLAN_COPY.seePlans, exact: true }).click();
      t.ok(await paywall(page).getByText("Monthly", { exact: true }).first().isVisible(), "2a See plans: the website's plans, inside the paywall");
      await paywall(page).getByRole("button", { name: "Close", exact: true }).click();
      t.ok(await paywall(page).getByRole("button", { name: P.NO_PLAN_COPY.seePlans, exact: true }).isVisible(), "2b …and back to the paywall");
      for (const [w, heading] of [[P.NO_PLAN_COPY.privacy, "Privacy Policy"], [P.NO_PLAN_COPY.terms, "Terms of Service"], [P.NO_PLAN_COPY.support, "Support"]]) {
        await paywall(page).getByRole("button", { name: w, exact: true }).click();
        t.ok(await paywall(page).getByText(heading, { exact: true }).first().isVisible(), `2c ${w} opens inside the paywall`);
        t.ok((await page.getByText("Getting set up", { exact: false }).count()) > 0, `2d …and nothing behind it unmounts (${w})`);
        await paywall(page).getByRole("button", { name: /Back/ }).first().click();
      }
      const [download] = await Promise.all([page.waitForEvent("download"), paywall(page).getByRole("button", { name: P.NO_PLAN_COPY.exportData, exact: true }).click()]);
      const file = await download.path();
      const exported = JSON.parse(fs.readFileSync(file, "utf8"));
      t.eq([exported._meta.app, exported.profile && exported.profile.name], ["Flourish Money", "Sam"], "2e Export my data downloads the household's own data");
      await paywall(page).getByRole("button", { name: P.NO_PLAN_COPY.deleteAccount, exact: true }).click();
      t.ok(await page.getByText("Delete your account?", { exact: true }).isVisible(), "2f Delete Account asks first, above the paywall");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await paywall(page).getByRole("button", { name: P.NO_PLAN_COPY.signOut, exact: true }).click();
      t.ok(await page.getByText("Sign out?", { exact: true }).isVisible(), "2g Sign out asks first, above the paywall");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      t.ok(await paywall(page).isVisible(), "2h after both are cancelled, the paywall is still there");
      await ctx.close();
    }

    // ── 3. Nothing is lost ──────────────────────────────────────────────────────────────────────────
    {
      access = { entitled: true, basis: "trial", grace_ends_at: null };
      const { ctx, page } = await open();
      await page.getByText("Getting set up", { exact: false }).first().waitFor({ timeout: 40000 });
      await page.getByRole("button").filter({ hasText: /^Watch(\s*\d+)?$/ }).last().click();
      await page.getByText("+ Add Bill").first().click();
      await page.getByText("+ Add a bill").first().click();
      const name = page.getByPlaceholder("e.g. Hydro").first();
      await name.fill("Gym");
      const before = await saved(page);
      access = { entitled: false, basis: "none", grace_ends_at: null };
      await recheck(page);
      await paywall(page).waitFor({ timeout: 15000 });
      t.ok(await paywall(page).isVisible(), "3a the trial ends while a bill is half typed: the paywall arrives");
      t.eq(await saved(page), before, "3b …and the household's saved data is exactly as it was");
      access = { entitled: true, basis: "paid", grace_ends_at: null };
      await paywall(page).getByRole("button", { name: P.NO_PLAN_COPY.checkAgain, exact: true }).click();
      await paywall(page).waitFor({ state: "detached", timeout: 15000 });
      t.eq(await paywall(page).count(), 0, "3c the household subscribes: the paywall goes");
      t.eq(await page.getByPlaceholder("e.g. Hydro").first().inputValue(), "Gym", "3d …and the half-typed bill is still there, as typed");
      t.eq(await saved(page), before, "3e …and nothing was written while the paywall was up");
      await ctx.close();
    }

    // ── 4. A plan ──────────────────────────────────────────────────────────────────
    {
      access = { entitled: true, basis: "paid", grace_ends_at: null };
      const { ctx, page } = await open();
      await page.getByText("Getting set up", { exact: false }).first().waitFor({ timeout: 40000 });
      await page.waitForTimeout(800);
      t.eq(await paywall(page).count(), 0, "4a a paid plan: no paywall");
      await ctx.close();
    }

    // ── 5. No answer ─────────────────────────────────────────────────────────────────────────────────
    {
      access = { entitled: true, basis: "paid", grace_ends_at: null };
      let { ctx, page } = await open();
      await page.getByText("Getting set up", { exact: false }).first().waitFor({ timeout: 40000 });
      await page.waitForTimeout(800);
      access = null;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByText("Getting set up", { exact: false }).first().waitFor({ timeout: 40000 });
      await page.waitForTimeout(800);
      t.eq(await paywall(page).count(), 0, "5a billing unreachable, an account that was entitled: no paywall (offline is not \"no plan\")");
      await ctx.close();
    }

    // ── 6. The live demo ─────────────────────────────────────────────────────────────────────────────
    {
      access = { entitled: false, basis: "none", grace_ends_at: null };
      billingCalls.length = 0; serverCalls.length = 0;
      const { ctx, page } = await open({ signedIn: false });
      const welcome = page.getByText("Try the demo with", { exact: false }).first();
      await welcome.waitFor({ timeout: 40000 });
      await welcome.click();
      await page.getByText("Demo mode", { exact: false }).first().waitFor({ timeout: 40000 });
      await page.waitForTimeout(1000);
      t.eq(await paywall(page).count(), 0, "6a the live demo: no account, no paywall, with the server saying \"no plan\" to anyone who asks");
      // Around the demo: Today, Watch, Do, Learn (the scripted coach), and What-If, each opened once.
      for (const tab of ["Watch", "Do", "Learn", "Today"]) {
        await page.getByRole("button").filter({ hasText: new RegExp("^" + tab + "(\\s*\\d+)?$") }).last().click();
        await page.waitForTimeout(400);
        t.eq(await paywall(page).count(), 0, `6b …${tab} opens, with no paywall`);
      }
      await page.getByText("What if? →").first().click();
      await page.waitForTimeout(800);
      t.eq(await paywall(page).count(), 0, "6c …What-If opens, with no paywall");
      t.eq(billingCalls.length, 0, "6d billing is never asked in the demo");
      t.eq(serverCalls.filter((c) => /coach|plaid|billing|meeting/.test(c)), [], "6e …nor the coach, Plaid or any paid function: the demo needs no account and costs nothing");
      await ctx.close();
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.message) || e).split("\n").slice(0, 4).join(" | ").slice(0, 400));
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("NO-PLAN PAYWALL (browser)");
})();
