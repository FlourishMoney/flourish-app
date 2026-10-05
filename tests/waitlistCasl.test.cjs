// tests/waitlistCasl.test.cjs
// -----------------------------------------------------------------------------
// THE WAITLIST MEETS CANADA'S ANTI-SPAM LAW (CASL) BEFORE ANY EMAIL IS SENT.
//
//   1. The form shows the consent line, word for word, directly under the Join button: purpose, sender,
//      mailing address, contact and unsubscribe in one line (version 2026-10-05); one copy of that
//      wording is shared by the browser and the server, and every earlier version keeps its own words.
//   2. A signup stores the version of the consent wording it was shown, with the time; a signup
//      without the current version is refused.
//   3. The source must be one of ours (the homepage's, plus "calendar" and "clawback"); any other is
//      refused.
//   4. The one-click unsubscribe link works, is per row, and cannot be forged.
//   5. An unsubscribed row is never emailed.
//   6. No price, trial, plan or founding offer on the form or in the welcome email.
//   7. Amanda's decisions of 2026-09-30: Canada only (no country choice, stored as Canada); rows whose
//      consent predates the consent line only ever get the launch-day email; signing up again after
//      unsubscribing re-subscribes, with the new consent recorded.
//
// It runs the REAL handlers (beta.js, unsubscribe.js, waitlist-sweep.js) with global fetch stubbed:
// no network, no Supabase, no Resend.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const FN = (f) => path.join(REPO, "netlify", "functions", f);
const fresh = (p) => { delete require.cache[require.resolve(p)]; return require(p); };
const KEY_NAME = ["RESEND", "API", "KEY"].join("_");

// Consent version 2026-10-06 (landing-contact): the purpose and unsubscribe, and "Contact" linking to the
// page's Contact block, which names the sender, its mailing address and its contact.
const BRIEF_CONSENT = "We'll email you when flourish launches in Canada, plus a few updates before then. Unsubscribe any time. Who we are: see Contact below.";
const BRIEF_CONTACT = "flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0.";
// Version 2026-10-05's one line, kept word for word for the rows that saw it.
const V5_CONSENT = "We'll email you when flourish launches in Canada, plus a few updates before then. From GrowSmart Inc. (flourish), PO Box 29, Foxboro ON K0K 2B0, hello@flourishmoney.app. Unsubscribe any time.";
// Version 2026-10-01's two lines, kept word for word for the rows that saw them.
const V1_CONSENT = "Email me when flourish launches in Canada, plus a few updates before then. Unsubscribe any time.";
const BRIEF_IDENTITY = "flourish is made by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0, hello@flourishmoney.app. You can unsubscribe at any time.";

function env() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;
}

// Run a handler with fetch stubbed; `answer(url, opts)` decides each response.
async function withFetch(answer, fn) {
  const calls = [];
  const real = global.fetch;
  const quiet = { e: console.error, l: console.log, w: console.warn };
  console.error = console.log = console.warn = () => {};
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || "GET", body: opts.body, headers: opts.headers || {} });
    const a = answer(String(url), opts) || { ok: true, status: 200, body: [] };
    return { ok: a.ok !== false, status: a.status || 200, headers: { get: (h) => (a.headers || {})[h.toLowerCase()] || null },
      json: async () => a.body, text: async () => a.text || JSON.stringify(a.body || {}) };
  };
  try { return { result: await fn(), calls }; }
  finally { global.fetch = real; Object.assign(console, { error: quiet.e, log: quiet.l, warn: quiet.w }); }
}

async function join(body, insertAnswer = { status: 201, body: [{ id: "row-1" }] }) {
  env(); process.env[KEY_NAME] = "re_TESTONLY_notreal";
  const beta = fresh(FN("beta.js"));
  const { result, calls } = await withFetch((u, o) => {
      if (u.endsWith("/rest/v1/waitlist") && o.method === "POST") return insertAnswer;
      if (u.includes("/rest/v1/waitlist")) return { status: 204, body: [] };
      return { status: 200, body: {} };
    },
    () => beta.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "join_waitlist", email: "person@example.com", country: "CA", ...body }) }));
  const insert = calls.find(c => c.method === "POST" && c.url.endsWith("/rest/v1/waitlist"));
  return { status: result.statusCode, body: JSON.parse(result.body || "{}"), insert: insert ? JSON.parse(insert.body) : null, calls,
    patches: calls.filter(c => c.method === "PATCH"), sends: calls.filter(c => c.url.includes("api.resend.com")) };
}

(async () => {
  const t = create();
  const C = fresh(FN("_lib/waitlistConsent.js"));
  const U = fresh(FN("_lib/waitlistUnsubscribe.js"));

  // ── 1. The wording, one copy, under the email field ──────────────────────────────────────────
  {
    t.eq(C.CONSENT_TEXT, BRIEF_CONSENT, "1a the consent line is the approved text, word for word");
    t.eq(C.IDENTITY_TEXT, BRIEF_IDENTITY, "1b the identity line is the approved text, word for word");
    const web = await import("../src/lib/waitlistConsent.js");
    t.eq([web.CONSENT_VERSION, web.CONSENT_TEXT, web.IDENTITY_TEXT, web.WAITLIST_PLACEMENTS.join(","), web.WAITLIST_SRCS.join(",")],
      [C.CONSENT_VERSION, C.CONSENT_TEXT, C.IDENTITY_TEXT, C.WAITLIST_PLACEMENTS.join(","), C.WAITLIST_SRCS.join(",")], "1c the browser's copy is identical to the server's");
    t.eq(C.CONSENT_VERSIONS[C.CONSENT_VERSION].consent, C.CONSENT_TEXT, "1d the current version resolves to the wording shown");
    t.eq([C.CONSENT_VERSION, C.CONSENT_VERSIONS["2026-10-05"].consent, C.CONSENT_VERSIONS["2026-10-01"].consent, C.CONSENT_VERSIONS["2026-10-01"].identity], ["2026-10-06", V5_CONSENT, V1_CONSENT, BRIEF_IDENTITY],
      "1d2 the new wording is a new version (2026-10-06); 2026-10-05 and 2026-10-01 still resolve to the words their rows saw");
    t.ok(["when flourish launches in Canada", "Unsubscribe any time", "see Contact below"].every(x => C.CONSENT_TEXT.includes(x)) && !/GrowSmart|PO Box/.test(C.CONSENT_TEXT)
      && C.CONSENT_VERSIONS["2026-10-06"].identityAt.includes(BRIEF_CONTACT) && C.CONSENT_VERSIONS["2026-10-06"].identityAt.includes("hello@flourishmoney.app"),
      "1d3 the line keeps the purpose and unsubscribe and points to Contact; the version records where the sender, address and contact were shown");
    let A = {};
    try { A = loadApp(["WaitlistForm"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A.WaitlistForm) {
      const html = A.render(A.h(A.WaitlistForm, { source: "calendar" }));
      const iInput = html.indexOf("<input"), iConsent = html.indexOf("We&#x27;ll email you when flourish launches in Canada"), iBtn = html.indexOf("Join the waitlist");
      t.ok(iInput >= 0 && iBtn > iInput && iConsent > iBtn && !/GrowSmart|PO Box/.test(html), "1e the form renders the email field, then the button, then the one consent line, with no company name or address");
      t.eq(textOf(html.slice(html.indexOf('class="fll-consent"') - 3)).trim().slice(0, BRIEF_CONSENT.length), BRIEF_CONSENT, "1e2 the consent line reads the approved text, word for word");
      t.ok(/<a class="fll-contact-link" href="#contact"[^>]*>Contact<\/a>/.test(html), "1e3 \"Contact\" in it is a link to #contact on the same page");
      t.ok(/aria-describedby="fll-consent-calendar"/.test(html) && /id="fll-consent-calendar"/.test(html), "1f the email field is described by the consent text");
      t.ok(/\.fll-form\{/.test(html), "1g the form carries its own styles, so any page can render it");
      t.ok(!/United States|🇺🇸|fll-country/.test(html), "7a the form offers no country choice: launch is Canada only");
      const txt = textOf(html);
      t.ok(!/\$\s?\d|price|trial|plan\b|plans|founding|founder|free|per month|\/mo\b/i.test(txt), `1h no price, trial, plan or offer on the form ("${txt.slice(0, 80)}…")`);
    }
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/<WaitlistForm source="hero"/.test(app) && /<WaitlistForm source="bottom_cta"/.test(app), "1i the homepage uses the component at both spots");
    {
      // landing-contact (owner rule): the company name and mailing address sit only in the footer's Contact block.
      const auth = app.slice(app.indexOf("function AuthScreen("), app.indexOf("\n}\n", app.indexOf("function AuthScreen(")));
      const hero = auth.slice(auth.indexOf("{/* Hero."), auth.indexOf("{/* Proof"));
      const cta2 = auth.slice(auth.indexOf("{/* Second email capture */}"), auth.indexOf("{/* Footer */}"));
      t.ok(hero.length > 500 && cta2.length > 100 && ![hero, cta2].some(x => /GrowSmart|PO Box/.test(x)), "1l the hero and the \"Be first to know\" form hold no \"GrowSmart\" and no \"PO Box\"");
      const contact = auth.slice(auth.indexOf('<div id="contact"'), auth.indexOf("</div>", auth.indexOf('<div id="contact"')));
      t.ok(contact.includes("<h2>Contact</h2>") && contact.includes(BRIEF_CONTACT) && contact.includes("hello@flourishmoney.app"), "1m #contact exists and holds the company, its mailing address and the contact email");
    }
    t.ok(/consentVersion: CONSENT_VERSION/.test(app), "1j the form sends the version of the wording it showed");
    t.ok(/country: "CA", placement: tag/.test(app), "7b …and always sends Canada");
    t.ok(!/No spam, just the launch news/.test(app), "1k the success message no longer contradicts the consent line");
  }

  // ── 2. Consent version stored ────────────────────────────────────────────────────────────────
  {
    const before = Date.now();
    const ok = await join({ source: "hero", consentVersion: C.CONSENT_VERSION });
    t.eq([ok.status, ok.body.joined], [200, true], "2a a signup with the current consent version joins");
    t.eq(ok.insert && ok.insert.consent_version, "2026-10-06", "2b …and the row stores that version");
    const at = ok.insert && Date.parse(ok.insert.consented_at);
    t.ok(at >= before - 1000 && at <= Date.now() + 1000, "2c …with the time consent was given");
    for (const [label, v] of [["no version", undefined], ["an old version", "pre-2026-10-01"], ["a page still showing version 2026-10-01", "2026-10-01"], ["a page still showing version 2026-10-05", "2026-10-05"], ["a made-up version", "2099-01-01"]]) {
      const r = await join({ source: "hero", consentVersion: v });
      t.eq([r.status, r.body.error, r.insert], [400, "Consent required", null], `2d ${label} is refused, and nothing is stored`);
    }
  }

  // ── 3. Unknown placement rejected (the campaign source is waitlistSrc.test's) ───────────────
  {
    for (const pl of ["landing", "hero", "bottom_cta", "calendar", "clawback"]) {
      const r = await join({ placement: pl, consentVersion: C.CONSENT_VERSION });
      t.eq([r.status, r.insert && r.insert.metadata.placement], [200, pl], `3a placement "${pl}" is accepted and stored in metadata.placement`);
    }
    for (const [label, pl] of [["an unknown placement", "partner_site"], ["no placement", undefined], ["a non-string placement", { x: 1 }], ["a near miss", "Calendar"]]) {
      const r = await join({ placement: pl, consentVersion: C.CONSENT_VERSION });
      t.eq([r.status, r.body.error, r.insert], [400, "Unknown placement", null], `3b ${label} is refused, and nothing is stored`);
    }
  }

  // ── 4. The unsubscribe link works and cannot be forged ───────────────────────────────────────
  {
    env();
    const secret = U.unsubscribeSecret();
    const tokA = U.unsubscribeToken("row-a"), tokB = U.unsubscribeToken("row-b");
    t.ok(!!tokA && tokA !== tokB, "4a each row gets its own signature");
    t.ok(U.verifyUnsubscribeToken("row-a", tokA) && !U.verifyUnsubscribeToken("row-b", tokA), "4b a signature works only for its own row");
    t.ok(!U.verifyUnsubscribeToken("row-a", tokA.slice(0, -1) + (tokA.endsWith("A") ? "B" : "A")), "4c a tampered signature fails");
    t.ok(!U.verifyUnsubscribeToken("row-a", U.unsubscribeToken("row-a", "some-other-secret")), "4d a signature made with any other secret fails");
    t.ok(!U.verifyUnsubscribeToken("row-a", "") && !U.verifyUnsubscribeToken("row-a", undefined), "4e an empty signature fails");
    t.ok(secret && secret !== process.env.SUPABASE_SECRET_KEY, "4f the signing key is derived, never the Supabase key itself");
    process.env.WAITLIST_UNSUBSCRIBE_SECRET = "dedicated-test-secret";
    t.ok(U.unsubscribeToken("row-a") !== tokA, "4g a dedicated WAITLIST_UNSUBSCRIBE_SECRET, once set, is the one used");
    delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;
    const url = U.unsubscribeUrl("row-a");
    t.ok(/^https:\/\/flourishmoney\.app\/api\/unsubscribe\?id=row-a&t=[A-Za-z0-9_-]+$/.test(url) && !/@/.test(url), "4h the link carries the row id and signature, never an address");

    const unsub = fresh(FN("unsubscribe.js"));
    const call = (method, q, body) => withFetch(() => ({ status: 204 }), () => unsub.handler({ httpMethod: method, queryStringParameters: q, body }));
    const get = await call("GET", { id: "row-a", t: tokA });
    t.eq([get.result.statusCode, get.calls.length], [200, 0], "4i opening the link shows the page and changes nothing (mail scanners open links)");
    t.ok(/<form method="post" action="\/api\/unsubscribe\?id=row-a&amp;t=|<form method="post" action="\/api\/unsubscribe\?id=row-a&t=/.test(get.result.body) && />Unsubscribe<\/button>/.test(get.result.body), "4j …with one Unsubscribe button");
    const post = await call("POST", { id: "row-a", t: tokA }, "List-Unsubscribe=One-Click");
    t.eq(post.result.statusCode, 200, "4k the one-click POST unsubscribes");
    const patch = post.calls.find(c => c.method === "PATCH");
    t.ok(patch && /\/rest\/v1\/waitlist\?id=eq\.row-a&unsubscribed_at=is\.null$/.test(patch.url), "4l …that row only, and only the first time (the first unsubscribe is the one on record)");
    t.eq(patch && Object.keys(JSON.parse(patch.body)).join(","), "unsubscribed_at", "4m …setting unsubscribed_at and nothing else");
    for (const [label, q] of [["a forged signature", { id: "row-a", t: tokB }], ["another row's signature", { id: "row-b", t: tokA }], ["no signature", { id: "row-a" }], ["a malformed id", { id: "row-a;drop", t: tokA }]]) {
      const bad = await call("POST", q, "List-Unsubscribe=One-Click");
      t.eq([bad.result.statusCode, bad.calls.length], [400, 0], `4n ${label} changes nothing`);
    }
    const down = await withFetch(() => ({ ok: false, status: 500 }), () => unsub.handler({ httpMethod: "POST", queryStringParameters: { id: "row-a", t: tokA } }));
    t.eq(down.result.statusCode, 503, "4o a failed update says so, and never claims success");
  }

  // ── 5. Unsubscribed rows are never emailed ───────────────────────────────────────────────────
  {
    env(); process.env[KEY_NAME] = "re_TESTONLY_notreal";
    const sweep = fresh(FN("waitlist-sweep.js"));
    const old = new Date(Date.now() - 3600e3).toISOString();
    const rows = [{ id: "r1", email: "a@example.com", created_at: old, unsubscribed_at: null, consent_version: "2026-10-01" },
                  { id: "r2", email: "b@example.com", created_at: old, unsubscribed_at: old, consent_version: "2026-10-01" }];
    const { result, calls } = await withFetch((u, o) => {
      if (u.includes("welcomed_at=gte.")) return { status: 200, body: [], headers: { "content-range": "0-0/0" } };
      if (u.includes("/rest/v1/waitlist?select=")) return { status: 200, body: rows };
      if (u.includes("api.resend.com")) return { status: 200, body: { id: "x" } };
      return { status: 204 };
    }, () => sweep.runSweep({ minAgeMs: 0 }));
    const select = calls.find(c => c.url.includes("welcomed_at=is.null"));
    t.ok(select && /&unsubscribed_at=is\.null/.test(select.url), "5a the sweep only asks for rows that have not unsubscribed");
    const sentTo = calls.filter(c => c.url.includes("api.resend.com")).map(c => JSON.parse(c.body).to[0]);
    t.eq(sentTo, ["a@example.com"], "5b …and even if an unsubscribed row came back, it is not emailed");
    t.eq(result.sent, 1, "5c the run counts only the send it made");
    const sent = JSON.parse(calls.find(c => c.url.includes("api.resend.com")).body);
    t.ok(sent.headers && /api\/unsubscribe\?id=r1&t=/.test(sent.headers["List-Unsubscribe"]), "5d every waitlist email carries its row's List-Unsubscribe link");
    const lib = fresh(FN("_lib/waitlistWelcome.js"));
    t.eq(lib.welcomeEmailPayload("a@example.com", null), null, "5e with no row to sign a link for, there is no email to send");
    delete process.env.SUPABASE_SECRET_KEY;
    t.eq(fresh(FN("_lib/waitlistWelcome.js")).welcomeEmailPayload("a@example.com", "r1"), null, "5f with no signing secret, there is no email to send");
  }

  // ── 6. The migration ─────────────────────────────────────────────────────────────────────────
  {
    const sql = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0012_waitlist_consent.sql"), "utf8");
    const body = sql.replace(/^\s*--.*$/gm, "");
    for (const col of ["consent_version text", "consented_at    timestamptz", "unsubscribed_at timestamptz"])
      t.ok(body.includes(`add column if not exists ${col}`), `6a adds ${col.split(" ")[0]}, safe to run twice`);
    t.ok(/set consent_version = 'pre-2026-10-01'\s+where consent_version is null;/.test(body), "6b existing rows get 'pre-2026-10-01', and only rows still null");
    t.ok(!/\bdrop\b|\bdelete\b|\btruncate\b/i.test(body), "6c nothing is dropped or deleted");
    t.ok(/grant all privileges on table public\.waitlist to service_role;/.test(body) && !/\bto (anon|authenticated)\b/.test(body), "6d grants service_role only, nothing to anon or authenticated");
    t.ok(/^--[ \t]*grants:[ \t]*service_role only[ \t]*$/m.test(sql) && /enable row level security/.test(body), "6e …marked and with row level security on");
  }

  // ── 7. Amanda's decisions (2026-09-30) ────────────────────────────────────────────────────────
  {
    // Canada only, whatever a client sends.
    for (const c of ["US", "", undefined, "FR"]) {
      const r = await join({ source: "hero", consentVersion: C.CONSENT_VERSION, country: c });
      t.eq(r.insert && r.insert.country, "CA", `7c a signup sending country ${JSON.stringify(c)} is stored as Canada`);
    }

    // Pre-consent rows only ever get the launch-day email.
    const may = C.mayEmailWaitlistRow;
    const legacy = { consent_version: "pre-2026-10-01", unsubscribed_at: null };
    const current = { consent_version: "2026-10-01", unsubscribed_at: null };
    t.eq([may(legacy, "launch"), may(legacy, "welcome"), may(legacy, "update")], [true, false, false], "7d a pre-2026-10-01 row may get the launch email and nothing else");
    t.eq([may({ consent_version: null }, "launch"), may({ consent_version: null }, "welcome"), may({}, "update")], [true, false, false], "7e …and so may a row with no version at all");
    t.eq([may(current, "launch"), may(current, "welcome"), may(current, "update")], [true, true, true], "7f a row with current consent may get any waitlist email");
    t.eq([may({ ...current, unsubscribed_at: "2026-10-02T00:00:00Z" }, "launch"), may({ ...legacy, unsubscribed_at: "2026-10-02T00:00:00Z" }, "launch")], [false, false], "7g an unsubscribed row gets nothing, not even the launch email");
    t.eq(may({ consent_version: "2099-01-01" }, "update"), false, "7h a version this code does not know is treated as no consent");

    env(); process.env[KEY_NAME] = "re_TESTONLY_notreal";
    const sweep = fresh(FN("waitlist-sweep.js"));
    const old = new Date(Date.now() - 3600e3).toISOString();
    const rows = [{ id: "n1", email: "new@example.com", created_at: old, unsubscribed_at: null, consent_version: "2026-10-01" },
                  { id: "o1", email: "old@example.com", created_at: old, unsubscribed_at: null, consent_version: "pre-2026-10-01" },
                  { id: "o2", email: "none@example.com", created_at: old, unsubscribed_at: null, consent_version: null }];
    const { calls } = await withFetch((u) => {
      if (u.includes("welcomed_at=gte.")) return { status: 200, body: [], headers: { "content-range": "0-0/0" } };
      if (u.includes("welcomed_at=is.null")) return { status: 200, body: rows };
      if (u.includes("api.resend.com")) return { status: 200, body: { id: "x" } };
      return { status: 204 };
    }, () => sweep.runSweep({ minAgeMs: 0 }));
    const select = calls.find(c => c.url.includes("welcomed_at=is.null"));
    t.ok(select && /&consent_version=neq\.pre-2026-10-01/.test(select.url), "7i the welcome sweep does not even ask for pre-consent rows");
    t.eq(calls.filter(c => c.url.includes("api.resend.com")).map(c => JSON.parse(c.body).to[0]), ["new@example.com"],
      "7j …and if they came back anyway, the welcome email (not a launch email) skips them: only the current-consent row is sent to");

    // Signing up again after unsubscribing re-subscribes, with the new consent recorded.
    const before = Date.now();
    for (const [label, answer] of [["409", { status: 409, body: {}, text: "" }], ["23505", { ok: false, status: 400, body: {}, text: '{"code":"23505","message":"duplicate key value"}' }]]) {
      const r = await join({ source: "calendar", consentVersion: C.CONSENT_VERSION }, answer);
      t.eq([r.status, r.body.alreadyJoined], [200, true], `7k a repeat signup (${label}) is told it is on the list`);
      const p = r.patches[0];
      t.ok(p && /\/rest\/v1\/waitlist\?email=eq\.person%40example\.com$/.test(p.url), `7l …and updates that address's row (${label})`);
      const b = p ? JSON.parse(p.body) : {};
      t.eq([b.unsubscribed_at, b.consent_version, Object.keys(b).sort().join(",")], [null, C.CONSENT_VERSION, "consent_version,consented_at,unsubscribed_at"],
        `7m …clearing unsubscribed_at and recording the current consent_version, and nothing else (${label})`);
      const at = Date.parse(b.consented_at);
      t.ok(at >= before - 1000 && at <= Date.now() + 1000, `7n …with consented_at set to now (${label})`);
      t.eq(r.sends.length, 0, `7o …and no email is sent for it (${label})`);
    }
    const stale = await join({ source: "calendar", consentVersion: "pre-2026-10-01" }, { status: 409, body: {}, text: "" });
    t.eq([stale.status, stale.patches.length], [400, 0], "7p a repeat signup WITHOUT the current wording changes nothing: no re-subscribe without the new consent");
  }

  t.summary("waitlistCasl.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
