// tests/gifts.test.cjs
// -----------------------------------------------------------------------------
// GIFTS, THE SERVER (netlify/functions/_lib/gifts.js, gift.js, gift-send-sweep.js, the gift branch of stripe-webhook.js,
// and the entitlement in _lib/auth.js getUserPlan and billing.js). The database is tests/_giftFake.cjs, which does what
// migration 0050's functions do (tests/gifts.sql.test.cjs runs the real ones). The emails are read twice: with the
// placeholders the code holds today (never sent), and with GIFT-COPY.md's drafts (as they would be sent once approved).
//   1  the code: 12 characters, no look-alikes, unguessable, typed any way
//   2  the dates: 7 a.m. Eastern in winter and summer, and on both clock-change days; the days a buyer may pick
//   3  the buyer's form: what is required for each delivery, what is ignored
//   4  Stripe Checkout: payment mode, the one price config, tax as the website's sales have it, no promotion codes
//   5  /api/gift: off until GIFTS_ENABLED, never for a store app, prices, checkout, redeem, rate limits
//   6  the webhook: signature, one code per session however often it arrives, Email 1 once, refunds
//   7  redeeming: an account that already pays starts the gift when its paid period ends, and is told where to stop renewal
//   8  the entitlement: getUserPlan, billing status and store_status, and a partner in couple mode
//   9  the recipient's email: on its day, once, safe to run again
//  10  the emails' words, with the drafts
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");
const crypto = require("crypto");
const { makeFake, draftWords } = require("./_giftFake.cjs");

const FN = path.join(__dirname, "..", "netlify", "functions");
const P = {
  gifts: require.resolve(path.join(FN, "_lib", "gifts.js")),
  words: require.resolve(path.join(FN, "_lib", "giftWords.js")),
  auth: require.resolve(path.join(FN, "_lib", "auth.js")),
  household: require.resolve(path.join(FN, "_lib", "household.js")),
  api: require.resolve(path.join(FN, "_lib", "stripeApi.js")),
  gift: require.resolve(path.join(FN, "gift.js")),
  sweep: require.resolve(path.join(FN, "gift-send-sweep.js")),
  hook: require.resolve(path.join(FN, "stripe-webhook.js")),
  billing: require.resolve(path.join(FN, "billing.js")),
};
const SUPA = require.resolve("@supabase/supabase-js", { paths: [FN] });
const DRAFTS = draftWords();

/** Load the functions fresh, with the drafted words (as approved) or the real placeholders, and a fake database. */
function load({ fake, words = "drafts", user = null } = {}) {
  for (const p of Object.values(P)) delete require.cache[p];
  delete require.cache[SUPA];
  if (words === "drafts") {
    const real = require(P.words);
    require.cache[P.words].exports = { ...real, GIFT_WORDS: Object.freeze({ ...real.GIFT_WORDS, ...DRAFTS }),
      giftWords: (id, vars, w) => real.giftWords(id, vars, w || { ...real.GIFT_WORDS, ...DRAFTS }) };
  }
  require.cache[SUPA] = { id: SUPA, filename: SUPA, loaded: true, exports: { createClient: () => fake.client } };
  const auth = require(P.auth);
  require.cache[P.auth].exports = { ...auth, getAdminClient: () => fake.client, getUserFromRequest: async () => (user ? { user_id: user } : { user_id: null, error: "missing Authorization header" }) };
  return { gifts: require(P.gifts), auth };
}
const mod = (p) => { delete require.cache[p]; return require(p); };

// Resend, as the emails see it: every request is recorded, each idempotency key is sent once.
function fakeResend(t0 = []) {
  const calls = t0; const seen = new Set();
  global.fetch = async (url, init) => {
    if (String(url) !== "https://api.resend.com/emails") throw new Error(`unexpected fetch ${url}`);
    const key = init.headers["Idempotency-Key"];
    calls.push({ key, body: JSON.parse(init.body), repeat: seen.has(key) });
    seen.add(key);
    return { ok: true, status: 200, json: async () => ({ id: "re_1" }) };
  };
  return calls;
}

const SECRET = "whsec_gift_test";
function signed(evt) {
  const raw = JSON.stringify(evt);
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");
  return { httpMethod: "POST", headers: { "stripe-signature": `t=${ts},v1=${sig}` }, body: raw };
}
function session(over = {}, meta = {}) {
  return { id: "cs_test_gift1", object: "checkout.session", mode: "payment", payment_status: "paid", livemode: false,
    payment_intent: "pi_test_gift1", amount_subtotal: 9999, amount_total: 11299, total_details: { amount_tax: 1300 }, currency: "cad",
    customer_details: { email: "buyer@example.ca" },
    metadata: { kind: "gift", gift_plan: "flourish", delivery: "email", buyer_email: "buyer@example.ca", recipient_name: "Sam",
      recipient_email: "sam@example.ca", gift_message: "Merry Christmas, Sam", send_on: "2026-12-25", start_on: "2027-01-01", ...meta }, ...over };
}
const evt = (id, type, object) => ({ id, type, created: Math.floor(Date.now() / 1000), livemode: false, data: { object } });
const web = (body, extra = {}) => ({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", "x-nf-client-connection-ip": "203.0.113.7", ...extra }, body: JSON.stringify(body) });
function memStore() { const m = new Map(); return { m, get: async (k) => m.get(k) || null, setJSON: async (k, v) => { m.set(k, v); } }; }

(async () => {
  const t = create();
  const savedEnv = { ...process.env }, savedFetch = global.fetch;
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.RESEND_API_KEY = "re_test_not_real";
  process.env.LIMITER_HASH_SECRET = "gift-test-limiter";
  process.env.APP_ORIGIN = "https://flourishmoney.app";
  // Names only: the Supabase client itself is the stand-in (load() replaces createClient).
  process.env.SUPABASE_URL = "https://placeholder.invalid";
  process.env.SUPABASE_SECRET_KEY = "placeholder-secret";
  try {
    // ── 1. the code ──────────────────────────────────────────────────────────────────────────────────
    {
      const { gifts: G } = load({ fake: makeFake() });
      const codes = Array.from({ length: 3000 }, () => G.makeGiftCode());
      t.ok(codes.every((c) => G.CODE_RE.test(c)), "1a every code is 12 characters from the 31");
      t.ok(codes.every((c) => !/[01OIL]/.test(c)), "1b …with no 0, O, 1, I or L, so it reads aloud and types cleanly");
      t.eq(new Set(codes).size, codes.length, "1c 3,000 codes, all different");
      const counts = {}; codes.join("").split("").forEach((ch) => { counts[ch] = (counts[ch] || 0) + 1; });
      const n = 36000 / 31;
      t.ok(Object.keys(counts).length === 31 && Object.values(counts).every((c) => c > n * 0.75 && c < n * 1.25), "1d every character turns up about as often as any other");
      let calls = 0;
      const rigged = (k) => { calls++; return calls === 1 ? Buffer.alloc(k, 255) : Buffer.from(Array.from({ length: k }, (_, i) => i)); };
      t.eq(G.makeGiftCode(rigged), "ABCDEFGHJKMN", "1e a byte of 248 or more is thrown away, never folded onto a character");
      t.eq([G.normaliseGiftCode(" abcd-efgh jkmn "), G.isGiftCode("abcd efgh-jkmn"), G.isGiftCode("ABCD-EFGH-JKM0")], ["ABCDEFGHJKMN", true, false], "1f typed with spaces, dashes or in lower case: the same code");
      t.eq(G.formatGiftCode("ABCDEFGHJKMN"), "ABCD-EFGH-JKMN", "1g shown as three groups of four");
    }

    // ── 2. the dates ─────────────────────────────────────────────────────────────────────────────────
    {
      const { gifts: G } = load({ fake: makeFake() });
      t.eq([G.sendInstant("2026-12-25").toISOString(), G.sendInstant("2027-07-01").toISOString()], ["2026-12-25T12:00:00.000Z", "2027-07-01T11:00:00.000Z"], "2a 7 a.m. Eastern, in winter and in summer");
      t.eq([G.sendInstant("2027-03-14").toISOString(), G.sendInstant("2026-11-01").toISOString()], ["2027-03-14T11:00:00.000Z", "2026-11-01T12:00:00.000Z"], "2b …and on both clock-change days");
      const now = new Date("2026-11-20T16:00:00Z");
      t.eq(["2026-11-20", "2026-11-19", "2027-11-20", "2027-11-21", "2026-02-30", "12/25/2026"].map((d) => { const r = G.pickDay(d, now); return r.value || r.invalid; }),
        ["2026-11-20", "past", "2027-11-20", "too_far", "format", "format"], "2c a buyer may pick from today to a year from today, Eastern, and only a real day");
      t.eq(G.torontoToday(new Date("2026-12-25T04:30:00Z")), "2026-12-24", "2d late evening Eastern is still that day");
      t.eq(G.formatDay("2026-12-25"), "December 25, 2026", "2e a date reads like December 25, 2026");
    }

    // ── 3. the buyer's form ──────────────────────────────────────────────────────────────────────────
    {
      const { gifts: G } = load({ fake: makeFake() });
      const now = new Date("2026-11-20T16:00:00Z");
      const ok = G.checkGiftForm({ plan: "flourish_plus", buyer_email: " Buyer@Example.CA ", delivery: "email", recipient_name: " Sam\u0007 Lee ",
        recipient_email: "sam@example.ca", send_on: "2026-12-25", message: "Merry\nChristmas", start_on: "2027-01-01", price: 1, amount: 1, code: "ABCDEFGHJKMN" }, now);
      t.eq(ok.form, { plan: "flourish_plus", buyer_email: "buyer@example.ca", delivery: "email", recipient_name: "Sam Lee", recipient_email: "sam@example.ca",
        message: "Merry Christmas", send_on: "2026-12-25", start_on: "2027-01-01" }, "3a an emailed gift: every field, cleaned; a price, an amount or a code in the body is ignored");
      const print = G.checkGiftForm({ plan: "flourish", buyer_email: "b@example.ca", delivery: "print", recipient_email: "x@example.ca", send_on: "2026-12-25" }, now);
      t.eq([print.ok, print.form.recipient_email, print.form.send_on, print.form.recipient_name], [true, null, null, null], "3b a printed card needs no name, address or day, and keeps none");
      t.eq(G.checkGiftForm({ plan: "flourish", delivery: "email" }, now).errors, ["buyer_email", "recipient_email", "recipient_name", "send_on"], "3c an emailed gift needs the buyer's address, the recipient's name and address, and a day");
      t.eq(G.checkGiftForm({ plan: "pro", buyer_email: "b@example.ca", delivery: "fax" }, now).errors, ["plan", "delivery"], "3d only the two gifts and the two deliveries");
      t.eq(G.checkGiftForm({ plan: "flourish", buyer_email: "b@example.ca", delivery: "print", message: "x".repeat(201) }, now).errors, ["message"], "3e a message over 200 characters is refused, not cut");
      t.eq(G.checkGiftForm({ plan: "flourish", buyer_email: "b@example.ca", delivery: "print", start_on: "2025-01-01" }, now).errors, ["start_on"], "3f a start day in the past is refused");
    }

    // ── 4. Stripe Checkout ───────────────────────────────────────────────────────────────────────────
    {
      const { gifts: G } = load({ fake: makeFake() });
      t.eq(G.GIFT_PRICES, { currency: "cad", flourish: 9999, flourish_plus: 14998 }, "4a the prices are one value: $99.99 and $149.98 CAD, before tax");
      const form = G.checkGiftForm({ plan: "flourish_plus", buyer_email: "b@example.ca", delivery: "print" }).form;
      process.env.STRIPE_TAX_ENABLED = "true";
      const p = G.checkoutParams(form);
      t.eq([p.mode, p.line_items.length, p.line_items[0].price_data.unit_amount, p.line_items[0].price_data.currency, p.line_items[0].price_data.tax_behavior, p.line_items[0].price_data.recurring],
        ["payment", 1, 14998, "cad", "exclusive", undefined], "4b one charge, nothing recurring, the price from that one value, tax on top");
      t.eq([p.automatic_tax.enabled, p.billing_address_collection, p.customer_update, p.customer], [true, "required", undefined, undefined], "4c Stripe Tax as the website's sales have it, with no customer to update");
      t.eq([p.allow_promotion_codes, p.subscription_data, p.discounts], [false, undefined, undefined], "4d no promotion codes (so no creator codes), and no subscription");
      t.eq([p.metadata.kind, p.metadata.gift_plan, p.metadata.buyer_email, p.payment_intent_data.metadata.kind], ["gift", "flourish_plus", "b@example.ca", "gift"], "4e the webhook can tell it is a gift, and which");
      t.eq([p.success_url, p.cancel_url, p.payment_method_types], ["https://flourishmoney.app/gift/?bought=1", "https://flourishmoney.app/gift/", ["card"]], "4f back to the gift page; card only, so paid means paid");
      process.env.STRIPE_TAX_ENABLED = "";
      t.eq(G.checkoutParams(form).automatic_tax.enabled, false, "4g STRIPE_TAX_ENABLED off: no tax, as billing.js does");
      const fs = require("fs");
      const pages = ["index.html", "gift.js", "redeem.html", "redeem.js", "card.html", "card.js"].map((f) => fs.readFileSync(path.join(__dirname, "..", "public", "gift", f), "utf8")).join("\n");
      t.ok(!/99\.99|149\.98|9999|14998/.test(pages), "4h no price is written in the gift pages: they read it from /api/gift");
    }

    // ── 5. /api/gift ─────────────────────────────────────────────────────────────────────────────────
    {
      const fake = makeFake();
      load({ fake, user: "user-1" });
      delete process.env.GIFTS_ENABLED;
      let fn = mod(P.gift);
      const shut = [(await fn.run({ httpMethod: "GET", headers: {} })).statusCode,
        (await fn.run(web({ action: "checkout", plan: "flourish", buyer_email: "b@example.ca", delivery: "print" }), { store: memStore() })).statusCode,
        (await fn.run(web({ action: "redeem", code: "ABCDEFGHJKMN" }), { store: memStore(), getUser: async () => ({ user_id: null, error: "missing Authorization header" }) })).statusCode];
      t.eq(shut, [404, 404, 401], "5a GIFTS_ENABLED unset: no prices and no checkout, but redeeming still answers (codes never strand)");
      process.env.GIFTS_ENABLED = "true";
      fn = mod(P.gift);
      for (const origin of ["capacitor://localhost", "https://localhost"]) {
        const r = await fn.run({ ...web({ action: "redeem", code: "ABCDEFGHJKMN" }), headers: { origin } }, { store: memStore() });
        t.eq([r.statusCode, JSON.parse(r.body).error], [403, "web_only"], `5b a store app (${origin}) is refused: redeeming is website only`);
      }
      const prices = await fn.run({ httpMethod: "GET", headers: { origin: "https://flourishmoney.app" } }, { store: memStore() });
      t.eq(JSON.parse(prices.body), { enabled: true, currency: "cad", prices: { flourish: 9999, flourish_plus: 14998 } }, "5c the page reads the prices from the one value");
      let sent = null;
      const stripePost = async (p2, params) => { sent = { p2, params }; return { id: "cs_x", url: "https://checkout.stripe.com/c/pay/cs_x" }; };
      const bad = await fn.run(web({ action: "checkout", plan: "flourish", delivery: "email" }), { store: memStore(), stripePost });
      t.eq([bad.statusCode, JSON.parse(bad.body).fields, sent], [400, ["buyer_email", "recipient_email", "recipient_name", "send_on"], null], "5d a form with gaps: 400 with the fields, and Stripe is not asked");
      const good = await fn.run(web({ action: "checkout", plan: "flourish", buyer_email: "b@example.ca", delivery: "print" }), { store: memStore(), stripePost });
      t.eq([good.statusCode, JSON.parse(good.body).url, sent.p2, sent.params.mode], [200, "https://checkout.stripe.com/c/pay/cs_x", "/checkout/sessions", "payment"], "5e a whole form: a Checkout Session, and its address");
      const down = await fn.run(web({ action: "checkout", plan: "flourish", buyer_email: "b@example.ca", delivery: "print" }), { store: memStore(), stripePost: async () => { const e = new Error("No such price: acct_secret_detail"); e.statusCode = 400; throw e; } });
      t.eq([down.statusCode, /acct_secret/.test(down.body)], [502, false], "5f Stripe refusing: 502, and its message stays on the server");
      const st = memStore();
      let last;
      for (let i = 0; i < 21; i++) last = await fn.run(web({ action: "checkout", plan: "flourish", buyer_email: "b@example.ca", delivery: "print" }), { store: st, stripePost });
      t.eq(last.statusCode, 429, "5g 20 checkouts an hour from one address, then 429");
      t.ok([...st.m.keys()].every((k) => !k.includes("203.0.113.7")), "5h …counted under a keyed hash, never the address itself");
      // redeem
      const noAuth = await mod(P.gift).run(web({ action: "redeem", code: "ABCD-EFGH-JKMN" }), { store: memStore(), getUser: async () => ({ user_id: null, error: "missing Authorization header" }) });
      t.eq(noAuth.statusCode, 401, "5i redeeming needs a signed-in account");
      const rs = memStore();
      const user = async () => ({ user_id: "user-1" });
      fake.GIFT.gift_create({ p_code: "ABCDEFGHJKMN", p_plan: "flourish", p_session: "cs_r1", p_delivery: "print", p_buyer_email: "b@example.ca" });
      const answers = [];
      for (let i = 0; i < 9; i++) {
        const r = await mod(P.gift).run(web({ action: "redeem", code: i === 0 ? "abcd-efgh-jkmn" : "ZZZZ-ZZZZ-ZZZZ" }), { store: rs, getUser: user, admin: fake.client });
        answers.push(r.statusCode === 429 ? "limited" : JSON.parse(r.body).result);
      }
      t.eq(answers, ["ok", "invalid", "invalid", "invalid", "invalid", "invalid", "invalid", "invalid", "limited"], "5j a code redeems once; then 8 tries an hour per account, whatever they are");
      const ipStore = memStore(); let ipLast;
      for (let i = 0; i < 21; i++) ipLast = await mod(P.gift).run(web({ action: "redeem", code: "ZZZZZZZZZZZZ" }), { store: ipStore, getUser: async () => ({ user_id: `u-${i}` }), admin: fake.client });
      t.eq(ipLast.statusCode, 429, "5k …and 20 an hour per IP address, however many accounts try");
      const closed = await mod(P.gift).run(web({ action: "redeem", code: "ZZZZZZZZZZZZ" }), { store: null, getUser: user, admin: fake.client });
      t.eq(closed.statusCode, 429, "5l with no way to count, a redeem is refused (a guesser never gets unlimited tries)");
    }

    // ── 6. the webhook ───────────────────────────────────────────────────────────────────────────────
    {
      const fake = makeFake();
      const mail = fakeResend();
      load({ fake });
      const hook = mod(P.hook);
      const bad = await hook.handler({ ...signed(evt("evt_bad", "checkout.session.completed", session())), headers: { "stripe-signature": "t=1,v1=00" } });
      t.eq([bad.statusCode, fake.state.gifts.length], [400, 0], "6a a wrong signature: 400, nothing read, no code");
      const first = await hook.handler(signed(evt("evt_g1", "checkout.session.completed", session())));
      t.eq([first.statusCode, fake.state.gifts.length], [200, 1], "6b a paid gift checkout makes one code");
      const g = fake.state.gifts[0];
      t.eq([g.plan, g.delivery, g.recipient_email, g.send_on, g.start_on, g.livemode, g.amount_total_cents, g.stripe_payment_intent],
        ["flourish", "email", "sam@example.ca", "2026-12-25", "2027-01-01", false, 11299, "pi_test_gift1"], "6c …saving the plan, the recipient, the delivery day, the start day and the payment");
      t.eq([mail.length, mail[0].key, mail[0].body.to, mail[0].body.subject], [1, "gift-buyer/cs_test_gift1", ["buyer@example.ca"], DRAFTS["gift-email1-subject"]], "6d Email 1 goes to the buyer at once, keyed to the session");
      t.ok(!!g.buyer_emailed_at, "6e …and is recorded");
      await hook.handler(signed(evt("evt_g1", "checkout.session.completed", session())));
      await hook.handler(signed(evt("evt_g1_again", "checkout.session.completed", session())));
      t.eq([fake.state.gifts.length, mail.length], [1, 1], "6f the same event again, and a second event for the same session: still one code, still one email");
      t.eq(fake.state.writes.filter((w) => w.table === "subscriptions").length, 0, "6g a gift writes no subscription row");
      t.eq(fake.state.rows.billing_events.find((e) => e.event_id === "evt_g1").status, "processed", "6h the event is marked processed");
      // an email that fails, then works
      const fake2 = makeFake(); load({ fake: fake2 });
      let fail = true; const calls2 = [];
      global.fetch = async (url, init) => { calls2.push(init.headers["Idempotency-Key"]); return fail ? { ok: false, status: 500 } : { ok: true, status: 200 }; };
      const h2 = mod(P.hook);
      const f1 = await h2.handler(signed(evt("evt_f1", "checkout.session.completed", session({ id: "cs_fail" }))));
      t.eq([f1.statusCode, fake2.state.gifts.length, fake2.state.rows.billing_events[0].status], [500, 1, "failed"], "6i Email 1 failing: 500 so Stripe retries, and the code already exists");
      const code1 = fake2.state.gifts[0].code;
      fail = false;
      const f2 = await h2.handler(signed(evt("evt_f1", "checkout.session.completed", session({ id: "cs_fail" }))));
      t.eq([f2.statusCode, fake2.state.gifts.length, fake2.state.gifts[0].code, calls2], [200, 1, code1, ["gift-buyer/cs_fail", "gift-buyer/cs_fail"]], "6j Stripe's retry sends it with the same code and the same key");
      // refunded before Email 1 could go: the retry never emails a void code
      const fakeV = makeFake(); load({ fake: fakeV }); const mV = fakeResend();
      global.fetch = async () => ({ ok: false, status: 500 });
      const hV = mod(P.hook);
      await hV.handler(signed(evt("evt_v1", "checkout.session.completed", session({ id: "cs_void", payment_intent: "pi_void" }))));
      fakeResend(mV);
      await hV.handler(signed(evt("evt_v2", "charge.refunded", { id: "ch_v", object: "charge", payment_intent: "pi_void", refunded: true, amount_refunded: 11299 })));
      const vRetry = await hV.handler(signed(evt("evt_v1", "checkout.session.completed", session({ id: "cs_void", payment_intent: "pi_void" }))));
      t.eq([vRetry.statusCode, fakeV.state.gifts[0].voided_at ? "void" : "live", mV.length], [200, "void", 0], "6p refunded before Email 1 went: Stripe's retry sends no email for the void code");
      // unpaid, and the placeholders
      const fake3 = makeFake(); load({ fake: fake3 }); fakeResend();
      await mod(P.hook).handler(signed(evt("evt_u", "checkout.session.completed", session({ id: "cs_unpaid", payment_status: "unpaid" }))));
      t.eq(fake3.state.gifts.length, 0, "6k a checkout not paid makes no code");
      const fake4 = makeFake(); load({ fake: fake4, words: "real" }); const m4 = fakeResend();
      const w4 = await mod(P.hook).handler(signed(evt("evt_w", "checkout.session.completed", session({ id: "cs_words" }))));
      t.eq([w4.statusCode, fake4.state.gifts.length, m4.length, fake4.state.rows.billing_events[0].error], [200, 1, 0, "gift: buyer email placeholder"], "6l words not approved yet: the code is made, the email is never sent with a placeholder, and the event says so");
      // refunds
      const fake5 = makeFake(); load({ fake: fake5 }); fakeResend();
      const h5 = mod(P.hook);
      await h5.handler(signed(evt("evt_p1", "checkout.session.completed", session({ id: "cs_r1", payment_intent: "pi_r1" }))));
      await h5.handler(signed(evt("evt_p2", "checkout.session.completed", session({ id: "cs_r2", payment_intent: "pi_r2" }))));
      await h5.handler(signed(evt("evt_p3", "checkout.session.completed", session({ id: "cs_r3", payment_intent: "pi_r3" }))));
      fake5.GIFT.gift_redeem({ p_code: fake5.state.gifts[1].code, p_user: "u-r", p_now: new Date().toISOString() });
      await h5.handler(signed(evt("evt_rf1", "charge.refunded", { id: "ch_1", object: "charge", payment_intent: "pi_r1", refunded: true, amount_refunded: 11299 })));
      await h5.handler(signed(evt("evt_rf2", "charge.refunded", { id: "ch_2", object: "charge", payment_intent: "pi_r2", refunded: true, amount_refunded: 11299 })));
      await h5.handler(signed(evt("evt_rf3", "charge.refunded", { id: "ch_3", object: "charge", payment_intent: "pi_r3", refunded: false, amount_refunded: 1300 })));
      t.eq(fake5.state.gifts.map((x) => (x.voided_at ? "void" : x.redeemed_at ? "redeemed" : "unused")), ["void", "redeemed", "unused"], "6m a full refund voids an unused code; a redeemed one and a partial refund leave it as it is");
      t.eq(fake5.state.rows.billing_events.filter((e) => e.event_id.startsWith("evt_rf")).map((e) => e.error), ["gift: voided", "gift: refunded after redeem, code kept", "gift: partial refund, code kept"], "6n …each recorded on its event");
      const other = await h5.handler(signed(evt("evt_rf4", "charge.refunded", { id: "ch_4", object: "charge", payment_intent: "pi_subscription", customer: "cus_1", refunded: true, amount_refunded: 999 })));
      t.eq([other.statusCode, fake5.state.rpcCalls.some((c) => c.fn === "gift_refund" && c.args.p_payment_intent === "pi_subscription")], [200, true], "6o a refund that is not a gift's goes on to the subscription handling");
    }

    // ── 7. redeeming when the account already pays ───────────────────────────────────────────────────
    {
      const fake = makeFake({ rows: { subscriptions: [
        { user_id: "u-ios", provider: "app_store", status: "active", current_period_end: "2027-03-01T00:00:00Z", cancel_at_period_end: false },
        { user_id: "u-web", provider: "stripe", status: "active", current_period_end: "2027-02-01T00:00:00Z", cancel_at_period_end: true },
        { user_id: "u-old", provider: "stripe", status: "canceled", current_period_end: "2026-10-01T00:00:00Z", cancel_at_period_end: false },
      ] } });
      const { gifts: G } = load({ fake });
      const now = new Date("2026-12-26T15:00:00Z");
      ["AAAAAAAAAAAA", "BBBBBBBBBBBB", "CCCCCCCCCCCC", "DDDDDDDDDDDD"].forEach((c, i) => fake.GIFT.gift_create({ p_code: c, p_plan: i === 3 ? "flourish_plus" : "flourish", p_session: `cs_7${i}`, p_delivery: "print", p_buyer_email: "b@example.ca", p_start_on: i === 3 ? "2027-01-10" : null }));
      const ios = await G.redeemGift({ admin: fake.client, userId: "u-ios", rawCode: "AAAA-AAAA-AAAA", now });
      t.eq([ios.ok, ios.starts_at, ios.ends_at, ios.pending, ios.already_paid], [true, "2027-03-01T00:00:00.000Z", "2028-03-01T00:00:00.000Z", true,
        { provider: "app_store", renews: true, period_end: "2027-03-01T00:00:00Z" }], "7a paying in the App Store: the gift starts when that period ends, and the page is told to say where to stop renewal");
      const webR = await G.redeemGift({ admin: fake.client, userId: "u-web", rawCode: "BBBBBBBBBBBB", now });
      t.eq([webR.starts_at, webR.already_paid.renews], ["2027-02-01T00:00:00.000Z", false], "7b a Stripe plan already set to end: starts then, nothing to turn off");
      const old = await G.redeemGift({ admin: fake.client, userId: "u-old", rawCode: "CCCCCCCCCCCC", now });
      t.eq([old.starts_at, old.already_paid, old.pending], ["2026-12-26T15:00:00.000Z", null, false], "7c a plan that has ended: starts now, no card, no trial step");
      const plus = await G.redeemGift({ admin: fake.client, userId: "u-new", rawCode: "DDDDDDDDDDDD", now });
      t.eq([plus.plan, plus.starts_at, plus.pending], ["flourish_plus", "2027-01-10T05:00:00.000Z", true], "7d the buyer's later start day: 00:00 Eastern that day");
      const again = await G.redeemGift({ admin: fake.client, userId: "u-other", rawCode: "dddd-dddd-dddd", now });
      t.eq([again.ok, again.result], [false, "used"], "7e redeemed already, on another account: used");
      const broken = makeFake({ failRpc: (f) => f === "gift_redeem" }); const { gifts: G2 } = load({ fake: broken });
      t.eq((await G2.redeemGift({ admin: broken.client, userId: "u", rawCode: "AAAAAAAAAAAA", now })).result, "unavailable", "7f the database failing: unavailable (503), and nothing is used up");
    }

    // ── 8. the entitlement ───────────────────────────────────────────────────────────────────────────
    {
      const now = Date.now();
      const fake = makeFake({ rows: { profiles: [{ user_id: "u-gift", plan: "trial", trial_started_at: "2026-01-01T00:00:00Z", trial_ends_at: "2026-01-15T00:00:00Z", founder_flag: false },
        { user_id: "u-free", plan: "trial", trial_started_at: "2026-01-01T00:00:00Z", trial_ends_at: "2026-01-15T00:00:00Z", founder_flag: false }] } });
      fake.GIFT.gift_create({ p_code: "EEEEEEEEEEEE", p_plan: "flourish_plus", p_session: "cs_8", p_delivery: "print", p_buyer_email: "b@example.ca" });
      fake.GIFT.gift_redeem({ p_code: "EEEEEEEEEEEE", p_user: "u-gift", p_now: new Date(now - 86400e3).toISOString() });
      const { gifts: G, auth } = load({ fake });
      G.resetGiftCoverCache();
      const plan = await auth.getUserPlan("u-gift", { delays: [] });
      t.eq([plan.entitlement, plan.unlimited, plan.paid, plan.covered_by, plan.gift_plus], ["premium", true, true, "gift", true], "8a getUserPlan: a redeemed gift is a paid plan (the coach, What-If and banks follow it)");
      t.eq((await auth.getUserPlan("u-free", { delays: [] })).entitlement, "free", "8b …and an account without one is unchanged");
      process.env.BILLING_ENABLED = "true"; process.env.IAP_ENABLED = "true";
      const billingFor = (user) => { load({ fake, user }); return mod(P.billing); };
      const status = JSON.parse((await billingFor("u-gift").handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify({ action: "status" }) })).body);
      t.eq([status.paid, status.covered_by, status.manageable, !!status.period_end], [true, "gift", false, true], "8c the website's status: paid, from a gift, nothing to manage, and when it ends");
      for (const origin of ["capacitor://localhost", "https://localhost"]) {
        const nat = await billingFor("u-gift").handler({ httpMethod: "POST", headers: { origin }, body: JSON.stringify({ action: "status" }) });
        t.eq([JSON.parse(nat.body).paid, /gift/i.test(nat.body)], [true, false], `8d a store app (${origin}) is told paid, and never the word gift`);
        const st = await billingFor("u-gift").handler({ httpMethod: "POST", headers: { origin }, body: JSON.stringify({ action: "store_status" }) });
        t.eq([JSON.parse(st.body).paid, /gift/i.test(st.body)], [true, false], `8e store_status (${origin}): paid, and never the word gift`);
      }
      const freeStatus = JSON.parse((await billingFor("u-free").handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app" }, body: JSON.stringify({ action: "status" }) })).body);
      t.eq(freeStatus.paid, false, "8f no gift, no pay: not paid");
      const blink = makeFake({ rows: fake.state.rows, failRpc: (f) => f === "gift_cover" });
      const { gifts: Gb, auth: authB } = load({ fake: blink }); Gb.resetGiftCoverCache();
      t.eq((await authB.getUserPlan("u-free", { delays: [] })).status_unavailable, true, "8g the gift read failing is 'unavailable', never 'not paid'");
      const missing = makeFake({ rows: fake.state.rows, missingGift: true });
      const salesWere = process.env.GIFTS_ENABLED; delete process.env.GIFTS_ENABLED;
      const { gifts: Gm, auth: authM } = load({ fake: missing }); Gm.resetGiftCoverCache();
      t.eq([(await authM.getUserPlan("u-free", { delays: [] })).entitlement, (await authM.getUserPlan("u-free", { delays: [] })).status_unavailable], ["free", false], "8h before 0050 runs: no gift, nothing else changes");
      t.eq(missing.state.rpcCalls.filter((c) => c.fn === "gift_cover").length, 1, "8i …and the missing function is asked about once, not on every check");
      process.env.GIFTS_ENABLED = "true";
      const onSale = makeFake({ rows: fake.state.rows, missingGift: true });
      const { gifts: Gs8, auth: authS } = load({ fake: onSale }); Gs8.resetGiftCoverCache();
      t.eq((await authS.getUserPlan("u-free", { delays: [] })).status_unavailable, true, "8i2 once gifts are on sale, a missing gift function is a failure (503), never quietly 'no gift'");
      process.env.GIFTS_ENABLED = salesWere;
      // couple mode: the other member's gift counts as their paid plan does
      const hh = makeFake({ rows: fake.state.rows });
      hh.GIFT.gift_create({ p_code: "FFFFFFFFFFFF", p_plan: "flourish", p_session: "cs_8h", p_delivery: "print", p_buyer_email: "b@example.ca" });
      hh.GIFT.gift_redeem({ p_code: "FFFFFFFFFFFF", p_user: "u-partner", p_now: new Date(now - 3600e3).toISOString() });
      for (const p of Object.values(P)) delete require.cache[p];
      const hmod = require(P.household); const real = hmod.householdCover;
      t.eq(typeof real, "function", "8j householdCover is there");
      const G8 = require(P.gifts); G8.resetGiftCoverCache();
      t.eq((await G8.giftCover(hh.client, "u-partner")).covered, true, "8k a partner's redeemed gift is a cover the household reads like a paid plan (_lib/household.js)");
    }

    // ── 9. the recipient's email, on its day ─────────────────────────────────────────────────────────
    {
      const fake = makeFake();
      const { gifts: G } = load({ fake });
      fake.GIFT.gift_create({ p_code: "GGGGGGGGGGGG", p_plan: "flourish", p_session: "cs_9a", p_delivery: "email", p_buyer_email: "b@example.ca", p_recipient_name: "Pat", p_recipient_email: "pat@example.ca", p_message: "For you", p_send_on: "2026-12-25" });
      fake.GIFT.gift_create({ p_code: "HHHHHHHHHHHH", p_plan: "flourish", p_session: "cs_9b", p_delivery: "email", p_buyer_email: "b@example.ca", p_recipient_name: "Quinn", p_recipient_email: "quinn@example.ca", p_send_on: "2026-12-26" });
      const sends = [];
      const send = async (payload, key) => { sends.push({ key, to: payload.to[0], subject: payload.subject, text: payload.text }); return { sent: true }; };
      const at = (s) => () => new Date(s);
      t.eq(await G.runSendSweep({ admin: fake.client, now: at("2026-12-25T11:45:00Z"), send, pauseMs: 0 }), { sent: 0, failed: 0, skipped: 0, unavailable: false, wordsPending: false }, "9a 6:45 a.m. Eastern on its day: nothing yet");
      const r1 = await G.runSendSweep({ admin: fake.client, now: at("2026-12-25T12:00:00Z"), send, pauseMs: 0 });
      t.eq([r1.sent, sends.map((s) => [s.key, s.to])], [1, [["gift-recipient/GGGGGGGGGGGG", "pat@example.ca"]]], "9b 7:00 a.m. Eastern: Email 2 to that day's recipient, keyed to the code");
      await G.runSendSweep({ admin: fake.client, now: at("2026-12-25T12:15:00Z"), send, pauseMs: 0 });
      await G.runSendSweep({ admin: fake.client, now: at("2026-12-25T13:00:00Z"), send, pauseMs: 0 });
      t.eq(sends.length, 1, "9c run again, and again: never sent twice");
      t.eq([fake.state.gifts[0].recipient_name, fake.state.gifts[0].gift_message], [null, null], "9d once sent, the name and the message are gone");
      let failing = true;
      const flaky = async (payload, key) => (failing ? { sent: false, error: "http", status: 500 } : send(payload, key));
      const r2 = await G.runSendSweep({ admin: fake.client, now: at("2026-12-26T12:00:00Z"), send: flaky, pauseMs: 0, log: { error() {} } });
      t.eq([r2.failed, fake.state.gifts[1].recipient_last_error], [1, "http_500"], "9e a send that fails is recorded on its row");
      failing = false;
      await G.runSendSweep({ admin: fake.client, now: at("2026-12-26T12:15:00Z"), send: flaky, pauseMs: 0 });
      t.eq(sends.length, 1, "9f …and waits 30 minutes, not hammering the email provider");
      await G.runSendSweep({ admin: fake.client, now: at("2026-12-26T12:31:00Z"), send: flaky, pauseMs: 0 });
      t.eq(sends.map((s) => s.to), ["pat@example.ca", "quinn@example.ca"], "9g then it goes, once");
      // email switched off, and the words not approved
      const off = makeFake(); const { gifts: Go } = load({ fake: off, words: "real" });
      off.GIFT.gift_create({ p_code: "JJJJJJJJJJJJ", p_plan: "flourish", p_session: "cs_9c", p_delivery: "email", p_buyer_email: "b@example.ca", p_recipient_name: "Jo", p_recipient_email: "jo@example.ca", p_send_on: "2026-12-25" });
      const r3 = await Go.runSendSweep({ admin: off.client, now: at("2026-12-25T12:00:00Z"), pauseMs: 0, log: { error() {} } });
      t.eq([r3.sent, r3.wordsPending, off.state.gifts[0].recipient_send_attempts, off.state.gifts[0].recipient_send_claimed_at, off.state.rpcCalls.length], [0, true, 0, null, 0], "9h words not approved: nothing is claimed, nothing goes, no attempt is used up");
      delete process.env.GIFTS_ENABLED;
      const ranOff = makeFake(); const { gifts: Gro } = load({ fake: ranOff });
      ranOff.GIFT.gift_create({ p_code: "KKKKKKKKKKKK", p_plan: "flourish", p_session: "cs_9off", p_delivery: "email", p_buyer_email: "b@example.ca", p_recipient_name: "Kit", p_recipient_email: "kit@example.ca", p_send_on: "2020-01-01" });
      const offSend = []; const rOff = JSON.parse((await mod(P.sweep).handler({}, {}, { admin: ranOff.client, pauseMs: 0, send: async (pl, key) => { offSend.push(key); return { sent: true }; } })).body);
      t.eq([rOff.sent, offSend], [1, ["gift-recipient/KKKKKKKKKKKK"]], "9i sales switched off: an email already bought still goes on its day");
      process.env.GIFTS_ENABLED = "true";
      // A buyer's text that looks like a placeholder (review, 2026-11-20): cleaned at the door, and one refused email
      // never holds up the others.
      const { gifts: Gb } = load({ fake: makeFake() });
      const form = Gb.checkGiftForm({ plan: "flourish", buyer_email: "b@example.ca", delivery: "email", recipient_name: "[WORDS: gift-x] Sam",
        recipient_email: "s@example.ca", send_on: Gb.torontoToday(), message: "Hi [WORDS: y]" }).form;
      t.eq([form.recipient_name, form.message], ["(WORDS: gift-x) Sam", "Hi (WORDS: y)"], "9n a name or message can never hold a placeholder: square brackets become round");
      t.ok(!Gb.holdsPlaceholder(Gb.recipientEmailPayload({ code: "ABCDEFGHJKMN", plan: "flourish", recipient_email: "s@example.ca", recipient_name: form.recipient_name, message: form.message })), "9o …so the email built from it can go");
      const meta = Gb.giftFromSession(session({ id: "cs_br" }, { recipient_name: "[WORDS: z]", gift_message: "[x]" }));
      t.eq([meta.recipient_name, meta.message], ["(WORDS: z)", "(x)"], "9p …and the same at the webhook, whatever reached Stripe's metadata");
      const two = makeFake(); const { gifts: Gt } = load({ fake: two });
      for (const [c, n] of [["MMMMMMMMMMMM", "First"], ["NNNNNNNNNNNN", "Second"]]) two.GIFT.gift_create({ p_code: c, p_plan: "flourish", p_session: `cs_${c}`, p_delivery: "email", p_buyer_email: "b@example.ca", p_recipient_name: n, p_recipient_email: `${n.toLowerCase()}@example.ca`, p_send_on: "2026-12-25" });
      const went = [];
      const picky = async (pl, key) => (key.endsWith("MMMMMMMMMMMM") ? { sent: false, skipped: "placeholder" } : (went.push(key), { sent: true }));
      const rp = await Gt.runSendSweep({ admin: two.client, now: at("2026-12-25T12:00:00Z"), send: picky, pauseMs: 0, log: { error() {} } });
      t.eq([rp.sent, rp.failed, went, two.state.gifts[0].recipient_last_error], [1, 1, ["gift-recipient/NNNNNNNNNNNN"], "skipped_placeholder"], "9q one email refused is that row's failure; the next one still goes");
      const fakeMissing = makeFake({ missingGift: true }); const { gifts: Gx } = load({ fake: fakeMissing });
      t.eq((await Gx.runSendSweep({ admin: fakeMissing.client, pauseMs: 0 })).unavailable, true, "9j before 0050 runs: nothing to send, and it says so");
      // sendGiftEmail itself
      const { gifts: Gs } = load({ fake: makeFake() });
      const hdrs = [];
      const okFetch = async (u, init) => { hdrs.push(init.headers); return { ok: true, status: 200 }; };
      t.eq(await Gs.sendGiftEmail({ to: ["a@b.ca"], subject: "x", text: "[WORDS: gift-x]" }, "k1", { env: { RESEND_API_KEY: "re" }, fetchImpl: okFetch }), { sent: false, skipped: "placeholder" }, "9k an email still holding a placeholder is never sent");
      t.eq(await Gs.sendGiftEmail({ to: ["a@b.ca"], subject: "x", text: "y" }, "k1", { env: {}, fetchImpl: okFetch }), { sent: false, skipped: "no_key" }, "9l no Resend key: skipped, not sent");
      t.eq([await Gs.sendGiftEmail({ to: ["a@b.ca"], subject: "x", text: "y" }, "k2", { env: { RESEND_API_KEY: "re" }, fetchImpl: okFetch }), hdrs[0]["Idempotency-Key"]], [{ sent: true }, "k2"], "9m sent through Resend with its idempotency key");
    }

    // ── 10. the emails, with the drafts ──────────────────────────────────────────────────────────────
    {
      const { gifts: G } = load({ fake: makeFake() });
      const g = { code: "ABCDEFGHJKMN", plan: "flourish", delivery: "email", buyer_email: "buyer@example.ca", recipient_name: "Sam", recipient_email: "sam@example.ca", message: "Merry Christmas", send_on: "2026-12-25", start_on: "2027-01-01" };
      const e1 = G.buyerEmailPayload(g);
      t.ok(e1.text.includes("ABCD-EFGH-JKMN") && e1.html.includes("ABCD-EFGH-JKMN"), "10a Email 1 carries the code");
      t.ok(e1.text.includes("https://flourishmoney.app/gift/card#c=ABCDEFGHJKMN&p=flourish&to=Sam&m=Merry%20Christmas&s=2027-01-01"), "10b …and the printable card, everything in the link's fragment");
      t.ok(!/\?[^#\s]*ABCDEFGHJKMN/.test(e1.text + e1.html), "10c the code is never in a query string a server would log");
      t.ok(e1.text.includes(DRAFTS["gift-email1-onetime"]) && /One-time gift, nothing renews/.test(e1.text), "10d \"One-time gift, nothing renews\" is in Email 1");
      t.ok(e1.text.includes("We'll email it to Sam at sam@example.ca on December 25, 2026, at 7 a.m. Eastern time."), "10e …with the day the recipient's email goes");
      t.ok(!/\[WORDS:/.test(JSON.stringify(e1)), "10f …and no placeholder once the words are approved");
      const pr = G.buyerEmailPayload({ ...g, delivery: "print", recipient_email: null, send_on: null, start_on: null });
      t.ok(pr.text.includes(DRAFTS["gift-email1-delivery-print"]) && pr.text.includes(DRAFTS["gift-email1-start-now"]), "10g a printed card: the print line, and the 12 months start when it is redeemed");
      const e2 = G.recipientEmailPayload(g);
      t.eq([e2.to, e2.subject], [["sam@example.ca"], "You've been given a year of flourish"], "10h Email 2 goes to the recipient");
      t.ok(e2.text.includes("Hi Sam,") && e2.text.includes('"Merry Christmas"') && e2.text.includes("ABCD-EFGH-JKMN"), "10i …with their name, the message and the code");
      t.ok(e2.html.includes('href="https://flourishmoney.app/gift/redeem"') && e2.html.includes("apps.apple.com") && e2.html.includes("play.google.com"), "10j …the redeem button, and both store badges (no app link to the website)");
      t.ok(/One-time gift, nothing renews/.test(e2.text), "10k \"One-time gift, nothing renews\" is in Email 2");
      t.ok(!/\[WORDS:/.test(JSON.stringify(e2)), "10l …and no placeholder");
      const { gifts: Gr } = load({ fake: makeFake(), words: "real" });
      t.ok(Gr.holdsPlaceholder(Gr.buyerEmailPayload(g)) && Gr.holdsPlaceholder(Gr.recipientEmailPayload(g)), "10m with today's placeholders both emails hold one, so neither can be sent");
    }
  } finally {
    process.env = savedEnv;
    global.fetch = savedFetch;
  }
  t.summary("gifts.test");
})().catch((e) => { console.error(e); process.exitCode = 1; });
