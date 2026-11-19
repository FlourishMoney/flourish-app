// tests/storeSignInDelete.browser.test.cjs
// -----------------------------------------------------------------------------
// 1.1.7, TWO THINGS A PERSON MUST BE ABLE TO DO, IN THE BUILT APP (2026-11-18).
//
// A. IN THE STORE APP, "Continue with Apple" AND "Continue with Google" OPEN THE SIGN-IN. The buttons load their
//    Capacitor plugins as they are tapped. A Capacitor plugin answers ANY property with a function, `then` included, so a
//    promise that resolves to the plugin itself treats it as a thenable and never settles: the button showed "…" for
//    good, with no sheet and no error. Unit tests with stand-in plugins cannot see that, so this one taps the real
//    buttons in the real store build, with Capacitor's own plugin proxies in front of a fake native side.
//      1  iPhone, Apple: Apple's sheet is asked once (our bundle id, name and email, a nonce), Supabase gets the
//         identity token and the person is in
//      2  iPhone, Apple, the sheet is cancelled: the buttons come back, with the approved line
//      3  iPhone, Google: the in-app browser opens Supabase's Google address with our callback; the callback signs in
//      4  Android, Apple: the in-app browser too (no Apple sheet there); closing it with no session says so
//
// B. AN ACCOUNT HELD AT "Choose your plan" CAN DELETE ITSELF THERE (App Store guideline 5.1.1(v)). With TRIAL_PLAN_FIRST
//    on, a new account that has not chosen a plan cannot reach Settings, where Delete Account lives.
//      5  the store app: Delete Account on that screen asks the same question Settings asks; "Cancel" changes nothing;
//         confirming deletes on the server, signs out and leaves nothing of the account on the device
//      6  the website: the same
// Nothing reaches the network: Supabase and /api/* are answered here, and any other host is refused.
// STORE_SIGNIN_SHOTS=<dir> also saves a picture of each plans screen and of the question.
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
const SHOTS = process.env.STORE_SIGNIN_SHOTS || "";
const FAILED_LINE = "That sign-in didn't finish. Try again, or use your email.";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function sessionFor(id, email, provider) {
  const now = Math.floor(Date.now() / 1000), exp = now + 86400, at = new Date((now - 5) * 1000).toISOString();
  const user = { id, aud: "authenticated", role: "authenticated", email, email_confirmed_at: at, confirmed_at: at, created_at: at,
    app_metadata: { provider, providers: [provider] }, user_metadata: {} };
  const access_token = `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ sub: id, email, role: "authenticated", aud: "authenticated", exp, iat: now })}.test-signature`;
  return { access_token, token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: `refresh-${provider}`, user };
}
const APPLE = sessionFor("00000000-0000-4000-8000-0000000a991e", "x7k2m9@privaterelay.appleid.com", "apple");
const GOOGLE = sessionFor("00000000-0000-4000-8000-00000000900e", "new.person@example.ca", "google");
const APPLE_TOKEN = `${b64u({ alg: "RS256", kid: "test" })}.${b64u({ iss: "https://appleid.apple.com", aud: "app.flourishmoney", sub: "001234.test" })}.test-signature`;

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

// Runs in the page before the app: the platform, and the native side of four plugins behind Capacitor's own bridge
// calls. Every plugin object the app holds is still Capacitor's real proxy (registerPlugin), which is the point.
function installNative([platform, appleToken, appleMode]) {
  const ids = platform === "android"
    ? { monthly: "flourish_plus:monthly", annual: "flourish_plus:annual", founding: "flourish_plus:founding" }
    : { monthly: "app.flourishmoney.plus.monthly", annual: "app.flourishmoney.plus.annual", founding: "app.flourishmoney.founding.annual" };
  const pkg = (id, price, offering) => ({ identifier: `$rc_${id.includes("monthly") ? "monthly" : "annual"}`, offeringIdentifier: offering,
    product: { identifier: id, priceString: price, currencyCode: "CAD" } });
  const std = { identifier: "default", availablePackages: [pkg(ids.monthly, "$11.99", "default"), pkg(ids.annual, "$99.99", "default")] };
  const fnd = { identifier: "founding", availablePackages: [pkg(ids.founding, "$79.99", "founding")] };
  const N = window.__native = { apple: [], opened: [], closed: 0, listeners: {}, n: 0, configured: false, uid: null };
  N.fire = (plugin, eventName, data) => (N.listeners[`${plugin}:${eventName}`] || []).slice().forEach((l) => l.callback(data));
  const impl = {
    Purchases: {
      isConfigured: async () => ({ isConfigured: N.configured }),
      configure: async (o) => { N.configured = true; N.uid = o && o.appUserID; },
      logIn: async (o) => { N.uid = o && o.appUserID; return { customerInfo: {}, created: false }; },
      getAppUserID: async () => ({ appUserID: N.uid }),
      getOfferings: async () => ({ current: std, all: { default: std, founding: fnd } }),
      checkTrialOrIntroductoryPriceEligibility: async () => ({}),
      purchasePackage: async ({ aPackage }) => ({ customerInfo: {}, productIdentifier: aPackage.product.identifier }),
      restorePurchases: async () => ({ customerInfo: {} }),
      showManageSubscriptions: async () => {},
    },
    SignInWithApple: {
      authorize: async (o) => {
        N.apple.push({ clientId: o && o.clientId, scopes: o && o.scopes, hasNonce: typeof (o && o.nonce) === "string" && o.nonce.length === 64 });
        if (appleMode === "cancel") throw new Error("The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)");
        return { response: { identityToken: appleToken, authorizationCode: "test-authorization-code", user: "001234.test", email: null, givenName: null, familyName: null } };
      },
    },
    Browser: { open: async (o) => { N.opened.push(o && o.url); }, close: async () => { N.closed++; } },
    App: { getInfo: async () => ({ name: "flourish", id: "app.flourishmoney", build: "0", version: "1.1.7" }), getState: async () => ({ isActive: true }), getLaunchUrl: async () => ({}), exitApp: async () => {}, minimizeApp: async () => {} },
  };
  window.CapacitorCustomPlatform = { name: platform, plugins: {} };
  window.Capacitor = {
    PluginHeaders: Object.keys(impl).map((name) => ({ name, methods: [...Object.keys(impl[name]).map((m) => ({ name: m, rtype: "promise" })),
      { name: "addListener", rtype: "callback" }, { name: "removeListener", rtype: "callback" }] })),
    nativePromise: (plugin, method, options) => impl[plugin] && impl[plugin][method] ? impl[plugin][method](options) : Promise.reject(new Error(`${plugin}.${method} not in the test`)),
    nativeCallback: (plugin, method, options, callback) => {
      const key = `${plugin}:${options && options.eventName}`;
      if (method === "addListener") { const id = String(++N.n); (N.listeners[key] = N.listeners[key] || []).push({ id, callback }); return id; }
      if (method === "removeListener") N.listeners[key] = (N.listeners[key] || []).filter((l) => l.id !== String(options && options.callbackId));
      return undefined;
    },
  };
}

(async () => {
  const t = create();
  const NAME = "STORE SIGN-IN AND DELETE AT THE PLANS (browser)";
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
  const build = (name, env) => {
    const out = tempDir(name);
    execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
      { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key", ...env } });
    return out;
  };
  const storeDist = build("storesignin-store", { VITE_NATIVE_BUILD: "true", VITE_IAP_ENABLED: "true", VITE_REVENUECAT_IOS_KEY: "appl_testkey000000", VITE_REVENUECAT_ANDROID_KEY: "goog_testkey000000" });
  const webDist = build("storesignin-web", {});
  const browser = await playwright.chromium.launch();
  const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

  // One browser context is one phone (or one browser, for the website). `st` is this test's server side.
  const device = async ({ platform = "ios", appleMode = "ok", seeded = false }) => {
    const web = platform === "web";
    dist = web ? webDist : storeDist;
    const st = { api: [], auth: [], deleted: false, session: seeded ? MOCK.makeSession(Math.floor(Date.now() / 1000)) : null };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: "America/Toronto", locale: "en-CA", colorScheme: "light" });
    if (!web) await ctx.addInitScript(installNative, [platform, APPLE_TOKEN, appleMode]);
    if (seeded) await ctx.addInitScript(([key, session]) => { try {
      if (!localStorage.getItem("test_seeded")) {
        localStorage.setItem("test_seeded", "1");
        localStorage.setItem(key, session);
        localStorage.setItem("flourish_first_visit_done", "1");
        localStorage.setItem("flourish_tour_done", "1");
        localStorage.setItem("flourish_ai_disclosure_seen", "1");
      }
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(st.session)]);
    const json = (r, status, body) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: body === undefined ? "" : JSON.stringify(body) });
    const tpf = { trial_plan_first: { on: true, trial_days: 14, account_trial: false, web_trial_eligible: true, trialing: false, trial_ends: null } };
    const byToken = (auth) => [APPLE, GOOGLE, st.session].find((s) => s && auth === `Bearer ${s.access_token}`) || null;
    await ctx.route((url) => !url.href.startsWith(base) || /^\/(auth|rest|api)\//.test(url.pathname), async (r) => {
      const req = r.request(), u = new URL(req.url()), method = req.method();
      if (u.protocol === "data:" || u.protocol === "blob:") return r.continue();
      let body = {}; try { body = JSON.parse(req.postData() || "{}"); } catch {}
      if (u.origin === base && u.pathname.startsWith("/auth/v1/")) {
        const p = u.pathname.slice("/auth/v1/".length), grant = u.searchParams.get("grant_type");
        st.auth.push(`${method} ${p}${grant ? "?grant_type=" + grant : ""}`);
        if (p === "token" && grant === "id_token") { st.idToken = { provider: body.provider, token: body.id_token || body.token, nonce: typeof body.nonce === "string" && body.nonce.length === 64 }; st.session = APPLE; return json(r, 200, APPLE); }
        if (p === "token") return st.session ? json(r, 200, st.session) : json(r, 400, { error_code: "refresh_token_not_found", msg: "no session" });
        if (p === "user") { const s = byToken(req.headers().authorization); if (s) st.session = s; return s ? json(r, 200, s.user) : json(r, 401, { msg: "no session" }); }
        if (p === "logout") { st.session = null; return r.fulfill({ status: 204, body: "" }); }
        return json(r, 200, {});
      }
      if (u.origin === base && u.pathname.startsWith("/rest/v1/")) {
        const table = u.pathname.slice("/rest/v1/".length), obj = /vnd\.pgrst\.object/.test(req.headers().accept || "");
        if (method !== "GET" && method !== "HEAD") return json(r, 201, []);
        if (table === "user_data") { const row = seeded && !st.deleted ? { data: household(), updated_at: "2026-11-18T09:00:00.000Z" } : null; return obj ? json(r, 200, row) : json(r, 200, row ? [row] : []); }
        if (table === "profiles") { const row = { plan: "trial", trial_started_at: new Date(Date.now() - 60e3).toISOString(), trial_ends_at: new Date(Date.now() + 14 * 86400e3).toISOString(), founder_flag: false }; return obj ? json(r, 200, row) : json(r, 200, [row]); }
        return obj ? json(r, 406, { code: "PGRST116", message: "no rows" }) : json(r, 200, []);
      }
      // The store app's API origin is the website; the website's own is this server.
      if ((u.origin === "https://flourishmoney.app" || u.origin === base) && u.pathname.startsWith("/api/")) {
        const name = u.pathname.slice(5);
        if (method === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, body: "" });
        st.api.push(`${name}${body.action ? ":" + body.action : ""}`);
        if (name === "trial-plan-first") return json(r, 200, { on: true, since: new Date(Date.now() - 3600e3).toISOString() });
        if (name === "billing") {
          if (body.action === "store_status") return json(r, 200, { enabled: true, paid: false, provider: null, plan_key: null, conflict: false, conflict_kind: null, web_attention: false, period_end: null,
            founding: { available: false, held_on_regular_plan: null, spots_left: null }, ...tpf });
          if (body.action === "status") return json(r, 200, { enabled: true, paid: false, ...tpf });
          if (body.action === "store_hold") return json(r, 200, { held: true });
          return json(r, 404, { error: "not_found" });
        }
        if (name === "plaid") {
          if (body.action === "delete_account") { st.deleted = true; return json(r, 200, { ok: true, deleted: true, errors: [] }); }
          if (body.action === "list_items") return json(r, 200, { items: [] });
          return json(r, 200, {});
        }
        if (name === "beta") return json(r, 200, body.action === "signup_status" ? { openSignup: true } : {});
        if (name === "activation" || name === "attribution") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" }, body: "" });
        return json(r, 404, { error: "not_found" });
      }
      return r.abort();
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    return { ctx, page, st };
  };
  const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.waitForTimeout(500); await page.screenshot({ path: path.join(SHOTS, name), fullPage: true }); };
  const native = (page) => page.evaluate(() => { const n = window.__native; return { apple: n.apple, opened: n.opened, closed: n.closed }; });
  const toTheCard = async (page) => {
    await page.getByRole("button", { name: "Get started", exact: true }).first().click({ timeout: 40000 });
    await page.getByRole("button", { name: "Continue with Apple", exact: true }).waitFor();
  };
  const provider = (page, name) => page.getByRole("button", { name: `Continue with ${name}`, exact: true });
  const signedIn = (page) => page.getByText("About AI in Flourish", { exact: false }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);

  try {
    // ── 1. iPhone, Continue with Apple ───────────────────────────────────────────────────────────
    {
      const { ctx, page, st } = await device({ platform: "ios" });
      await toTheCard(page);
      await provider(page, "Apple").click();
      const asked = await until(async () => (await native(page)).apple.length > 0, 8000);
      t.eq(asked ? (await native(page)).apple : [], [{ clientId: "app.flourishmoney", scopes: "email name", hasNonce: true }], "1a iPhone: Continue with Apple opens Apple's own sheet, once, for our app, asking for the name and the email, with a hashed nonce");
      t.ok(await until(async () => !!st.idToken, 8000) && st.idToken.provider === "apple" && st.idToken.token === APPLE_TOKEN && st.idToken.nonce, "1b Supabase is given Apple's identity token and the unhashed nonce");
      t.ok(await signedIn(page), "1c …and the person is in: the app moves on from the sign-up card");
      t.ok(await until(async () => st.api.includes("beta:apple_grant"), 8000), "1d what deleting the account will need to revoke the sign-in at Apple is sent to our server");
      t.eq((await native(page)).opened, [], "1e no browser is opened for Apple on an iPhone");
      await ctx.close();
    }
    // ── 2. iPhone, the Apple sheet is cancelled ──────────────────────────────────────────────────
    {
      const { ctx, page, st } = await device({ platform: "ios", appleMode: "cancel" });
      await toTheCard(page);
      await provider(page, "Apple").click();
      const said = await page.getByText(FAILED_LINE, { exact: true }).waitFor({ timeout: 8000 }).then(() => true, () => false);
      t.ok(said && (await native(page)).apple.length === 1, "2a a cancelled sheet says so, in the approved words");
      t.ok(said && await provider(page, "Apple").isEnabled() && await provider(page, "Google").isEnabled() && (await provider(page, "Apple").innerText()).trim() === "Continue with Apple", "2b …and both buttons come back, to try again");
      t.ok(!st.idToken, "2c nothing was sent to Supabase");
      await ctx.close();
    }
    // ── 3. iPhone, Continue with Google ──────────────────────────────────────────────────────────
    {
      const { ctx, page } = await device({ platform: "ios" });
      await toTheCard(page);
      await provider(page, "Google").click();
      const opened = await until(async () => (await native(page)).opened.length > 0, 8000);
      const url = opened ? new URL((await native(page)).opened[0]) : null;
      t.ok(!!url && url.origin === base && url.pathname === "/auth/v1/authorize" && url.searchParams.get("provider") === "google" && url.searchParams.get("redirect_to") === "flourishmoney://auth-callback",
        "3a iPhone: Continue with Google opens Supabase's Google sign-in in the in-app browser, to come back to the app");
      t.eq((await native(page)).apple, [], "3b Apple's sheet is not asked for Google");
      await until(() => page.evaluate(() => (window.__native.listeners["App:appUrlOpen"] || []).length > 0), 5000);
      await page.evaluate((cb) => window.__native.fire("App", "appUrlOpen", { url: cb }), `flourishmoney://auth-callback#access_token=${GOOGLE.access_token}&refresh_token=${GOOGLE.refresh_token}&expires_in=86400&token_type=bearer`);
      t.ok(await signedIn(page), "3c the address Google sends back signs the person in");
      t.eq((await native(page)).closed, 1, "3d …and the in-app browser is closed (an iPhone leaves it open otherwise)");
      await ctx.close();
    }
    // ── 4. Android, Continue with Apple ──────────────────────────────────────────────────────────
    {
      const { ctx, page } = await device({ platform: "android" });
      await toTheCard(page);
      await provider(page, "Apple").click();
      const opened = await until(async () => (await native(page)).opened.length > 0, 8000);
      const url = opened ? new URL((await native(page)).opened[0]) : null;
      t.ok(!!url && url.searchParams.get("provider") === "apple" && url.searchParams.get("redirect_to") === "flourishmoney://auth-callback" && (await native(page)).apple.length === 0,
        "4a Android: Continue with Apple opens Apple's page in the in-app browser (there is no Apple sheet on Android)");
      await until(() => page.evaluate(() => (window.__native.listeners["Browser:browserFinished"] || []).length > 0), 5000);
      await page.evaluate(() => window.__native.fire("Browser", "browserFinished", {}));
      t.ok(await page.getByText(FAILED_LINE, { exact: true }).waitFor({ timeout: 8000 }).then(() => true, () => false) && await provider(page, "Apple").isEnabled(),
        "4b closing that browser without signing in says so, and the buttons come back");
      await ctx.close();
    }
    // ── 5 and 6. Held at "Choose your plan": the account can be deleted there ───────────────────
    for (const [n, platform, where] of [[5, "ios", "the store app"], [6, "web", "the website"]]) {
      const { ctx, page, st } = await device({ platform, seeded: true });
      const held = await page.getByRole("heading", { name: "Choose your plan", exact: true }).waitFor({ timeout: 40000 }).then(() => true, () => false);
      t.ok(held, `${n}a ${where}: an account that must choose a plan is held at "Choose your plan"`);
      const del = page.locator("[data-plans-delete]");
      t.ok(held && await del.count() === 1 && (await del.innerText()).trim() === "Delete Account", `${n}b …and that screen has Delete Account, in the words Settings uses`);
      const ask = page.getByText("Delete your account?", { exact: true });
      if (held && await del.count() === 1) {
        if (platform !== "web") await page.locator("[data-plan]").first().waitFor({ timeout: 10000 }).catch(() => {});
        await shot(page, `${platform}-plans-delete-account.png`);
        await del.click();
        await ask.waitFor({ timeout: 5000 }).catch(() => {});
        await shot(page, `${platform}-plans-delete-question.png`);
        t.ok(await ask.waitFor({ timeout: 5000 }).then(() => true, () => false)
          && await page.getByText("This permanently erases your account and all associated data from our servers. This cannot be undone.", { exact: true }).count() === 1,
          `${n}c tapping it asks the question Settings asks, word for word`);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await page.waitForTimeout(500);
        t.ok(await ask.count() === 0 && !st.api.includes("plaid:delete_account") && await page.getByRole("heading", { name: "Choose your plan", exact: true }).count() === 1,
          `${n}d Cancel: nothing is deleted and the plans are still there`);
        await del.click();
        await ask.waitFor({ timeout: 5000 }).catch(() => {});
        await page.getByRole("button", { name: "Delete account", exact: true }).click();
        t.ok(await until(async () => st.api.filter((a) => a === "plaid:delete_account").length === 1, 8000), `${n}e confirming asks the server to delete the account, once`);
        const out = await until(async () => await page.getByRole("heading", { name: "Choose your plan", exact: true }).count() === 0
          && await page.getByRole("button", { name: "Get started", exact: true }).count() > 0, 20000);
        t.ok(out, `${n}f …then the person is signed out, at the first screen`);
        // After the reload the signed-out app keeps its own empty state under the same key: no household in it.
        const left = await page.evaluate((key) => { let s = null; try { s = JSON.parse(localStorage.getItem("flourish_v1") || "null"); } catch (e) { s = "unreadable"; }
          return { session: localStorage.getItem(key), finances: s && s.appData ? "kept" : null, onboarded: !!(s && s.onboarded), owner: (s && s.userId) || null }; }, MOCK.storageKey(base));
        t.eq(left, { session: null, finances: null, onboarded: false, owner: null }, `${n}g nothing of the account is left on the device: no session, no saved finances`);
      } else {
        for (const c of ["c", "d", "e", "f", "g"]) t.ok(false, `${n}${c} (not reached: no Delete Account on the screen)`);
      }
      await ctx.close();
    }
  } catch (e) {
    t.ok(false, `the run finished without throwing (${e && e.message})`);
  } finally {
    await browser.close();
    server.close();
  }
  t.summary(NAME);
})();
