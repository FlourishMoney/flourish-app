// tests/plaidReturnPaths.test.cjs
// -----------------------------------------------------------------------------
// BOTH WAYS BACK FROM THE BANK, END TO END, AND EVERY WORD THE HOUSEHOLD READS ON THEM.
//
// 1. Which path each caller gets, from the server: the website and older store builds get Plaid's web
//    SDK token; a store build that asks gets Hosted Link.
// 2. A store app's whole session against the real plaid.js and a fake Plaid (nothing leaves the
//    machine): mint, open, the completion redirect on the custom scheme, the result read from Plaid,
//    the public_token handed to the success handler. Then the closed browser, Link's exit, Plaid down,
//    and a result key from another account.
// 3. The website's whole return with the real record helpers: written before Link opens, the bank's
//    redirect to /plaid/oauth, resume with the same token and the full address; and the lost case.
// 4. Every new string a household can read: no em or en dash, none of the banned words, no GST/HST
//    credit, no competitor, no money instruction, Canadian spelling. And the exact wording.
// 5. The demo: nothing in it reaches either path.
// 6. The pending record never leaves the device, and signing out removes it.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { copyStrings, adviceProblems } = require("./_copyStrings.cjs");

const REPO = path.join(__dirname, "..");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const IOS = "capacitor://localhost", ANDROID = "https://localhost", WEB = "https://flourishmoney.app";
const TOKEN = "link-sandbox-0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const BANNED = /\blearns?\b|\bremembers?\b|\bsmarter\b|better over time|\bsets? aside\b|\bholds? back\b|GST\/HST credit|GST credit|HST credit|[–—]|\b(Mint|YNAB|Monarch|Rocket Money|Copilot|Quicken|Wealthsimple|KOHO|Credit Karma|Borrowell|Simplifi|EveryDollar|PocketGuard|Goodbudget|Emma)\b/;
const US_SPELLING = /\b(color|colors|center|centers|favorite|behavior|honor|labor|neighbor|catalog|canceled|canceling|traveled|fulfill|analyze|apologize|organize|realize|recognize|cheque?ing account)\b/i;

(async () => {
  const t = create();
  const H = await import("../src/lib/plaidHostedLink.js");
  const O = await import("../src/lib/plaidOAuthReturn.js");

  // A real plaid.js against a fake Plaid and a fake Supabase.
  const saved = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role", PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox" });
  const q = { select() { return q; }, eq() { return q; }, single: async () => ({ data: { access_token: "access-sandbox-item" }, error: null }) };
  require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => ({ from: () => q, auth: { admin: {} } }) } };
  delete require.cache[AUTH_PATH]; delete require.cache[PLAID_PATH];
  const auth = require(AUTH_PATH);
  let caller = "u1";
  auth.getUserFromRequest = async () => ({ user_id: caller, error: null });
  const plaid = require(PLAID_PATH);
  const realFetch = global.fetch, realError = console.error;
  let sessions = [], plaidDown = false;
  const plaidCalls = [];
  console.error = () => {};
  global.fetch = async (url, init) => {
    const u = String(url), body = JSON.parse(init.body);
    plaidCalls.push(u.replace(/^https:\/\/[^/]+/, ""));
    if (plaidDown) return { ok: false, status: 500, json: async () => ({ error_code: "INTERNAL_SERVER_ERROR", error_message: "down" }) };
    const json = (o) => ({ ok: true, status: 200, json: async () => o });
    if (u.endsWith("/link/token/create")) return json({ link_token: TOKEN, ...(body.hosted_link ? { hosted_link_url: "https://hosted.sandbox.plaid.com/link/0c1d2e3f" } : {}) });
    if (u.endsWith("/link/token/get")) return json({ link_token: body.link_token, link_sessions: sessions });
    throw new Error("network blocked in test: " + u);
  };
  const api = async (origin, body) => {
    const res = await plaid.handler({ httpMethod: "POST", headers: { origin, authorization: "Bearer x" }, body: JSON.stringify(body) });
    const data = JSON.parse(res.body || "{}");
    if (res.statusCode !== 200) { const e = new Error(data.error || "Plaid error"); e.status = res.statusCode; throw e; }
    return data;
  };

  try {
    // ── 1. Which path each caller gets ──────────────────────────────────────────────────────────
    const matrix = [];
    for (const [who, origin] of [["web", WEB], ["iOS", IOS], ["Android", ANDROID]]) {
      for (const ask of [false, true]) {
        const d = await api(origin, { action: "create_link_token", country: "CA", ...(ask ? { hosted_link: true } : {}) });
        matrix.push(`${who}${ask ? "+ask" : ""}:${d.hosted_link_url ? "hosted" : "sdk"}`);
      }
    }
    t.eq(matrix, ["web:sdk", "web+ask:sdk", "iOS:sdk", "iOS+ask:hosted", "Android:sdk", "Android+ask:hosted"], "1a the website and older store builds: web SDK; a store build that asks: Hosted Link");

    // ── 2. A store app's whole session ──────────────────────────────────────────────────────────
    const storeSession = async ({ origin = IOS, script, sessionsNow }) => {
      const minted = await api(origin, { action: "create_link_token", country: "US", hosted_link: true });
      H.rememberHostedLink(minted);
      const hosted = H.hostedLinkFor(minted.link_token);
      const dev = { appUrl: [], finished: [], closed: 0 };
      const deps = {
        openBrowser: async () => {},
        closeBrowser: async () => { dev.closed++; },
        addAppUrlListener: async (fn) => { dev.appUrl.push(fn); return { remove() {} }; },
        addBrowserFinishedListener: async (fn) => { dev.finished.push(fn); return { remove() {} }; },
        fetchResult: () => api(origin, { action: "hosted_link_result", link_token: minted.link_token, result_key: hosted.resultKey }),
        sleep: async () => {},
      };
      const p = H.runHostedLink(deps, { url: hosted.url });
      await new Promise((r) => setImmediate(r));
      sessions = sessionsNow;
      script(dev);
      const res = await p;
      let handed = null;
      if (res.outcome === "success") handed = [res.result.public_token, H.successMetadata(res.result)];
      return { res, handed, dev };
    };
    const added = [{ started_at: "2026-10-15T10:00:00Z", finished_at: "2026-10-15T10:03:00Z", results: { item_add_results: [{ public_token: "public-sandbox-platypus", institution: { name: "Platypus OAuth Bank", institution_id: "ins_127287" } }] } }];
    let s = await storeSession({ sessionsNow: added, script: (d) => d.appUrl.forEach((f) => f({ url: H.HOSTED_LINK_COMPLETION_URI })) });
    t.eq([s.res.outcome, s.handed], ["success", ["public-sandbox-platypus", { institution: { name: "Platypus OAuth Bank", institution_id: "ins_127287" } }]], "2a iOS: the completion redirect on flourishmoney://, the result from Plaid, the public_token to the success handler");
    t.ok(plaidCalls.slice(-2).join() === "/link/token/create,/link/token/get", "2b …the result came from /link/token/get, not from the redirect");
    s = await storeSession({ origin: ANDROID, sessionsNow: added, script: (d) => d.appUrl.forEach((f) => f({ url: "flourishmoney://plaid/complete" })) });
    t.eq(s.res.outcome, "success", "2c Android: the same");
    s = await storeSession({ sessionsNow: [], script: (d) => d.finished.forEach((f) => f()) });
    t.eq([s.res.outcome, s.res.reason, s.handed], ["closed", "closed_early", null], "2d the household closes the browser before finishing: closed, nothing exchanged");
    s = await storeSession({ sessionsNow: [{ finished_at: "2026-10-15T10:03:00Z", events: [{ event_name: "EXIT", event_metadata: {} }] }], script: (d) => d.appUrl.forEach((f) => f({ url: H.HOSTED_LINK_COMPLETION_URI })) });
    t.eq([s.res.outcome, s.res.reason], ["closed", "exited"], "2e the household leaves Link inside Plaid: closed");
    s = await storeSession({ sessionsNow: [{ finished_at: "2026-10-15T10:03:00Z", events: [{ event_name: "ERROR", event_metadata: { error_code: "INSTITUTION_DOWN" } }] }], script: (d) => d.appUrl.forEach((f) => f({ url: H.HOSTED_LINK_COMPLETION_URI })) });
    t.eq([s.res.outcome, s.res.reason], ["failed", "link_error"], "2f the bank is down inside Link: failed");
    {
      const minted = await api(IOS, { action: "create_link_token", country: "US", hosted_link: true });
      plaidDown = true;
      let err = null;
      try { await api(IOS, { action: "hosted_link_result", link_token: minted.link_token, result_key: minted.result_key }); } catch (e) { err = e; }
      plaidDown = false;
      t.eq(err && err.status, 500, "2g Plaid down while reading the result: an error the app turns into failed (4i in plaidHostedLink)");
      caller = "u2";
      err = null;
      try { await api(IOS, { action: "hosted_link_result", link_token: minted.link_token, result_key: minted.result_key }); } catch (e) { err = e; }
      caller = "u1";
      t.eq(err && err.status, 403, "2h another account holding the token and its key still cannot read the result");
    }

    // ── 3. The website's whole return ───────────────────────────────────────────────────────────
    {
      const m = new Map();
      const store = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
      const web = await api(WEB, { action: "create_link_token", country: "US" });
      const t0 = Date.parse("2026-10-15T12:00:00Z");
      H.savePlaidPending(store, { mode: "web", link_token: web.link_token, intent: "onboarding", draft: { p: { name: "Sam", country: "US", province: "NY" } } }, t0);
      // The bank sends the browser back to the link token's redirect_uri with Plaid's oauth_state_id.
      const redirectUri = require("../netlify/functions/_lib/plaidLink.js").WEB_REDIRECT_URI;
      const href = `${redirectUri}?oauth_state_id=7f8e9d0c-1b2a-4c3d-9e8f-001122334455`;
      const u = new URL(href);
      const plan = O.planOAuthReturn({ pathname: u.pathname, search: u.search, href }, H.readPlaidPending(store, t0 + 4 * 60000));
      t.eq([plan.kind, plan.linkToken, plan.receivedRedirectUri, plan.intent, plan.draft.p.name], ["resume", web.link_token, href, "onboarding", "Sam"], "3a back from the bank: the same link token, the full return address, the bank step with the answers so far");
      t.eq(O.redirectUriFor(plan, web.link_token), href, "3b …Link is re-opened with receivedRedirectUri");
      H.clearPlaidPending(store);
      t.eq(O.planOAuthReturn({ pathname: u.pathname, search: u.search, href }, H.readPlaidPending(store, t0)).kind, "lost", "3c the same return in another browser (no record): lost, said plainly");
    }
  } finally {
    global.fetch = realFetch; console.error = realError; process.env = saved;
    delete require.cache[PLAID_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[SUPA_PATH];
  }

  // ── 4. Every new string a household can read ───────────────────────────────────────────────────
  {
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const lineOf = (i) => APP.slice(0, i).split("\n").length;
    const region = (from, to) => { const a = APP.indexOf(from), b = APP.indexOf(to, a + 1); return a > 0 && b > a ? [lineOf(a), lineOf(b + to.length)] : null; };
    const regions = [
      region("function PlaidAppReturnPage(){", "\n}\n"),
      region("async function openHostedLink(", "function usePlaidLinkSDK("),
      region("const [hostedRetry,setHostedRetry]=useState(false);", "const oauthResumed=useRef(false);"),
      region("const onHostedProblem = useCallback((kind)=>{", "},[plaidOAuthReturn, user, hydrated, onboarded]);"),
    ];
    t.ok(regions.every(Boolean), "4a (the new App.jsx code was found)");
    const all = copyStrings();
    const mine = all.filter((c) => /src\/lib\/plaid(HostedLink|OAuthReturn)\.js$/.test(c.file)
      || (c.file === "src/App.jsx" && regions.some((r) => r && c.line >= r[0] && c.line <= r[1])));
    const texts = [...new Set(mine.map((c) => c.text))].sort();
    t.ok(texts.length >= 8, `4b the scan sees the new copy (${texts.length} strings)`);
    t.eq(texts.filter((x) => BANNED.test(x)), [], "4c no em or en dash, no learns/remembers/smarter/better over time/sets aside/holds back, no GST/HST credit, no competitor");
    t.eq(texts.flatMap((x) => adviceProblems(x).map((w) => `${w}: ${x}`)), [], "4d no money instruction, no verdict");
    t.eq(texts.filter((x) => US_SPELLING.test(x)), [], "4e Canadian spelling");
    t.eq(Object.values(H.HOSTED_LINK_COPY), [
      "Your bank wasn't connected. The bank window closed before it finished.",
      "Your bank wasn't connected. Something went wrong on the way back from your bank.",
      "You can try again.", "Try again", "Not now",
    ], "4f the store apps' words, exactly");
    t.eq(O.OAUTH_RETURN_COPY.lost, "This page couldn't finish connecting your bank. If your bank isn't listed in Flourish, connect it again.", "4g the website's lost return, exactly");
    t.ok(APP.includes(">Go back to Flourish.</h1>") && APP.includes(">Your bank sign-in finishes in the Flourish app. You can close this page.</p>"), "4h /plaid/app in a browser, exactly");
  }

  // ── 5. The demo ────────────────────────────────────────────────────────────────────────────────
  {
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const demoFiles = fs.readdirSync(path.join(REPO, "src", "lib")).filter((f) => /^demo/.test(f));
    t.eq(demoFiles.filter((f) => /hosted|oauth|plaidHostedLink|plaidOAuthReturn|create_link_token/i.test(fs.readFileSync(path.join(REPO, "src", "lib", f), "utf8"))), [], "5a no demo file touches either path");
    t.ok(/if\(hostedRecoveryRan\.current \|\| !user \|\| !hydrated \|\| !isNativeApp\(\)\) return;/.test(APP) && /if\(!plaidOAuthReturn \|\| !user \|\| !hydrated \|\| !onboarded\) return;/.test(APP),
      "5b both returns need a signed-in household: the demo (no user) never resumes either");
  }

  // ── 6. The record stays on this device, and leaves with the household ─────────────────────────
  {
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
    const P = await import("../src/lib/persistence.js");
    H.savePlaidPending(globalThis.localStorage, { mode: "web", link_token: TOKEN, intent: "onboarding", draft: { p: { name: "Sam" } } });
    globalThis.localStorage.setItem("flourish_plaid_consented_at", "2026-10-15T12:00:00.000Z");
    const synced = P.readSideKeys();
    t.ok("flourish_plaid_consented_at" in synced && !(H.PLAID_PENDING_KEY in synced), "6a the record (a link token, onboarding's answers) is never synced to the account");
    P.clearAllUserLocal();
    t.eq(globalThis.localStorage.getItem(H.PLAID_PENDING_KEY), null, "6b signing out removes it");
    delete globalThis.localStorage;
  }

  t.summary("plaidReturnPaths.test");
})();
