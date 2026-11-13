// tests/appleTokens.test.cjs
// -----------------------------------------------------------------------------
// SIGN IN WITH APPLE IS REVOKED WHEN THE ACCOUNT IS DELETED (App Store guideline 5.1.1(v), 1.1.7).
//   1  the settings: read from the environment only; any one missing means "not configured"; the .p8 pasted any way works
//      (lost line breaks, \n, spaces, quotes, no BEGIN/END, SEC1, base64 again); a bad one is logged by NAME only
//   2  the client secret: an ES256 JWT Apple can check with our key (iss team, sub client, aud appleid.apple.com, 5 min)
//   3  the sealed token opens only with the same key, account and client
//   4  Apple's two calls (token swap, revoke): the right address and fields; a failure, a refusal or a hang never throws
//   5  beta.js apple_grant: the iPhone's code is swapped and the token stored sealed, the website's token stored sealed;
//      not an Apple account, a bad grant or no settings: nothing stored, always 200
//   6  plaid.js delete_account: the kept tokens are revoked before the sign-in is deleted; a refused or failed revoke, no
//      settings or no token: the account is deleted all the same and the answer is the same as without Apple
//   7  no log line carries a token, a key, a code, an address or an account id
//   8  the app: the iPhone's code and Android's token come back from the sign-in; the website marks the sign-in and takes the
//      token from the session once; the grant is sent in the background
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const LIB = require.resolve("../netlify/functions/_lib/appleTokens.js");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const BETA_PATH = require.resolve("../netlify/functions/beta.js");
const BLOBS_PATH = require.resolve("@netlify/blobs");
const A = require(LIB);

const USER = "00000000-0000-4000-8000-0000000000a1";
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const SEAL_KEY = crypto.randomBytes(32).toString("base64");
const ENV = {
  APPLE_TEAM_ID: "TEAM000001", APPLE_SIGNIN_KEY_ID: "KEY0000001", APPLE_SIGNIN_PRIVATE_KEY: PEM,
  APPLE_CLIENT_ID_IOS: "app.example.ios", APPLE_CLIENT_ID_WEB: "app.example.web", APPLE_TOKEN_ENC_KEY: SEAL_KEY,
};
const SECRETS = ["rt-ios-secret-value", "rt-web-secret-value", "code-once-secret", SEAL_KEY, PEM.split("\n")[1], USER, "apple.person@example.invalid"];
const appleUser = { id: USER, email: "apple.person@example.invalid", app_metadata: { provider: "apple", providers: ["apple"] } };

function decodeJwt(jwt) {
  const [h, b, s] = jwt.split(".");
  return { head: JSON.parse(Buffer.from(h, "base64url")), body: JSON.parse(Buffer.from(b, "base64url")),
    verified: crypto.verify("sha256", Buffer.from(`${h}.${b}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")) };
}
const form = (init) => Object.fromEntries(new URLSearchParams(init.body));

// Every console line, kept, while fn runs.
async function logged(fn) {
  const lines = []; const saved = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(saved)) console[k] = (...a) => lines.push(a.map(String).join(" "));
  try { return { value: await fn(), lines }; } finally { Object.assign(console, saved); }
}
const leaks = (lines) => lines.filter((l) => SECRETS.some((x) => x && l.includes(x)));

// A stand-in Apple: records each call, answers as told.
function apple({ revoke = 200, token = 200, hang = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), fields: form(init) });
    if (hang) return new Promise((_, rej) => { init.signal && init.signal.addEventListener("abort", () => rej(new Error("aborted"))); });
    if (String(url).endsWith("/auth/token")) return { ok: token === 200, status: token, json: async () => ({ access_token: "at", refresh_token: "rt-ios-secret-value", id_token: "x" }) };
    return { ok: revoke === 200, status: revoke, json: async () => ({}) };
  };
  return { calls, fetchImpl };
}

(async () => {
  const t = create();

  // ── 1. Settings ─────────────────────────────────────────────────────────────────────────────
  t.ok(A.appleConfig(ENV) && A.appleConfig(ENV).clientIds.web === "app.example.web", "1a every setting present: configured");
  for (const k of Object.keys(ENV)) t.eq(A.appleConfig({ ...ENV, [k]: "" }), null, `1b ${k} missing: not configured`);
  t.eq(A.appleConfig({ ...ENV, APPLE_TOKEN_ENC_KEY: Buffer.alloc(16).toString("base64") }), null, "1c a sealing key that is not 32 bytes: not configured");
  t.eq(A.appleConfig({ ...ENV, APPLE_SIGNIN_PRIVATE_KEY: "not a key" }), null, "1d a private key that is not one: not configured");
  t.ok(A.appleConfig({ ...ENV, APPLE_SIGNIN_PRIVATE_KEY: PEM.replace(/\n/g, "\\n") }), "1e the .p8 pasted with \\n for its line breaks works");
  const body = PEM.split("\n").filter((l) => l && !l.startsWith("-----")).join("");
  t.ok(A.appleConfig({ ...ENV, APPLE_SIGNIN_PRIVATE_KEY: body }), "1f the .p8's base64 body alone works");
  t.eq(A.appleConfig({}), null, "1g nothing set (today): not configured");
  const src = fs.readFileSync(LIB, "utf8");
  t.ok(!/V8B8MR88SL|app\.flourishmoney\b(?!\.)|-----BEGIN [A-Z ]*PRIVATE KEY-----\n[A-Za-z0-9]/.test(src.replace(/\/\/.*$/gm, "")), "1h no team, client or key is written into the code: all from the environment");

  // 1i to 1x (2026-11-13): production logged not_configured with every setting set. The key must load however Netlify kept
  // it, and signing with what comes back must verify with the real public key.
  {
    const lines = PEM.trim().split("\n"), bodyLines = lines.slice(1, -1);
    const sec1 = privateKey.export({ type: "sec1", format: "pem" });
    const signs = (raw) => { const cfg = A.appleConfig({ ...ENV, APPLE_SIGNIN_PRIVATE_KEY: raw }); return !!cfg && decodeJwt(A.clientSecret(cfg, "web")).verified; };
    for (const [label, raw] of [
      ["line breaks lost (one line)", PEM.replace(/\n/g, "")],
      ["spaces where the line breaks were", PEM.replace(/\n/g, " ")],
      ["literal \\n", PEM.replace(/\n/g, "\\n")],
      ["literal \\r\\n", PEM.replace(/\n/g, "\\r\\n")],
      ["Windows line breaks", PEM.replace(/\n/g, "\r\n")],
      ["wrapped in quotes", `"${PEM}"`],
      ["wrapped in escaped quotes, with literal \\n", `\\"${PEM.replace(/\n/g, "\\n")}\\"`],
      ["no BEGIN/END lines, the body on its lines", bodyLines.join("\n")],
      ["no BEGIN/END lines, spaces between", bodyLines.join(" ")],
      ["spaces and tabs around it", `  \t${PEM}\n\n  `],
      ["a SEC1 \"EC PRIVATE KEY\"", sec1],
      ["a SEC1 key with its line breaks lost", sec1.replace(/\n/g, " ")],
      ["the whole file base64-encoded again", Buffer.from(PEM).toString("base64")],
      ["base64url body", bodyLines.join("").replace(/\+/g, "-").replace(/\//g, "_")],
      ["the setting's name pasted in front", `APPLE_SIGNIN_PRIVATE_KEY=${PEM.replace(/\n/g, "\\n")}`],
    ]) t.ok(signs(raw), `1i the key loads and signs: ${label}`);
    const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" });
    const p384 = crypto.generateKeyPairSync("ec", { namedCurve: "P-384" }).privateKey.export({ type: "pkcs8", format: "pem" });
    for (const [label, raw] of [["not base64", "this is not a key"], ["random bytes", crypto.randomBytes(120).toString("base64")],
      ["an RSA key", rsa], ["a P-384 key (Apple signs with P-256)", p384], ["half a key", PEM.slice(0, 90)], ["the Key ID by mistake", "KEY0000001"]])
      t.eq(A.pemOf(raw), null, `1j not a usable Apple key: ${label}`);
    t.eq(A.appleConfigProblems(ENV), [], "1k every setting usable: no problems");
    t.eq(A.appleConfigStatus(ENV), "ok", "1l …status ok");
    t.eq(A.appleConfigProblems({ ...ENV, APPLE_SIGNIN_PRIVATE_KEY: "this is not a key" }), ["APPLE_SIGNIN_PRIVATE_KEY unusable"], "1m an unusable key is named, nothing else");
    t.eq(A.appleConfigProblems({ ...ENV, APPLE_TEAM_ID: "", APPLE_TOKEN_ENC_KEY: "short" }), ["APPLE_TEAM_ID missing", "APPLE_TOKEN_ENC_KEY unusable"], "1n missing and unusable settings, by name");
    const bad = { ...ENV, APPLE_SIGNIN_PRIVATE_KEY: "Zm9vYmFy" + "secretish", APPLE_TOKEN_ENC_KEY: "c2hvcnQ=" };
    const st = A.appleConfigStatus(bad);
    t.ok(/^not usable: APPLE_SIGNIN_PRIVATE_KEY unusable, APPLE_TOKEN_ENC_KEY unusable$/.test(st) && !Object.values(bad).some((v) => st.includes(v)), "1o the status line names settings, never a value");
    delete require.cache[LIB];
    const fresh = require(LIB);
    const got = [];
    const log = { log: (l) => got.push(l) };
    fresh.logAppleConfigOnce("plaid", { e: ENV, log }); fresh.logAppleConfigOnce("plaid", { e: ENV, log });
    t.eq(got, ["[plaid] apple config: ok"], "1p once per function instance: \"apple config: ok\"");
    delete require.cache[LIB]; require(LIB);
  }

  // ── 2. The client secret ────────────────────────────────────────────────────────────────────
  {
    const cfg = A.appleConfig(ENV);
    const now = Date.UTC(2026, 10, 12, 18, 0, 0);
    const j = decodeJwt(A.clientSecret(cfg, "web", now));
    t.ok(j.verified, "2a signed with our key (ES256), so Apple can check it");
    t.eq(j.head, { alg: "ES256", kid: "KEY0000001", typ: "JWT" }, "2b its header names the key");
    t.eq(j.body, { iss: "TEAM000001", iat: now / 1000, exp: now / 1000 + 300, aud: "https://appleid.apple.com", sub: "app.example.web" }, "2c team, Apple, the client, five minutes");
    t.eq(decodeJwt(A.clientSecret(cfg, "ios", now)).body.sub, "app.example.ios", "2d the iPhone's own client for the iPhone's tokens");
  }

  // ── 3. Sealing ──────────────────────────────────────────────────────────────────────────────
  {
    const key = Buffer.from(SEAL_KEY, "base64");
    const sealed = A.seal(key, "rt-web-secret-value", USER, "web");
    t.ok(sealed.startsWith("v1.") && !sealed.includes("rt-web-secret-value"), "3a the stored text is not the token");
    t.eq(A.open(key, sealed, USER, "web"), "rt-web-secret-value", "3b it opens with the same key, account and client");
    t.eq([A.open(crypto.randomBytes(32), sealed, USER, "web"), A.open(key, sealed, "00000000-0000-4000-8000-000000000999", "web"), A.open(key, sealed, USER, "ios")], [null, null, null],
      "3c another key, another account or another client: it does not open");
    t.eq(A.open(key, sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA"), USER, "web"), null, "3d tampered: it does not open");
    t.ok(A.seal(key, "x", USER, "web") !== A.seal(key, "x", USER, "web"), "3e a fresh nonce every time");
  }

  // ── 4. Apple's calls ────────────────────────────────────────────────────────────────────────
  {
    const cfg = A.appleConfig(ENV);
    const ap = apple();
    t.eq(await A.exchangeCode(cfg, "code-once-secret", { fetchImpl: ap.fetchImpl }), { refreshToken: "rt-ios-secret-value" }, "4a the iPhone's code is swapped for a refresh token");
    const c = ap.calls[0];
    t.eq([c.url, c.fields.client_id, c.fields.grant_type, c.fields.code], ["https://appleid.apple.com/auth/token", "app.example.ios", "authorization_code", "code-once-secret"], "4b …at Apple's token address, as the iPhone's client");
    t.ok(decodeJwt(c.fields.client_secret).verified, "4c …with a signed client secret");
    t.eq(await A.revokeToken(cfg, "web", "rt-web-secret-value", { fetchImpl: ap.fetchImpl }), { ok: true }, "4d a revoke Apple accepts");
    const r = ap.calls[1];
    t.eq([r.url, r.fields.client_id, r.fields.token, r.fields.token_type_hint], ["https://appleid.apple.com/auth/revoke", "app.example.web", "rt-web-secret-value", "refresh_token"], "4e …at Apple's revoke address, as the client the token came from");
    t.eq(await A.revokeToken(cfg, "web", "x", { fetchImpl: apple({ revoke: 400 }).fetchImpl }), { ok: false, status: 400 }, "4f Apple refuses: an outcome, not a throw");
    t.eq(await A.revokeToken(cfg, "web", "x", { fetchImpl: async () => { throw new Error("offline"); } }), { ok: false, status: 0 }, "4g Apple cannot be reached: an outcome, not a throw");
    const t0 = Date.now();
    t.eq(await A.revokeToken(cfg, "web", "x", { fetchImpl: apple({ hang: true }).fetchImpl }), { ok: false, status: 0 }, "4h Apple hangs: given up on");
    t.ok(Date.now() - t0 < 4500, "4i …within 3 seconds, so a deletion stays inside Netlify's 10");
    t.eq((await A.exchangeCode(cfg, "c", { fetchImpl: apple({ token: 400 }).fetchImpl })).error, "exchange_failed", "4j a code Apple refuses: nothing to store");
  }

  // ── 5. beta.js apple_grant ──────────────────────────────────────────────────────────────────
  async function grant(user, g, { env = ENV, ap = apple(), upsertError = null } = {}) {
    const writes = [];
    const saved = { ...process.env }, savedFetch = global.fetch;
    for (const k of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[k];
    require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true, exports: { getStore: () => ({ async get() { return null; }, async setJSON() {} }) } };
    require.cache[AUTH_PATH] = { id: AUTH_PATH, filename: AUTH_PATH, loaded: true, exports: {
      getUserFromRequest: async () => ({ user_id: user ? user.id : null }),
      getAdminClient: () => ({ from: (table) => ({ upsert: async (row, opts) => { writes.push({ table, row, opts }); return { error: upsertError }; } }),
        auth: { admin: { getUserById: async () => ({ data: { user }, error: null }) } } }),
      getPublicClient: () => ({}),
    } };
    global.fetch = ap.fetchImpl;
    try {
      for (const k of Object.keys(ENV)) delete process.env[k];
      Object.assign(process.env, env, { SUPABASE_URL: "https://supabase.test.invalid", SUPABASE_SECRET_KEY: "test-secret-not-real" });
      const { value: res, lines } = await logged(() => require(BETA_PATH).handler({ httpMethod: "POST", headers: { origin: "capacitor://localhost", authorization: "Bearer x" }, body: JSON.stringify({ action: "apple_grant", grant: g }) }));
      return { status: res.statusCode, body: JSON.parse(res.body || "{}"), writes, lines, calls: ap.calls };
    } finally {
      for (const k of [AUTH_PATH, BETA_PATH, BLOBS_PATH]) delete require.cache[k];
      process.env = saved; global.fetch = savedFetch;
    }
  }
  const key = Buffer.from(SEAL_KEY, "base64");
  {
    const r = await grant(appleUser, { code: "code-once-secret" });
    t.eq([r.status, r.body], [200, { stored: true }], "5a the iPhone's code: stored");
    t.eq([r.writes.length, r.writes[0].table, r.writes[0].row.client, r.writes[0].opts], [1, "apple_tokens", "ios", { onConflict: "user_id,client" }], "5b …one row in apple_tokens, as the iPhone's, replacing an older one");
    t.eq(A.open(key, r.writes[0].row.sealed, USER, "ios"), "rt-ios-secret-value", "5c …holding Apple's refresh token, sealed");
    t.eq(leaks(r.lines), [], "5d …and no log line carries the code, the token or the account");
  }
  {
    const r = await grant(appleUser, { refresh_token: "rt-web-secret-value" });
    t.eq([r.body, r.writes[0].row.client, A.open(key, r.writes[0].row.sealed, USER, "web"), r.calls.length], [{ stored: true }, "web", "rt-web-secret-value", 0],
      "5e the website's token: stored sealed as the website's, with no call to Apple");
  }
  {
    const google = { ...appleUser, app_metadata: { provider: "google", providers: ["google"] } };
    const r = await grant(google, { refresh_token: "rt-web-secret-value" });
    t.eq([r.status, r.body, r.writes.length], [200, { stored: false }, 0], "5f not an Apple account: nothing stored");
    const n = await grant(appleUser, { code: "code-once-secret" }, { env: {} });
    t.eq([n.status, n.body, n.writes.length, n.calls.length], [200, { stored: false }, 0, 0], "5g no settings yet: nothing stored, nothing asked of Apple, still 200");
    t.ok(n.lines.some((l) => /apple_grant\] not stored: not_configured/.test(l)), "5h …and the log says why");
    const b = await grant(appleUser, { nonsense: 1 });
    t.eq([b.status, b.body, b.writes.length], [200, { stored: false }, 0], "5i a grant that is neither: nothing stored");
    const f = await grant(appleUser, { refresh_token: "rt-web-secret-value" }, { upsertError: { message: "relation apple_tokens does not exist" } });
    t.eq([f.status, f.body], [200, { stored: false }], "5j before 0049 runs: nothing stored, still 200");
    const u = await grant(null, { refresh_token: "x" });
    t.eq(u.status, 401, "5k signed out: refused");
  }

  // ── 6. plaid.js delete_account ──────────────────────────────────────────────────────────────
  async function del({ rows, env = ENV, ap = apple(), user = appleUser, authDeleteFails = false } = {}) {
    const order = [];
    const admin = {
      from: (table) => ({
        select: () => ({ eq: async () => {
          if (table === "plaid_items") return { data: [], error: null };
          if (table === "apple_tokens") return rows instanceof Error ? { data: null, error: { message: rows.message } } : { data: rows || [], error: null };
          return { data: [], error: null };
        } }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      }),
      rpc: async () => ({ data: { result: "left" }, error: null }),
      auth: { admin: {
        getUserById: async () => ({ data: { user } }),
        deleteUser: async () => { order.push("deleteUser"); return authDeleteFails ? { error: { message: "no" } } : { error: null }; },
      } },
    };
    const saved = { ...process.env }, savedFetch = global.fetch;
    delete require.cache[PLAID_PATH]; delete require.cache[AUTH_PATH];
    const real = require(AUTH_PATH);
    require.cache[AUTH_PATH].exports = { ...real, getUserFromRequest: async () => ({ user_id: USER }), getAdminClient: () => admin };
    global.fetch = async (url, init) => { order.push(String(url).includes("appleid.apple.com") ? "apple" : "other"); return ap.fetchImpl(url, init); };
    try {
      for (const k of Object.keys(ENV)) delete process.env[k];
      Object.assign(process.env, env, { PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret" });
      const { handler } = require(PLAID_PATH);
      const { value: res, lines } = await logged(() => handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify({ action: "delete_account" }) }));
      return { body: JSON.parse(res.body || "{}"), order, lines, calls: ap.calls };
    } finally {
      delete require.cache[PLAID_PATH]; delete require.cache[AUTH_PATH];
      process.env = saved; global.fetch = savedFetch;
    }
  }
  const both = [{ client: "ios", sealed: A.seal(key, "rt-ios-secret-value", USER, "ios") }, { client: "web", sealed: A.seal(key, "rt-web-secret-value", USER, "web") }];
  const plain = { deleted: true, partial: false, errors: [] };
  {
    const r = await del({ rows: both });
    t.eq(r.body, plain, "6a every token revoked: the account is deleted, the answer as ever");
    t.eq(r.calls.map((c) => [c.fields.client_id, c.fields.token]).sort(), [["app.example.ios", "rt-ios-secret-value"], ["app.example.web", "rt-web-secret-value"]], "6b …each token revoked as the client it came from");
    t.eq(r.order.slice(-3), ["apple", "apple", "deleteUser"], "6c …before the sign-in itself is deleted");
    t.eq(r.lines.filter((l) => /apple revoke: revoked/.test(l)).length, 2, "6d …and logged as revoked");
    t.eq(leaks(r.lines), [], "6e no log line carries a token, a key or the account");
  }
  for (const [label, opts, outcome] of [
    ["Apple refuses", { rows: both, ap: apple({ revoke: 400 }) }, /apple revoke: failed client=(ios|web) status=400/],
    ["Apple is down", { rows: both, ap: apple({ revoke: 503 }) }, /apple revoke: failed client=(ios|web) status=503/],
    ["Apple hangs", { rows: both.slice(0, 1), ap: apple({ hang: true }) }, /apple revoke: failed client=ios status=0/],
    ["no settings yet", { rows: both, env: {} }, /apple revoke: not_configured/],
    ["a private key that cannot be used", { rows: both, env: { ...ENV, APPLE_SIGNIN_PRIVATE_KEY: "this is not a key" } }, /apple revoke: not_configured \(APPLE_SIGNIN_PRIVATE_KEY unusable\)$/],
    ["no token was ever kept", { rows: [] }, /apple revoke: no_token/],
    ["apple_tokens cannot be read (0049 not run)", { rows: new Error("relation does not exist") }, /apple revoke: unreadable/],
    ["a token sealed with another key", { rows: [{ client: "web", sealed: A.seal(crypto.randomBytes(32), "x", USER, "web") }] }, /apple revoke: unreadable client=web/],
  ]) {
    const r = await del(opts);
    t.eq(r.body, plain, `6f ${label}: the account is still deleted, and the person is told nothing new`);
    t.ok(r.order[r.order.length - 1] === "deleteUser" && r.lines.some((l) => outcome.test(l)), `6g ${label}: logged as an outcome only`);
    t.eq(leaks(r.lines), [], `6h ${label}: no personal data in the log`);
  }
  {
    const google = { ...appleUser, app_metadata: { provider: "google", providers: ["google"] } };
    const r = await del({ rows: [], user: google });
    t.eq([r.body, r.calls.length, r.lines.some((l) => /apple revoke/.test(l))], [plain, 0, false], "6i not an Apple account: nothing asked of Apple, nothing logged about it");
  }

  // ── 8. The app ──────────────────────────────────────────────────────────────────────────────
  {
    const S = await import(path.join(REPO, "src", "lib", "socialSignIn.js"));
    const G = await import(path.join(REPO, "src", "lib", "appleGrant.js"));
    const supa = (extra = {}) => ({ auth: {
      signInWithIdToken: async () => ({ error: null }),
      signInWithOAuth: async () => ({ data: { url: "https://appleid.apple.com/auth/authorize?x" }, error: null }),
      setSession: async (s) => { supa.last = s; return { error: null }; },
      exchangeCodeForSession: async () => ({ data: { session: { provider_refresh_token: "rt-web-secret-value" } }, error: null }),
      ...extra } });
    const appleSignIn = { authorize: async () => ({ response: { identityToken: "id.token.x", authorizationCode: "code-once-secret" } }) };
    t.eq(await S.signInWithProvider("apple", { supabase: supa(), native: true, platform: "ios", appleSignIn }), { ok: true, appleGrant: { code: "code-once-secret" } },
      "8a iPhone: Apple's one-time code comes back with the sign-in");
    t.eq(await S.signInWithProvider("apple", { supabase: supa({ signInWithIdToken: async () => ({ error: { message: "x" } }) }), native: true, platform: "ios", appleSignIn }), { ok: false },
      "8b …and not when the sign-in failed");
    const tab = (url) => ({ open: async () => { setTimeout(() => tab.cb(url), 5); }, close: async () => {}, addListener: async () => ({ remove() {} }) });
    const listener = (cb) => { tab.cb = cb; return () => {}; };
    const frag = "flourishmoney://auth-callback#access_token=a&refresh_token=r&provider_refresh_token=rt-web-secret-value";
    const s1 = supa();
    t.eq(await S.signInWithProvider("apple", { supabase: s1, native: true, platform: "android", browser: tab(frag), appListener: listener }), { ok: true, appleGrant: { refresh_token: "rt-web-secret-value" } },
      "8c Android: Apple's refresh token from the callback comes back with the sign-in");
    t.eq(supa.last, { access_token: "a", refresh_token: "r" }, "8d …and Supabase is given only its own session");
    t.eq(await S.signInWithProvider("google", { supabase: supa(), native: true, platform: "android", browser: tab(frag), appListener: listener }), { ok: true }, "8e Google: no Apple grant");
    t.eq(await S.signInWithProvider("apple", { supabase: supa(), native: true, platform: "android", browser: tab("flourishmoney://auth-callback?code=c1"), appListener: listener }), { ok: true, appleGrant: { refresh_token: "rt-web-secret-value" } },
      "8f Android, the code flow: the token from the exchanged session");
    const store = new Map(); const ss = { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    await S.signInWithProvider("apple", { supabase: supa(), native: false, origin: "https://flourishmoney.app", storage: ss });
    t.eq(store.get(G.APPLE_GRANT_FLAG), "1", "8g website: leaving for Apple marks the sign-in");
    t.eq(G.takeWebAppleGrant({ provider_refresh_token: "rt-web-secret-value" }, ss), { refresh_token: "rt-web-secret-value" }, "8h back with the session: the token is taken");
    t.eq([store.has(G.APPLE_GRANT_FLAG), G.takeWebAppleGrant({ provider_refresh_token: "rt-web-secret-value" }, ss)], [false, null], "8i …once: the mark is gone");
    await S.signInWithProvider("google", { supabase: supa(), native: false, origin: "https://flourishmoney.app", storage: ss });
    t.eq(store.has(G.APPLE_GRANT_FLAG), false, "8j a Google sign-in on the website marks nothing");
    const sent = [];
    t.eq(await G.sendAppleGrant({ grant: { code: "c" }, jwt: "j", apiBase: "https://x.invalid", fetchImpl: async (u, i) => { sent.push([u, i.headers.Authorization, JSON.parse(i.body)]); return { ok: true }; } }), true, "8k the grant is sent");
    t.eq(sent, [["https://x.invalid/api/beta", "Bearer j", { action: "apple_grant", grant: { code: "c" } }]], "8l …signed in, to apple_grant");
    t.eq(await G.sendAppleGrant({ grant: { code: "c" }, jwt: "j", fetchImpl: async () => { throw new Error("offline"); } }), false, "8m a failed send never throws");
    const APP = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/if \(res && res\.ok && res\.appleGrant\) \(async \(\) => \{[^\n]*sendAppleGrant\(\{ grant: res\.appleGrant/.test(APP), "8n the app sends the iPhone's and Android's grant after the sign-in, not waited for");
    t.ok(/const grant = takeWebAppleGrant\(s, appleGrantStorage\(\)\);\s*if \(grant && s\?\.access_token\) sendAppleGrant/.test(APP), "8o the website sends its grant when the session lands");
  }

  // ── 9. The deletion pages say nothing new ───────────────────────────────────────────────────
  {
    const fn = fs.readFileSync(PLAID_PATH, "utf8");
    const at = fn.indexOf("await revokeAppleTokens(admin, user_id, appleUser);"), del = fn.indexOf("await admin.auth.admin.deleteUser(user_id);");
    t.ok(at > 0 && at < del && !/errors\.push\([^)]*apple/i.test(fn), "9a the revoke runs right before the sign-in is deleted and never adds to the answer's errors");
  }

  t.summary("appleTokens.test");
})();
