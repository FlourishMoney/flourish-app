// tests/plaidHostedLink.test.cjs
// -----------------------------------------------------------------------------
// THE STORE APPS LINK A BANK THROUGH PLAID HOSTED LINK, AND ALWAYS HEAR HOW IT ENDED.
//
// 1. The link token (netlify/functions/_lib/plaidLink.js): a store app's request carries hosted_link
//    (completion_redirect_uri = the app's own scheme, is_mobile_app) and the app's universal link as
//    redirect_uri, new and update mode alike; the website's request carries neither.
// 2. The result is read from Plaid, never trusted from the redirect: readHostedLinkResult, and the result
//    key that keeps hosted_link_result to the account that minted the token.
// 3. plaid.js against a fake Plaid (nothing leaves the machine): what each request sends and returns.
// 4. The flow in the app (src/lib/plaidHostedLink.js runHostedLink), driven with fakes: success, a late
//    result, the closed browser, Link's own exit, an error, no result, no browser, and a redirect from a
//    bank's own app that must be ignored.
// 5. The custom scheme, the universal link / App Link and their files, registered where each platform
//    looks, and all spelling the same address.
// 6. The wiring in App.jsx: the store apps never load Plaid's web SDK, every link token's hosted URL is
//    remembered, and a problem is said plainly with a way to try again.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const L = require("../netlify/functions/_lib/plaidLink.js");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const IOS = "capacitor://localhost", ANDROID = "https://localhost", WEB = "https://flourishmoney.app";
const TOKEN = "link-sandbox-af1a0311-da53-4636-b754-dd15cc058176";

(async () => {
  const t = create();
  const H = await import("../src/lib/plaidHostedLink.js");

  // ── 1. The link token ─────────────────────────────────────────────────────────────────────────
  {
    const web = L.linkTokenBody({ userId: "u1", country: "CA" });
    t.eq([web.hosted_link, web.redirect_uri, web.country_codes, web.products], [undefined, "https://flourishmoney.app/plaid/oauth", ["CA"], ["transactions"]], "1a the website: web SDK, no hosted_link, back to /plaid/oauth after an OAuth bank");
    const app = L.linkTokenBody({ userId: "u1", country: "US", native: true });
    t.eq(app.hosted_link, { completion_redirect_uri: "flourishmoney://plaid/complete", is_mobile_app: true }, "1b a store app: Hosted Link, back to the app's own scheme, in an in-app browser");
    t.eq([app.redirect_uri, app.country_codes, app.user, app.webhook], ["https://flourishmoney.app/plaid/app", ["US"], { client_user_id: "u1" }, L.WEBHOOK_URL], "1c …with the app's universal link as redirect_uri (required with is_mobile_app)");
    const upd = L.linkTokenBody({ userId: "u1", country: "CA", accessToken: "access-sandbox-x", native: true });
    t.eq([upd.access_token, upd.products, !!upd.hosted_link, upd.redirect_uri], ["access-sandbox-x", undefined, true, "https://flourishmoney.app/plaid/app"], "1d update mode in a store app is Hosted Link too");
    const webUpd = L.linkTokenBody({ userId: "u1", country: "CA", accessToken: "access-sandbox-x" });
    t.eq([webUpd.hosted_link, webUpd.redirect_uri], [undefined, "https://flourishmoney.app/plaid/oauth"], "1e update mode on the website is not, and returns to /plaid/oauth too");
    t.eq(L.linkTokenBody({ userId: "u1", country: "XX" }).country_codes, ["CA"], "1f an unknown country is Canada");
    t.ok(L.APP_REDIRECT_URI !== L.WEB_REDIRECT_URI && /^https:\/\//.test(L.APP_REDIRECT_URI), "1g the app's universal link has its own path, so the website's return is never captured by the app");
  }

  // ── 2. The result and its key ────────────────────────────────────────────────────────────────
  {
    const S = "plaid-secret-for-tests";
    const k = L.resultKey("u1", TOKEN, L.resultSecret(S));
    t.ok(/^[A-Za-z0-9_-]{43}$/.test(k), "2a the result key is an HMAC (base64url)");
    t.ok(L.resultKeyMatches("u1", TOKEN, k, L.resultSecret(S)), "2b it matches its own account and token");
    t.ok(!L.resultKeyMatches("u2", TOKEN, k, L.resultSecret(S)), "2c another account's key never matches");
    t.ok(!L.resultKeyMatches("u1", TOKEN.replace(/6$/, "7"), k, L.resultSecret(S)), "2d nor another token's");
    t.ok(!L.resultKeyMatches("u1", TOKEN, "", L.resultSecret(S)) && !L.resultKeyMatches("u1", TOKEN, k, ""), "2e no key, or no secret, never matches");
    t.ok(L.resultSecret(S) !== S && !k.includes(S), "2f the key is derived from PLAID_SECRET, never PLAID_SECRET itself");

    const R = L.readHostedLinkResult;
    const item = (pt, name = "Platypus OAuth Bank", id = "ins_127287") => ({ public_token: pt, institution: { name, institution_id: id }, accounts: [] });
    t.eq(R({ link_sessions: [{ link_session_id: "s1", started_at: "2026-10-15T10:00:00Z", finished_at: "2026-10-15T10:02:00Z", results: { item_add_results: [item("public-sandbox-1")] } }] }),
      { status: "success", public_token: "public-sandbox-1", institution_name: "Platypus OAuth Bank", institution_id: "ins_127287" }, "2g an added item is success, with its public_token and bank");
    t.eq(R({ link_sessions: [
      { started_at: "2026-10-15T10:00:00Z", finished_at: "2026-10-15T10:01:00Z", results: { item_add_results: [item("public-sandbox-old")] } },
      { started_at: "2026-10-15T10:05:00Z", finished_at: "2026-10-15T10:06:00Z", results: { item_add_results: [item("public-sandbox-new")] } },
    ] }).public_token, "public-sandbox-new", "2h the newest session wins");
    t.eq(R({ link_sessions: [{ finished_at: "2026-10-15T10:02:00Z", on_success: { public_token: "public-sandbox-legacy", metadata: { institution: { name: "Tartan Bank", institution_id: "ins_109508" } } } }] }),
      { status: "success", public_token: "public-sandbox-legacy", institution_name: "Tartan Bank", institution_id: "ins_109508" }, "2i the older on_success is read when results is absent");
    t.eq(R({ link_sessions: [{ finished_at: "2026-10-15T10:02:00Z", results: { item_add_results: [] }, events: [{ event_name: "EXIT", event_metadata: { exit_status: "requires_credentials" } }] }] }), { status: "exited" }, "2j a finished session with no item is exited");
    t.eq(R({ link_sessions: [{ finished_at: "2026-10-15T10:02:00Z", events: [{ event_name: "EXIT", event_metadata: { error_code: "INSTITUTION_NOT_RESPONDING" } }] }] }), { status: "error" }, "2k a session that ended on a Link error is error");
    t.eq([R({ link_sessions: [] }), R({ link_sessions: [{ started_at: "2026-10-15T10:00:00Z" }] }), R({}), R(null)].map(x => x.status), ["pending", "pending", "pending", "pending"], "2l no finished session yet is pending");
  }

  // ── 3. plaid.js against a fake Plaid ─────────────────────────────────────────────────────────
  {
    const saved = { ...process.env };
    Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role", PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox" });
    const q = { select() { return q; }, eq() { return q; }, single: async () => ({ data: { access_token: "access-sandbox-item" }, error: null }) };
    require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => ({ from: () => q, auth: { admin: {} } }) } };
    delete require.cache[AUTH_PATH]; delete require.cache[PLAID_PATH];
    const auth = require(AUTH_PATH);
    let signedIn = "u1";
    auth.getUserFromRequest = async () => (signedIn ? { user_id: signedIn, error: null } : { user_id: null, error: "unauthorized" });
    const plaid = require(PLAID_PATH);
    const realFetch = global.fetch, realError = console.error;
    const sent = []; let hostedUrl = "https://hosted.sandbox.plaid.com/link/abc123"; let sessions = [];
    const logs = [];
    console.error = (...a) => logs.push(a.join(" "));
    global.fetch = async (url, init) => {
      const u = String(url), body = JSON.parse(init.body);
      sent.push({ path: u.replace(/^https:\/\/[^/]+/, ""), body });
      const json = (o) => ({ ok: true, status: 200, json: async () => o });
      if (u.endsWith("/link/token/create")) return json({ link_token: TOKEN, expiration: "2026-10-15T14:00:00Z", ...(body.hosted_link && hostedUrl ? { hosted_link_url: hostedUrl } : {}) });
      if (u.endsWith("/link/token/get")) return json({ link_token: body.link_token, link_sessions: sessions });
      throw new Error("network blocked in test: " + u);
    };
    const call = async (origin, body) => {
      const res = await plaid.handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" }, body: JSON.stringify(body) });
      return { status: res.statusCode, body: JSON.parse(res.body || "{}") };
    };
    try {
      const web = await call(WEB, { action: "create_link_token", country: "CA" });
      t.eq([web.status, Object.keys(web.body).sort()], [200, ["link_token"]], "3a the website gets a link token and nothing else");
      t.eq([sent.at(-1).body.hosted_link, sent.at(-1).body.redirect_uri], [undefined, "https://flourishmoney.app/plaid/oauth"], "3b …and Plaid was not asked for Hosted Link");
      for (const [name, origin] of [["iOS", IOS], ["Android", ANDROID]]) {
        const r = await call(origin, { action: "create_link_token", country: "CA" });
        t.eq([r.status, r.body.link_token, r.body.hosted_link_url, r.body.result_key === L.resultKey("u1", TOKEN)], [200, TOKEN, hostedUrl, true], `3c the ${name} app gets the token, the hosted_link_url and its result key`);
        t.eq([sent.at(-1).body.hosted_link, sent.at(-1).body.redirect_uri], [{ completion_redirect_uri: "flourishmoney://plaid/complete", is_mobile_app: true }, "https://flourishmoney.app/plaid/app"], `3d …from a Hosted Link request (${name})`);
      }
      const reconnect = await call(IOS, { action: "create_link_token", item_id: "item-1", country: "CA" });
      t.eq([reconnect.status, sent.at(-1).body.access_token, !!sent.at(-1).body.hosted_link], [200, "access-sandbox-item", true], "3e a store app's reconnect (update mode) is Hosted Link too");
      hostedUrl = null;
      const none = await call(ANDROID, { action: "create_link_token", country: "CA" });
      t.eq([none.status, none.body.error, none.body.link_token], [502, "Could not start bank connection.", undefined], "3f no hosted_link_url from Plaid: the app is told, never handed a token it cannot open");
      hostedUrl = "https://hosted.sandbox.plaid.com/link/abc123";

      const key = L.resultKey("u1", TOKEN);
      sessions = [{ started_at: "2026-10-15T10:00:00Z", finished_at: "2026-10-15T10:02:00Z", results: { item_add_results: [{ public_token: "public-sandbox-ok", institution: { name: "Platypus OAuth Bank", institution_id: "ins_127287" } }] } }];
      const ok = await call(IOS, { action: "hosted_link_result", link_token: TOKEN, result_key: key });
      t.eq([ok.status, ok.body], [200, { status: "success", public_token: "public-sandbox-ok", institution_name: "Platypus OAuth Bank", institution_id: "ins_127287" }], "3g hosted_link_result reads the session from Plaid");
      t.eq(sent.at(-1), { path: "/link/token/get", body: { link_token: TOKEN } }, "3h …by asking /link/token/get with the link token alone");
      const before = sent.length;
      t.eq((await call(IOS, { action: "hosted_link_result", link_token: TOKEN, result_key: L.resultKey("u2", TOKEN) })).status, 403, "3i another account's result key is refused");
      t.eq((await call(IOS, { action: "hosted_link_result", link_token: TOKEN })).status, 403, "3j no result key is refused");
      t.eq((await call(IOS, { action: "hosted_link_result", link_token: "not-a-token", result_key: key })).status, 400, "3k something that is not a link token is refused");
      signedIn = null;
      t.eq((await call(IOS, { action: "hosted_link_result", link_token: TOKEN, result_key: key })).status, 401, "3l signed out is refused");
      signedIn = "u1";
      t.eq(sent.length, before, "3m …and none of those reached Plaid");
      sessions = [];
      t.eq((await call(ANDROID, { action: "hosted_link_result", link_token: TOKEN, result_key: key })).body, { status: "pending" }, "3n no finished session yet: pending");
      t.ok(!logs.some(l => l.includes(TOKEN) || l.includes("public-sandbox") || l.includes(key)), "3o nothing logged a link token, a public_token or a result key");
    } finally {
      global.fetch = realFetch; console.error = realError; process.env = saved;
      delete require.cache[PLAID_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[SUPA_PATH];
    }
  }

  // ── 4. The flow in the app ───────────────────────────────────────────────────────────────────
  {
    const URL_OK = "https://hosted.sandbox.plaid.com/link/abc123";
    // A fake device: the two plugins' listeners, and a scripted list of results from the server.
    function device(results, { openFails = false } = {}) {
      const d = { appUrl: [], finished: [], opened: [], closed: 0, fetches: 0, removed: 0, slept: [] };
      d.deps = {
        openBrowser: async (url) => { if (openFails) throw new Error("no browser"); d.opened.push(url); },
        closeBrowser: async () => { d.closed++; },
        addAppUrlListener: async (fn) => { d.appUrl.push(fn); return { remove: () => { d.removed++; } }; },
        addBrowserFinishedListener: async (fn) => { d.finished.push(fn); return { remove: () => { d.removed++; } }; },
        fetchResult: async () => { const r = results[Math.min(d.fetches, results.length - 1)]; d.fetches++; if (r instanceof Error) throw r; return r; },
        sleep: async (ms) => { d.slept.push(ms); },
      };
      d.redirect = (url = "flourishmoney://plaid/complete") => d.appUrl.forEach(f => f({ url }));
      d.close = () => d.finished.forEach(f => f());
      return d;
    }
    const tick = () => new Promise(r => setImmediate(r));
    const SUCCESS = { status: "success", public_token: "public-sandbox-ok", institution_name: "Platypus OAuth Bank", institution_id: "ins_127287" };
    const run = async (d, act, opts = {}) => { const p = H.runHostedLink(d.deps, { url: URL_OK, ...opts }); await tick(); await act(d); return p; };

    let d = device([SUCCESS]);
    let r = await run(d, (x) => x.redirect());
    t.eq([r.outcome, r.result.public_token, d.opened, d.closed, d.fetches, d.removed], ["success", "public-sandbox-ok", [URL_OK], 1, 1, 2], "4a the redirect, then success: closes the sheet, reads once, unhooks both listeners");
    t.eq(H.successMetadata(r.result), { institution: { name: "Platypus OAuth Bank", institution_id: "ins_127287" } }, "4b …and the success handler gets Plaid's metadata shape");

    d = device([{ status: "pending" }, { status: "pending" }, SUCCESS]);
    r = await run(d, (x) => x.redirect());
    t.eq([r.outcome, d.fetches], ["success", 3], "4c a result that lags the redirect is waited for");

    d = device([{ status: "pending" }]);
    r = await run(d, (x) => x.redirect(), { pendingTries: 4 });
    t.eq([r.outcome, r.reason, d.fetches], ["failed", "no_result", 4], "4d a redirect and never a result: failed, after a bounded wait");

    d = device([{ status: "pending" }]);
    r = await run(d, (x) => x.close());
    t.eq([r.outcome, r.reason, d.fetches, d.slept[0]], ["closed", "closed_early", 2, 1500], "4e the household closes the browser: a short grace, asked twice, then closed");

    d = device([SUCCESS]);
    r = await run(d, (x) => x.close());
    t.eq(r.outcome, "success", "4f closed on the very last screen, after the bank was added (e.g. iOS's Open in Flourish? cancelled): still success");

    d = device([{ status: "exited" }]);
    r = await run(d, (x) => x.redirect());
    t.eq([r.outcome, r.reason], ["closed", "exited"], "4g the household left Link inside Plaid: closed");

    d = device([{ status: "error" }]);
    r = await run(d, (x) => x.redirect());
    t.eq([r.outcome, r.reason], ["failed", "link_error"], "4h Link ended on an error: failed");

    d = device([new Error("offline")]);
    r = await run(d, (x) => x.redirect());
    t.eq([r.outcome, r.reason], ["failed", "result_unavailable"], "4i the result cannot be read: failed");

    d = device([SUCCESS], { openFails: true });
    r = await H.runHostedLink(d.deps, { url: URL_OK });
    t.eq([r.outcome, r.reason, d.removed], ["failed", "browser_unavailable", 2], "4j the browser will not open: failed, listeners unhooked");

    d = device([SUCCESS]);
    r = await H.runHostedLink(d.deps, { url: "https://evil.example/plaid.com" });
    t.eq([r.outcome, d.opened, d.fetches], ["failed", [], 0], "4k only a Plaid URL is ever opened");

    d = device([SUCCESS]);
    r = await run(d, async (x) => {
      x.redirect("https://flourishmoney.app/plaid/app?oauth_state_id=abc");
      await tick();
      t.eq(x.fetches, 0, "4l a bank's own app handing back (the universal link) is ignored: Plaid carries on");
      x.redirect();
    });
    t.eq(r.outcome, "success", "4m …and the session still finishes on the completion redirect");

    d = device([SUCCESS]);
    r = await run(d, (x) => { x.redirect(); x.close(); x.redirect(); });
    t.eq([r.outcome, d.fetches, d.closed], ["success", 1, 1], "4n the redirect and the browser closing together read the result once");

    d = device([{ status: "pending" }, SUCCESS]);
    r = await run(d, async (x) => { x.close(); await tick(); x.redirect(); });
    t.eq([r.outcome, d.fetches], ["success", 2], "4o the redirect landing just after the browser closed still wins");

    // The scheme and URL checks.
    t.eq(["flourishmoney://plaid/complete", "flourishmoney://plaid/complete?x=1", "FLOURISHMONEY://plaid/complete/", "flourish://plaid/complete", "flourishmoney://plaid/completed", "https://flourishmoney.app/plaid/app", null].map(H.isHostedLinkCompletion),
      [true, true, true, false, false, false, false], "4p the completion address, and nothing like it");
    t.eq(["https://hosted.plaid.com/x", "https://secure.plaid.com/hl/abc", "https://plaid.com/", "http://hosted.plaid.com/x", "https://plaid.com.evil.example/", "https://evilplaid.com/", "javascript:alert(1)"].map(H.isPlaidHostedUrl),
      [true, true, true, false, false, false, false], "4q a Plaid page is https on plaid.com or one of its subdomains");

    // The pending record.
    const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
    const s1 = store(), NOW = Date.parse("2026-10-15T12:00:00Z");
    H.savePlaidPending(s1, { mode: "hosted", link_token: TOKEN, result_key: "k", intent: "add" }, NOW);
    t.eq(H.readPlaidPending(s1, NOW + 29 * 60000), { mode: "hosted", link_token: TOKEN, result_key: "k", intent: "add", at: NOW }, "4r the pending record is read back within 30 minutes");
    t.eq([H.readPlaidPending(s1, NOW + 31 * 60000), s1.m.size], [null, 0], "4s …and dropped after");
    s1.setItem(H.PLAID_PENDING_KEY, "{not json");
    t.eq([H.readPlaidPending(s1, NOW), s1.m.size], [null, 0], "4t an unreadable record is dropped");
    const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
    t.ok(H.readPlaidPending(broken, NOW) === null && (H.savePlaidPending(broken, { link_token: TOKEN }), H.clearPlaidPending(broken), true), "4u no storage is never an error");

    // The hosted URL is remembered by token.
    H.rememberHostedLink({ link_token: TOKEN, hosted_link_url: URL_OK, result_key: "k1" });
    H.rememberHostedLink({ link_token: "link-sandbox-web-only-0000-000000000000" });
    t.eq([H.hostedLinkFor(TOKEN), H.hostedLinkFor("link-sandbox-web-only-0000-000000000000"), H.hostedLinkFor(null)], [{ url: URL_OK, resultKey: "k1" }, null, null], "4v a store app's hosted URL is kept by token; a web token has none");
  }

  // ── 5. The scheme and the universal link, registered where each platform looks ────────────────
  {
    const scheme = H.HOSTED_LINK_COMPLETION_URI.split(":")[0];
    t.eq([H.HOSTED_LINK_COMPLETION_URI, H.APP_REDIRECT_URI], [L.HOSTED_LINK_COMPLETION_URI, L.APP_REDIRECT_URI], "5a the app and the server spell both addresses the same");
    const plist = read("ios", "App", "App", "Info.plist");
    t.ok(new RegExp(`<key>CFBundleURLSchemes</key>\\s*<array>\\s*<string>${scheme}</string>`).test(plist), "5b iOS registers the completion scheme (Info.plist CFBundleURLTypes)");
    const manifest = read("android", "app", "src", "main", "AndroidManifest.xml");
    t.ok(/<data android:scheme="flourishmoney" android:host="plaid" android:path="\/complete" \/>/.test(manifest), "5c Android registers the completion scheme");
    const appLink = manifest.slice(manifest.indexOf('<intent-filter android:autoVerify="true">'));
    t.ok(/android:autoVerify="true"/.test(manifest) && /<data android:scheme="https" android:host="flourishmoney\.app" android:path="\/plaid\/app" \/>/.test(appLink), "5d Android claims /plaid/app as a verified App Link");
    t.ok(/<category android:name="android.intent.category.BROWSABLE" \/>/.test(appLink), "5e …that a browser may open");
    const ent = read("ios", "App", "App", "App.entitlements");
    t.ok(/<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>\s*<string>applinks:flourishmoney\.app<\/string>/.test(ent), "5f iOS claims flourishmoney.app for universal links (Associated Domains)");
    const pbx = read("ios", "App", "App.xcodeproj", "project.pbxproj");
    t.eq((pbx.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length, 2, "5g …in both the Debug and Release builds of the app");
    const team = (pbx.match(/DEVELOPMENT_TEAM = ([A-Z0-9]+);/) || [])[1], bundle = (pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = ([a-z.]+);/) || [])[1];
    const aasa = JSON.parse(read("public", ".well-known", "apple-app-site-association"));
    t.eq(aasa.applinks.details.map(x => x.appIDs), [[`${team}.${bundle}`]], `5h the site's apple-app-site-association names this app (${team}.${bundle})`);
    t.eq(aasa.applinks.details[0].components.map(c => c["/"]), ["/plaid/app"], "5i …for /plaid/app only, so no other page of the site opens the app");
    const al = JSON.parse(read("public", ".well-known", "assetlinks.json"));
    const appId = (read("android", "app", "build.gradle").match(/applicationId "([^"]+)"/) || [])[1];
    t.eq([al[0].relation, al[0].target.namespace, al[0].target.package_name], [["delegate_permission/common.handle_all_urls"], "android_app", appId], `5j the site's assetlinks.json names this app (${appId})`);
    t.ok(al[0].target.sha256_cert_fingerprints.length >= 1 && al[0].target.sha256_cert_fingerprints.every(f => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f)), "5k …with well-formed SHA-256 certificate fingerprints");
    const toml = read("netlify.toml");
    for (const f of ["apple-app-site-association", "assetlinks.json"]) {
      const block = toml.slice(toml.indexOf(`for = "/.well-known/${f}"`), toml.indexOf(`for = "/.well-known/${f}"`) + 200);
      t.ok(/Content-Type = "application\/json"/.test(block), `5l /.well-known/${f} is served as JSON`);
    }
    const redirects = [...toml.matchAll(/\[\[redirects\]\]\s*from\s*=\s*"([^"]+)"[\s\S]*?status\s*=\s*(\d+)(?:\s*force\s*=\s*(true))?/g)].map(m => ({ from: m[1], force: !!m[3] }));
    t.ok(!redirects.some(r => r.from.startsWith("/.well-known")) && !redirects.some(r => r.from === "/*" && r.force), "5m no redirect answers for /.well-known: the files are served as they are");
    const pkg = JSON.parse(read("package.json"));
    const spm = read("ios", "App", "CapApp-SPM", "Package.swift");
    const gradle = read("android", "capacitor.settings.gradle") + read("android", "app", "capacitor.build.gradle");
    t.ok(/^\^8\./.test(pkg.dependencies["@capacitor/app"] || "") && /CapacitorApp"/.test(spm) && /:capacitor-app'/.test(gradle), "5n @capacitor/app 8 is a dependency and registered in both native projects");
    t.ok(/^\^8\./.test(pkg.dependencies["@capacitor/browser"] || "") && /CapacitorBrowser"/.test(spm) && /:capacitor-browser'/.test(gradle), "5o @capacitor/browser 8 likewise");
  }

  // ── 6. The wiring in App.jsx ─────────────────────────────────────────────────────────────────
  {
    const APP = read("src", "App.jsx");
    const hook = APP.slice(APP.indexOf("function usePlaidLinkSDK("), APP.indexOf("return { openPlaidLink"));
    t.ok(/if \(native\) return;   \/\/ store apps: Hosted Link, no script/.test(hook) && hook.indexOf("if (native) return;") < hook.indexOf("document.createElement(\"script\")"), "6a a store app never loads Plaid's web SDK into its WebView");
    t.ok(/if \(native\) \{[\s\S]*?openHostedLink\(\{ linkToken,/.test(hook), "6b …it opens Hosted Link instead, from the same hook");
    t.ok(/plaidReady: native \? !!hostedLinkFor\(linkToken\) : sdkReady && !!linkToken, plaidSdkError: native \? false : sdkError/.test(APP), "6c …and is ready once its hosted URL is known");
    const mints = [...APP.matchAll(/callPlaid\("create_link_token"[\s\S]{0,260}?(set(?:Link|Reconnect)Token\(d\.link_token\))/g)].map(m => m[0]);
    t.eq([mints.length, mints.every(m => /rememberHostedLink\(d\);\s*set(?:Link|Reconnect)Token\(d\.link_token\)/.test(m))], [3, true], "6d every link token minted (onboarding, add, reconnect) has its hosted URL remembered first");
    const fn = APP.slice(APP.indexOf("async function openHostedLink("), APP.indexOf("function usePlaidLinkSDK("));
    t.ok(/closeBrowser: \(\) => \(ios \? Browser\.close\(\) : undefined\)/.test(fn), "6e the sheet is closed on iOS only (Android is already back in the app)");
    t.ok(/savePlaidPending\(appStorage\(\), \{ mode: "hosted", link_token: linkToken, result_key: hosted\.resultKey, intent \}\);[\s\S]*?const res = await runHostedLink/.test(fn) && /clearPlaidPending\(appStorage\(\)\);/.test(fn), "6f the pending record is kept while the browser is up, then removed");
    t.ok(/if \(res\.outcome === "success"\) \{ onSuccess\(res\.result\.public_token, successMetadata\(res\.result\)\); return; \}/.test(fn), "6g success goes to the same success handler as the web SDK (then exchange_token)");
    t.ok(/onProblem\?\.\(res\.outcome === "closed" \? "closed" : "failed"\);/.test(fn) && /catch \(err\) \{[\s\S]*?onProblem\?\.\("failed"\);/.test(fn), "6h anything else is a problem the screen hears about, never silence");
    const ob = APP.slice(APP.indexOf("const onHostedProblem=useCallback((kind)=>{"), APP.indexOf("const onHostedProblem=useCallback((kind)=>{") + 700);
    t.ok(/setBankError\(`\$\{HOSTED_LINK_COPY\[kind\]\|\|HOSTED_LINK_COPY\.failed\} \$\{HOSTED_LINK_COPY\.again\}`\);/.test(ob) && /fetchLinkToken\(true\)/.test(ob), "6i onboarding says what happened on the bank step and makes Connect ready again");
    t.ok(/usePlaidLinkSDK\(linkToken,onPlaidSuccess,\{ intent:"onboarding", onProblem:onHostedProblem[,}]/.test(APP), "6j …through the onboarding hook");
    const top = APP.slice(APP.indexOf("const onHostedProblem = useCallback((kind)=>{"), APP.indexOf("const onHostedProblem = useCallback((kind)=>{") + 600);
    t.ok(/confirmModal\(\{ message: HOSTED_LINK_COPY\[kind\] \|\| HOSTED_LINK_COPY\.failed, confirmLabel: HOSTED_LINK_COPY\.tryAgain, cancelLabel: HOSTED_LINK_COPY\.notNow \}\)/.test(top) && /if\(again\) setPendingPlaid\(intent\);/.test(top),
      "6k Settings says what happened and offers Try again, through the same consent sheet");
    t.ok(/usePlaidLinkSDK\(reconnectToken, onReconnectSuccess, \{ intent: \(\)=>linkIntentRef\.current, onProblem: onHostedProblem[,}]/.test(APP), "6l …through the add/reconnect hook");
    const rec = APP.slice(APP.indexOf("const hostedRecoveryRan = useRef(false);"), APP.indexOf("const hostedRecoveryRan = useRef(false);") + 1100);
    t.ok(/!isNativeApp\(\)\) return;/.test(rec) && /readPlaidPending\(appStorage\(\)\)/.test(rec) && /if\(r\?\.status !== "success" \|\| !r\.public_token\) return;/.test(rec) && /onReconnectSuccess\(r\.public_token, successMetadata\(r\)\)/.test(rec),
      "6m a session that added a bank while the system had closed the app is finished when it opens again");
    t.ok(/"hosted_link_result"/.test(APP.slice(APP.indexOf("const RETRY_SAFE"), APP.indexOf("const RETRY_SAFE") + 200)), "6n reading the result is retried on a dropped connection (a read)");
    t.ok(/if \(path === "\/plaid\/app"\) return "plaid-app";/.test(APP) && /if\(screen==="plaid-app"\)return <PlaidAppReturnPage\/>;/.test(APP), "6o /plaid/app opened in a browser says to go back to the app, never a blank page");
  }

  t.summary("plaidHostedLink.test");
})();
