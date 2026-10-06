// tests/betaLogging.test.cjs
// -----------------------------------------------------------------------------
// EVERY /api/beta RESPONSE WRITES ONE LOG LINE, AND NO LOG LINE EVER CARRIES AN EMAIL.
//
// A refused signup (wrong consent version, bad email, unknown placement) used to return a 400 and log
// nothing, and Netlify's function logs carry no status codes, so refusals could not be counted. The
// handler now writes `[beta] action= status= reason= src= placement= consentVersion=` per response.
// This drives the real handler down every path, with Supabase answered by a stub `fetch`, and checks
// every console line written: exactly one [beta] line per call, the right fields, no email, no IP.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

const EMAIL = "Some.Person+tag@example.com";
const IP = "203.0.113.77";

(async () => {
  const t = create();
  Object.assign(process.env, { SUPABASE_URL: "https://stub.supabase.invalid", SUPABASE_SECRET_KEY: "stub", BETA_CODES: "TESTCODE" });
  let insertStatus = 201;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "content-range": "0-0/3" } });
    if (u.includes("/rest/v1/waitlist") && opts.method === "POST") return insertStatus === 201 ? json(201, [{ id: 1 }]) : json(insertStatus, { code: insertStatus === 409 ? "23505" : "XX000" });
    return json(200, []);
  };
  const { handler } = require("../netlify/functions/beta.js");
  const { CONSENT_VERSION } = require("../netlify/functions/_lib/waitlistConsent.js");

  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.map(String).join(" "));
  const call = async (body, method = "POST") => {
    const from = lines.length;
    const res = await handler({ httpMethod: method, body: JSON.stringify(body), headers: { origin: "https://flourishmoney.app", "x-nf-client-connection-ip": IP, "x-forwarded-for": IP } });
    const mine = lines.slice(from).filter((l) => l.startsWith("[beta] action="));
    return { res, mine };
  };
  const join = (over = {}) => ({ action: "join_waitlist", email: EMAIL, placement: "hero", src: "meta_a", metadata: { referrer: "https://x.test/?e=" + EMAIL }, consentVersion: CONSENT_VERSION, ...over });

  const cases = [
    ["join ok", join(), 200, "ok"],
    ["join already", join(), 200, "alreadyJoined", () => { insertStatus = 409; }],
    ["join server error", join(), 500, "Failed_to_join_waitlist", () => { insertStatus = 500; }],
    ["consent mismatch", join({ consentVersion: "2026-01-01" }), 400, "Consent_required"],
    ["bad email", join({ email: "not-an-email" }), 400, "Valid_email_required"],
    ["unknown placement", join({ placement: "nowhere" }), 400, "Unknown_placement"],
    // No Blobs store in tests, so the limiter refuses: this is the rate-limit path.
    ["validate (rate limited)", { action: "validate", code: "TESTCODE" }, 429, "rate_limited"],
    ["resend bad email", { action: "resend_confirmation", email: "x" }, 400, "invalid_email"],
    ["signup weak password", { action: "signup", email: EMAIL, password: "x", code: "TESTCODE" }, 200, "weak_password"],
    ["signup_status", { action: "signup_status" }, 200, "ok"],
    ["count", { action: "count" }, 200, "ok"],
  ];
  for (const [name, body, status, reason, before] of cases) {
    if (before) before(); else insertStatus = 201;
    const { res, mine } = await call(body);
    t.eq(res.statusCode, status, `${name}: response status unchanged`);
    t.eq(mine.length, 1, `${name}: exactly one [beta] line`);
    t.ok(mine[0] && mine[0].includes(`status=${status} reason=${reason}`), `${name}: line names status and reason (${mine[0]})`);
  }
  // Non-POST and unparseable bodies still log, safely.
  t.eq((await call({}, "GET")).mine.length, 1, "a GET is logged");
  t.ok((await call(join({ src: EMAIL, placement: EMAIL, consentVersion: EMAIL }))).mine[0].includes("src=other placement=other consentVersion=other"), "free text in a logged field is reduced to 'other'");

  for (const k of Object.keys(orig)) console[k] = orig[k];
  const leaks = lines.filter((l) => /[^\s@]+@[^\s@]+\.[^\s@]+/.test(l) || l.toLowerCase().includes(EMAIL.toLowerCase()) || l.includes(IP));
  t.eq(leaks, [], "no console line from any path carries an email or the IP");
  t.ok(lines.filter((l) => l.startsWith("[beta] action=")).length >= cases.length + 2, "the check read real log lines");
  t.summary("betaLogging.test");
})();
