// tests/foundingReminders.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING REMINDERS (billing day, round 5; the approved 30-day plan): a reminder on October 29 and a
// last call on November 2, behind FOUNDING_REMINDERS (default off). The words are a DRAFT for review. Pinned:
//   1. the words, and what they never say: no regular price, no saving, no struck-through price; the one
//      price is the landing page's founding card, word for word; signed "Amanda, founder of flourish";
//   2. the CASL footer, the same as the founding link email's;
//   3. who: worded consent only (never a pre-2026-10-01 row, the one-email rule), a founding number, not a
//      test row, not unsubscribed;
//   4. when: the two windows, in Toronto time across the clock change;
//   5. the sweep, run for real against a stubbed fetch: off unless both flags are exactly "true" (nothing is
//      read); only households that got the founding link email at least two days ago and have not paid;
//      one email per row per reminder, recorded; fails closed on anything it cannot read; logs counts only;
//   6. the schedule in netlify.toml, and the runbook's later steps.
// Nothing is sent.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SWEEP = path.join(REPO, "netlify", "functions", "founding-reminder-sweep.js");
const R = require("../netlify/functions/_lib/foundingReminderEmail.js");
const E = require("../netlify/functions/_lib/foundingLinkEmail.js");
const U = require("../netlify/functions/_lib/waitlistUnsubscribe.js");
const C = require("../netlify/functions/_lib/waitlistConsent.js");
const KEY_NAME = ["RESEND", "API", "KEY"].join("_");
const ADDRESS = "founding.household@example.test";
const ROW = Object.freeze({ id: "7c2d9e40-1a5b-4c6d-8e7f-9a0b1c2d3e4f", founding_position: 7, is_test: false, unsubscribed_at: null, consent_version: "2026-10-06", metadata: null });
const LINK_SENT = (at) => ({ founding_link: { kind: "founding_link", sent_at: at, consent_version: "2026-10-06", position: 7 } });
const AT = (iso) => Date.parse(iso);

(async () => {
  const t = create();
  const saved = { ...process.env };
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;

  // ── 1. the words ────────────────────────────────────────────────────────────────────────────────
  const rem = R.foundingReminderPayload(ADDRESS, ROW, "founding_reminder");
  const last = R.foundingReminderPayload(ADDRESS, ROW, "founding_last_call");
  t.ok(!!rem && !!last, "1 both reminders are built for a worded-consent founding household");
  if (rem && last) {
    t.eq([rem.subject, last.subject], ["Your founding price is still waiting", "A last note about your founding price"], "1a the subjects");
    const body = (p) => p.text.split("\n\n").slice(0, p.text.split("\n\n").indexOf(E.WHY_LINE));
    t.eq(body(rem), [
      "A few days ago we sent you your link to the founding price. It's still there for you.",
      "You're founding household #7 of 50.",
      "$79.99 a year",
      "Plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet in the iPhone and Android apps.",
      "Your link: https://flourishmoney.app/?checkout=founding",
      "Sign in or create your account with the email address this message was sent to, then choose Founding Annual.",
      "We'll send one last note on November 2, and then no more about this.",
      "Questions? Just reply to this email.",
      "Amanda, founder of flourish",
    ], "1b the reminder, word for word");
    t.eq(body(last), [
      "This is our last note about your founding price. After this, we won't send you more reminders about it.",
      "You're founding household #7 of 50.",
      "$79.99 a year",
      "Plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet in the iPhone and Android apps.",
      "Your link: https://flourishmoney.app/?checkout=founding",
      "Sign in or create your account with the email address this message was sent to, then choose Founding Annual.",
      "Questions? Just reply to this email.",
      "Amanda, founder of flourish",
    ], "1c the last call, word for word");
    const landing = fs.readFileSync(path.join(REPO, "src", "lib", "foundingOffer.js"), "utf8");
    t.ok(landing.includes(`small: "${R.CARD_SMALL}"`), "1d the small print is the landing page's founding card, word for word");
    t.ok(/price: `\$\{formatPrice\(p\.foundingAnnual\)\} a year`/.test(landing) && R.CARD_PRICE === "$79.99 a year", "1e …and the price is the card's");
    for (const [name, p] of [["the reminder", rem], ["the last call", last]]) {
      const all = `${p.subject}\n${p.text}\n${p.html}`;
      t.ok(!/regular/i.test(all), `1f ${name} never says "regular"`);
      t.ok(!/\bsav(e|es|ed|ing|ings)\b/i.test(all), `1g ${name} never mentions a saving`);
      t.ok(!/a year less/i.test(all), `1h ${name} never says "a year less"`);
      t.ok(!/<s[\s>]|<\/s>|<del[\s>]|<strike[\s>]|line-through|~~/i.test(all), `1i ${name} has no struck-through price`);
      t.ok(!/\$99\.99|\$11\.99|\$9\.99/.test(all), `1j ${name} shows no price but the founding one`);
      t.ok(p.html.includes(`href="${E.FOUNDING_LINK_URL}"`), `1k ${name} links to the founding price`);
      t.eq(p.tags[0], { name: "kind", value: p === rem ? "founding_reminder" : "founding_last_call" }, `1l ${name} is tagged with its kind`);
    }
  }

  // ── 2. the CASL footer ──────────────────────────────────────────────────────────────────────────
  if (rem) {
    const url = U.unsubscribeUrl(ROW.id);
    const tail = rem.text.split("\n\n").slice(-5);
    t.eq(tail, [E.WHY_LINE, "Consent on record: version 2026-10-06.", ...E.CONTACT_BLOCK, `Unsubscribe with one click: ${url}`], "2a the same footer as the founding link email");
    t.eq(rem.headers, U.listUnsubscribeHeaders(ROW.id), "2b one-click unsubscribe headers");
    t.ok(rem.html.includes(url.replace(/&/g, "&amp;")) || rem.html.includes(url), "2c the html has the unsubscribe link");
    t.eq([rem.from, rem.reply_to], ["Flourish <hello@flourishmoney.app>", "hello@flourishmoney.app"], "2d from and reply-to as the founding link email");
  }

  // ── 3. who ──────────────────────────────────────────────────────────────────────────────────────
  for (const v of ["2026-10-01", "2026-10-05", "2026-10-06"]) {
    t.ok(!!R.foundingReminderPayload(ADDRESS, { ...ROW, consent_version: v }, "founding_reminder"), `3a ${v}: yes`);
  }
  for (const [why, over, kind] of [
    ["a pre-2026-10-01 row (their one email is the Canada launch email)", { consent_version: C.LEGACY_CONSENT_VERSION }, "founding_reminder"],
    ["a pre-2026-10-01 row, last call", { consent_version: C.LEGACY_CONSENT_VERSION }, "founding_last_call"],
    ["no consent version", { consent_version: null }, "founding_reminder"],
    ["a version never shown", { consent_version: "2026-09-01" }, "founding_reminder"],
    ["unsubscribed", { unsubscribed_at: "2026-10-27T00:00:00Z" }, "founding_reminder"],
    ["a test row", { is_test: true }, "founding_reminder"],
    ["no founding number", { founding_position: null }, "founding_reminder"],
    ["number 51", { founding_position: 51 }, "founding_reminder"],
    ["an unknown kind", {}, "launch"],
  ]) {
    t.eq(R.foundingReminderPayload(ADDRESS, { ...ROW, ...over }, kind), null, `3b ${why}: nothing`);
  }
  t.eq(R.foundingReminderPayload("", ROW, "founding_reminder"), null, "3c no address: nothing");

  // ── 4. when ─────────────────────────────────────────────────────────────────────────────────────
  t.eq([
    R.dueKind(AT("2026-10-26T14:00:00Z")),
    R.dueKind(AT("2026-10-29T13:59:59Z")),
    R.dueKind(AT("2026-10-29T14:00:00Z")),            // 10:00 EDT
    R.dueKind(AT("2026-11-02T14:59:59Z")),
    R.dueKind(AT("2026-11-02T15:00:00Z")),            // 10:00 EST (the clocks changed November 1)
    R.dueKind(AT("2026-11-09T14:59:59Z")),
    R.dueKind(AT("2026-11-09T15:00:00Z")),
  ], [null, null, "founding_reminder", "founding_reminder", "founding_last_call", "founding_last_call", null],
  "4a the reminder from Oct 29 10:00 Toronto, the last call from Nov 2 10:00 until Nov 9, nothing else");

  // ── 5. the sweep ────────────────────────────────────────────────────────────────────────────────
  // rows: the waitlist; accounts: { user id: address } with a subscription; fail: which read fails.
  async function sweep({ env = {}, now, rows = [], accounts = {}, fail = {}, opts = {} }) {
    const calls = [], logs = [], realFetch = global.fetch, quiet = { log: console.log, error: console.error };
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env[KEY_NAME] = "re_TESTONLY_notarealkey";
    process.env.BILLING_ENABLED = "true"; process.env.FOUNDING_REMINDERS = "true";
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    global.fetch = async (url, o = {}) => {
      const u = String(url), call = { url: u, method: o.method || "GET", headers: o.headers || {}, body: o.body };
      calls.push(call);
      if (u.includes("api.resend.com")) return { ok: true, status: 200, json: async () => ({}) };
      if (u.includes("/rpc/waitlist_founding_position_for_email")) {
        if (fail.lookup) return { ok: false, status: 404, json: async () => ({}) };
        const e = JSON.parse(o.body).p_email; return { ok: true, status: 200, json: async () => (fail.notHonoured || []).includes(e) ? null : rows.find(r => r.email === e)?.founding_position ?? null };
      }
      if (u.includes("/rest/v1/subscriptions?")) {
        if (fail.paid) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => Object.keys(accounts).map(user_id => ({ user_id })) };
      }
      if (u.includes("/auth/v1/admin/users/")) {
        const id = decodeURIComponent(u.split("/auth/v1/admin/users/")[1]);
        if (fail.account) return { ok: false, status: 500, json: async () => ({}) };
        if (accounts[id] === null) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ id, email: accounts[id] }) };
      }
      if (call.method === "PATCH") return { ok: !fail.record, status: fail.record ? 500 : 204, json: async () => ({}) };
      if (u.includes("sent_at=gte.")) return { ok: true, status: 200, headers: { get: () => `*/${fail.sentToday || 0}` }, json: async () => [] };
      if (u.includes("/rest/v1/waitlist?select=id,email,")) return { ok: true, status: 200, json: async () => rows };
      return { ok: false, status: 599, json: async () => ({}) };
    };
    console.log = (...a) => logs.push(a.join(" ")); console.error = (...a) => logs.push(a.join(" "));
    try { delete require.cache[require.resolve(SWEEP)]; return { result: await require(SWEEP).runFoundingReminderSweep({ now, ...opts }), calls, logs }; }
    finally { global.fetch = realFetch; console.log = quiet.log; console.error = quiet.error; }
  }
  const sends = (r) => r.calls.filter(c => c.url.includes("api.resend.com")).map(c => JSON.parse(c.body));
  const ON_REMINDER = AT("2026-10-29T14:15:00Z"), ON_LAST = AT("2026-11-02T15:15:00Z");
  const row = (n, email, over = {}) => ({ ...ROW, id: `7c2d9e40-1a5b-4c6d-8e7f-9a0b1c2d3e${String(n).padStart(2, "0")}`, founding_position: n, email, metadata: LINK_SENT("2026-10-26T15:00:00Z"), ...over });

  // 5a. Off: nothing is read.
  for (const [why, env, now] of [
    ["BILLING_ENABLED unset", { BILLING_ENABLED: undefined }, ON_REMINDER],
    ["FOUNDING_REMINDERS unset", { FOUNDING_REMINDERS: undefined }, ON_REMINDER],
    ["FOUNDING_REMINDERS \"1\"", { FOUNDING_REMINDERS: "1" }, ON_REMINDER],
    ["FOUNDING_REMINDERS \"TRUE\"", { FOUNDING_REMINDERS: "TRUE" }, ON_REMINDER],
    ["both on, October 28", {}, AT("2026-10-28T14:00:00Z")],
    ["both on, November 10", {}, AT("2026-11-10T15:00:00Z")],
  ]) {
    const r = await sweep({ env, now, rows: [row(1, "a@example.test")] });
    t.eq(r.calls.length, 0, `5a ${why}: nothing read, sent or written`);
  }

  // 5b. The reminder window: only the household that got its link two days ago and has not paid.
  {
    const A = row(1, "a@example.test");
    const PAID = row(2, "paid@example.test");
    const SOON = row(3, "soon@example.test", { metadata: LINK_SENT("2026-10-28T15:00:00Z") });
    const LEGACY = row(4, "legacy@example.test", { consent_version: C.LEGACY_CONSENT_VERSION, metadata: { founding_link: { kind: "canada_launch", sent_at: "2026-10-26T15:00:00Z" } } });
    const ENDED = row(5, "ended@example.test");
    const DONE = row(6, "done@example.test", { metadata: { ...LINK_SENT("2026-10-26T15:00:00Z"), founding_reminders: { founding_reminder: { sent_at: "2026-10-29T14:00:00Z" } } } });
    const NOLINK = row(8, "nolink@example.test", { metadata: null });
    const OLDREC = row(9, "oldrec@example.test", { metadata: { founding_link: { sent_at: "2026-10-26T15:00:00Z" } } });
    const r = await sweep({ now: ON_REMINDER, rows: [A, PAID, SOON, LEGACY, ENDED, DONE, NOLINK, OLDREC],
      accounts: { "u-paid": "Paid@Example.test ", "u-gone": null }, fail: { notHonoured: ["ended@example.test"] } });
    t.eq(sends(r).map(s => [s.to[0], s.subject]), [["a@example.test", "Your founding price is still waiting"]], "5b the reminder goes to the one household owed it");
    t.eq([r.result.kind, r.result.paid, r.result.tooSoon], ["founding_reminder", 1, 1], "5c …the one who paid (any case, any status) and the one sent its link yesterday are skipped");
    const lookups = r.calls.filter(c => c.url.includes("/rpc/")).map(c => JSON.parse(c.body).p_email).sort();
    t.eq(lookups, ["a@example.test", "ended@example.test"], "5d billing's founding lookup is asked before a send (an ended number gets nothing)");
    const resend = r.calls.find(c => c.url.includes("api.resend.com"));
    t.eq(resend && resend.headers["Idempotency-Key"], `founding-reminder/founding_reminder/${A.id}`, "5e Idempotency-Key per row per reminder");
    const patches = r.calls.filter(c => c.method === "PATCH");
    t.eq(patches.length, 1, "5f one record written");
    if (patches[0]) {
      t.ok(decodeURIComponent(patches[0].url).includes(`id=eq.${A.id}&metadata->founding_reminders->founding_reminder=is.null`), "5g …only where none of this kind is there yet");
      const m = JSON.parse(patches[0].body).metadata;
      t.eq([m.founding_link, Object.keys(m.founding_reminders), m.founding_reminders.founding_reminder.consent_version],
        [A.metadata.founding_link, ["founding_reminder"], "2026-10-06"], "5h …keeping the founding link record, adding the reminder's");
    }
    const select = decodeURIComponent(r.calls.find(c => c.url.includes("/rest/v1/waitlist?select=id,email,")).url);
    t.ok(select.includes("consent_version=in.(2026-10-01,2026-10-05,2026-10-06)") && !select.includes(C.LEGACY_CONSENT_VERSION), "5i the query asks for worded consent only");
    t.ok(select.includes("metadata->founding_link->>kind=eq.founding_link") && select.includes("metadata->founding_reminders->founding_reminder=is.null")
      && select.includes("is_test=is.false") && select.includes("unsubscribed_at=is.null"), "5j …that got the founding link email, not this reminder, not a test, not unsubscribed");
    const said = r.logs.join("\n");
    t.ok(!/@example\.test|7c2d9e40|re_TESTONLY|test-service-role/i.test(said), "5k logs: counts only (no address, row id or key)");
  }

  // 5l. The next run: nothing more to that row.
  {
    const A = row(1, "a@example.test", { metadata: { ...LINK_SENT("2026-10-26T15:00:00Z"), founding_reminders: { founding_reminder: { sent_at: "2026-10-29T14:15:00Z" } } } });
    const r = await sweep({ now: ON_REMINDER + 3600000, rows: [A] });
    t.eq(sends(r).length, 0, "5l the next run sends that row nothing (even if the query returned it)");
  }

  // 5m. The last call: two days after any reminder.
  {
    const A = row(1, "a@example.test", { metadata: { ...LINK_SENT("2026-10-26T15:00:00Z"), founding_reminders: { founding_reminder: { sent_at: "2026-10-29T14:15:00Z" } } } });
    const LATE = row(2, "late@example.test", { metadata: { ...LINK_SENT("2026-10-26T15:00:00Z"), founding_reminders: { founding_reminder: { sent_at: "2026-11-01T14:15:00Z" } } } });
    const NONE = row(3, "none@example.test");
    const DONE = row(4, "done@example.test", { metadata: { ...LINK_SENT("2026-10-26T15:00:00Z"), founding_reminders: { founding_last_call: { sent_at: "2026-11-02T15:00:00Z" } } } });
    const r = await sweep({ now: ON_LAST, rows: [A, LATE, NONE, DONE] });
    t.eq(sends(r).map(s => [s.to[0], s.subject]), [["a@example.test", "A last note about your founding price"], ["none@example.test", "A last note about your founding price"]],
      "5m the last call: not within two days of a reminder, and never twice");
    t.eq(r.result.tooSoon, 1, "5n …the household reminded yesterday waits");
    const p = r.calls.find(c => c.method === "PATCH");
    t.ok(!!p && Object.keys(JSON.parse(p.body).metadata.founding_reminders).sort().join() === "founding_last_call,founding_reminder", "5o the record keeps the reminder's and adds the last call's");
  }

  // 5p. Fails closed.
  for (const [why, fail, expectSkipped] of [
    ["the subscriptions cannot be read", { paid: true }, "paid_unreadable"],
    ["an account cannot be read", { account: true }, "paid_unreadable"],
    ["billing's founding lookup fails", { lookup: true }, "lookup_failed"],
  ]) {
    const r = await sweep({ now: ON_REMINDER, rows: [row(1, "a@example.test")], accounts: { "u-paid": "paid@example.test" }, fail });
    t.eq([sends(r).length, r.result.skipped], [0, expectSkipped], `5p ${why}: nothing sent`);
  }
  {
    const r = await sweep({ now: ON_REMINDER, rows: [row(1, "a@example.test"), row(2, "b@example.test")], fail: { record: true } });
    t.eq([sends(r).length, r.result.skipped], [1, "record_failed"], "5q a send that cannot be recorded stops the run");
  }
  {
    const rows = Array.from({ length: 14 }, (_, i) => row(i + 1, `h${i + 1}@example.test`));
    const r = await sweep({ now: ON_REMINDER, rows });
    t.eq(sends(r).length, 10, "5r at most 10 a run");
    const capped = await sweep({ now: ON_REMINDER, rows, fail: { sentToday: 40 } });
    t.eq([sends(capped).length, capped.result.skipped], [0, "daily_cap_reached"], "5s at most 40 a day");
  }

  // ── 6. the schedule and the runbook ─────────────────────────────────────────────────────────────
  const toml = fs.readFileSync(path.join(REPO, "netlify.toml"), "utf8");
  t.ok(/\[functions\."founding-reminder-sweep"\]\s*\n\s*schedule = "\*\/15 \* \* \* \*"/.test(toml), "6a scheduled every 15 minutes");
  const runbook = fs.readFileSync(path.join(REPO, "docs", "ops", "BILLING-DAY-OCT-26.md"), "utf8");
  t.ok(/FOUNDING_REMINDERS/.test(runbook) && /October 29/.test(runbook) && /November 2/.test(runbook), "6b the runbook has the reminder steps");
  const src = fs.readFileSync(path.join(REPO, "netlify", "functions", "founding-reminder-sweep.js"), "utf8");
  t.ok(/flagOn\("FOUNDING_REMINDERS"\)/.test(src) && /process\.env\[name\] === "true"/.test(src), "6c the flag is exactly \"true\" or off");

  process.env = saved;
  t.summary("foundingReminders.test");
})();
