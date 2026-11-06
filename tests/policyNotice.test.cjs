// tests/policyNotice.test.cjs
// -----------------------------------------------------------------------------
// THE PRIVACY POLICY NOTICE (words approved 2026-11-05). Word for word; off unless asked; the dry run sends and writes nothing; one
// send per account however often it runs; a failure stops the run and is not retried. The claim itself, in a real Postgres, is in
// tests/testerFreeMonth.sql.test.cjs.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APPROVED = `Hi,

We've updated the flourish privacy policy. The new version is dated November 12, 2026 and you can read it at flourishmoney.app/privacy.

What changed:

• We added Canadian money dates this week, an optional weekly email for people aged 18 and over. You only get it if you sign up and confirm from the email we send you. Having a flourish account doesn't sign you up, and the waitlist wasn't added to it.

• Our own links can carry a short code naming the post they came from. On our web pages we count visits and taps through to the App Store or Google Play with that code, and we store no IP address, cookie or other identifier with those counts.

• On our public website pages we now use Microsoft Clarity heatmaps and session recordings to understand taps, scrolling and other page interactions. Page content is masked, Clarity cookies are off, and Clarity doesn't load for visitors in Quebec, the European Economic Area, the United Kingdom or Switzerland. It isn't used in the flourish app, on sign-in or sign-up pages, at checkout, or on any signed-in page.

• If you install the Android app from one of our links, Google Play can pass that code to the app the first time you open it. We keep it with your account and delete it when your account is deleted.

• We now also use your IP address briefly to limit repeated newsletter sign-ups, as we already do for account sign-ups and coach requests. We don't store it with your newsletter sign-up.

• If you enter a tester code when you sign up, we store the code and the date. Answers you give to the tester questions in the app are saved to your account.

• We added our mailing address to the policy.

Nothing about your bank connections or your financial information changed.

Questions? Email privacy@flourishmoney.app.

Reply to this email to stop getting privacy-policy notices by email.

GrowSmart Inc. (flourish), PO Box 29, Foxboro ON K0K 2B0`;

// A stand-in database: one claim per account, as the primary key is.
function fakeDb(accounts, launch = { live_on: "2026-11-12", created_at: "2026-11-12T14:00:00Z" }) {
  const sends = new Map();
  const db = {
    sends, writes: 0, reads: 0,
    from: (table) => {
      if (table === "newsletter_launch") { db.reads += 1; return { select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: launch, error: null }) }) }) }; }
      return { update: (patch) => { db.writes += 1; const f = {}; const b = { eq: (k, v) => { f[k] = v; if (f.user_id) sends.set(f.user_id, { ...sends.get(f.user_id), ...patch }); return b; }, then: (ok) => Promise.resolve({ error: null }).then(ok) }; return b; } };
    },
    rpc: async (fn, a) => {
      if (fn === "policy_notice_pending") { db.reads += 1; db.lastBefore = a.p_before; return { data: accounts.filter((x) => !sends.has(x.user_id)), error: null }; }
      if (fn === "policy_notice_claim") { db.writes += 1; if (sends.has(a.p_user_id)) return { data: false, error: null }; sends.set(a.p_user_id, { status: a.p_status || "claimed" }); return { data: true, error: null }; }
      throw new Error(fn);
    },
  };
  return db;
}
const people = (n) => Array.from({ length: n }, (_, i) => ({ user_id: `u${i}`, email: `p${i}@example.ca`, confirmed: i % 2 === 0 }));

(async () => {
  const t = create();
  const NOTICE_PATH = require.resolve("../netlify/functions/_lib/policyNotice");
  const SWEEP_PATH = require.resolve("../netlify/functions/policy-notice-sweep");
  const N = require(NOTICE_PATH);
  // The sweep with the notice's lines as given (the real module, or a stand-in for it).
  const sweepWith = (notice) => {
    delete require.cache[SWEEP_PATH];
    require.cache[NOTICE_PATH].exports = notice;
    const mod = require(SWEEP_PATH);
    require.cache[NOTICE_PATH].exports = N;
    return mod._test;
  };
  const withText = (edit) => ({ ...N,
    noticeText: (d) => edit(N.noticeText(d)),
    noticePayload: (to, d) => { const pl = N.noticePayload(to, d); return { ...pl, text: edit(pl.text), html: edit(pl.html) }; } });
  const { run, PER_RUN_CAP } = sweepWith(N);

  t.eq(N.noticeText("November 12, 2026"), APPROVED, "1a the words, exactly as approved");
  const p = N.noticePayload("a@example.ca", "November 12, 2026");
  t.eq([p.from, p.subject, p.to], ["flourish <hello@flourishmoney.app>", "We've updated the flourish privacy policy", ["a@example.ca"]], "1b the sender and subject");
  t.eq(p.reply_to, "hello@flourishmoney.app", "1b2 a reply reaches hello@flourishmoney.app");
  t.ok(p.html.includes("Reply to this email to stop getting privacy-policy notices by email."), "1b3 the stop line is in the HTML part too");
  t.ok(APPROVED.indexOf("Questions? Email") < APPROVED.indexOf("Reply to this email") && APPROVED.indexOf("Reply to this email") < APPROVED.indexOf("GrowSmart Inc. (flourish), PO Box"), "1b4 after the questions line, before the sender line");
  t.ok(p.html.includes("dated November 12, 2026") && p.html.includes("GrowSmart Inc. (flourish), PO Box 29, Foxboro ON K0K 2B0") && p.html.includes("We added our mailing address"), "1c the HTML part carries the same words");
  t.eq(N.dateLabel("2026-11-12"), "November 12, 2026", "1d the launch row's date");

  // Off.
  {
    const saved = process.env.POLICY_NOTICE_SEND;
    for (const v of [undefined, "", "true", "yes", "SEND"]) {
      if (v === undefined) delete process.env.POLICY_NOTICE_SEND; else process.env.POLICY_NOTICE_SEND = v;
      const db = fakeDb(people(3)); let sent = 0;
      t.eq((await run({ mode: process.env.POLICY_NOTICE_SEND, admin: db, send: async () => { sent += 1; return true; } })).mode, "off", `2a POLICY_NOTICE_SEND=${v}: off`);
      t.eq([sent, db.reads, db.writes], [0, 0, 0], "2b reads, sends and writes nothing");
    }
    if (saved === undefined) delete process.env.POLICY_NOTICE_SEND; else process.env.POLICY_NOTICE_SEND = saved;
  }

  // Dry run.
  {
    const accounts = [...people(4), { user_id: "snap", email: "snap@flourish.app", confirmed: true }, { user_id: "out", email: "out@example.ca", confirmed: true, opted_out: true }];
    const db = fakeDb(accounts); let sent = 0; const lines = [];
    const r = await run({ mode: "dry-run", admin: db, send: async () => { sent += 1; return true; }, log: (x) => lines.push(x) });
    t.eq([r.recipients, r.skipped, r.optedOut, r.sent, sent, db.writes], [4, 1, 1, 0, 0, 0], "3a counts them, sends nothing, writes nothing");
    t.ok(lines[0].includes("4 recipients (2 confirmed, 2 unconfirmed), 1 sample accounts left out, 1 opted out; nothing sent"), "3b prints the recipient count");
    t.ok(lines[1].includes(APPROVED), "3c prints one rendered copy");
    t.ok(!lines.join("\n").includes("@example.ca") && !lines.join("\n").includes("snap@"), "3d and no address");
    const none = fakeDb(people(1), null), l2 = [];
    await run({ mode: "dry-run", admin: none, log: (x) => l2.push(x) });
    t.ok(l2[1].includes("dated [launch date] and"), "3e before the launch row the date stays visibly unset");
    t.eq(none.lastBefore, "9999-12-31T00:00:00Z", "3f and it counts every account");
  }

  // Send.
  {
    const none = fakeDb(people(2), null); let sent0 = 0;
    t.eq((await run({ mode: "send", admin: none, send: async () => { sent0 += 1; return true; }, log: () => {} })).stopped, "no_launch_row", "4a no launch row: no send");
    t.eq(sent0, 0, "4b nothing sent");

    const db = fakeDb([...people(3), { user_id: "snap", email: "snap@flourish.app", confirmed: true }]); const to = [];
    const send = async (payload, id) => { to.push([payload.to[0], id]); return true; };
    const r1 = await run({ mode: "send", admin: db, send, log: () => {} });
    t.eq([r1.sent, r1.failed, to.length], [3, 0, 3], "4c every account once");
    t.eq(db.lastBefore, "2026-11-12T14:00:00Z", "4d only accounts from before the launch row");
    t.eq([...db.sends.values()].map((s) => s.status).sort(), ["sent", "sent", "sent", "skipped_sample"], "4e recorded; the sample account is claimed and not emailed");
    t.ok(!to.some(([a]) => a.startsWith("snap@")), "4f the sample account gets nothing");
    const r2 = await run({ mode: "send", admin: db, send, log: () => {} });
    t.eq([r2.sent, to.length], [0, 3], "4g running it again sends nothing: never twice");

    const optDb = fakeDb([...people(2), { user_id: "out", email: "out@example.ca", confirmed: true, opted_out: true }]); const optTo = [];
    const r9 = await run({ mode: "send", admin: optDb, send: async (pl) => { optTo.push(pl.to[0]); return true; }, log: () => {} });
    t.eq([r9.sent, optTo.includes("out@example.ca"), optDb.sends.has("out")], [2, false, false], "4g2 an account on the opt-out list gets nothing and isn't claimed");

    const big = fakeDb(people(PER_RUN_CAP + 5)); let n = 0;
    t.eq((await run({ mode: "send", admin: big, send: async () => { n += 1; return true; }, log: () => {} })).sent, PER_RUN_CAP, "4h a batch at a time");
    await run({ mode: "send", admin: big, send: async () => { n += 1; return true; }, log: () => {} });
    t.eq(n, PER_RUN_CAP + 5, "4i the next run finishes them, and nobody gets two");

    const bad = fakeDb(people(3)); const tried = [];
    const r3 = await run({ mode: "send", admin: bad, send: async (_, id) => { tried.push(id); return false; }, log: () => {} });
    t.eq([r3.sent, r3.failed, tried.length, bad.sends.get("u0").status], [0, 1, 1, "failed"], "4j a failure stops the run, and is recorded");
    await run({ mode: "send", admin: bad, send: async (_, id) => { tried.push(id); return true; }, log: () => {} });
    t.ok(tried.filter((x) => x === "u0").length === 1, "4k and that account is not retried");

    // Words still to come: nothing claimed, nothing sent (a "[WORDS: …]" placeholder never reaches an inbox).
    const pendingRun = sweepWith(withText((x) => x.replace("What changed:", "What changed: [WORDS: some-line]"))).run;
    const held = fakeDb(people(2)); let heldSent = 0;
    const r4 = await pendingRun({ mode: "send", admin: held, send: async () => { heldSent += 1; return true; }, log: () => {} });
    t.eq([r4.stopped, heldSent, held.sends.size], ["pending_words", 0, 0], "4m words still to come: the send stops before claiming or sending anything");

    // Two runs at once: the claim decides.
    const race = fakeDb(people(1)); const raced = []; const s = async (_, id) => { raced.push(id); return true; };
    await Promise.all([run({ mode: "send", admin: race, send: s, log: () => {} }), run({ mode: "send", admin: race, send: s, log: () => {} })]);
    t.eq(raced.length, 1, "4l two runs at once: one email");
  }

  const toml = fs.readFileSync(path.join(__dirname, "..", "netlify.toml"), "utf8");
  t.ok(/\[functions\."policy-notice-sweep"\]\s*\n\s*schedule = "\*\/15 \* \* \* \*"/.test(toml), "5a scheduled");
  const src = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "policy-notice-sweep.js"), "utf8") + fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", "_lib", "policyNotice.js"), "utf8");
  t.ok(!/from\("waitlist"\)|from\("newsletter_subscribers"\)/.test(src), "5b it reads neither the waitlist nor the newsletter list");
  t.summary("POLICY NOTICE");
})();
