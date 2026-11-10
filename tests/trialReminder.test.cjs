// tests/trialReminder.test.cjs
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST, ITEM 3: one reminder, 3 days before the first charge, on every platform.
//   4a-4c  the window and the email: sender, mailing address, one-click unsubscribe, the date and the amount, how to
//          cancel on that platform; nothing sent while a line is a placeholder
//   4d-4h  never more than one per trial: a second call, two at once, a send that stopped, a send that failed
//   4i-4k  the unsubscribe link: signed, one click (GET and RFC 8058 POST), and then no reminder
//   4l-4q  the website, from Stripe's trial_will_end: Stripe's own amount, the trial's end, never for a cancelled trial,
//          and nothing with the switch off
//   4r-4w  the stores, from the hourly sweep: in its window only, iPhone and Android lines, the plan's price, once
// Synthetic data only. The words are swapped for stand-in lines (as approved lines would be) only where a test needs
// an email that sends; with the real, still-placeholder lines nothing is ever sent (4c).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { fakeAdmin } = require("./_trialFakes.cjs");
const { signPayload } = require("../netlify/functions/_lib/stripeSignature.js");

const REPO = path.join(__dirname, "..");
const LIB = require.resolve("../netlify/functions/_lib/trialReminder.js");
const WORDS = require.resolve("../netlify/functions/_lib/trialWords.js");
const AUTH = require.resolve("../netlify/functions/_lib/auth.js");
const API = require.resolve("../netlify/functions/_lib/stripeApi.js");
const HOOK = require.resolve("../netlify/functions/stripe-webhook.js");
const SWEEP = require.resolve("../netlify/functions/trial-reminder-sweep.js");
const UNSUB = require.resolve("../netlify/functions/trial-reminder.js");
const SINCE = "2026-11-13T15:00:00Z";
const DAY = 86400000;
const END = Date.parse("2026-11-27T15:00:00Z");
const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";

// Stand-in lines, as approved ones would be: facts in braces.
const STAND_IN = {
  "trialfirst-email-subject": "Your free trial ends {date}",
  "trialfirst-email-lead": "Your 14 days free end on {date}.",
  "trialfirst-email-charge": "On {date} you'll be charged {amount}.",
  "trialfirst-email-keep": "Nothing to do to keep your plan.",
  "trialfirst-email-cancel-ios": "To cancel on iPhone before {date}: Settings > your name > Subscriptions > flourish.",
  "trialfirst-email-cancel-android": "To cancel on Android before {date}: Google Play > Payments & subscriptions > Subscriptions > flourish.",
  "trialfirst-email-cancel-web": "To cancel on the website before {date}: Settings > Manage subscription.",
  "trialfirst-email-why": "You started a free trial. This is the only reminder.",
  "trialfirst-email-unsubscribed": "No more trial reminders.",
  "trialfirst-email-link-bad": "This link doesn't work.",
  "trialfirst-email-unsub-failed": "Please try again.",
};
function clearFns() { for (const k of Object.keys(require.cache)) if (k.includes("/netlify/functions/")) delete require.cache[k]; }
function withWords(standIn) {
  clearFns();
  if (standIn) {
    const real = require(WORDS);
    const words = { ...real.TRIAL_EMAIL_WORDS, ...STAND_IN };
    require.cache[WORDS].exports = { TRIAL_EMAIL_WORDS: words, trialEmailWords: (id, f = {}) => Object.keys(f).reduce((s, k) => s.split(`{${k}}`).join(String(f[k])), words[id]) };
  }
}
function loadLib(standIn = true) { withWords(standIn); return require(LIB); }
function load(modPath, admin, { standIn = true, stripe = null, send = null } = {}) {
  withWords(standIn);
  const real = require(AUTH);
  require.cache[AUTH].exports = { ...real, getUserFromRequest: async () => ({ user_id: U1, error: null }), getAdminClient: () => admin };
  if (stripe) require.cache[API] = { id: API, filename: API, loaded: true, exports: stripe };
  // Resend, stood in for at the shared send function, before anything takes it.
  if (send) { const NL = require.resolve("../netlify/functions/_lib/newsletter.js"); const nl = require(NL); require.cache[NL].exports = { ...nl, sendEmail: send }; }
  return require(modPath);
}
const state = () => ({ __unique: { trial_reminders: ["provider", "subscription_ref"] }, __users: { [U1]: { email: "one@example.ca" }, [U2]: { email: "two@example.ca" } },
  subscriptions: [], trial_reminders: [], trial_reminder_optouts: [], billing_events: [], profiles: [] });
const outbox = () => { const sent = []; const send = async (payload, key) => { sent.push({ payload, key }); return true; }; return { sent, send }; };

(async () => {
  const t = create();
  const saved = { ...process.env };
  const realError = console.error; console.error = () => {};
  Object.assign(process.env, { WAITLIST_UNSUBSCRIBE_SECRET: "trial-reminder-test-secret", STRIPE_WEBHOOK_SECRET: "whsec_rem_test" });
  for (const k of ["TRIAL_PLAN_FIRST", "TRIAL_PLAN_FIRST_SINCE", "RESEND_API_KEY"]) delete process.env[k];
  const ON = () => Object.assign(process.env, { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: SINCE });
  const OFF = () => { delete process.env.TRIAL_PLAN_FIRST; delete process.env.TRIAL_PLAN_FIRST_SINCE; };
  try {
    // ── 4a-4c the window and the email ─────────────────────────────────────────────────────────────
    {
      const L = loadLib();
      t.eq([L.reminderDue(END, END - 3 * DAY), L.reminderDue(END, END - 3 * DAY - 1), L.reminderDue(END, END - 2 * DAY), L.reminderDue(END, END - DAY), L.reminderDue(END, END)],
        [true, false, true, false, false], "4a due from 3 days before the trial ends, never earlier, and never in its last day");
      const e = L.reminderEmail({ to: "one@example.ca", userId: U1, platform: "ios", trialEndMs: END, amount: "$11.99 CAD" });
      t.eq([e.from, e.reply_to, e.to], ["flourish <hello@flourishmoney.app>", "hello@flourishmoney.app", ["one@example.ca"]], "4b1 sent from hello@flourishmoney.app, to the account's own address");
      t.ok(e.text.includes("PO Box 29, Foxboro ON K0K 2B0"), "4b2 …with the mailing address");
      t.ok(/^<https:\/\/flourishmoney\.app\/api\/trial-reminder\?do=unsubscribe&u=[^&]+&t=[^>]+>, <mailto:hello@flourishmoney\.app\?subject=unsubscribe>$/.test(e.headers["List-Unsubscribe"])
        && e.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && e.text.includes("Unsubscribe in one click: https://flourishmoney.app/api/trial-reminder?"), "4b3 …and a one-click unsubscribe (RFC 8058 headers and a link)");
      t.ok(e.subject === "Your free trial ends November 27, 2026" && e.text.includes("On November 27, 2026 you'll be charged $11.99 CAD."), "4b4 …it says the date and amount of the first charge");
      t.ok(e.text.includes("Settings > your name > Subscriptions") && !e.text.includes("Google Play") && !e.text.includes("Manage subscription"), "4b5 …and how to cancel on an iPhone, only");
      const a = L.reminderEmail({ to: "x@example.ca", userId: U1, platform: "android", trialEndMs: END, amount: "$99.99 CAD" });
      const w = L.reminderEmail({ to: "x@example.ca", userId: U1, platform: "web", trialEndMs: END, amount: "$13.55 CAD" });
      t.ok(a.text.includes("Google Play > Payments & subscriptions") && w.text.includes("Settings > Manage subscription"), "4b6 …Android's way and the website's way");
      t.ok(e.html.includes("PO Box 29, Foxboro ON K0K 2B0") && e.html.includes("November 27, 2026"), "4b7 the HTML part says the same");

      const P = loadLib(false);
      const { sent, send } = outbox(); const S = state();
      const r = await P.sendTrialReminder(fakeAdmin(S), { provider: "stripe", ref: "sub_1", userId: U1, trialEndMs: END, platform: "web", amount: "$13.55 CAD", now: END - 3 * DAY, send });
      t.eq([r.reason, sent.length, S.trial_reminders.length], ["words_pending", 0, 0], "4c with the real lines still placeholders: nothing is sent, and nothing is claimed");
    }

    // ── 4d-4h never more than one per trial ────────────────────────────────────────────────────────
    {
      const L = loadLib();
      const S = state(); const admin = fakeAdmin(S); const { sent, send } = outbox();
      const args = { provider: "stripe", ref: "sub_1", userId: U1, trialEndMs: END, platform: "web", amount: "$13.55 CAD", now: END - 3 * DAY, send };
      t.eq((await L.sendTrialReminder(admin, args)).sent, true, "4d the first call sends it");
      t.eq([(await L.sendTrialReminder(admin, args)).reason, (await L.sendTrialReminder(admin, { ...args, now: END - 2 * DAY })).reason, sent.length], ["already_sent", "already_sent", 1], "4e a second call, and a later one, send nothing more");
      t.eq(sent[0].key, "trial-reminder/stripe/sub_1", "4e2 …and Resend is given one key per trial, so a retry is never a second email");
      // two at once
      const S2 = state(); const a2 = fakeAdmin(S2); const o2 = outbox();
      const slow = async (p, k) => { await new Promise((res) => setTimeout(res, 5)); return o2.send(p, k); };
      const both = await Promise.all([L.sendTrialReminder(a2, { ...args, send: slow }), L.sendTrialReminder(a2, { ...args, send: slow })]);
      t.eq([both.filter((x) => x.sent).length, o2.sent.length], [1, 1], "4f two at the same moment: one email");
      // a send that stopped (claimed, never sent): taken over after 15 minutes, never sooner
      const S3 = state(); S3.trial_reminders.push({ provider: "stripe", subscription_ref: "sub_1", user_id: U1, trial_end: new Date(END).toISOString(), claimed_at: new Date(END - 3 * DAY).toISOString(), sent_at: null });
      const a3 = fakeAdmin(S3); const o3 = outbox();
      t.eq((await L.sendTrialReminder(a3, { ...args, now: END - 3 * DAY + 10 * 60000, send: o3.send })).reason, "in_progress", "4g a claim under 15 minutes old is left alone");
      t.eq([(await L.sendTrialReminder(a3, { ...args, now: END - 3 * DAY + 16 * 60000, send: o3.send })).sent, o3.sent.length], [true, 1], "4g2 …and one older than that is taken over, once");
      // a send that failed: not recorded as sent, so it can go later
      const S4 = state(); const a4 = fakeAdmin(S4);
      t.eq((await L.sendTrialReminder(a4, { ...args, send: async () => false })).reason, "send_failed", "4h a send that failed says so");
      t.eq(S4.trial_reminders[0].sent_at, null, "4h2 …and is not recorded as sent");
      const o4 = outbox();
      t.eq([(await L.sendTrialReminder(a4, { ...args, now: args.now + 16 * 60000, send: o4.send })).sent, o4.sent.length], [true, 1], "4h3 …so the retry sends it, once");
    }

    // ── 4i-4k the unsubscribe link ─────────────────────────────────────────────────────────────────
    {
      const L = loadLib();
      const link = new URL(L.reminderUnsubscribeLink(U1));
      const S = state(); const admin = fakeAdmin(S);
      const route = load(UNSUB, admin)._test.route;
      const q = { do: "unsubscribe", u: link.searchParams.get("u"), t: link.searchParams.get("t") };
      let r = await route({ httpMethod: "GET", queryStringParameters: { ...q, t: q.t.slice(0, -2) + "xx" } }, { admin: () => admin });
      t.eq([r.statusCode, S.trial_reminder_optouts.length], [400, 0], "4i a link that was altered does nothing");
      r = await route({ httpMethod: "GET", queryStringParameters: { ...q, u: U2 } }, { admin: () => admin });
      t.eq([r.statusCode, S.trial_reminder_optouts.length], [400, 0], "4i2 …nor one for another account");
      r = await route({ httpMethod: "POST", queryStringParameters: q, body: "List-Unsubscribe=One-Click" }, { admin: () => admin });
      t.eq([r.statusCode, S.trial_reminder_optouts.map((x) => x.user_id)], [200, [U1]], "4j one click (the mail app's POST) unsubscribes that account");
      const { sent, send } = outbox();
      const res = await L.sendTrialReminder(admin, { provider: "stripe", ref: "sub_9", userId: U1, trialEndMs: END, platform: "web", amount: "$13.55 CAD", now: END - 3 * DAY, send });
      t.eq([res.reason, sent.length], ["unsubscribed", 0], "4k …and then no reminder is sent to it");
    }

    // ── 4l-4q the website, from Stripe's trial_will_end ────────────────────────────────────────────
    {
      const T = Math.floor(END / 1000);
      const sub = (o = {}) => ({ id: "sub_web", customer: "cus_1", status: "trialing", trial_end: T, cancel_at_period_end: false, cancel_at: null,
        metadata: { user_id: U1, plan_key: "monthly" }, items: { data: [{ price: { id: "price_monthly_1199", unit_amount: 1199, currency: "cad" } }] }, ...o });
      const event = async (S, id, object, { previewFails = false } = {}) => {
        const calls = [];
        const stripe = { stripeGet: async () => ({ data: [] }), stripePost: async (p, b) => { calls.push([p, b]); if (previewFails) throw new Error("down"); return { total: 1355, currency: "cad" }; } };
        const sentBox = [];
        const hook = load(HOOK, fakeAdmin(S), { stripe, send: async (p, k) => { sentBox.push({ p, k }); return true; } });
        const body = JSON.stringify({ id, created: T - 3 * 86400, type: "customer.subscription.trial_will_end", data: { object } });
        const r = await hook.handler({ httpMethod: "POST", headers: { "stripe-signature": signPayload(body, "whsec_rem_test") }, body });
        return { code: r.statusCode, sent: sentBox, calls };
      };
      ON();
      let S = state();
      let r = await event(S, "evt_1", sub());
      t.eq([r.code, r.sent.length], [200, 1], "4l on: trial_will_end sends the website's reminder");
      t.ok(r.sent[0].p.text.includes("On November 27, 2026 you'll be charged $13.55 CAD.") && r.sent[0].p.text.includes("Settings > Manage subscription"), "4m …with Stripe's own amount (tax included), the trial's end date, and the website's way to cancel");
      t.eq(r.calls[0], ["/invoices/create_preview", { subscription: "sub_web" }], "4m2 …the amount is Stripe's preview of that first invoice");
      r = await event(S, "evt_2", sub());
      t.eq(r.sent.length, 0, "4n the same trial again (a second event): nothing more");
      S = state();
      r = await event(S, "evt_3", sub({ cancel_at_period_end: true }));
      t.eq([r.code, r.sent.length], [200, 0], "4o a trial already cancelled: no reminder");
      S = state();
      r = await event(S, "evt_4", sub(), { previewFails: true });
      t.ok(r.sent.length === 1 && r.sent[0].p.text.includes("$11.99 CAD plus tax"), "4p Stripe cannot preview it: the plan's price, plus tax");
      OFF();
      S = state();
      r = await event(S, "evt_5", sub());
      t.eq([r.code, r.sent.length], [200, 0], "4q off: trial_will_end is ignored, as before");
    }

    // ── 4r-4w the stores, from the hourly sweep ────────────────────────────────────────────────────
    {
      ON();
      const row = (o) => ({ user_id: U1, provider: "app_store", status: "trialing", plan_key: "monthly", current_period_end: new Date(END).toISOString(), cancel_at_period_end: false, ...o });
      const run = async (S, now) => { const box = outbox(); const sw = load(SWEEP, fakeAdmin(S))._test.sweep; const out = await sw({ admin: fakeAdmin(S), now, send: box.send }); return { out, sent: box.sent }; };
      let S = state(); S.subscriptions.push(row({}));
      let r = await run(S, END - 5 * DAY);
      t.eq(r.sent.length, 0, "4r five days out: not yet");
      r = await run(S, END - 3 * DAY + 3600000);
      t.ok(r.sent.length === 1 && r.sent[0].payload.text.includes("Settings > your name > Subscriptions") && r.sent[0].payload.text.includes("$11.99 CAD"), "4s 3 days out: the iPhone's reminder, with the plan's price");
      r = await run(S, END - 3 * DAY + 2 * 3600000);
      t.eq(r.sent.length, 0, "4t the next hour's sweep: nothing more");
      S = state(); S.subscriptions.push(row({ provider: "play_store", plan_key: "founding_annual", user_id: U2 }));
      r = await run(S, END - 3 * DAY + 60000);
      t.ok(r.sent.length === 1 && r.sent[0].payload.text.includes("Google Play > Payments") && r.sent[0].payload.text.includes("$79.99 CAD"), "4u Android, founding: Android's way, the founding price");
      S = state(); S.subscriptions.push(row({ cancel_at_period_end: true }), row({ user_id: U2, provider: "stripe" }), row({ user_id: U2, status: "active" }));
      r = await run(S, END - 3 * DAY + 60000);
      t.eq(r.sent.length, 0, "4v a cancelled store trial, a website row (Stripe sends that one) and a paid row: none");
      OFF();
      const h = await load(SWEEP, fakeAdmin(state())).handler();
      t.eq(JSON.parse(h.body), { off: true }, "4w off: the sweep does nothing");
      const pricing = fs.readFileSync(path.join(REPO, "src", "lib", "pricing.js"), "utf8");
      const L = loadLib();
      t.ok(/monthly:\s*11\.99/.test(pricing) && /annual:\s*99\.99/.test(pricing) && /foundingAnnual:\s*79\.99/.test(pricing)
        && L.STORE_PRICES.monthly === "$11.99 CAD" && L.STORE_PRICES.annual === "$99.99 CAD" && L.STORE_PRICES.founding_annual === "$79.99 CAD", "4w2 the store prices are pricing.js's");
      const toml = fs.readFileSync(path.join(REPO, "netlify.toml"), "utf8");
      t.ok(/\[functions\."trial-reminder-sweep"\]\s+schedule = "@hourly"/.test(toml) && /from\s+= "\/api\/trial-reminder"\s+to\s+= "\/\.netlify\/functions\/trial-reminder"/.test(toml), "4w3 the sweep runs hourly and the unsubscribe link is routed");
      const sql = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0046_trial_plan_first.sql"), "utf8");
      t.ok(/primary key \(provider, subscription_ref\)/.test(sql) && /create table if not exists public\.trial_reminder_optouts/.test(sql), "4w4 0046: one row per trial (the key), and the opt-outs");
    }
  } finally {
    console.error = realError;
    process.env = saved;
    clearFns();
  }
  t.summary("trialReminder.test");
})();
