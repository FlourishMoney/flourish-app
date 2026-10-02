// tests/_mockSupabase.cjs — a signed-in EMPTY account, entirely on this machine.
//
// The accessibility sweep has to see the app as a person who has just signed up and added nothing
// sees it. Creating an account against production is ruled out, so the test build points
// VITE_SUPABASE_URL at the test's own local server and this answers the few calls the app makes:
//   auth   GET /auth/v1/user (the user below), token refresh (the same session), logout;
//   rest   user_data (one row: onboarded, a profile, no accounts, bills, income, debts or goals),
//          profiles (a fresh trial, as the server grants at signup), and an empty list or a quiet 201 for anything else;
//   other  /.netlify/functions/* and /api/* answer 404, as an unreachable server would.
// The session is seeded into localStorage under supabase-js's own key before the page loads, so the
// client starts signed in without ever reaching a real auth server. Nothing here is a real
// credential: the token is an unsigned JWT for a made-up user on 127.0.0.1.
"use strict";

const USER_ID = "00000000-0000-4000-8000-00000000a11e";
const EMAIL = "empty-account@a11y.test";

function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"); }

function makeSession(now = Math.floor(Date.now() / 1000)) {
  const exp = now + 24 * 3600;
  const user = { id: USER_ID, aud: "authenticated", role: "authenticated", email: EMAIL,
    email_confirmed_at: new Date((now - 86400) * 1000).toISOString(), confirmed_at: new Date((now - 86400) * 1000).toISOString(),
    created_at: new Date((now - 86400) * 1000).toISOString(), app_metadata: { provider: "email" }, user_metadata: {} };
  const access_token = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: USER_ID, email: EMAIL, role: "authenticated", aud: "authenticated", exp, iat: now })}.test-signature`;
  return { access_token, token_type: "bearer", expires_in: 24 * 3600, expires_at: exp, refresh_token: "test-refresh-token", user };
}

// supabase-js v2 stores the session under sb-<first label of the host>-auth-token.
function storageKey(supabaseUrl) { return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`; }

function emptyBlob() {
  return {
    schemaVersion: 1, savedAt: new Date(Date.now() - 3600 * 1000).toISOString(), userId: USER_ID,
    core: { onboarded: true, household: null, isPremium: false, checkInBonus: 0,
      appData: { profile: { name: "Sam", country: "CA", province: "ON" }, accounts: [], incomes: [], bills: [], debts: [], goals: [], transactions: [], bankConnected: false } },
    sideKeys: { flourish_ai_disclosure_seen: "1", flourish_ai_coach_enabled: "1", flourish_ai_third_party_consent: "1" },
  };
}

// Returns true when it answered the request.
function handle(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); return true; };
  const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
  const rows = (list) => wantsObject ? (list.length ? json(200, list[0]) : json(406, { code: "PGRST116", message: "no rows" })) : json(200, list);
  if (p.startsWith("/auth/v1/")) {
    if (p === "/auth/v1/user") return json(200, makeSession().user);
    if (p === "/auth/v1/token") return json(200, makeSession());
    if (p === "/auth/v1/logout") return json(204);
    return json(200, {});
  }
  if (p.startsWith("/rest/v1/")) {
    const table = p.slice("/rest/v1/".length);
    if (req.method !== "GET" && req.method !== "HEAD") { req.resume(); return json(201, []); }
    if (table === "user_data") return rows([{ data: emptyBlob(), updated_at: new Date().toISOString() }]);
    // A new account: the server grants the trial at signup (planFromProfile.js derivePlan).
    if (table === "profiles") return rows([{ plan: "trial", trial_started_at: new Date(Date.now() - 86400e3).toISOString(),
      trial_ends_at: new Date(Date.now() + 13 * 86400e3).toISOString(), founder_flag: false }]);
    return rows([]);
  }
  if (p.startsWith("/.netlify/") || p.startsWith("/api/") || p.startsWith("/functions/v1/")) return json(404, { error: "not available in the test" });
  return false;
}

module.exports = { USER_ID, EMAIL, makeSession, storageKey, emptyBlob, handle };
