// tests/creators.browser.test.cjs
// -----------------------------------------------------------------------------
// THE CREATOR CODE IN A REAL BROWSER: the app built as it ships, on a stand-in server.
//   1  the program off (/api/creator answers 404): no field, nothing sent, and a code in the address touched by nothing
//   2  on: a creator's link starts the sign-up field filled in, the code goes with the sign-up, and a refusal shows its line
//   3  Settings: the card shows only while a code can be added; adding one; a wrong code
//   4  /get?c=CODE: on a computer the website's link carries it; on a phone the store redirect is exactly as it was
//   5  the field fits the narrowest phone
// -----------------------------------------------------------------------------
"use strict";
const { tempDir } = require("./_tmp.cjs");
const { create } = require("./_runner.cjs");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const MOCK = require("./_mockSupabase.cjs");

const ROOT = path.join(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".mp4": "video/mp4" };
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("CREATORS (browser)"); return; }
  let dist = null;
  const server = http.createServer((req, res) => {
    if (MOCK.handle(req, res)) return;
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/get" || p === "/get/") p = "/get/index.html";
    let f = path.join(dist, p);
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = tempDir("creators-dist");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "error"],
    { cwd: ROOT, stdio: "pipe", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  const browser = await playwright.chromium.launch();
  const W = (await import("../src/lib/creatorWords.js")).CREATOR_WORDS;

  const open = async ({ on = false, width = 390, ua, signedIn = false, status = { enabled: true, may_add: true }, addAnswer } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, ...(ua ? { userAgent: ua } : {}), colorScheme: "light" });
    const sent = { signup: [], add: [], stores: [] };
    await ctx.addInitScript(([session, key, signed]) => { try {
      localStorage.setItem("flourish_theme", "light"); localStorage.setItem("flourish_theme_manual", "1");
      localStorage.setItem("flourish_first_visit_done", "1"); localStorage.setItem("flourish_tour_done", "1");
      if (signed) localStorage.setItem(key, session);
    } catch {} }, [JSON.stringify(MOCK.makeSession()), MOCK.storageKey(base), signedIn]);
    await ctx.route("https://plausible.io/**", (r) => r.abort());
    await ctx.route(/apps\.apple\.com|play\.google\.com/, (r) => { sent.stores.push(r.request().url()); return r.fulfill({ status: 200, contentType: "text/html", body: "<p>store</p>" }); });
    await ctx.route("**/api/creator", (r) => {
      if (!on) return r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not_found"}' });
      if (r.request().method() === "GET") return r.fulfill({ status: 200, contentType: "application/json", body: '{"enabled":true}' });
      const b = JSON.parse(r.request().postData() || "{}");
      if (b.action === "status") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status) });
      sent.add.push(b);
      const a = addAnswer ? addAnswer(b) : { code: 200, body: { ok: true } };
      return r.fulfill({ status: a.code, contentType: "application/json", body: JSON.stringify(a.body) });
    });
    await ctx.route("**/api/beta", (r) => {
      const b = JSON.parse(r.request().postData() || "{}");
      if (b.action !== "signup") return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      sent.signup.push(b);
      const bad = b.creator_code === "WRONG";
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bad ? { error: "creator_code_invalid" } : { ok: true, needsConfirmation: true, sent: true }) });
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    return { ctx, page, sent };
  };
  const toSignup = async (page) => {
    await page.getByRole("button", { name: /Try flourish free/ }).first().click();
    await page.locator('input[name="password"]').first().waitFor();
  };
  const FIELD = 'input[name="creatorcode"]';
  const fillAccount = async (page) => {
    await page.locator('input[type="email"]').first().fill("new@example.test");
    await page.locator('input[name="password"]').first().fill("long-enough-password");
  };
  const submit = (page) => page.getByRole("button", { name: "Create Account", exact: true }).click();

  try {
    // 1 ── OFF ───────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const { ctx, page, sent } = await open({ on: false });
      await page.goto(`${base}/?c=alice`);
      await toSignup(page);
      await page.waitForTimeout(400);
      t.eq(await page.locator(FIELD).count(), 0, "1a off: no field on the sign-up form");
      t.eq(await page.getByLabel("Password (min 8 characters)").getAttribute("name"), "password", "1a2 the password's label doesn't depend on the program");
      t.ok(!(await page.content()).includes(W.signupHint) && !(await page.content()).includes(W.signupLabel), "1b off: none of the program's words on the page");
      t.ok(page.url().includes("c=alice") && (await page.evaluate(() => sessionStorage.getItem("flourish_creator_code"))) === null, "1c off: the address and the tab are left exactly as they were");
      await fillAccount(page);
      await submit(page);
      await page.getByText("Check your email", { exact: false }).first().waitFor();
      t.eq([sent.signup.length, "creator_code" in sent.signup[0]], [1, false], "1d off: the sign-up sends nothing about a code");
      await ctx.close();
    }

    // 2 ── THE SIGN-UP FIELD ─────────────────────────────────────────────────────────────────────────────────────
    {
      const { ctx, page, sent } = await open({ on: true });
      await page.goto(`${base}/?c=alice&src=direct`);
      await page.waitForURL((u) => !u.search.includes("c=alice"));
      t.ok(!page.url().includes("c=alice"), "2a the code leaves the address once the app starts");
      t.ok(page.url().includes("src=direct"), "2b anything else in it stays");
      await toSignup(page);
      await page.locator(FIELD).waitFor();
      t.eq(await page.locator(FIELD).inputValue(), "ALICE", "2c a creator's link starts the field filled in");
      t.eq([(await page.locator('[data-creator-field]').innerText()).includes(W.signupHint), await page.getByLabel(W.signupLabel).getAttribute("name"), await page.locator(FIELD).getAttribute("placeholder")], [true, "creatorcode", null], "2d the words shown are the module's own, and the label is a real one, not a placeholder");
      await page.locator(FIELD).fill("wrong");
      t.eq(await page.locator(FIELD).inputValue(), "WRONG", "2e what is typed shows in capitals");
      await fillAccount(page);
      await submit(page);
      await page.getByRole("alert").filter({ hasText: W.errors.creator_code_invalid }).waitFor();
      t.eq(sent.signup[0].creator_code, "WRONG", "2f the code goes with the sign-up");
      t.ok((await page.getByRole("alert").first().innerText()).includes(W.errors.creator_code_invalid), "2g a refused code shows its line, and the form stays");
      await page.locator(FIELD).fill("");
      await submit(page);
      await page.getByText("Check your email", { exact: false }).first().waitFor();
      t.eq("creator_code" in sent.signup[1], false, "2h empty is fine: the field is optional, and nothing is sent");
      await ctx.close();
    }
    {
      const { ctx, page } = await open({ on: true });
      await page.goto(`${base}/?c=alice`);
      await toSignup(page);
      await page.locator(FIELD).waitFor();
      await page.reload();
      await toSignup(page);
      await page.locator(FIELD).waitFor();
      t.eq(await page.locator(FIELD).inputValue(), "ALICE", "2i a reload in the same tab keeps it, though it has left the address");
      await ctx.close();
    }

    // 3 ── SETTINGS ──────────────────────────────────────────────────────────────────────────────────────────────
    const toSettings = async (page) => {
      await page.goto(`${base}/`);
      await page.getByRole("button", { name: "Settings", exact: true }).first().click();
      await page.getByText("Sign Out", { exact: true }).first().waitFor();
    };
    {
      const { ctx, page, sent } = await open({ on: true, signedIn: true });
      await toSettings(page);
      const card = page.locator("[data-creator-card]");
      await card.waitFor();
      t.ok((await card.innerText()).includes(W.settingsBody) && (await card.innerText()).includes(W.settingsTitle) && (await card.getByRole("button", { name: W.settingsButton }).count()) === 1, "3a while a code can be added, Settings shows the card");
      await card.locator("input").fill("alice");
      await card.getByRole("button").click();
      await page.locator("[data-creator-added]").waitFor();
      t.eq(sent.add, [{ action: "add", code: "ALICE" }], "3b adding sends the code");
      t.ok((await page.locator("[data-creator-added]").innerText()).includes(W.settingsAdded), "3c …and the card says it is done");
      await ctx.close();
    }
    {
      const { ctx, page } = await open({ on: true, signedIn: true, addAnswer: () => ({ code: 400, body: { error: "creator_code_invalid" } }) });
      await toSettings(page);
      const card = page.locator("[data-creator-card]");
      await card.waitFor();
      await card.locator("input").fill("nope");
      await card.getByRole("button").click();
      await card.getByRole("alert").waitFor();
      t.ok((await card.getByRole("alert").innerText()).includes(W.errors.creator_code_invalid), "3d a wrong code shows its line, and the card stays");
      await ctx.close();
    }
    {
      const { ctx, page } = await open({ on: true, signedIn: true, status: { enabled: true, may_add: false } });
      await toSettings(page);
      await page.waitForTimeout(500);
      t.eq(await page.locator("[data-creator-card]").count(), 0, "3e past the window, after a payment, a partner, or a code already: no card");
      await ctx.close();
    }
    {
      const { ctx, page } = await open({ on: false, signedIn: true });
      await toSettings(page);
      await page.waitForTimeout(500);
      t.eq(await page.locator("[data-creator-card]").count(), 0, "3f the program off: no card");
      await ctx.close();
    }

    // 4 ── /get ──────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const { ctx, page } = await open({ on: true });
      await page.goto(`${base}/get?c=ben`);
      await page.locator("#website").waitFor();
      t.eq(await page.locator("#website").getAttribute("href"), "/?c=BEN", "4a on a computer the website's link carries the code");
      await page.goto(`${base}/get?ref=founding&c=ben`);
      await page.locator("#website").waitFor();
      t.eq(await page.locator("#website").getAttribute("href"), "/?checkout=founding&c=BEN", "4b …beside the founding link");
      await page.goto(`${base}/get?c=${encodeURIComponent('"><img>')}`);
      await page.locator("#website").waitFor();
      t.eq(await page.locator("#website").getAttribute("href"), "/", "4c anything that could not be a code goes nowhere");
      await page.goto(`${base}/get?c=ben`);
      await page.locator("#website").click();
      await page.waitForURL((u) => u.pathname === "/" && !u.search.includes("c="));
      await toSignup(page);
      await page.locator(FIELD).waitFor();
      t.eq(await page.locator(FIELD).inputValue(), "BEN", "4d followed: the web sign-up starts with it filled in");
      await ctx.close();
    }
    for (const [who, ua, store] of [["iPhone", IPHONE, /apps\.apple\.com\/ca\/app\/flourish-money-handled\/id6792967778$/], ["Android", ANDROID, /play\.google\.com\/store\/apps\/details\?id=com\.flourishmoney\.app&referrer=utm_source%3Dother%26utm_medium%3Dsocial%26utm_campaign%3Dfounding$/]]) {
      const { ctx, page, sent } = await open({ on: true, ua });
      await page.goto(`${base}/get?c=ben`);
      await page.waitForURL(/apps\.apple\.com|play\.google\.com/);
      t.ok(store.test(sent.stores[0] || ""), `4e ${who}: the store redirect is exactly as it was, and carries nothing of the code (${(sent.stores[0] || "").slice(0, 60)})`);
      await ctx.close();
    }
    // A shop's QR code and a creator's code in one link: each does its own job.
    {
      const { ctx, page } = await open({ on: true });
      await page.goto(`${base}/get?ref=shop-trenton-counter&c=ben`);
      await page.locator("#website").waitFor();
      t.eq([await page.locator("#website").getAttribute("href"), /ct=shop-trenton-counter/.test(await page.locator("#app-store").getAttribute("href")), /utm_source%3Dshop-trenton-counter/.test(await page.locator("#google-play").getAttribute("href"))],
        ["/?c=BEN", true, true], "4f a computer, a shop's tag and a creator's code together: the badges carry the tag, the website's link the code");
      await ctx.close();
    }
    for (const [who, ua, store] of [["iPhone", IPHONE, /ct=shop-trenton-counter&mt=8$/], ["Android", ANDROID, /utm_source%3Dshop-trenton-counter%26utm_medium%3Dqr%26utm_campaign%3Dshop$/]]) {
      const { ctx, page, sent } = await open({ on: true, ua });
      await page.goto(`${base}/get?ref=shop-trenton-counter&c=ben`);
      await page.waitForURL(/apps\.apple\.com|play\.google\.com/);
      t.ok(store.test(sent.stores[0] || "") && !/c=ben/i.test(sent.stores[0] || ""), `4g ${who}, the same link: the shop's tagged store link, and nothing of the code (${(sent.stores[0] || "").slice(-60)})`);
      await ctx.close();
    }

    // 5 ── THE NARROWEST PHONE ───────────────────────────────────────────────────────────────────────────────────
    {
      const { ctx, page } = await open({ on: true, width: 320 });
      await page.goto(`${base}/`);
      await toSignup(page);
      await page.locator(FIELD).waitFor();
      const box = await page.locator(FIELD).boundingBox();
      t.ok(box && box.x >= 0 && box.x + box.width <= 320 && box.height >= 40, "5a at 320px the field fits and can be tapped");
      const fits = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; }, sel);
      t.ok(await fits(page, "[data-creator-field]"), "5b …and the approved hint wraps inside the screen, with nothing to scroll sideways");
      // Every text size: each rendered font size times k, worked out first so nested sizes don't compound.
      const biggerText = (k) => { const els = [...document.querySelectorAll("body *")]; const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize)); els.forEach((e, i) => { if (sizes[i]) e.style.fontSize = sizes[i] * k + "px"; }); };
      const labels = () => ["password", "creatorcode"].map((name) => {
        const input = document.querySelector(`input[name="${name}"]`), label = document.querySelector(`label[for="${input.id}"]`);
        const range = document.createRange(); range.selectNodeContents(label);
        const text = range.getBoundingClientRect(), box = input.getBoundingClientRect(), css = getComputedStyle(label);
        return { name, placeholder: input.getAttribute("placeholder"), inside: text.left >= box.left - 1 && text.right <= box.right + 1, cut: css.overflow !== "visible" || css.whiteSpace === "nowrap" || label.scrollWidth > label.clientWidth + 1, lines: Math.round(text.height / parseFloat(css.lineHeight)) };
      });
      for (const k of [1, 1.3, 1.6, 2]) {
        await page.reload();
        await toSignup(page);
        await page.locator(FIELD).waitFor();
        await page.evaluate(biggerText, k);
        const seen = await page.evaluate(labels);
        t.eq(seen.map(({ name, placeholder, inside, cut }) => ({ name, placeholder, inside, cut })), ["password", "creatorcode"].map((name) => ({ name, placeholder: null, inside: true, cut: false })), `5b2 at 320px and text ×${k}: both labels show in full, inside the field's width`);
        t.ok((await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)), `5b3 …with nothing to scroll sideways (×${k})`);
        if (k === 2) t.ok(seen.every((s) => s.lines >= 2), `5b4 at the largest, each wraps onto more lines instead of being cut (${seen.map((s) => s.lines).join(", ")})`);
      }
      await ctx.close();
    }
    {
      const { ctx, page } = await open({ on: true, signedIn: true, width: 320 });
      await page.goto(`${base}/`);
      await page.getByRole("button", { name: "Settings", exact: true }).first().click();
      await page.locator("[data-creator-card]").waitFor();
      const r = await page.evaluate(() => { const c = document.querySelector("[data-creator-card]"); const b = c.getBoundingClientRect(); return { inside: b.left >= 0 && b.right <= innerWidth, sideways: document.documentElement.scrollWidth > innerWidth, clipped: [...c.querySelectorAll("div,button")].some((e) => e.scrollWidth > e.clientWidth + 1) }; });
      t.eq(r, { inside: true, sideways: false, clipped: false }, "5c at 320px the Settings card and its approved line fit, with nothing cut off");
      await ctx.close();
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.message) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  }
  await browser.close(); server.close();
  t.summary("CREATORS (browser)");
})();
