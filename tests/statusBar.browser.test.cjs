// tests/statusBar.browser.test.cjs
// -----------------------------------------------------------------------------
// IN THE STORE APPS, NOTHING A PERSON READS SCROLLS UNDER THE STATUS BAR (found on the Android emulator, 2026-11-18;
// the iPhone app did the same on the same screens, under its clock and Dynamic Island).
//
// From Android 15 the app is drawn edge to edge: the status bar is transparent and the page runs behind it
// (tests/androidEdgeToEdge.test.cjs). Every screen pads its top by the bar's height, so at rest nothing is under the
// clock. But the padding scrolls away with the page: on a screen with no header of its own (the AI notice, the
// onboarding steps, "Choose your plan", the Terms…) the words slid up under the clock and the icons, one drawn over
// the other. The signed-in app never did it: its sticky header covers the bar.
//
// The iPhone app runs the page behind its status bar too (viewport-fit=cover), so everything here is checked twice:
// the built store app as the Android app with a status bar of 48 px, and as the iPhone app with one of 59 px (an
// iPhone with a Dynamic Island), both through Chromium's safe-area override, as tests/_duo.cjs does for the iPhone
// Duo, in a short window so every screen scrolls. On each screen it scrolls every scroller a little, further, and to
// its end, and at each stop asks: is any word or control painted in the bar, on top? (document.elementFromPoint: a
// cover or a header drawn over the words is what a person sees instead.)
//   A  signed out: the first screen, the sign-up card, the log-in card
//   B  a new account: the AI notice, "Before you start", its Terms and Privacy Policy, the bank step, the balance, the
//      paycheques, the first number and how it is calculated, the bills, the debts, "Choose your plan" and its Privacy Policy
//   C  an account in the app: the five tabs (the control: the app's header already covered the bar), Settings, the
//      plans opened from Settings, Support, Notifications, the Glossary, What-If, the Check-In, Add bill
//   D  the iPhone Duo's outer screen, whose strip is on the RIGHT and whose top inset is 0: the cover is 0 px tall
//      there, so that screen is exactly as it was (the website has no cover at all: androidEdgeToEdge c1, c3)
// And at rest, as before: nothing in the strip, and the cover takes no room (it is fixed, the height of the bar, and
// in the page's own opaque colour).
// One thing is left out by name: the count on the bell reaches 6 px above its button, on every platform and at rest,
// which is the header's own design and not words scrolling under the bar.
// STATUS_BAR_SHOTS=<dir> saves a picture of each screen, scrolled.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { tempDir } = require("./_tmp.cjs");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const MOCK = require("./_mockSupabase.cjs");
const { applyInsets } = require("./_duo.cjs");

const ROOT = path.join(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
const SHOTS = process.env.STATUS_BAR_SHOTS || "";
// The status bar in CSS px, and a short window. Android: a Pixel with a camera cutout is 40 to 52. iPhone: 59 with a
// Dynamic Island (47 with a notch).
const DEVICES = { android: { bar: 48, bottom: 24, width: 412, height: 600 }, ios: { bar: 59, bottom: 34, width: 390, height: 600 } };

function household() {
  const blob = MOCK.emptyBlob();
  blob.savedAt = "2026-11-18T09:00:00.000Z";
  blob.core.onboarded = true;
  blob.core.appData = {
    profile: { name: "", country: "CA", province: "ON" },
    accounts: [{ id: "m1", name: "Chequing", type: "checking", balance: 3000, institution: "Manual" }],
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-27", type: "employment" }],
    bills: [], transactions: [], debts: [], goals: [], bankConnected: false,
  };
  return blob;
}

// Runs in the page before the app: the Android platform, and Google Play's plans behind Capacitor's bridge.
function installAndroid(platform) {
  const pkg = (id, price) => ({ identifier: `$rc_${id.includes("monthly") ? "monthly" : "annual"}`, offeringIdentifier: "default", product: { identifier: id, priceString: price, currencyCode: "CAD" } });
  const std = { identifier: "default", availablePackages: [pkg("flourish_plus:monthly", "$11.99"), pkg("flourish_plus:annual", "$99.99")] };
  const st = { configured: false, uid: null };
  const impl = {
    isConfigured: async () => ({ isConfigured: st.configured }),
    configure: async (o) => { st.configured = true; st.uid = o && o.appUserID; },
    logIn: async (o) => { st.uid = o && o.appUserID; return { customerInfo: {}, created: false }; },
    getAppUserID: async () => ({ appUserID: st.uid }),
    getOfferings: async () => ({ current: std, all: { default: std } }),
    restorePurchases: async () => ({ customerInfo: {} }),
    showManageSubscriptions: async () => {},
  };
  window.CapacitorCustomPlatform = { name: platform, plugins: {} };
  window.Capacitor = {
    PluginHeaders: [{ name: "Purchases", methods: Object.keys(impl).map((name) => ({ name, rtype: "promise" })) }],
    nativePromise: (plugin, method, options) => plugin === "Purchases" && impl[method] ? impl[method](options) : Promise.reject(new Error(`${plugin}.${method} not in the test`)),
  };
}

// Runs in the page. What is painted in the top `bar` px, on top, after each scroller has moved by `step` (a number of
// px, or "end"). Returns the words (and controls) found there, shortest description first.
function PROBE([bar, step]) {
  const scrollers = [document.scrollingElement, ...document.querySelectorAll("*")].filter((e, i, all) => e && all.indexOf(e) === i
    && e.scrollHeight - e.clientHeight > 4 && (e === document.scrollingElement || /(auto|scroll)/.test(getComputedStyle(e).overflowY)));
  for (const e of scrollers) e.scrollTop = step === "end" ? e.scrollHeight : step;
  const found = [];
  const onTop = (node, r) => {
    const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, bar);
    if (r.width < 2 || bottom - top < 2 || r.right <= 0 || r.left >= innerWidth) return false;
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), y = top + (bottom - top) / 2;
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === node || node.contains(hit) || (node.nodeType === 3 && (hit === node.parentElement || node.parentElement.contains(hit))));
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.replace(/\s+/g, " ").trim();
    if (!text || !n.parentElement) continue;
    if (n.parentElement.closest('button[aria-label="Notifications"]') && n.parentElement.getBoundingClientRect().top >= bar - 8) continue;   // the bell's count (see the top of this file)
    const cs = getComputedStyle(n.parentElement);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    if ([...range.getClientRects()].some((r) => onTop(n, r))) found.push(text.slice(0, 40));
  }
  for (const el of document.querySelectorAll("button, a[href], input, select, textarea")) {
    const r = el.getBoundingClientRect();
    if (onTop(el, r) && !found.some((f) => (el.innerText || "").includes(f))) found.push(`<${el.tagName.toLowerCase()}> ${(el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 30)}`);
  }
  const covers = [...document.querySelectorAll("[data-status-bar-cover]")].map((c) => { const cs = getComputedStyle(c), r = c.getBoundingClientRect();
    return { position: cs.position, top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width), opaque: /^rgb\(/.test(cs.backgroundColor), hidden: c.getAttribute("aria-hidden") }; });
  return { found: [...new Set(found)].slice(0, 6), scrolled: scrollers.some((e) => e.scrollTop > 0), covers };
}
(async () => {
  const t = create();
  const NAME = "STATUS BAR (browser)";
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary(NAME); return; }
  let dist = null;
  const server = http.createServer((req, res) => {
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = tempDir("statusbar");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      VITE_NATIVE_BUILD: "true", VITE_IAP_ENABLED: "true", VITE_REVENUECAT_IOS_KEY: "appl_testkey000000", VITE_REVENUECAT_ANDROID_KEY: "goog_testkey000000" } });
  const browser = await playwright.chromium.launch();

  // who: "out" (signed out), "new" (a new account, held at the plans once set up) or "in" (an account in the app).
  const phone = async (who, platform, insets = null) => {
    const dev = DEVICES[platform], VIEW = insets ? { width: 466, height: 678 } : { width: dev.width, height: dev.height };
    const st = { saved: null };
    const session = MOCK.makeSession(Math.floor(Date.now() / 1000));
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: "America/Toronto", locale: "en-CA", colorScheme: "light" });
    await ctx.addInitScript(installAndroid, platform);
    await ctx.addInitScript(([who, key, session]) => { try {
      if (localStorage.getItem("test_seeded")) return;
      localStorage.setItem("test_seeded", "1");
      if (who !== "out") localStorage.setItem(key, session);
      if (who === "in") { localStorage.setItem("flourish_first_visit_done", "1"); localStorage.setItem("flourish_tour_done", "1"); localStorage.setItem("flourish_ai_disclosure_seen", "1"); }
    } catch (e) {} }, [who, MOCK.storageKey(base), JSON.stringify(session)]);
    const json = (r, status, body) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: body === undefined ? "" : JSON.stringify(body) });
    const tpf = { trial_plan_first: { on: true, trial_days: 14, account_trial: who !== "new", trialing: false, trial_ends: null } };
    await ctx.route((url) => !url.href.startsWith(base) || /^\/(auth|rest)\//.test(url.pathname), async (r) => {
      const req = r.request(), u = new URL(req.url()), method = req.method();
      if (u.protocol === "data:" || u.protocol === "blob:") return r.continue();
      let body = {}; try { body = JSON.parse(req.postData() || "{}"); } catch {}
      if (u.origin === base && u.pathname.startsWith("/auth/v1/")) {
        const p = u.pathname.slice("/auth/v1/".length);
        if (p === "user") return who === "out" ? json(r, 401, { msg: "no session" }) : json(r, 200, session.user);
        if (p === "token") return who === "out" ? json(r, 400, { error_code: "refresh_token_not_found", msg: "no session" }) : json(r, 200, session);
        return json(r, 200, {});
      }
      if (u.origin === base && u.pathname.startsWith("/rest/v1/")) {
        const table = u.pathname.slice("/rest/v1/".length), obj = /vnd\.pgrst\.object/.test(req.headers().accept || "");
        if (method !== "GET" && method !== "HEAD") { if (table === "user_data") st.saved = Array.isArray(body) ? body[0] : body; return json(r, 201, []); }
        if (table === "user_data") {
          const row = who === "in" ? { data: household(), updated_at: "2026-11-18T09:00:00.000Z" } : (st.saved && st.saved.data ? { data: st.saved.data, updated_at: new Date().toISOString() } : null);
          return obj ? json(r, 200, row) : json(r, 200, row ? [row] : []);
        }
        if (table === "profiles") { const row = { plan: "trial", trial_started_at: new Date(Date.now() - 60e3).toISOString(), trial_ends_at: new Date(Date.now() + 14 * 86400e3).toISOString(), founder_flag: false }; return obj ? json(r, 200, row) : json(r, 200, [row]); }
        return obj ? json(r, 406, { code: "PGRST116", message: "no rows" }) : json(r, 200, []);
      }
      if (u.origin === "https://flourishmoney.app" && u.pathname.startsWith("/api/")) {
        const name = u.pathname.slice(5);
        if (method === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, body: "" });
        if (name === "trial-plan-first") return json(r, 200, { on: true, since: new Date(Date.now() - 3600e3).toISOString() });
        if (name === "billing") {
          if (body.action === "store_status") return json(r, 200, { enabled: true, paid: false, provider: null, plan_key: null, conflict: false, conflict_kind: null, web_attention: false, period_end: null,
            founding: { available: false, held_on_regular_plan: null, spots_left: null }, ...tpf });
          if (body.action === "status") return json(r, 200, { enabled: true, paid: false, ...tpf });
          return json(r, 404, { error: "not_found" });
        }
        if (name === "plaid") return json(r, 200, body.action === "list_items" ? { items: [] } : {});
        if (name === "beta") return json(r, 200, body.action === "signup_status" ? { openSignup: true } : {});
        if (name === "coach") return json(r, 200, { ok: true });   // the AI notice's consent is recorded before it lets a person on
        if (name === "activation" || name === "attribution") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" }, body: "" });
        return json(r, 404, { error: "not_found" });
      }
      return r.abort();
    });
    const page = await ctx.newPage();
    await applyInsets(ctx, page, insets || { top: dev.bar, right: 0, bottom: dev.bottom, left: 0 });
    page.setDefaultTimeout(15000);
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    return { ctx, page };
  };

  const results = [];
  const LABEL = { android: "Android", ios: "iPhone" };
  // One screen: wait for its words, then nothing in the bar at rest, and nothing after each scroll.
  const check = async (page, name, waitFor, { control = false, platform, duo = false } = {}) => {
    const bar = duo ? 0 : DEVICES[platform].bar, width = duo ? 466 : DEVICES[platform].width, key = name.split(" ")[0];
    name = `${duo ? "iPhone Duo, outer screen" : LABEL[platform]}: ${name}`;
    try {
      if (waitFor) await page.getByText(waitFor, { exact: false }).first().waitFor({ timeout: 40000 });
      await page.waitForTimeout(400);
      const rest = await page.evaluate(PROBE, [bar, 0]);
      const under = [];
      let scrolled = false;
      for (const step of [30, 90, 200, "end"]) {
        const res = await page.evaluate(PROBE, [bar, step]);
        await page.waitForTimeout(80);
        scrolled = scrolled || res.scrolled;
        for (const f of res.found) if (!under.includes(f)) under.push(f);
        if (step === 90 && SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name.replace(/[^\w]+/g, "-").toLowerCase()}.png`) }); }
      }
      await page.evaluate(PROBE, [bar, 0]);
      results.push({ name, key, platform, duo, bar, width, control, scrolled, rest: rest.found, under, covers: rest.covers });
    } catch (e) {
      const saw = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 140)).catch(() => "");
      results.push({ name, key, platform, duo, control, error: `${String(e && e.message).split("\n")[0].slice(0, 80)}; the screen said: ${saw}` });
    }
  };
  const tap = (page, name, exact = true) => page.getByRole("button", { name, exact }).first().click();

  try {
    for (const platform of ["android", "ios"]) {
      const o = { platform };
      // ── A. Signed out ──────────────────────────────────────────────────────────────────────────
      {
        const { ctx, page } = await phone("out", platform);
        await check(page, "A1 first screen", "Example, sample data", o);
        await tap(page, "Get started");
        await check(page, "A2 sign-up card", "Continue with Apple", o);
        await tap(page, "Log In");
        await check(page, "A3 log-in card", "Forgot password?", o);
        await ctx.close();
      }
      // ── B. A new account ───────────────────────────────────────────────────────────────────────
      {
        const { ctx, page } = await phone("new", platform);
        await check(page, "B1 AI notice", "About AI in Flourish", o);
        await tap(page, "I Understand & Accept");
        await check(page, "B2 Before you start", "Before you start", o);
        await tap(page, "Terms");
        await check(page, "B3 Terms (from Before you start)", "Plans and billing", o);
        await page.getByRole("button", { name: /Back/ }).first().click();
        await page.getByText("Before you start", { exact: true }).first().waitFor();
        await tap(page, "Privacy Policy");
        await check(page, "B4 Privacy Policy (from Before you start)", "Privacy", o);
        await page.getByRole("button", { name: /Back/ }).first().click();
        await page.getByText("Before you start", { exact: true }).first().waitFor();
        await tap(page, "Get started");
        await check(page, "B5 Link your accounts", "Link your accounts", o);
        await tap(page, "Enter it myself");
        await check(page, "B6 chequing balance", "Your chequing balance", o);
        await page.getByPlaceholder("0.00").first().fill("2500");
        await tap(page, "Continue →");
        await check(page, "B7 Your paycheques", "Your paycheques", o);
        await page.getByPlaceholder("e.g. 2100").first().fill("2100");
        const d = new Date(Date.now() + 9 * 86400e3);
        await page.locator('input[type="date"]').first().fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        await tap(page, "Show my starting number →");
        await check(page, "B8 first number", "Here's your number.", o);
        await tap(page, "How is this calculated? →");
        await check(page, "B9 how the number is calculated", "How this is calculated", o);
        await tap(page, "Take me to my dashboard →");
        await check(page, "B10 Your bills", "Your bills", o);
        await tap(page, "Continue →");
        await check(page, "B11 Your debts", "Your debts", o);
        await tap(page, "No debt, skip");
        await check(page, "B12 Choose your plan", "Choose your plan", o);
        await tap(page, "Privacy Policy");
        await check(page, "B13 Privacy Policy (from the plans)", "Privacy", o);
        await ctx.close();
      }
      // ── C. An account in the app ───────────────────────────────────────────────────────────────
      {
        const { ctx, page } = await phone("in", platform);
        const home = async () => { await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 }); await page.waitForTimeout(300); };
        const tab = (name) => page.getByRole("button").filter({ hasText: new RegExp("^" + name + "(\\s*\\d+)?$") }).last().click();
        const VIEWS = [
          ["C1 Today (the app's header covers the bar)", async () => {}, "safe to spend", true],
          ["C2 Watch", () => tab("Watch"), null, true],
          ["C3 Do", () => tab("Do"), null, true],
          ["C4 Learn", () => tab("Learn"), null, true],
          ["C5 Meet", () => tab("Meet"), null, true],
          ["C6 Settings", () => tap(page, "Settings"), "Delete Account"],
          ["C7 the plans, opened from Settings", async () => { await tap(page, "Settings"); await tap(page, "See plans"); }, "Subscribe to flourish"],
          ["C8 Support, opened from Settings", async () => { await tap(page, "Settings"); await page.getByText("Open Support", { exact: true }).first().click(); }, "What is safe to spend?"],
          ["C9 Notifications", () => tap(page, "Notifications"), "Notifications"],
          ["C10 Glossary", () => tap(page, "What Safe to spend means"), null],
          ["C11 What-If", () => page.getByText("What if? →", { exact: false }).first().click(), null],
          ["C12 Check-In", () => page.getByText("Check-In ✦", { exact: false }).first().click(), null],
          ["C13 Add bill", async () => { await tab("Watch"); await page.getByText("+ Add Bill", { exact: false }).first().click(); }, null],
        ];
        for (const [name, go, waitFor, control] of VIEWS) {
          try { await home(); await go(); await page.waitForTimeout(500); } catch (e) { results.push({ name: `${LABEL[platform]}: ${name}`, platform, error: `could not open it: ${String(e && e.message).split("\n")[0].slice(0, 80)}` }); continue; }
          await check(page, name, waitFor, { ...o, control: !!control });
        }
        await ctx.close();
      }
    }
    // ── D. The iPhone Duo's outer screen: the strip is on the right, the top inset is 0 ───────────────
    {
      const o = { platform: "ios", duo: true }, DUO = { top: 0, right: 84, bottom: 34, left: 0 };
      const out = await phone("out", "ios", DUO);
      await check(out.page, "D1 first screen", "Example, sample data", o);
      await tap(out.page, "Get started");
      await check(out.page, "D2 sign-up card", "Continue with Apple", o);
      await out.ctx.close();
      const fresh = await phone("new", "ios", DUO);
      await check(fresh.page, "D3 AI notice", "About AI in Flourish", o);
      await fresh.ctx.close();
    }
  } catch (e) {
    results.push({ name: "the walk", error: String(e && e.message).split("\n")[0].slice(0, 160) });
  } finally {
    await browser.close();
    server.close();
  }

  for (const r of results) {
    if (r.error) { t.ok(false, `${r.name}: reached (${r.error})`); continue; }
    if (r.duo) {   // no bar along the top there: the cover is in the page and 0 px tall, so it hides nothing and takes nothing
      t.ok(r.covers.length >= 1 && r.covers.every((c) => c.height === 0 && c.position === "fixed"), `${r.name}: the cover is 0 px tall (this screen's strip is on the right), so the screen is exactly as it was`);
      continue;
    }
    t.eq(r.rest, [], `${r.name}: at rest, nothing is under the status bar`);
    t.eq(r.under, [], `${r.name}: scrolled, nothing a person reads is under the status bar`);
    // A cover, where a screen has one: fixed to the top, the bar's height, the whole width, opaque, and out of a screen reader's way.
    const bad = (r.covers || []).filter((c) => !(c.position === "fixed" && c.top === 0 && c.height === r.bar && c.width === r.width && c.opaque && c.hidden === "true"));
    t.eq(bad, [], `${r.name}: its cover is fixed over the bar, the bar's height, opaque, and takes no room`);
  }
  for (const platform of ["android", "ios"]) {
    const mine = results.filter((r) => r.platform === platform && !r.duo);
    const scrolledScreens = mine.filter((r) => !r.error && r.scrolled).length;
    t.ok(scrolledScreens >= 20, `${LABEL[platform]}: the window is short enough that the screens really scroll (${scrolledScreens} of ${mine.length} did)`);
    const covered = mine.filter((r) => !r.error && !r.control && (r.covers || []).length > 0).map((r) => r.key);
    t.ok(["A1", "A2", "A3", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B12", "B13", "C7", "C8"].every((k) => covered.includes(k)),
      `${LABEL[platform]}: every screen that has no header of its own carries the cover (${covered.join(" ")})`);
  }
  t.summary(NAME);
})();
