// tests/firstRun.test.cjs
// -----------------------------------------------------------------------------
// THE FIRST RUN, 1.1.7 (2026-11-11, from the first-run audit):
//   1  the words: one file (lib/firstRunWords.js), every line used, and the copy rules (lowercase flourish, no dash, no
//      competitor, no "learns" or "remembers", no money instruction, no verdict).
//   2  the store apps open on a value screen: the demo household's own number, labelled as an example, "Get started"
//      first, "Log in" a small link, the demo kept. The website's landing is unchanged.
//   3  Sign in with Apple and Google on the sign-up and log-in cards (website and apps), through Supabase
//      (lib/socialSignIn.js): the website's redirect, Apple's own sheet on an iPhone, the in-app browser elsewhere.
//   4  the apps' setup for it: the flourishmoney:// return address, the Sign in with Apple entitlement, the plugins.
//   5  the server counts a new Apple or Google account as a signup, once, and nothing else (beta.js social_signup).
//   6  onboarding asks only the balance, pay and the next payday before the number; bills and debts come after it, for
//      a household onboarded from 1.1.7 only; the statement import sits beside the bank as a first path.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");
const { STARTS, VERDICT } = require("./_copyStrings.cjs");

const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
const BANNED = /\blearns\b|\bremembers\b|\bsmarter\b|better over time|—|–|\bFlourish\b|\b(Mint|YNAB|Monarch|Rocket Money|Copilot|Quicken|Wealthsimple|KOHO|Credit Karma|Borrowell|Simplifi|EveryDollar|PocketGuard|Goodbudget|Emma)\b/;
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const BETA_PATH = require.resolve("../netlify/functions/beta.js");
const BLOBS_PATH = require.resolve("@netlify/blobs");

// beta.js's social_signup with _lib/auth faked: the signed-in account is `user`; every write is recorded.
async function socialSignup(user, { signedIn = true, hadMilestone = false, origin = "https://localhost" } = {}) {
  const writes = [];
  const saved = { ...process.env }, savedFetch = global.fetch;
  for (const k of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[k];
  const d = new Map();
  require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true, exports: { getStore: () => ({ async get(k) { return d.get(k) || null; }, async setJSON(k, v) { d.set(k, v); } }) } };
  const chain = (table) => {
    const q = { table, filters: [] };
    const api = {
      select() { return api; }, eq(k, v) { q.filters.push([k, v]); return api; }, limit() { return api; }, order() { return api; }, maybeSingle: async () => ({ data: null, error: null }),
      upsert: async (row) => { writes.push({ table, row }); return { error: null }; },
      insert: async (row) => { writes.push({ table, row }); return { error: null }; },
      then(res, rej) { return Promise.resolve({ data: table === "account_milestones" && hadMilestone ? [{ user_id: user.id }] : [], error: null }).then(res, rej); },
    };
    return api;
  };
  require.cache[AUTH_PATH] = { id: AUTH_PATH, filename: AUTH_PATH, loaded: true, exports: {
    getUserFromRequest: async () => (signedIn ? { user_id: user.id } : { user_id: null }),
    getAdminClient: () => ({ from: chain, rpc: async (fn, args) => { writes.push({ rpc: fn, args }); return { error: null }; },
      auth: { admin: { getUserById: async () => ({ data: { user }, error: null }) } } }),
    getPublicClient: () => ({}),
  } };
  global.fetch = async (url, init) => { writes.push({ fetch: String(url).replace(/^https:\/\/[^/]+/, ""), body: init && init.body }); return { ok: true, status: 201, json: async () => ({}), text: async () => "" }; };
  const realLog = console.log, realErr = console.error; console.log = () => {}; console.error = () => {};
  try {
    process.env.SUPABASE_URL = "https://supabase.test.invalid"; process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    const res = await require(BETA_PATH).handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x", "user-agent": "Mozilla/5.0 (Linux; Android 15)" }, body: JSON.stringify({ action: "social_signup" }) });
    return { status: res.statusCode, body: JSON.parse(res.body || "{}"), writes };
  } finally {
    console.log = realLog; console.error = realErr;
    for (const k of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[k];
    process.env = saved; global.fetch = savedFetch;
  }
}

(async () => {
  const t = create();
  const { FIRST_RUN_WORDS: W } = await import(path.join(REPO, "src", "lib", "firstRunWords.js"));
  const S = await import(path.join(REPO, "src", "lib", "socialSignIn.js"));

  // ── 1. The words ────────────────────────────────────────────────────────────────────────────────
  {
    const entries = Object.entries(W);
    t.ok(entries.length >= 18, `1a every new line is in lib/firstRunWords.js (${entries.length})`);
    t.eq(entries.filter(([, v]) => BANNED.test(v)).map(([k]) => k), [], "1b no dash, no competitor, no capital Flourish, no \"learns\" or \"remembers\"");
    t.eq(entries.filter(([k, v]) => k !== "getStarted" && (STARTS.test(v) || VERDICT.test(v))).map(([k]) => k), [],
      "1c no line starts with a money instruction or holds a verdict (\"Get started\" is the approved go-live button)");
    t.eq(entries.filter(([k]) => !APP.includes(`W.${k}`) && !APP.includes(`FIRST_RUN_WORDS.${k}`)).map(([k]) => k), [], "1d every line is used");
    t.eq(W.sampleTag, "Example, sample data", "1e the sample number is labelled as asked");
  }

  // ── 2. The value screen ─────────────────────────────────────────────────────────────────────────
  let A = {};
  try { A = loadApp(["AuthScreen", "AppWelcome", "Onboarding", "FirstVisitScreen", "buildDemoState", "SafeSpendEngine", "safeToSpendView"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
  const real = globalThis.Capacitor;
  const as = (p, fn) => {
    Object.defineProperty(globalThis, "Capacitor", { value: p === "web" ? undefined : { getPlatform: () => p, isNativePlatform: () => true }, configurable: true, writable: true });
    try { return fn(); } finally { Object.defineProperty(globalThis, "Capacitor", { value: real, configurable: true, writable: true }); }
  };
  {
    for (const p of ["ios", "android"]) {
      const html = as(p, () => A.render(A.h(A.AuthScreen, { onAuth: () => {}, onTryDemo: () => {} })));
      const text = textOf(html);
      t.ok(/data-app-welcome/.test(html) && !/id="auth-email"/.test(html), `2a ${p}: a fresh install opens on the value screen, not a log-in form`);
      t.ok(text.includes(W.valueHeadline) && text.includes(W.sampleTag) && /\$\d/.test(text), `2b ${p}: the headline and a sample number, labelled "${W.sampleTag}"`);
      const iGet = html.indexOf("data-get-started"), iLog = html.indexOf("data-welcome-login"), iDemo = html.indexOf(W.demo);
      t.ok(iGet > 0 && iLog > iGet && iDemo > iLog, `2c ${p}: "Get started" first, then "${W.haveAccount} ${W.logIn}", then the demo`);
      const login = as(p, () => A.render(A.h(A.AuthScreen, { onAuth: () => {}, onTryDemo: () => {}, startOnLogin: true })));
      t.ok(/id="auth-email"/.test(login) && !/data-app-welcome/.test(login), `2d ${p}: startOnLogin (back from a link) still opens the log-in form`);
    }
    const web = as("web", () => A.render(A.h(A.AuthScreen, { onAuth: () => {}, onTryDemo: () => {} })));
    t.ok(!/data-app-welcome/.test(web) && /fll-/.test(web), "2e the website still opens on its landing page");
    // The sample number is the demo household's own safe to spend, by the same engine as Today.
    const view = A.safeToSpendView(A.SafeSpendEngine.calculate(A.buildDemoState("CA")), { hasCashAccount: true, hasIncome: true });
    const card = textOf(as("ios", () => A.render(A.h(A.AppWelcome, { onGetStarted: () => {}, onLogIn: () => {}, onDemo: () => {} }))));
    const shown = (card.match(/Example, sample data \$([\d,]+)/) || [])[1];
    t.ok(view.headline > 0 && shown && Number(shown.replace(/,/g, "")) === Math.round(view.headline), `2f the sample is the demo's own number ($${shown})`);
  }

  // ── 3. Apple and Google ─────────────────────────────────────────────────────────────────────────
  {
    for (const p of ["web", "ios", "android"]) {
      // The website opens its card from the landing ("Get started" or "Log in"); a founding link opens it directly.
      const html = as(p, () => A.render(A.h(A.AuthScreen, { onAuth: () => {}, onTryDemo: () => {}, startOnLogin: true, ...(p === "web" ? { foundingNote: "founding" } : {}) })));
      const iApple = html.indexOf('data-provider="apple"'), iGoogle = html.indexOf('data-provider="google"'), iEmail = html.indexOf('id="auth-email"');
      t.ok(iApple > 0 && iGoogle > iApple && iEmail > iGoogle && textOf(html).includes(W.orEmail), `3a ${p}: Apple, then Google, then "${W.orEmail}" and the email form`);
    }
    t.eq(S.sessionFromCallback("flourishmoney://auth-callback#access_token=a&refresh_token=r&expires_in=3600"), { access_token: "a", refresh_token: "r" }, "3b the callback's tokens");
    t.eq([S.sessionFromCallback("flourishmoney://auth-callback?code=c1"), S.sessionFromCallback("flourishmoney://auth-callback#error=access_denied"),
      S.sessionFromCallback("https://flourishmoney.app/#access_token=a&refresh_token=r"), S.sessionFromCallback("flourishmoney://auth-callback")],
      [{ code: "c1" }, { error: "access_denied" }, null, { error: "no_session" }], "3c …a code, a refusal, another address (not ours), nothing");
    const { createHash } = require("crypto");
    const n = await S.nonces();
    t.ok(/^[0-9a-f]{64}$/.test(n.raw) && n.hashed === createHash("sha256").update(n.raw).digest("hex"), "3d Apple gets the SHA-256 of the nonce Supabase gets");

    const calls = [];
    const supa = { auth: {
      signInWithOAuth: async (o) => { calls.push(["oauth", o]); return { data: { url: "https://supabase.test/auth/v1/authorize?provider=" + o.provider }, error: null }; },
      signInWithIdToken: async (o) => { calls.push(["idtoken", o]); return { error: null }; },
      setSession: async (o) => { calls.push(["setSession", o]); return { error: null }; },
      exchangeCodeForSession: async (c) => { calls.push(["exchange", c]); return { error: null }; },
    } };
    let r = await S.signInWithProvider("google", { supabase: supa, native: false, platform: "web", origin: "https://flourishmoney.app" });
    t.eq([r, calls[0]], [{ ok: true, redirecting: true }, ["oauth", { provider: "google", options: { redirectTo: "https://flourishmoney.app" } }]], "3e website: Supabase's redirect, back to flourishmoney.app");
    calls.length = 0;
    const apple = { authorize: async (o) => { calls.push(["apple", o]); return { response: { identityToken: "id-token" } }; } };
    r = await S.signInWithProvider("apple", { supabase: supa, native: true, platform: "ios", origin: "https://flourishmoney.app", appleSignIn: apple });
    const sentNonce = calls[0][1].nonce, gotNonce = calls[1][1].nonce;
    t.ok(r.ok && calls[0][0] === "apple" && calls[0][1].clientId === "app.flourishmoney" && calls[1][0] === "idtoken" && calls[1][1].provider === "apple" && calls[1][1].token === "id-token"
      && sentNonce === createHash("sha256").update(gotNonce).digest("hex"), "3f iPhone, Apple: Apple's own sheet, then Supabase checks its token with the matching nonce");
    // The in-app browser: Google on either app, Apple on Android.
    for (const [provider, platform] of [["google", "ios"], ["google", "android"], ["apple", "android"]]) {
      calls.length = 0;
      let cb = null, closed = 0;
      const browser = { open: async (o) => { calls.push(["open", o.url]); setTimeout(() => cb && cb("flourishmoney://auth-callback#access_token=a&refresh_token=r"), 5); }, close: async () => { closed++; }, addListener: async () => ({ remove() {} }) };
      r = await S.signInWithProvider(provider, { supabase: supa, native: true, platform, appleSignIn: null, browser, appListener: (f) => { cb = f; return () => { cb = null; }; } });
      t.ok(r.ok && calls[0][0] === "oauth" && calls[0][1].options.redirectTo === S.NATIVE_CALLBACK && calls[0][1].options.skipBrowserRedirect === true
        && calls[1][0] === "open" && calls[2][0] === "setSession" && closed === (platform === "ios" ? 1 : 0),
        `3g ${provider} on ${platform}: the in-app browser, back through ${S.NATIVE_CALLBACK}, the session set (closed by us on iPhone only)`);
    }
    // Closed without finishing: no session, and the button comes back.
    calls.length = 0;
    let fin = null;
    const quitter = { open: async () => { setTimeout(() => fin && fin(), 5); }, close: async () => {}, addListener: async (ev, f) => { if (ev === "browserFinished") fin = f; return { remove() {} }; } };
    const t0 = Date.now();
    r = await S.signInWithProvider("google", { supabase: supa, native: true, platform: "android", browser: quitter, appListener: () => () => {} });
    t.ok(!r.ok && !calls.some(c => c[0] === "setSession") && Date.now() - t0 >= 1400, "3h closed without finishing: no session, after a moment for a late return");
    t.ok(APP.includes('<SocialSignIn onFailed={() => { setSuccess(""); setError(FIRST_RUN_WORDS.socialFailed); }} />'), "3i a sign-in that didn't finish says so on the card");
  }

  // ── 4. The apps' setup ──────────────────────────────────────────────────────────────────────────
  {
    const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
    t.ok(/<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>flourishmoney<\/string>/.test(read("ios", "App", "App", "Info.plist")), "4a iPhone: the flourishmoney:// address opens the app");
    t.ok(/com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>/.test(read("ios", "App", "App", "App.entitlements"))
      && (read("ios", "App", "App.xcodeproj", "project.pbxproj").match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length === 2, "4b …with the Sign in with Apple entitlement, in Debug and Release");
    t.ok(/android:scheme="flourishmoney" android:host="auth-callback"/.test(read("android", "app", "src", "main", "AndroidManifest.xml")), "4c Android: the same return address");
    const pkg = require(path.join(REPO, "package.json"));
    t.ok(pkg.dependencies["@capacitor/browser"] === "8.0.5" && pkg.dependencies["@capacitor-community/apple-sign-in"] === "7.1.0", "4d the two plugins, pinned");
    t.ok(/CapacitorBrowser/.test(read("ios", "App", "CapApp-SPM", "Package.swift")) && /CapacitorCommunityAppleSignIn/.test(read("ios", "App", "CapApp-SPM", "Package.swift"))
      && /capacitor-browser/.test(read("android", "capacitor.settings.gradle")), "4e …registered in both store projects");
  }

  // ── 5. The server counts a new Apple or Google account once ────────────────────────────────────
  {
    const now = Date.now();
    const fresh = (provider, ageMin = 2, email = "new@example.invalid") => ({ id: "11111111-2222-4333-8444-555555555555", email, created_at: new Date(now - ageMin * 60000).toISOString(), app_metadata: { provider } });
    const g = await socialSignup(fresh("google"));
    t.ok(g.status === 200 && g.body.recorded === true && g.writes.some(w => w.table === "account_milestones" && w.row.milestone === "signed_up" && w.row.channel === "android")
, "5a a new Google account: counted, on its platform");
    t.eq([(await socialSignup(fresh("apple"))).body.recorded, (await socialSignup(fresh("email"))).body.recorded, (await socialSignup(fresh("google", 60))).body.recorded,
      (await socialSignup(fresh("google"), { hadMilestone: true })).body.recorded],
      [true, false, false, false], "5b Apple too; never an email account, an account older than 15 minutes, or one already counted");
    t.eq((await socialSignup(fresh("google"), { signedIn: false })).status, 401, "5c only for the signed-in account");
    const test = await socialSignup(fresh("google", 2, "test@flourishmoney.app"));
    t.ok(!test.writes.some(w => w.table === "account_milestones"), "5d a test address is not put in the funnel");
    t.ok(/useEffect\(\(\) => \{\s*const provider = user\?\.app_metadata\?\.provider;[\s\S]{0,700}action: "social_signup"/.test(APP), "5e the app asks once, after a new Apple or Google sign-in");
  }

  // ── 6. Onboarding ───────────────────────────────────────────────────────────────────────────────
  {
    const ob = APP.slice(APP.indexOf("function Onboarding({"), APP.indexOf("\nfunction ", APP.indexOf("function Onboarding({") + 30));
    t.ok(/<Btn label=\{FIRST_RUN_WORDS\.showNumber\} onClick=\{finishBeforeNumber\}/.test(ob) && /billsAfterNumber:"pending"/.test(ob), "6a pay and the next payday are the last questions: the number comes next, bills and debts marked to do");
    t.ok(/if\(firstVisitDone&&appData&&!appData\.demo&&appData\.profile\?\.billsAfterNumber==="pending"\)return <><Onboarding key="after" phase="after"/.test(APP) && /if\(!onboarded\)return <><Onboarding key="before"/.test(APP),
      "6b after the number: bills then debts, only for a household marked to do them (nobody onboarded before 1.1.7), each phase its own screen (keyed)");
    const after = A.render(A.h(A.Onboarding, { phase: "after", initialBills: [{ name: "Hydro", amount: 90, date: 15 }], initialDebts: [], onComplete: () => {}, onLater: () => {} }));
    const at = textOf(after);
    t.ok(at.includes("Your bills") && at.includes(W.billsLead) && at.includes(W.notNow) && /value="Hydro"/.test(after) && !at.includes("Link your accounts"),
      "6c the after step opens on bills, seeded with what the household has, with \"Not now\"");
    const found = textOf(A.render(A.h(A.Onboarding, { phase: "after", initialBills: [{ name: "Netflix", amount: 16.99, date: 12, auto: true }], initialDebts: [], onComplete: () => {}, onLater: () => {} })));
    t.ok(/We found 1 recurring bill/.test(found) && !/Bills will auto-detect/.test(found), "6c2 after the number, a linked bank's bills are shown as found, not as still to come");
    const fv = (bills) => textOf(A.render(A.h(A.FirstVisitScreen, { data: { ...A.buildDemoState("CA"), demo: false, bills, profile: { ...A.buildDemoState("CA").profile, billsAfterNumber: "pending" } }, onDismiss: () => {} })));
    t.ok(fv([]).includes(W.billsPending) && !fv([{ name: "Rent", amount: "1", date: "1" }]).includes(W.billsPending), "6d the first number says bills aren't in it yet, only while there are none");
    const bank = textOf(as("ios", () => A.render(A.h(A.Onboarding, { onComplete: () => {} }))));
    t.ok(APP.includes("{FIRST_RUN_WORDS.statementTitle}</div>") && APP.includes("{FIRST_RUN_WORDS.statementSub}</div>") && !APP.includes("📄 Upload a statement instead"),
      "6e the statement import is offered beside the bank as a first path, in its own words");
    t.ok(bank.length > 0, "6f onboarding still renders from its first screen");
  }

  // ── 7. Leaving the app with Plaid Link open (a bank's "did you just sign in?" in its own app) ──────────────────────
  {
    const L = await import(path.join(REPO, "src", "lib", "plaidLinkOpen.js"));
    t.eq([L.isPlaidLinkOpen(), (L.markPlaidLinkOpen(), L.isPlaidLinkOpen()), (L.markPlaidLinkOpen(), L.markPlaidLinkClosed(), L.isPlaidLinkOpen())], [false, true, false],
      "7a open until Link reports back; a yes or no, never left open by a second open");
    const sdk = APP.slice(APP.indexOf("function usePlaidLinkSDK("), APP.indexOf("\n}\n", APP.indexOf("function usePlaidLinkSDK(")));
    t.ok(/markPlaidLinkOpen\(\);\s*window\.Plaid\.create\(/.test(sdk) && /onSuccess: \(\.\.\.args\) => \{ markPlaidLinkClosed\(\);/.test(sdk) && /onExit: \(err, meta\) => \{ if \(err\) \{[^}]*\} markPlaidLinkClosed\(\);/.test(sdk),
      "7b every Link the app opens is marked open, and closed on success or exit");
    t.ok(APP.includes("setUser(prev => (isPlaidLinkOpen() && prev && session?.user && prev.id === session.user.id) ? prev : (session?.user ?? null));"),
      "7c while Link is open, the same session announced again keeps the same account (no re-read, no loader under Link)");
    t.ok(/if\(isPlaidLinkOpen\(\)\) return;\s*\/\/ back from the bank's own app[^\n]*\n\s*askStore\("store_status"\)/.test(APP)
      && /if \(isPlaidLinkOpen\(\)\) return;\s*\/\/ Link open: the household/.test(APP)
      && APP.includes('if (document.visibilityState === "visible" && !isPlaidLinkOpen()) refreshBanksRef.current?.();'),
      "7d …and the store, household and bank checks wait while it is open (browser test R1: they still run once it is closed)");
  }

  t.summary("firstRun.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
