// netlify/functions/_lib/appleTokens.js
// -----------------------------------------------------------------------------
// SIGN IN WITH APPLE: KEEPING THE REFRESH TOKEN, AND REVOKING IT WHEN THE ACCOUNT IS DELETED (App Store guideline
// 5.1.1(v), 1.1.7, 2026-11-12).
//
// Apple revokes a user's tokens only when asked with one of them, so one has to be kept from the sign-in:
//   iPhone (client "ios", app.flourishmoney)   Apple's sheet gives the app a one-time authorization code (5 minutes). The
//                                               server swaps it at Apple for a refresh token (beta.js apple_grant).
//   website and Android (client "web",         Supabase swapped the code itself and hands the app Apple's refresh token
//   app.flourishmoney.web)                      once, as the session's provider_refresh_token; the app passes it on.
// The refresh token is sealed with AES-256-GCM (APPLE_TOKEN_ENC_KEY, bound to the account and the client) before it is
// stored (migration 0049 apple_tokens). On its own a refresh token is useless: using it, or revoking it, needs a client
// secret signed with our Apple key, which only Netlify holds.
//
// Everything here reads Netlify environment variables only:
//   APPLE_TEAM_ID              the Apple Developer team
//   APPLE_SIGNIN_KEY_ID        the Key ID of the Sign in with Apple key
//   APPLE_SIGNIN_PRIVATE_KEY   that key's .p8 file, however it was pasted (pemOf rebuilds it from its bytes)
//   APPLE_CLIENT_ID_IOS        the iPhone app's bundle ID
//   APPLE_CLIENT_ID_WEB        the website's Services ID
//   APPLE_TOKEN_ENC_KEY        32 random bytes, base64: seals the stored tokens
// Missing or unusable: nothing is stored or revoked, nothing fails, and the log names the setting (never its value).
// Nothing here throws, and nothing here logs a token, a key, an address or an account id: only an outcome and Apple's
// HTTP status.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");

const APPLE = "https://appleid.apple.com";
const CLIENTS = Object.freeze(["ios", "web"]);
// Netlify stops a function at 10 s and an account deletion does a lot before this: Apple gets 3 s, both clients at once.
const TIMEOUT_MS = 3000;

const env = (k, e) => String((e || process.env)[k] || "").trim();

/**
 * The .p8 key as a PEM Node can sign with, however Netlify kept it: real line breaks, lost line breaks (one line, or
 * spaces where they were), literal \n or \r\n, wrapping quotes, the base64 body with no BEGIN/END lines, a SEC1
 * "EC PRIVATE KEY", or the whole file base64-encoded once more. The key itself is rebuilt from its bytes, so only a
 * real P-256 key comes back. null when it is not one. Never throws, never logs.
 */
function pemOf(raw, depth = 0) {
  let v = String(raw == null ? "" : raw).trim().replace(/^APPLE_SIGNIN_PRIVATE_KEY\s*=\s*/, "");
  v = v.replace(/^(\\?["'])+|(\\?["'])+$/g, "").replace(/\\r\\n|\\n|\\r/g, "\n").trim();
  if (!v) return null;
  const sec1 = /-----BEGIN EC PRIVATE KEY-----/.test(v);
  let body = v.replace(/-----(BEGIN|END)[^-]*-----/g, "").replace(/\s+/g, "");
  if (/[-_]/.test(body) && !/[+/]/.test(body)) body = body.replace(/-/g, "+").replace(/_/g, "/");   // base64url
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  const der = Buffer.from(body, "base64");
  if (depth === 0) {
    const text = der.toString("utf8");
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return pemOf(text, 1);   // the file, base64-encoded again
  }
  for (const type of sec1 ? ["sec1", "pkcs8"] : ["pkcs8", "sec1"]) {
    try {
      const k = crypto.createPrivateKey({ key: der, format: "der", type });
      const curve = k.asymmetricKeyDetails && k.asymmetricKeyDetails.namedCurve;
      if (k.asymmetricKeyType === "ec" && (!curve || curve === "prime256v1")) return k.export({ type: "pkcs8", format: "pem" }).toString();
    } catch { /* the other encoding */ }
  }
  return null;
}

/** The 32-byte sealing key, or null. */
function sealKeyOf(raw) {
  try { const k = Buffer.from(String(raw || "").trim(), "base64"); return k.length === 32 ? k : null; } catch { return null; }
}

/** Only what sealing and opening need (APPLE_TOKEN_ENC_KEY). null when it is missing or not 32 bytes. */
function sealConfig(e) {
  const key = sealKeyOf(env("APPLE_TOKEN_ENC_KEY", e));
  return key ? { key } : null;
}

/**
 * Which settings stop a call to Apple, by NAME only ("APPLE_SIGNIN_PRIVATE_KEY unusable"), for the logs. [] when none.
 * Never a value, never a length.
 */
function appleConfigProblems(e) {
  const out = [];
  const check = (name, ok) => { if (!env(name, e)) out.push(`${name} missing`); else if (!ok()) out.push(`${name} unusable`); };
  check("APPLE_TEAM_ID", () => true);
  check("APPLE_SIGNIN_KEY_ID", () => true);
  check("APPLE_SIGNIN_PRIVATE_KEY", () => !!pemOf(env("APPLE_SIGNIN_PRIVATE_KEY", e)));
  check("APPLE_CLIENT_ID_IOS", () => true);
  check("APPLE_CLIENT_ID_WEB", () => true);
  check("APPLE_TOKEN_ENC_KEY", () => !!sealConfig(e));
  return out;
}

/** One line for a log: "ok", or the settings that are missing or unusable, by name. */
function appleConfigStatus(e) {
  const p = appleConfigProblems(e);
  return p.length ? `not usable: ${p.join(", ")}` : "ok";
}

/**
 * Once per warm function instance: "[plaid] apple config: ok", or which settings are missing or unusable, by name. So
 * whether production can sign for Apple is readable in the function log without any value being printed.
 */
let configLogged = false;
function logAppleConfigOnce(tag, { e, log = console } = {}) {
  if (configLogged) return;
  configLogged = true;
  try { log.log(`[${tag}] apple config: ${appleConfigStatus(e)}`); } catch { /* a log line never stops a request */ }
}

/** Everything a call to Apple needs. null when any of it is missing or unusable. */
function appleConfig(e) {
  const seal = sealConfig(e);
  const teamId = env("APPLE_TEAM_ID", e), keyId = env("APPLE_SIGNIN_KEY_ID", e);
  const pem = pemOf(env("APPLE_SIGNIN_PRIVATE_KEY", e));
  const clientIds = { ios: env("APPLE_CLIENT_ID_IOS", e), web: env("APPLE_CLIENT_ID_WEB", e) };
  if (!seal || !teamId || !keyId || !pem || !clientIds.ios || !clientIds.web) return null;
  return { key: seal.key, teamId, keyId, pem, clientIds };
}

const b64u = (b) => Buffer.from(b).toString("base64url");

/** The client secret Apple asks for: an ES256 JWT signed with our key, for one client, good for five minutes. */
function clientSecret(cfg, client, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = b64u(JSON.stringify({ alg: "ES256", kid: cfg.keyId, typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: cfg.teamId, iat, exp: iat + 300, aud: APPLE, sub: cfg.clientIds[client] }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: cfg.pem, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

/** Seal a token for one account and client. The account and client are bound in, so a row moved elsewhere will not open. */
function seal(key, token, userId, client) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(`${userId}:${client}`));
  const ct = Buffer.concat([c.update(String(token), "utf8"), c.final()]);
  return `v1.${b64u(Buffer.concat([iv, c.getAuthTag(), ct]))}`;
}

/** The token back, or null when it does not open (another key, another account, tampered). */
function open(key, sealed, userId, client) {
  try {
    if (typeof sealed !== "string" || !sealed.startsWith("v1.")) return null;
    const raw = Buffer.from(sealed.slice(3), "base64url");
    if (raw.length < 29) return null;
    const d = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    d.setAAD(Buffer.from(`${userId}:${client}`));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch { return null; }
}

async function postForm(fetchImpl, url, fields) {
  const ac = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), TIMEOUT_MS) : null;
  try {
    return await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString(), signal: ac ? ac.signal : undefined });
  } finally { if (timer) clearTimeout(timer); }
}

/** iPhone: swap the sheet's one-time code for a refresh token. { refreshToken } or { error, status }. */
async function exchangeCode(cfg, code, { fetchImpl = fetch, now } = {}) {
  try {
    const r = await postForm(fetchImpl, `${APPLE}/auth/token`, { client_id: cfg.clientIds.ios, client_secret: clientSecret(cfg, "ios", now), code: String(code), grant_type: "authorization_code" });
    if (!r || !r.ok) return { error: "exchange_failed", status: (r && r.status) || 0 };
    const j = await r.json().catch(() => null);
    return j && typeof j.refresh_token === "string" && j.refresh_token ? { refreshToken: j.refresh_token } : { error: "no_refresh_token", status: r.status };
  } catch { return { error: "exchange_failed", status: 0 }; }
}

/** Revoke one refresh token at Apple. { ok: true } or { ok: false, status }. */
async function revokeToken(cfg, client, token, { fetchImpl = fetch, now } = {}) {
  try {
    const r = await postForm(fetchImpl, `${APPLE}/auth/revoke`, { client_id: cfg.clientIds[client], client_secret: clientSecret(cfg, client, now), token: String(token), token_type_hint: "refresh_token" });
    return r && r.ok ? { ok: true } : { ok: false, status: (r && r.status) || 0 };
  } catch { return { ok: false, status: 0 }; }
}

const isApple = (user) => {
  const m = (user && user.app_metadata) || {};
  const providers = Array.isArray(m.providers) ? m.providers : (m.provider ? [m.provider] : []);
  return providers.includes("apple") || (Array.isArray(user && user.identities) && user.identities.some((i) => i && i.provider === "apple"));
};

/**
 * Keep an Apple grant for this account (beta.js apple_grant). grant: { code } from the iPhone, or { refresh_token } from
 * the website or Android. Resolves { stored, reason }; never throws.
 */
async function storeGrant(admin, userId, grant, { e, fetchImpl = fetch, now } = {}) {
  const g = grant && typeof grant === "object" ? grant : {};
  let client, token;
  if (typeof g.code === "string" && g.code.length > 0 && g.code.length <= 1024) {
    const cfg = appleConfig(e);
    if (!cfg) return { stored: false, reason: "not_configured", problems: appleConfigProblems(e) };
    const x = await exchangeCode(cfg, g.code, { fetchImpl, now });
    if (x.error) return { stored: false, reason: x.error, status: x.status };
    client = "ios"; token = x.refreshToken;
  } else if (typeof g.refresh_token === "string" && g.refresh_token.length > 0 && g.refresh_token.length <= 2048) {
    client = "web"; token = g.refresh_token;
  } else {
    return { stored: false, reason: "bad_grant" };
  }
  const sc = sealConfig(e);
  if (!sc) return { stored: false, reason: "not_configured", problems: appleConfigProblems(e).filter((x) => x.startsWith("APPLE_TOKEN_ENC_KEY")) };
  try {
    const { error } = await admin.from("apple_tokens").upsert(
      { user_id: userId, client, sealed: seal(sc.key, token, userId, client), updated_at: new Date(now || Date.now()).toISOString() },
      { onConflict: "user_id,client" });
    return error ? { stored: false, reason: "store_failed" } : { stored: true, client };
  } catch { return { stored: false, reason: "store_failed" }; }
}

/**
 * At account deletion (plaid.js delete_account), just before the sign-in itself is deleted: revoke every Apple token kept
 * for the account. Best effort by design: whatever happens here, the deletion goes on, and the person is told nothing new.
 * Resolves a list of outcomes (for tests); logs one line per outcome with no personal data. Never throws.
 */
async function revokeForAccount(admin, userId, user, { e, fetchImpl = fetch, now, log = console } = {}) {
  const out = [];
  const say = (outcome, extra = "") => { out.push(outcome); try { (outcome === "revoked" ? log.log : log.warn).call(log, `[delete_account] apple revoke: ${outcome}${extra}`); } catch { /* a log line never stops a deletion */ } };
  try {
    const { data, error } = await admin.from("apple_tokens").select("client, sealed").eq("user_id", userId);
    const rows = !error && Array.isArray(data) ? data.filter((r) => r && CLIENTS.includes(r.client) && typeof r.sealed === "string") : [];
    if (!rows.length) { if (isApple(user)) say(error ? "unreadable" : "no_token"); return out; }
    const cfg = appleConfig(e);
    if (!cfg) { say("not_configured", ` (${appleConfigProblems(e).join(", ")})`); return out; }
    await Promise.all(rows.map(async (r) => {
      const token = open(cfg.key, r.sealed, userId, r.client);
      if (!token) { say("unreadable", ` client=${r.client}`); return; }
      const res = await revokeToken(cfg, r.client, token, { fetchImpl, now });
      if (res.ok) say("revoked", ` client=${r.client}`);
      else say("failed", ` client=${r.client} status=${res.status}`);
    }));
  } catch { say("failed", " status=0"); }
  return out;
}

module.exports = { APPLE, CLIENTS, appleConfig, appleConfigProblems, appleConfigStatus, logAppleConfigOnce, sealConfig, pemOf, clientSecret, seal, open, exchangeCode, revokeToken, storeGrant, revokeForAccount, isApple };
