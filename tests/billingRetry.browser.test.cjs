// tests/billingRetry.browser.test.cjs
// -----------------------------------------------------------------------------
// ONE FAILED BILLING STATUS NO LONGER STOPS ANYONE PAYING (audit 2026-10-26, B4), IN A REAL BROWSER.
//
// The web billing status was asked once per account. If that call failed, every upgrade opened the old feature
// Paywall, which offered "Start 14 days free" after the trial had ended and then said paid plans weren't open.
// A free household, signed in on the built app, with the status call failing:
//   1  it is asked again after 5, 20 and 60 seconds, and when the network comes back
//   2  Upgrade asks again first: when that answers, the real checkout opens, not the old Paywall
//   3  when it still cannot be read, the old Paywall offers no trial, never says plans aren't open, shows CAD
//      prices to a US profile too, and its "Try again" asks once more (and says so when that fails)
//   4  its promo code has a real label and no placeholder, in both themes, at 320px and every text size
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
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
function household(country = "CA") {
  const blob = MOCK.emptyBlob();
  blob.savedAt = "2026-10-26T09:00:00.000Z";
  blob.core.isPremium = false;
  blob.core.appData = {
    profile: { name: "", country, province: country === "CA" ? "ON" : "NY" },
    accounts: [{ id: "m1", name: "Chequing", type: "checking", balance: 3000, institution: "Manual" }],
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-06", type: "employment" }],
    bills: [], transactions: [], debts: [], goals: [], bankConnected: false,
  };
  return blob;
}
const STATUS = { enabled: true, paid: false, provider: null, period_end: null, manageable: false, founding: { available: false, cohortLimit: 50, confirmEmail: false } };

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("BILLING RETRY (browser)"); return; }
  let dist = null, country = "CA";
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    if (p === "/rest/v1/user_data" && req.method === "GET") {
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
      const row = { data: household(country), updated_at: "2026-10-26T09:00:00.000Z" };
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(wantsObject ? row : [row])); return;
    }
    if (p === "/rest/v1/profiles" && req.method === "GET") {
      // A household whose trial ended in September: on the free plan.
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
      const row = { plan: "trial", trial_started_at: "2026-09-01T00:00:00.000Z", trial_ends_at: "2026-09-15T00:00:00.000Z", founder_flag: false };
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(wantsObject ? row : [row])); return;
    }
    if (MOCK.handle(req, res)) return;
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = tempDir("billretry");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  const browser = await playwright.chromium.launch();
  // failUntil: the status call fails (503) for its first n calls; Infinity: always.
  const open = async (failUntil, { width = 390, theme = null } = {}) => {
    const calls = [];
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: "America/Toronto" });
    await ctx.addInitScript(([key, session, chosen]) => { try {
      if (chosen) { localStorage.setItem("flourish_theme", chosen); localStorage.setItem("flourish_theme_manual", "1"); }
      localStorage.setItem(key, session);
      localStorage.setItem("flourish_first_visit_done", "1");
      localStorage.setItem("flourish_tour_done", "1");
      localStorage.setItem("flourish_ai_disclosure_seen", "1");
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession(Math.floor(Date.parse("2026-10-26T14:00:00Z") / 1000))), theme]);
    await ctx.route("**/api/billing", (r) => {
      let action = null; try { action = JSON.parse(r.request().postData() || "{}").action; } catch {}
      if (action !== "status") return r.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      calls.push(Date.now());
      const fail = calls.length <= failUntil;
      r.fulfill({ status: fail ? 503 : 200, contentType: "application/json", body: JSON.stringify(fail ? { error: "status_unavailable" } : STATUS) });
    });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-26T10:00:00-04:00") });
    page.setDefaultTimeout(20000);
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 });
    return { ctx, page, calls };
  };
  const settle = async (page, ms = 400) => { await page.waitForTimeout(ms); };
  try {
    // ── 1. Asked again after 5, 20 and 60 s, and when the network comes back ─────────────────────
    {
      const { ctx, page, calls } = await open(Infinity);
      await settle(page);
      const n0 = calls.length;
      await page.clock.runFor(5100); await settle(page);
      const n1 = calls.length;
      await page.clock.runFor(20100); await settle(page);
      const n2 = calls.length;
      await page.clock.runFor(60100); await settle(page);
      const n3 = calls.length;
      await page.evaluate(() => window.dispatchEvent(new Event("online"))); await settle(page);
      const n4 = calls.length;
      t.ok(n0 >= 1 && n1 === n0 + 1 && n2 === n1 + 1 && n3 === n2 + 1, `1a the status is asked again after 5, 20 and 60 seconds (${[n0, n1, n2, n3].join(", ")})`);
      t.ok(n4 === n3 + 1, "1b …and again when the network comes back");
      await ctx.close();
    }

    // ── 2. Upgrade asks again first ───────────────────────────────────────────────────────────────
    {
      const { ctx, page, calls } = await open(1);
      await settle(page);
      const before = calls.length;
      await page.getByText(/\[WORDS: plan-(get|upgrade)-cta\]/).first().click();   // the main plan's CTA, its words to come (2026-11-10)
      await page.getByText("$11.99 a month", { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {});
      const body = await page.locator("body").innerText();
      t.ok(calls.length > before && /\$11\.99 a month/.test(body) && !/Try again\b/.test(body), "2a the first status call failed; Upgrade asked again and opened the real checkout, not the old Paywall");
      await ctx.close();
    }

    // ── 3. Still unreadable: the old Paywall tells the truth ─────────────────────────────────────
    for (const c of ["CA", "US"]) {
      country = c;
      const { ctx, page, calls } = await open(Infinity);
      await settle(page);
      await page.getByText(/\[WORDS: plan-(get|upgrade)-cta\]/).first().click();   // the main plan's CTA, its words to come (2026-11-10)
      await page.getByRole("button", { name: "Try again" }).waitFor({ timeout: 10000 });
      const body = await page.locator("body").innerText();
      t.ok(!/days free|free trial|Free for 14 days/i.test(body) && !/aren't open/i.test(body), `3a ${c} profile: the old Paywall offers no free trial and never says plans aren't open`);
      t.ok(/\$99\.99\/yr/.test(body) && /\$11\.99\/mo/.test(body) && !/\$59\.99|\$7\.99/.test(body) && /CAD plus tax/.test(body), `3b ${c} profile: CAD prices only, the ones the server can charge`);
      const n = calls.length;
      await page.getByRole("button", { name: "Try again" }).click();
      await page.getByText("Couldn't reach the server. Try again in a moment.").waitFor({ timeout: 10000 }).catch(() => {});
      const after = await page.locator("body").innerText();
      t.ok(calls.length === n + 1 && /Couldn't reach the server\. Try again in a moment\./.test(after), `3c ${c}: "Try again" asks once more, and says so when that fails`);
      await ctx.close();
    }

    // ── 4. The promo code has a real label ─────────────────────────────────────────────────────────
    const toPromo = async (page) => {
      await settle(page);
      await page.getByText(/\[WORDS: plan-(get|upgrade)-cta\]/).first().click();   // the main plan's CTA, its words to come (2026-11-10)
      const PROMO = page.getByLabel("Promo code", { exact: true });
      await PROMO.waitFor({ timeout: 10000 });
      return PROMO;
    };
    // Each rendered font size times k, worked out first so nested sizes don't compound.
    const biggerText = (k) => { const els = [...document.querySelectorAll("body *")]; const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize)); els.forEach((e, i) => { if (sizes[i]) e.style.fontSize = sizes[i] * k + "px"; }); };
    const fit = () => {
      const input = document.getElementById("paywall-promo"), label = document.querySelector('label[for="paywall-promo"]');
      const apply = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Apply");
      const range = document.createRange(); range.selectNodeContents(label);
      const text = range.getBoundingClientRect(), box = input.getBoundingClientRect(), go = apply.getBoundingClientRect(), css = getComputedStyle(label);
      const onScreen = (r) => r.left >= 0 && r.right <= innerWidth;
      const leaf = (words) => [...document.querySelectorAll("body *")].find((e) => e.children.length === 0 && e.textContent.trim() === words).getBoundingClientRect();
      return { words: label.textContent, above: text.bottom <= box.top, inFull: css.overflow === "visible" && css.whiteSpace !== "nowrap" && onScreen(text), fieldOnScreen: onScreen(box), applyOnScreen: onScreen(go), apart: go.left >= box.right || go.top >= box.bottom, pillClear: leaf("Billed yearly").bottom <= leaf("Annual").top, placeholders: document.querySelectorAll("input[placeholder],textarea[placeholder]").length, sideways: document.documentElement.scrollWidth > innerWidth };
    };
    const FITS = { words: "Promo code", above: true, inFull: true, fieldOnScreen: true, applyOnScreen: true, apart: true, pillClear: true, placeholders: 0, sideways: false };
    for (const theme of ["dark", "light"]) {
      for (const k of [1, 1.3, 1.6, 2]) {
        const { ctx, page } = await open(Infinity, { width: 320, theme });
        await toPromo(page);
        await page.evaluate(biggerText, k);
        t.eq(await page.evaluate(fit), FITS, `4a ${theme}, 320px, text ×${k}: the label shows in full above the field, no placeholder, field and Apply on screen, "Billed yearly" clear of "Annual", nothing to scroll sideways`);
        await ctx.close();
      }
      const { ctx, page } = await open(Infinity, { theme });
      await toPromo(page);
      const look = await page.evaluate(() => {
        const rgba = (s) => s.match(/[\d.]+/g).map(Number);
        const blend = (c, under) => { const a = c[3] === undefined ? 1 : c[3]; return [0, 1, 2].map((i) => c[i] * a + under[i] * (1 - a)); };
        const behind = (e) => { const c = rgba(getComputedStyle(e).backgroundColor); return !e.parentElement || c[3] === undefined || c[3] === 1 ? c.slice(0, 3) : blend(c, behind(e.parentElement)); };
        const lum = (c) => { const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const label = document.querySelector('label[for="paywall-promo"]'), css = getComputedStyle(label), bg = behind(label);
        const [hi, lo] = [lum(blend(rgba(css.color), bg)), lum(bg)].sort((x, y) => y - x);
        return { size: css.fontSize, weight: css.fontWeight, display: css.display, gap: css.marginBottom, ratio: (hi + 0.05) / (lo + 0.05) };
      });
      t.eq([look.size, look.weight, look.display, look.gap], ["13px", "600", "block", "4px"], `4b ${theme}: the label has the sign-in fields' measurements`);
      t.ok(look.ratio >= 4.5, `4c ${theme}: the label is readable (${look.ratio.toFixed(1)}, at least 4.5)`);
      await ctx.close();
    }
    {
      const { ctx, page } = await open(Infinity);
      const asked = [];
      await page.route("**/api/beta", (r) => { const b = JSON.parse(r.request().postData() || "{}"); if (b.action === "validate") asked.push(b.code); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) }); });
      const PROMO = await toPromo(page);
      await PROMO.fill("friend26");
      t.eq(await PROMO.inputValue(), "FRIEND26", "4d the label drives the same field: what is typed goes in capitals");
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await page.getByText("Invalid code", { exact: true }).waitFor({ timeout: 10000 });
      t.eq(asked, ["FRIEND26"], "4e …and Apply still checks it and still answers");
      await ctx.close();
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.message) || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("BILLING RETRY (browser)");
})();
