// tests/foundingSpotConsent.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING SPOT FORM'S CONSENT (billing day; wording approved by ChatGPT and Grok, 2026-10-15).
//
// While signup is open and founding spots remain, the landing's forms say "Get my founding spot" and, under
// them, "We'll email you your founding price link. We won't send other marketing emails from this form.
// Unsubscribe any time. Who we are: see Contact below." A signup made under that line is recorded as its own
// consent version, 2026-10-26, which covers the founding link email and nothing else. Pinned:
//   1. the words and the version, the same in the browser's copy and the server's;
//   2. coverage: the founding link email, and no other email, before or after the launch, and nothing once
//      it has been sent;
//   3. join_waitlist (the real handler, fetch stubbed) accepts exactly the version the page shows for the
//      signup state: 2026-10-26 while signup is open, 2026-10-06 while it is shut; stores it; sends no
//      welcome under 2026-10-26; and a repeat signup records the new wording;
//   4. the real founding link sweep sends such a row its founding link email; the welcome sweep never asks
//      for those rows.
// Nothing is sent.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const FN = (f) => path.join(REPO, "netlify", "functions", f);
const fresh = (p) => { delete require.cache[require.resolve(p)]; return require(p); };
const KEY_NAME = ["RESEND", "API", "KEY"].join("_");
const C = require("../netlify/functions/_lib/waitlistConsent.js");
const LINE = "We'll email you your founding price link. We won't send other marketing emails from this form. Unsubscribe any time. Who we are: see Contact below.";

// Run a handler with fetch stubbed; `answer(url, opts)` decides each response.
async function withFetch(answer, fn) {
  const calls = [];
  const real = global.fetch, quiet = { e: console.error, l: console.log, w: console.warn };
  console.error = console.log = console.warn = () => {};
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || "GET", body: opts.body, headers: opts.headers || {} });
    const a = answer(String(url), opts) || { status: 200, body: [] };
    return { ok: a.ok !== undefined ? a.ok : (a.status || 200) < 300, status: a.status || 200, headers: { get: (h) => (a.headers || {})[h.toLowerCase()] || null },
      json: async () => a.body, text: async () => (a.text !== undefined ? a.text : JSON.stringify(a.body || {})) };
  };
  try { return { result: await fn(), calls }; }
  finally { global.fetch = real; Object.assign(console, { error: quiet.e, log: quiet.l, warn: quiet.w }); }
}

async function join({ open, consentVersion, insert = { status: 201, body: [{ id: "row-1", founding_position: 31 }] } }) {
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SECRET_KEY = "test-service-role";
  process.env[KEY_NAME] = "re_TESTONLY_notarealkey"; delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;
  if (open) process.env.OPEN_SIGNUP = "true"; else delete process.env.OPEN_SIGNUP;
  const beta = fresh(FN("beta.js"));
  const { result, calls } = await withFetch((u, o) => {
    if (u.includes("api.resend.com")) return { status: 200, body: { id: "x" } };
    if (u.endsWith("/rest/v1/waitlist") && o.method === "POST") return insert;
    if (u.includes("/rest/v1/waitlist")) return { status: 204, body: [] };
    return { status: 200, body: {} };
  }, () => beta.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "join_waitlist", email: "household@example.test", country: "CA", placement: "hero", consentVersion }) }));
  delete process.env.OPEN_SIGNUP;
  const ins = calls.find(c => c.method === "POST" && c.url.endsWith("/rest/v1/waitlist"));
  return { status: result.statusCode, body: JSON.parse(result.body || "{}"), insert: ins ? JSON.parse(ins.body) : null,
    patches: calls.filter(c => c.method === "PATCH").map(c => JSON.parse(c.body)), sends: calls.filter(c => c.url.includes("api.resend.com")) };
}

(async () => {
  const t = create();

  // ── 1. the words and the version ────────────────────────────────────────────────────────────────
  t.eq([C.FOUNDING_SPOT_CONSENT_VERSION, C.FOUNDING_SPOT_CONSENT_TEXT], ["2026-10-26", LINE], "1a the approved line, word for word, and its version");
  t.eq(C.CONSENT_VERSIONS["2026-10-26"].consent, LINE, "1b the version resolves to the words shown");
  const web = await import("../src/lib/waitlistConsent.js");
  t.eq([web.FOUNDING_SPOT_CONSENT_VERSION, web.FOUNDING_SPOT_CONSENT_TEXT], [C.FOUNDING_SPOT_CONSENT_VERSION, C.FOUNDING_SPOT_CONSENT_TEXT], "1c the browser's copy is the server's");
  t.eq([C.waitlistConsentVersionFor({ open: true }), C.waitlistConsentVersionFor({ open: false }), C.waitlistConsentVersionFor()], ["2026-10-26", "2026-10-06", "2026-10-06"],
    "1d the version a signup must carry: 2026-10-26 while signup is open, 2026-10-06 while it is shut");

  // ── 2. coverage: the founding link email, nothing else ──────────────────────────────────────────
  t.eq([...C.CONSENT_COVERS["2026-10-26"]], ["founding_link"], "2a 2026-10-26 covers the founding link email and nothing else");
  t.ok(C.FOUNDING_LINK_CONSENT_VERSIONS.includes("2026-10-26"), "2b …so the founding link email may go to it");
  t.ok(!C.WELCOME_CONSENT_VERSIONS.includes("2026-10-26") && !C.LAUNCH_EMAIL_CONSENT_VERSIONS.includes("2026-10-26") && !C.POST_LAUNCH_CONSENT_VERSIONS.includes("2026-10-26"),
    "2c …and it is on no other email's list");
  const KINDS = ["welcome", "update", "launch", "founding_link", "canada_launch", "founding_reminder", "founding_last_call", "store_release", "newsletter", "", undefined];
  const row = (over = {}) => ({ id: "4c1d9e2a-7b3f-4a6e-9d10-2f8a6b5c3e71", founding_position: 31, is_test: false, unsubscribed_at: null, consent_version: "2026-10-26", metadata: null, ...over });
  for (const launched of [false, true]) {
    t.eq(KINDS.filter(k => C.mayEmailWaitlistRow(row(), k, { launched })), ["founding_link"], `2d ${launched ? "after" : "before"} the launch: the founding link email, and no other kind`);
  }
  t.eq(KINDS.filter(k => C.mayEmailWaitlistRow(row({ metadata: { founding_link: { kind: "founding_link", sent_at: "2026-10-27T14:00:00Z" } } }), k)), [], "2e once it has been sent: nothing more");
  t.eq(KINDS.filter(k => C.mayEmailWaitlistRow(row({ unsubscribed_at: "2026-10-27T00:00:00Z" }), k)), [], "2f unsubscribed: nothing");
  t.eq(C.foundingEmailKindFor(row(), { launched: true }), "founding_link", "2g the founding sweep's per-row rule picks the founding link email for it");

  // ── 3. join_waitlist ────────────────────────────────────────────────────────────────────────────
  {
    const ok = await join({ open: true, consentVersion: "2026-10-26" });
    t.eq([ok.status, ok.body.joined, ok.insert && ok.insert.consent_version], [200, true, "2026-10-26"], "3a signup open: a signup carrying 2026-10-26 joins, and the row records 2026-10-26");
    t.eq(ok.sends.length, 0, "3b …and gets no welcome email (its words promised the founding link email only)");
    const stale = await join({ open: true, consentVersion: "2026-10-06" });
    t.eq([stale.status, stale.body.error, stale.body.consentVersion, stale.insert], [400, "Consent required", "2026-10-26", null],
      "3c signup open: a page still showing the launch line is refused, nothing stored, and told the current version");
    const shut = await join({ open: false, consentVersion: "2026-10-26" });
    t.eq([shut.status, shut.body.consentVersion, shut.insert], [400, "2026-10-06", null], "3d signup shut: the founding spot line is refused (it is not on the page)");
    const today = await join({ open: false, consentVersion: "2026-10-06" });
    t.eq([today.status, today.insert && today.insert.consent_version, today.sends.length], [200, "2026-10-06", 1], "3e signup shut: today's signup, today's welcome (the checks above are not blind)");
    const again = await join({ open: true, consentVersion: "2026-10-26", insert: { status: 409, body: {}, text: "" } });
    t.eq([again.status, again.body.alreadyJoined, again.patches.map(p => p.consent_version)], [200, true, ["2026-10-26"]],
      "3f a repeat signup under the founding spot line records the founding spot wording");
  }

  // ── 4. the sweeps ───────────────────────────────────────────────────────────────────────────────
  {
    process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SECRET_KEY = "test-service-role";
    process.env[KEY_NAME] = "re_TESTONLY_notarealkey"; delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;
    process.env.BILLING_ENABLED = "true"; process.env.FOUNDING_LINK_EMAIL = "true"; process.env.OPEN_SIGNUP = "true";
    const r = row({ email: "household@example.test" });
    const { result, calls } = await withFetch((u, o) => {
      if (u.includes("api.resend.com")) return { status: 200, body: {} };
      if (u.includes("/rpc/waitlist_founding_position_for_email")) return { status: 200, body: 31 };
      if ((o.method || "GET") === "PATCH") return { status: 204, body: {} };
      if (u.includes("sent_at=gte.")) return { status: 200, headers: { "content-range": "*/0" }, body: [] };
      if (u.includes("/rest/v1/waitlist?select=id,email,")) return { status: 200, body: [r] };
      return { status: 599, body: {} };
    }, () => fresh(FN("founding-link-sweep.js")).runFoundingLinkSweep());
    const sends = calls.filter(c => c.url.includes("api.resend.com")).map(c => JSON.parse(c.body));
    t.eq([result.sent, sends.map(s => [s.subject, s.tags[0].value, s.tags[1].value])], [1, [["Your founding price is ready", "founding_link", "2026-10-26"]]],
      "4a the founding link sweep sends a 2026-10-26 row its founding link email, recording the version");
    const select = decodeURIComponent(calls.find(c => c.url.includes("/rest/v1/waitlist?select=id,email,")).url);
    t.ok(/consent_version\.in\.\(2026-10-01,2026-10-05,2026-10-06,2026-10-26,pre-2026-10-01\)|consent_version=in\.\(2026-10-01,2026-10-05,2026-10-06,2026-10-26,pre-2026-10-01\)/.test(select),
      "4b …its query asks for 2026-10-26 rows");
    delete process.env.BILLING_ENABLED; delete process.env.FOUNDING_LINK_EMAIL; delete process.env.OPEN_SIGNUP;

    const w = await withFetch((u) => {
      if (u.includes("welcomed_at=gte.")) return { status: 200, headers: { "content-range": "*/0" }, body: [] };
      if (u.includes("/rest/v1/waitlist?select=")) return { status: 200, body: [] };
      return { status: 204, body: {} };
    }, () => fresh(FN("waitlist-sweep.js")).runSweep({ minAgeMs: 0 }));
    const wsel = decodeURIComponent((w.calls.find(c => c.url.includes("/rest/v1/waitlist?select=") && c.url.includes("welcomed_at=is.null")) || {}).url || "");
    t.ok(wsel.includes("consent_version=in.(2026-10-01,2026-10-05,2026-10-06)") && !wsel.includes("2026-10-26"), "4c the welcome sweep never asks for 2026-10-26 rows");
  }

  t.summary("foundingSpotConsent.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
