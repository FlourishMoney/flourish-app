// tests/onboardingDuo.browser.test.cjs
// -----------------------------------------------------------------------------
// THE NEW ONBOARDING ON THE iPHONE DUO (release 1.1.1, 2026-10-23). a11y.browser.test.cjs checks every
// signed-in screen at the Duo's four viewports; the onboarding of PR #94 came after it, so it is checked
// here the same way: each Duo viewport (tests/_duo.cjs: 466x678, 678x466, 669x951, 951x669) in the light
// and the dark theme with its measured safe-area insets, and again with the side strip mirrored wherever
// there is one (the outer display's 84 px strip moves left or right with the pose).
//
// The screens, a new account signed in against this test's own server (tests/_mockSupabase.cjs) and a
// stand-in for Plaid's Link script, nothing sent anywhere:
//   manual   the AI disclosure, Welcome, Link your accounts, the chequing balance, the paycheques (with
//            "When is your next payday?", and with the income type open), the bills, the debts, the first
//            number, Today with the tour's first step, Today after the tour ("Getting set up")
//   bank     the bank consent sheet, W4 after Plaid is closed, "Connected!", the paycheques and the bills
//            pre-filled from the bank
//   token    the retry after the link token could not be fetched
//   store    the demo as the store app renders it (window.CapacitorCustomPlatform), its banner hidden: the trial
//            chip shows only in a store app, so no other browser gate sees it. Found on the Duo simulator: below
//            a hidden banner the chip sat in the top strip (now under the header, which clears it).
// On each: every WCAG 2.x A and AA rule axe automates (meta-viewport excepted, as in the a11y check), every
// icon-only button named in words, and the layout measurement (tests/_layoutScan.cjs): nothing overlaps,
// nothing scrolls sideways, no text is cut short with an ellipsis, nothing sits in the safe-area strip.
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const MOCK = require("./_mockSupabase.cjs");
const { SCAN } = require("./_layoutScan.cjs");
const { DUO_VIEWPORTS, duoPasses, insetLabel, applyInsets, READ_INSETS } = require("./_duo.cjs");

const ROOT = path.join(__dirname, "..");
const EXCLUDED_RULES = ["meta-viewport"];
const CONCURRENCY = Number(process.env.ONBOARDING_DUO_CONCURRENCY || 3);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".mp4": "video/mp4" };

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// The bank's 90 days, as in onboardingFirstNumber.browser.test.cjs: pay every two weeks, rent and a streaming bill.
function bankTxns(today = new Date()) {
  const out = [];
  let id = 0;
  const push = (d, name, amount, category) => out.push({ id: `t${id++}`, date: iso(d), name, amount, category, pending: false, account_id: "acc-chq" });
  for (let k = 1; k <= 6; k++) push(addDays(today, -3 - 14 * (k - 1)), "ACME CORP PAYROLL", -2100, "INCOME");
  for (let m = 0; m < 3; m++) { push(addDays(today, -20 - 30 * m), "Landlord Rent", 1400, "RENT_AND_UTILITIES"); push(addDays(today, -12 - 30 * m), "Netflix", 16.99, "ENTERTAINMENT"); }
  for (let k = 1; k <= 40; k++) push(addDays(today, -k * 2), "Corner Grocery", 23 + (k % 5), "FOOD_AND_DRINK");
  return out;
}
const PLAID_STUB = `window.Plaid = { create: function (cfg) { return { open: function () {
  var m = window.__plaidMode || "success";
  setTimeout(function () {
    if (m === "success") cfg.onSuccess("public-test-token", { institution: { name: "Test Bank" } });
    else if (m === "cancel") cfg.onExit(null, { status: "requires_credentials" });
    else cfg.onExit({ error_code: "INTERNAL_SERVER_ERROR", error_message: "test" }, {});
  }, 30);
} }; } };`;

function buildApp(supabaseUrl) {
  if (process.env.ONBOARDING_DIST) return process.env.ONBOARDING_DIST;
  const out = tempDir("onboarding-duo");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  return out;
}

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("ONBOARDING ON THE DUO (browser)"); return; }
  const axePath = require.resolve("axe-core/axe.min.js");
  let dist = null;
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

  // A new account, signed in, on one Duo pass: its viewport, theme and insets, a Canadian device.
  const open = async (vp, { token = "ok", store = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      colorScheme: vp.scheme, locale: "en-CA", timezoneId: "America/Toronto" });
    await ctx.addInitScript(([key, session, scheme, store]) => { try {
      localStorage.setItem("flourish_theme", scheme); localStorage.setItem("flourish_theme_manual", "1");
      if (store) window.CapacitorCustomPlatform = { name: "ios", plugins: {} };
      else localStorage.setItem(key, session);
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession()), vp.scheme, store]);
    await ctx.route("**/rest/v1/user_data*", (r) => r.request().method() === "GET"
      ? r.fulfill({ status: 200, contentType: "application/json", body: /vnd\.pgrst\.object/.test(r.request().headers().accept || "") ? "null" : "[]" })
      : r.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
    await ctx.route("**/api/coach", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
    await ctx.route("**/api/activation", (r) => r.fulfill({ status: 204, body: "" }));
    await ctx.route("https://cdn.plaid.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: PLAID_STUB }));
    await ctx.route("**/api/plaid", async (r) => {
      let body = {}; try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
      const json = (status, b) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
      if (body.action === "create_link_token") return token === "fail" ? json(502, { error: "plaid unavailable" }) : json(200, { link_token: "link-test-token" });
      if (body.action === "exchange_token") return json(200, { item_id: "item-test", institution_name: "Test Bank" });
      if (body.action === "get_accounts") return json(200, { accounts: [{ id: "acc-chq", name: "Chequing", mask: "1234", type: "depository", subtype: "checking", balance: { available: 3200, current: 3200, limit: null, currency: "CAD" } }] });
      if (body.action === "get_transactions") return json(200, { transactions: bankTxns(), removed: [], truncated: false, full: true });
      if (body.action === "list_items") return json(200, { items: [] });
      return json(200, {});
    });
    const page = await ctx.newPage();
    await applyInsets(ctx, page, vp.insets);
    page.setDefaultTimeout(15000);
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    if (store) await page.getByText("Try the demo", { exact: false }).first().waitFor({ timeout: 40000 });
    else await page.getByRole("button", { name: "I Understand & Accept", exact: true }).waitFor({ timeout: 40000 });
    return { ctx, page };
  };

  const scan = async (page) => {
    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async (excluded) => {
      const rules = {}; for (const id of excluded) rules[id] = { enabled: false };
      const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, rules, resultTypes: ["violations"] });
      return res.violations.map((x) => `${x.id} (${x.impact}, ${x.nodes.length}): ${x.nodes.slice(0, 3).map((nd) => `${nd.target.join(" ")} :: ${(nd.failureSummary || "").split("\n").slice(1, 2).join(" ").trim().slice(0, 140)}`).join(" | ")}`);
    }, EXCLUDED_RULES);
    const icons = await page.evaluate(() => [...document.querySelectorAll("button, [role=button]")]
      .filter((b) => b.getClientRects().length && !/[\p{L}\p{N}]/u.test(b.textContent || ""))
      .filter((b) => !/\p{L}/u.test(b.getAttribute("aria-label") || b.getAttribute("title") || ""))
      .map((b) => `${(b.textContent || "").trim() || "(empty)"} :: ${b.outerHTML.replace(/style="[^"]*"/g, "").slice(0, 100)}`));
    return { violations, icons };
  };
  const measure = async (page, overlay) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const safe = await page.evaluate(READ_INSETS);
    const opts = { textCtrlMin: 12, ctrlCtrlMin: 8, minTap: 44, safe };
    let res = overlay ? await page.evaluate(SCAN, { ...opts, scope: "overlay" }) : null;
    if (!res || res.error) res = await page.evaluate(SCAN, { ...opts, scope: "page" });
    return { safe, overlaps: (res.violations || []).filter((x) => x.kind === "overlap"), hOverflow: res.hOverflow,
      clipped: res.clipped || [], unsafe: res.unsafe || [], counts: res.counts };
  };

  const btn = (page, name) => page.getByRole("button", { name, exact: true }).last();
  const settle = (page) => page.waitForTimeout(450);

  // One walk on one pass: each screen is checked as it is reached. A screen that cannot be reached is a failure.
  const walk = async (vp, name, steps, opts) => {
    const out = [];
    const label = (s) => `${s} (${name}, ${vp.name} ${vp.width}x${vp.height} ${insetLabel(vp.insets)}, ${vp.scheme}${vp.side === "mirrored" ? ", strip mirrored" : ""})`;
    let ctx = null;
    try {
      const o = await open(vp, opts); ctx = o.ctx;
      for (const [screen, go, overlay] of steps) {
        try {
          await go(o.page); await settle(o.page);
          out.push({ view: label(screen), vp, ...(await scan(o.page)), duo: await measure(o.page, overlay) });
        } catch (e) { out.push({ view: label(screen), vp, unreachable: String(e.message).split("\n")[0].slice(0, 160) }); break; }
      }
    } catch (e) { out.push({ view: label("open"), vp, unreachable: String(e.message).split("\n")[0].slice(0, 160) }); }
    if (ctx) await ctx.close();
    return out;
  };

  const payday = iso(addDays(new Date(), 5));
  const MANUAL = [
    ["AI disclosure", async () => {}],
    ["Welcome", async (p) => { await btn(p, "I Understand & Accept").click(); await btn(p, "Get Started →").waitFor(); }],
    ["Link your accounts", async (p) => { await btn(p, "Get Started →").click(); await p.locator('[data-bank-button="connect"]').waitFor(); }],
    ["Chequing balance", async (p) => { await btn(p, "Enter it myself").click(); await p.getByPlaceholder("0.00").first().fill("2500"); }],
    ["Paycheques", async (p) => { await btn(p, "Continue →").click(); await p.getByPlaceholder("e.g. 2100").first().fill("2100"); await p.locator('input[type="date"]').first().fill(payday); }],
    ["Paycheques, income type open", async (p) => { await p.locator("[data-income-type-toggle]").first().click(); }],
    ["Bills", async (p) => { await p.locator("[data-income-type-toggle]").first().click(); await btn(p, "Continue →").click();
      await p.getByPlaceholder("Netflix, Hydro, Rent…").first().fill("Rent"); await p.locator('input[type="number"]').first().fill("1400"); await p.getByPlaceholder("1 to 28").first().fill("3"); }],
    ["Debts", async (p) => { await btn(p, "Continue →").click(); await p.getByText("No debt, skip").first().waitFor(); }],
    ["First number", async (p) => { await btn(p, "No debt, skip").click(); await p.getByText("Here's your number.").first().waitFor(); }],
    ["Today, tour step 1", async (p) => { await p.getByRole("button", { name: /Skip for now/ }).first().click(); await p.getByText("Step 1 of 5").first().waitFor(); }, true],
    ["Today, after the tour", async (p) => { await p.getByRole("button", { name: "Skip", exact: true }).first().click(); await p.getByText("Getting set up").first().waitFor(); }],
  ];
  const BANK = [
    ["Link your accounts", async (p) => { await btn(p, "I Understand & Accept").click(); await btn(p, "Get Started →").click(); await p.locator('[data-bank-button="connect"]').waitFor(); }],
    ["Bank consent sheet", async (p) => { await p.locator('[data-bank-button="connect"]').click(); await btn(p, "Connect My Bank").waitFor(); }, true],
    ["W4, Plaid closed", async (p) => { await p.evaluate(() => { window.__plaidMode = "cancel"; }); await btn(p, "Connect My Bank").click(); await p.locator("[data-bank-outcome]").waitFor(); }],
    ["Connected!", async (p) => { await p.evaluate(() => { window.__plaidMode = "success"; }); await btn(p, "Try again").click(); await p.getByText("Connected!").first().waitFor(); }],
    ["Paycheques, pre-filled", async (p) => { await btn(p, "Let's go →").click(); await p.getByText("We detected your income", { exact: false }).first().waitFor(); }],
    ["Bills, pre-filled", async (p) => { await btn(p, "Continue →").click(); await p.getByText("Auto-detected", { exact: false }).first().waitFor(); }],
  ];
  const TOKEN = [
    ["Link-token retry", async (p) => { await btn(p, "I Understand & Accept").click(); await btn(p, "Get Started →").click(); await p.locator('[data-bank-button="retry"]').waitFor({ timeout: 20000 }); }],
  ];

  const STORE = [
    ["Store app: Today, demo banner hidden", async (p) => {
      await p.getByText("Try the demo", { exact: false }).first().click();
      const accept = p.getByRole("button", { name: "I Understand & Accept", exact: true });
      const demo = p.getByText("Demo mode", { exact: false }).first();
      await accept.or(demo).waitFor({ timeout: 40000 });
      if (await accept.isVisible()) await accept.click();
      const skip = p.getByRole("button", { name: "Skip", exact: true });
      await skip.or(demo).first().waitFor();
      if (await skip.count() && await skip.first().isVisible()) await skip.first().click();
      await p.getByRole("button", { name: "Hide demo banner" }).first().click();
      await p.getByText("days left in your trial", { exact: false }).first().waitFor();
    }],
  ];

  const passes = duoPasses();
  const jobs = passes.flatMap((vp) => [[vp, "manual", MANUAL], [vp, "bank", BANK], [vp, "token", TOKEN, { token: "fail" }], [vp, "store", STORE, { store: true }]]);
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (i < jobs.length) { const [vp, name, steps, opts] = jobs[i++]; results.push(...(await walk(vp, name, steps, opts))); }
  }));
  await browser.close(); server.close();
  if (process.env.ONBOARDING_DUO_JSON) fs.writeFileSync(process.env.ONBOARDING_DUO_JSON, JSON.stringify(results, null, 1));

  const perPass = MANUAL.length + BANK.length + TOKEN.length + STORE.length;
  t.eq(passes.length, DUO_VIEWPORTS.length * 2 + DUO_VIEWPORTS.filter((v) => v.insets.left !== v.insets.right).length, "0 every Duo viewport in both themes, and each side strip mirrored");
  t.eq(results.length, passes.length * perPass, `0b ${passes.length} passes x ${perPass} screens were checked`);
  t.eq(results.filter((r) => r.unreachable).map((r) => `${r.view}: ${r.unreachable}`), [], "1 every onboarding screen opened on every pass");
  for (const r of results.filter((x) => !x.unreachable)) {
    const d = r.duo;
    t.eq(r.violations, [], `2 ${r.view}: no WCAG 2.x A/AA violation axe can find`);
    t.eq(r.icons, [], `3 ${r.view}: every icon-only button has a name in words`);
    t.eq(insetLabel(d.safe), insetLabel(r.vp.insets), `4a ${r.view}: env(safe-area-inset-*) reported the emulated insets`);
    t.ok(d.counts && d.counts.controls > 0 && d.counts.texts > 0, `4b ${r.view}: the layout measurement saw the screen (${d.counts ? d.counts.controls : 0} controls)`);
    t.eq(d.overlaps.map((x) => `OVERLAP by ${-x.gap}px — "${x.a}" [${x.ax}] over "${x.b}" [${x.bx}]`), [], `4c ${r.view}: nothing overlaps`);
    t.ok(d.hOverflow <= 1, `4d ${r.view}: no horizontal scroll (${d.hOverflow}px)`);
    t.eq(d.clipped.map((c) => `<${c.tag}> "${c.text}"`), [], `4e ${r.view}: no text cut short with an ellipsis`);
    t.eq(d.unsafe.map((u) => `<${u.tag}> "${u.a}" [${u.at}]: ${u.bad}`), [], `4f ${r.view}: no text or control in the safe-area strip`);
  }
  t.summary("ONBOARDING ON THE DUO (browser)");
})();
