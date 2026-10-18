// tests/plaidOAuthReturn.test.cjs
// -----------------------------------------------------------------------------
// THE WEBSITE'S OAUTH RETURN: https://flourishmoney.app/plaid/oauth RE-OPENS LINK WHERE IT LEFT OFF.
//
// The website keeps Plaid's web SDK. A bank that signs in with OAuth sends a phone's browser back to the
// link token's redirect_uri with an oauth_state_id, and Plaid's guidance is to re-open Link there with the
// same link token and receivedRedirectUri = the full return address (plaid.com/docs/link/oauth).
//
// 1. The redirect_uri the website's link tokens carry: /plaid/oauth, https, no query, no fragment, new and
//    update mode, and never the store apps' universal link.
// 2. planOAuthReturn: which addresses are a return, and resume vs lost.
// 3. The record that carries the token across the trip to the bank, with the real storage helpers.
// 4. The wiring in App.jsx: the record is written before Link opens and removed when it ends; the return is
//    read once at load and the address put back; onboarding resumes on the bank step with its answers;
//    a signed-in household resumes through the add/reconnect hook once Link can open; a lost return is
//    said plainly. The store apps never take this path.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const L = require("../netlify/functions/_lib/plaidLink.js");
const TOKEN = "link-sandbox-af1a0311-da53-4636-b754-dd15cc058176";

(async () => {
  const t = create();
  const O = await import("../src/lib/plaidOAuthReturn.js");
  const H = await import("../src/lib/plaidHostedLink.js");

  // ── 1. The redirect_uri ───────────────────────────────────────────────────────────────────────
  {
    const u = new URL(L.WEB_REDIRECT_URI);
    t.eq([u.protocol, u.host, u.pathname, u.search, u.hash], ["https:", "flourishmoney.app", O.PLAID_OAUTH_PATH, "", ""], "1a the website's redirect_uri is https://flourishmoney.app/plaid/oauth: https, no query, no # (Plaid's rules)");
    t.eq([L.linkTokenBody({ userId: "u1", country: "US" }).redirect_uri, L.linkTokenBody({ userId: "u1", country: "US", accessToken: "access-sandbox-x" }).redirect_uri], [L.WEB_REDIRECT_URI, L.WEB_REDIRECT_URI], "1b new and update-mode link tokens both carry it");
    t.ok(L.WEB_REDIRECT_URI !== L.APP_REDIRECT_URI && !L.WEB_REDIRECT_URI.startsWith(L.APP_REDIRECT_URI) && !L.APP_REDIRECT_URI.startsWith(L.WEB_REDIRECT_URI), "1c it is not the store apps' universal link, so a phone with the app installed still returns to the website");
    t.eq(L.linkTokenBody({ userId: "u1", country: "US", native: true }).redirect_uri, L.APP_REDIRECT_URI, "1d a store app's link token keeps the app's universal link");
    const aasa = JSON.parse(fs.readFileSync(path.join(REPO, "public", ".well-known", "apple-app-site-association"), "utf8"));
    t.ok(!aasa.applinks.details.some(d => d.components.some(c => O.PLAID_OAUTH_PATH.startsWith(c["/"].replace(/\*$/, "")))), "1e the iOS app does not claim /plaid/oauth");
    const manifest = fs.readFileSync(path.join(REPO, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
    t.ok(!/plaid\/oauth/.test(manifest), "1f nor does the Android app");
  }

  // ── 2. planOAuthReturn ────────────────────────────────────────────────────────────────────────
  {
    const loc = (p, q = "") => ({ pathname: p, search: q, href: `https://flourishmoney.app${p}${q}` });
    const rec = (over = {}) => ({ mode: "web", link_token: TOKEN, intent: "onboarding", at: 1, ...over });
    t.eq([O.planOAuthReturn(loc("/"), rec()), O.planOAuthReturn(loc("/plaid/oauth"), rec()), O.planOAuthReturn(loc("/plaid/oauth", "?oauth_state_id="), rec()), O.planOAuthReturn(loc("/plaid/app", "?oauth_state_id=abc"), rec()), O.planOAuthReturn(null, rec())],
      [null, null, null, null, null], "2a only /plaid/oauth with an oauth_state_id is a return");
    const back = loc("/plaid/oauth", "?oauth_state_id=6a1b2c3d-0000-4e5f-8a9b-0123456789ab");
    t.eq(O.planOAuthReturn(back, rec({ draft: { p: { name: "Sam", country: "US", province: "NY" } } })),
      { kind: "resume", linkToken: TOKEN, receivedRedirectUri: back.href, intent: "onboarding", draft: { p: { name: "Sam", country: "US", province: "NY" } } }, "2b a return with its record: resume with the same token, the full return address and the answers so far");
    t.eq(O.planOAuthReturn(loc("/plaid/oauth/", "?oauth_state_id=abc"), rec()).kind, "resume", "2c (a trailing slash is the same page)");
    t.eq(["add", "reconnect", "onboarding", "anything", undefined].map(i => O.planOAuthReturn(back, rec({ intent: i })).intent), ["add", "reconnect", "onboarding", "onboarding", "onboarding"], "2d the intent is one of three");
    t.eq([O.planOAuthReturn(back, rec({ draft: "x" })).draft, O.planOAuthReturn(back, rec({ draft: { p: 3 } })).draft], [null, null], "2e a malformed draft is ignored");
    t.eq([O.planOAuthReturn(back, null), O.planOAuthReturn(back, rec({ mode: "hosted" })), O.planOAuthReturn(back, rec({ link_token: "" }))].map(x => x.kind), ["lost", "lost", "lost"],
      "2f a return with no usable record (another browser, a store app's record, no token) is lost, never a guess");
    const resume = O.planOAuthReturn(back, rec());
    t.eq([O.redirectUriFor(resume, TOKEN), O.redirectUriFor(resume, "link-sandbox-another-0000-000000000000"), O.redirectUriFor(null, TOKEN), O.redirectUriFor(resume, null)], [back.href, null, null, null], "2g receivedRedirectUri goes only with the token it came back for");
  }

  // ── 3. The record across the trip to the bank ─────────────────────────────────────────────────
  {
    const m = new Map();
    const store = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    const NOW = Date.parse("2026-10-15T12:00:00Z");
    H.savePlaidPending(store, { mode: "web", link_token: TOKEN, intent: "add" }, NOW);
    const back = { pathname: "/plaid/oauth", search: "?oauth_state_id=abc", href: "https://flourishmoney.app/plaid/oauth?oauth_state_id=abc" };
    t.eq(O.planOAuthReturn(back, H.readPlaidPending(store, NOW + 10 * 60000)).kind, "resume", "3a back from the bank within 30 minutes: resume");
    t.eq(O.planOAuthReturn(back, H.readPlaidPending(store, NOW + 45 * 60000)).kind, "lost", "3b after 30 minutes: lost (the link token's session is long over)");
    t.eq(H.appStorage({ get localStorage() { throw new Error("SecurityError"); } }), null, "3c a browser that blocks storage gives no storage, never an error");
    t.ok(O.planOAuthReturn(back, H.readPlaidPending(H.appStorage(undefined))).kind === "lost", "3d …and its return is lost");
  }

  // ── 4. The wiring in App.jsx ─────────────────────────────────────────────────────────────────
  {
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const hook = APP.slice(APP.indexOf("function usePlaidLinkSDK("), APP.indexOf("return { openPlaidLink"));
    const save = hook.indexOf('savePlaidPending(appStorage(), { mode: "web", link_token: linkToken, intent: i, ...(extra || {}) });'), make = hook.indexOf("window.Plaid.create({");
    t.ok(save > 0 && make > save, "4a the website writes the record before Link opens");
    t.ok(/\.\.\.\(receivedRedirectUri \? \{ receivedRedirectUri \} : \{\}\),/.test(hook) && /\}, \[native, sdkReady, linkToken, receivedRedirectUri\]\);/.test(hook), "4b receivedRedirectUri reaches Plaid.create when there is one");
    t.ok(/onSuccess: \(\.\.\.args\) => \{ clearPlaidPending\(appStorage\(\)\); onSuccessRef\.current\(\.\.\.args\); \}/.test(hook) && /onExit: \(err, meta\) => \{ if \(err\) \{[^}]*\} clearPlaidPending\(appStorage\(\)\); \}/.test(hook), "4c …and the record is removed when Link ends, success or exit");

    t.ok(/useState\(\(\)=> isNativeApp\(\) \? null : planOAuthReturn\(window\.location, readPlaidPending\(appStorage\(\)\)\)\)/.test(APP), "4d the return is read once, at load, and never in a store app");
    t.ok(/if\(plaidOAuthReturn\)\{ try\{ window\.history\.replaceState\(null,"","\/"\); \}/.test(APP), "4e the address goes back to / straight away");
    const top = APP.slice(APP.indexOf("if(!plaidOAuthReturn || !user || !hydrated || !onboarded) return;"), APP.indexOf("if(!plaidOAuthReturn || !user || !hydrated || !onboarded) return;") + 500);
    t.ok(top.length > 100 && /if\(r\.kind === "lost"\)\{ alertModal\(\{ message: OAUTH_RETURN_COPY\.lost \}\); return; \}/.test(top), "4f signed in and onboarded: a lost return is said plainly");
    t.ok(/linkIntentRef\.current = r\.intent === "reconnect" \? "reconnect" : "add";\s*setReconnectResume\(r\);\s*setReconnectToken\(r\.linkToken\);/.test(top), "4g …a resume re-opens Link through the add/reconnect path (its duplicate-bank guard included)");
    t.ok(/receivedRedirectUri: redirectUriFor\(reconnectResume, reconnectToken\)/.test(APP), "4h …with the return address for that token only");
    t.ok(/useEffect\(\(\)=>\{ if\(reconnectToken && reconnectReady\) openReconnectLink\(\); \},\[reconnectToken, reconnectReady\]\);/.test(APP), "4i …once Link can open (Plaid's script may still be loading on a fresh page)");

    t.ok(/<Onboarding\s+oauthReturn=\{plaidOAuthReturn\}\s+onOAuthReturnUsed=\{\(\)=>setPlaidOAuthReturn\(null\)\}/.test(APP), "4j still onboarding: Onboarding takes the return");
    const ob = APP.slice(APP.indexOf("const [oauthResume,setOauthResume]=useState(null);"), APP.indexOf("const [oauthResume,setOauthResume]=useState(null);") + 1500);
    t.ok(/if\(oauthReturn\.kind==="lost"\)\{ setBankError\(OAUTH_RETURN_COPY\.lost\); return; \}/.test(ob), "4k …a lost return is said on the bank step, where Connect is");
    t.ok(/if\(oauthReturn\.draft\?\.p\)\{ setP\(prev=>\(\{\.\.\.prev,\.\.\.oauthReturn\.draft\.p\}\)\); setStep\(2\); \}/.test(ob), "4l …a resume brings back the answers already given and the bank step");
    t.ok(/pending:\(\)=>\(\{ draft:\{ p \} \}\)/.test(ob) && /receivedRedirectUri:redirectUriFor\(oauthResume,linkToken\)/.test(ob), "4m …the answers travel in the record, and the return address goes with its token");
    t.ok(/if\(oauthResume && !oauthResumed\.current && plaidReady && linkToken===oauthResume\.linkToken\)\{ oauthResumed\.current=true; openPlaidLink\(\); \}/.test(ob), "4n …and Link re-opens once, when it can");
    const init = APP.slice(APP.indexOf("const initialScreen = (() => {"), APP.indexOf("const [screen,setScreen]=useState(initialScreen);"));
    t.ok(init.length > 50 && !/plaid\/oauth/.test(init), "4o /plaid/oauth is the app itself, not a separate page");
    for (const [k, v] of Object.entries(O.OAUTH_RETURN_COPY)) {
      t.ok(!/[–—]/.test(v) && !/\b(learns?|remembers?|smarter|better over time|sets? aside|holds? back)\b/i.test(v), `4p the ${k} message has no dash and none of the banned words`);
    }
  }

  t.summary("plaidOAuthReturn.test");
})();
