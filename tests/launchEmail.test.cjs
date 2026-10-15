// tests/launchEmail.test.cjs
// -----------------------------------------------------------------------------
// THE LAUNCH EMAIL FOR THE PRE-2026-10-01 ROWS (billing day, round 4).
//
// Those rows joined before the consent line existed, from a form that said "we'll email you the moment
// flourish launches" and "No spam, just the launch news." Amanda decided (2026-10-14) that October 26 with
// signup open is that launch. So they get one email: the launch news, carrying their founding link. Pinned:
//   1. the words, exactly; the one price is the landing page's sentence; the link carries nothing personal;
//   2. the CASL footer, as on the founding link email, recording the version they agreed to;
//   3. who gets it: pre-2026-10-01 only, and only with signup open; never a row that also gets the founding
//      link email; never twice;
//   4. the sweep, run for real against a stubbed fetch, with OPEN_SIGNUP on and off. Nothing is sent.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");

const SWEEP = path.join(__dirname, "..", "netlify", "functions", "founding-link-sweep.js");
const E = require("../netlify/functions/_lib/foundingLinkEmail.js");
const U = require("../netlify/functions/_lib/waitlistUnsubscribe.js");
const C = require("../netlify/functions/_lib/waitlistConsent.js");
const KEY_NAME = ["RESEND", "API", "KEY"].join("_");
const LEGACY = C.LEGACY_CONSENT_VERSION;
const ADDRESS = "early.household@example.test";
const ROW = Object.freeze({ id: "3b1f7e20-5c44-4b1e-9a77-0c2d6e8f1a23", founding_position: 2, is_test: false, unsubscribed_at: null, consent_version: LEGACY });

(async () => {
  const t = create();
  const saved = { ...process.env };
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;
  const O = await import("../src/lib/foundingOffer.js");

  // ── 1. the words ────────────────────────────────────────────────────────────────────────────────
  const p = E.foundingLinkEmailPayload(ADDRESS, ROW, { launched: true });
  {
    t.ok(p !== null, "1a a pre-2026-10-01 founding household, signup open: the launch email");
    t.eq(p.subject, "flourish has launched in Canada", "1b the subject");
    t.eq(E.launchParagraphs(2), [
      "flourish has launched in Canada. When you joined the waitlist, you asked us to email you when it did, so here it is.",
      "You joined early, so you're founding household #2 of 50, and your founding price is ready:",
      "$79.99 a year plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet available in the iPhone and Android apps.",
      "Your link: https://flourishmoney.app/?checkout=founding",
      "Sign in or create your account with the email address this message was sent to, then choose Founding Annual. Your founding price is matched to this address.",
      "This is the one email you asked for when you joined, so we won't send you anything else from the waitlist.",
      "Questions? Just reply to this email.",
      "Amanda, founder of Flourish",
    ], "1c the words, exactly (changing one is a deliberate edit here)");
    t.eq(E.LANDING_PRICE_SENTENCE, O.foundingOfferCopy().price, "1d the price sentence is the landing page's, word for word");
    const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?/g;
    for (const [part, body] of [["text", p.text], ["html", p.html]]) {
      t.eq(body.split(E.LANDING_PRICE_SENTENCE).join("").match(MONEY), null, `1e the ${part} names no other price`);
    }
    t.ok(p.text.includes(E.FOUNDING_LINK_URL) && p.html.includes(`href="${E.FOUNDING_LINK_URL}"`), "1f the same founding link, in text and html");
    t.eq([p.text.includes(ADDRESS), p.html.includes(ADDRESS), p.to], [false, false, [ADDRESS]], "1g the address is only in `to`");
    t.ok(!/—/.test(p.text + p.subject), "1h no em dash in it (house style for marketing copy)");
    t.ok(p.html.includes("<title>flourish has launched in Canada</title>"), "1i the html carries the same subject");
  }

  // ── 2. the footer ───────────────────────────────────────────────────────────────────────────────
  {
    const url = U.unsubscribeUrl(ROW.id);
    t.eq(p.text.split("\n\n").slice(-5), [
      "You're receiving this because you joined the waitlist at flourishmoney.app.",
      `Consent on record: version ${LEGACY}.`,
      ...E.CONTACT_BLOCK,
      `Unsubscribe with one click: ${url}`,
    ], "2a the CASL footer: why, the version they agreed to, the Contact block, one-click unsubscribe");
    t.eq([p.headers["List-Unsubscribe-Post"], p.tags], ["List-Unsubscribe=One-Click", [{ name: "kind", value: "launch" }, { name: "consent_version", value: LEGACY }]],
      "2b one-click headers, and Resend records it as the launch email under the legacy version");
  }

  // ── 3. who gets it ──────────────────────────────────────────────────────────────────────────────
  {
    t.eq(E.foundingLinkEmailPayload(ADDRESS, ROW), null, "3a signup not open: no launch email");
    t.eq(E.foundingLinkEmailPayload(ADDRESS, ROW, { launched: "true" }), null, "3b only a real `true` counts as open");
    for (const v of ["2026-10-01", "2026-10-05", "2026-10-06"]) {
      const q = E.foundingLinkEmailPayload(ADDRESS, { ...ROW, consent_version: v }, { launched: true });
      t.eq([q.subject, q.tags[0].value], ["Your founding price is ready", "founding_link"], `3c ${v}: the founding link email, not the launch one`);
    }
    for (const [why, over] of [["unsubscribed", { unsubscribed_at: "2026-10-20T00:00:00Z" }], ["a test row", { is_test: true }],
      ["no founding number", { founding_position: null }], ["number 51", { founding_position: 51 }], ["a version never shown", { consent_version: "2026-09-01" }]]) {
      t.eq(E.foundingLinkEmailPayload(ADDRESS, { ...ROW, ...over }, { launched: true }), null, `3d ${why}: nothing`);
    }
  }

  // ── 4. the sweep ────────────────────────────────────────────────────────────────────────────────
  {
    const OTHER = { id: "0a8e9b77-3f4c-4d2b-8e1a-5c6d7e8f9a0b", email: "later.household@example.test", founding_position: 9, is_test: false, unsubscribed_at: null, consent_version: "2026-10-06", metadata: null };
    const FIRST = { ...ROW, email: ADDRESS, metadata: null };
    async function sweep(env) {
      const calls = [], realFetch = global.fetch, quiet = { log: console.log, error: console.error };
      process.env.SUPABASE_URL = "https://example.supabase.co";
      process.env[KEY_NAME] = "re_TESTONLY_notarealkey";
      process.env.BILLING_ENABLED = "true"; process.env.FOUNDING_LINK_EMAIL = "true";
      for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      global.fetch = async (url, o = {}) => {
        const u = String(url), call = { url: u, method: o.method || "GET", headers: o.headers || {}, body: o.body };
        calls.push(call);
        if (u.includes("api.resend.com")) return { ok: true, status: 200, json: async () => ({}) };
        if (u.includes("/rpc/waitlist_founding_position_for_email")) {
          const e = JSON.parse(o.body).p_email; return { ok: true, status: 200, json: async () => [FIRST, OTHER].find(r => r.email === e)?.founding_position ?? null };
        }
        if (call.method === "PATCH") return { ok: true, status: 204, json: async () => ({}) };
        if (u.includes("sent_at=gte.")) return { ok: true, status: 200, headers: { get: () => "*/0" }, json: async () => [] };
        if (u.includes("/rest/v1/waitlist?select=id,email,")) {
          const versions = decodeURIComponent(u).match(/consent_version=in\.\(([^)]*)\)/)[1].split(",");
          return { ok: true, status: 200, json: async () => [FIRST, OTHER].filter(r => versions.includes(r.consent_version)) };
        }
        return { ok: false, status: 599, json: async () => ({}) };
      };
      console.log = () => {}; console.error = () => {};
      try { delete require.cache[require.resolve(SWEEP)]; return { result: await require(SWEEP).runFoundingLinkSweep(), calls }; }
      finally { global.fetch = realFetch; console.log = quiet.log; console.error = quiet.error; }
    }
    const open = await sweep({ OPEN_SIGNUP: "true" });
    const sends = open.calls.filter(c => c.url.includes("api.resend.com")).map(c => JSON.parse(c.body));
    t.eq(sends.map(s => [s.to[0], s.subject]), [[ADDRESS, "flourish has launched in Canada"], ["later.household@example.test", "Your founding price is ready"]],
      "4a signup open: the early household gets the launch email, the later one the founding link email");
    const select = decodeURIComponent(open.calls.find(c => c.url.includes("/rest/v1/waitlist?select=id,email,")).url);
    t.ok(select.includes(`consent_version=in.(2026-10-01,2026-10-05,2026-10-06,${LEGACY})`), "4b …because the query asks for the legacy version too");
    const records = open.calls.filter(c => c.method === "PATCH").map(c => JSON.parse(c.body).metadata.founding_link);
    t.eq(records.map(r => [r.kind, r.consent_version]), [["launch", LEGACY], ["founding_link", "2026-10-06"]], "4c each send is recorded with its kind and consent version");
    t.eq(open.calls.filter(c => c.url.includes("api.resend.com")).map(c => c.headers["Idempotency-Key"]), [`founding-link/${FIRST.id}`, `founding-link/${OTHER.id}`],
      "4d one Idempotency-Key per row for either kind: a row can never get both");
    const shut = await sweep({ OPEN_SIGNUP: undefined });
    const shutSends = shut.calls.filter(c => c.url.includes("api.resend.com")).map(c => JSON.parse(c.body).to[0]);
    t.eq(shutSends, ["later.household@example.test"], "4e signup shut: no launch email; the founding link email still goes");
    t.ok(!decodeURIComponent(shut.calls.find(c => c.url.includes("/rest/v1/waitlist?select=id,email,")).url).includes(LEGACY), "4f …and the legacy rows are not even asked for");
    const off = await sweep({ OPEN_SIGNUP: "true", FOUNDING_LINK_EMAIL: undefined });
    t.eq(off.calls.length, 0, "4g FOUNDING_LINK_EMAIL unset: nothing read, nothing sent, even with signup open");
  }

  process.env = saved;
  t.summary("launchEmail.test");
})();
