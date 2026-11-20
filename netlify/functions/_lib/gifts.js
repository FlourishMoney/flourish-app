// netlify/functions/_lib/gifts.js
// -----------------------------------------------------------------------------
// GIFTS: every rule in one place (Christmas 2026; the pattern GrowSmart's gift subscriptions proved).
//
// Two one-time gifts, sold on flourishmoney.app/gift only: "a year of flourish" and "a year of flourish with Plus".
//   checkout     netlify/functions/gift.js action "checkout": Stripe Checkout in PAYMENT mode (one charge, nothing renews),
//                Stripe Tax as the website's subscriptions have it (STRIPE_TAX_ENABLED), no promotion codes (so no creator
//                codes). The buyer's form travels in the session's metadata.
//   paid         stripe-webhook.js (signature verified, event claimed once in billing_events) -> fulfilGift: ONE row in
//                public.gift_codes per Stripe session (migration 0050, gift_create), so a repeated webhook never makes a
//                second code; then Email 1 to the buyer, once (Resend idempotency key per session).
//   on the day   gift-send-sweep.js, every 5 minutes -> runSendSweep: Email 2 to the recipient at 07:00 Eastern on the
//                day the buyer chose. Claimed atomically, sent with an idempotency key, recorded: never twice.
//   redeem       gift.js action "redeem", website only, signed in, rate limited -> redeemGift: 12 months from the latest
//                of now, the buyer's start day, the end of the account's paid period, and the end of any gift it holds.
//   refund       stripe-webhook.js charge.refunded -> refundGift: a full refund voids the code only while it is unused.
//   entitlement  giftCover: a redeemed gift running now makes the account paid in getUserPlan (_lib/auth.js) and in
//                billing.js status / store_status, the answers the website and both store apps already read.
//
// SWITCHES. GIFTS_ENABLED ("true") opens SALES only: the prices and the checkout. Redeeming and the recipient's email do
// not depend on it, so turning sales off after Christmas never strands a code (codes never expire) or a scheduled email.
//
// STORE RULES. The iPhone and Android apps show nothing about gifts (Apple 3.1.1): no button, link, code box or mention.
// The pages live in public/gift/, which a native build removes (scripts/strip-landing-media.mjs), and
// scripts/check-native-build.mjs refuses a native build that mentions them. gift.js refuses a store app's origin.
//
// WORDS. Every line a person reads comes from _lib/giftWords.js, all placeholders until Amanda approves
// docs/review/GIFT-COPY.md. An email still holding a placeholder is never sent.
//
// Never log a code, an address, a name or a message.
// -----------------------------------------------------------------------------
"use strict";

const crypto = require("crypto");
const { isPaidSubscription } = require("./planRules");
const { cleanEmail, isEmail } = require("./emailAddress");
const { emailHtml } = require("./emailLayout");
const { GIFT_WORDS, giftWords } = require("./giftWords");

// ── THE PRICES: ONE VALUE ─────────────────────────────────────────────────────────────────────────────
// In cents, CAD, BEFORE tax ("plus tax": Stripe Tax adds GST/HST at checkout). Amanda will confirm the real prices;
// changing a price is this one line. The gift page reads them from gift.js ("prices"), never its own copy.
const GIFT_PRICES = Object.freeze({ currency: "cad", flourish: 9999, flourish_plus: 14998 });
const GIFT_PLANS = Object.freeze(["flourish", "flourish_plus"]);
const GIFT_MONTHS = 12;

const ORIGIN = (env = process.env) => (env.APP_ORIGIN || "https://flourishmoney.app").trim().replace(/\/+$/, "");
const SUPPORT = "hello@flourishmoney.app";
const FROM = "Flourish <hello@flourishmoney.app>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 5000;

// Sales (the prices and the checkout) only. Redeeming and the recipient's email always run.
const giftsEnabled = (env = process.env) => env.GIFTS_ENABLED === "true";

// ── THE CODE ─────────────────────────────────────────────────────────────────────────────────────────
// 12 characters from 31 with no look-alikes (no 0 O 1 I L), so it reads aloud and types cleanly; shown as three
// groups of four. About 59 bits from crypto.randomBytes: not guessable, and attempts are rate limited.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/;
/** One code. Rejection sampling: 248 = 8 x 31, so a byte of 248 or more is dropped and every character is equally likely. */
function makeGiftCode(randomBytes = crypto.randomBytes) {
  let out = "";
  while (out.length < 12) {
    for (const b of randomBytes(24)) if (out.length < 12 && b < 248) out += ALPHABET[b % 31];
  }
  return out;
}
/** Typed with spaces, dashes or in lower case: all the same code. */
const normaliseGiftCode = (raw) => String(raw == null ? "" : raw).toUpperCase().replace(/[\s-]+/g, "").slice(0, 40);
const isGiftCode = (raw) => CODE_RE.test(normaliseGiftCode(raw));
const formatGiftCode = (code) => String(code || "").replace(/^(.{4})(.{4})(.{4})$/, "$1-$2-$3");

// ── THE DATES (Eastern time, the zone the gift page states) ──────────────────────────────────────────
const TZ = "America/Toronto";
const SEND_HOUR = 7;
const MAX_DAYS_AHEAD = 365;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const wallFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
/** The Eastern wall clock at an instant, as if it were UTC (ms). */
function wallMs(t) {
  const p = Object.fromEntries(wallFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
}
const torontoToday = (now = new Date()) => new Date(wallMs(now.getTime())).toISOString().slice(0, 10);
/** A real calendar day written YYYY-MM-DD (no 2026-02-30). */
function isDay(v) {
  const m = DAY_RE.exec(String(v || ""));
  if (!m) return false;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString().slice(0, 10) === m[0];
}
const addDays = (day, n) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
/** The instant it is hour:00 Eastern on that day, right across both daylight saving changes (both at 02:00). */
function torontoInstant(day, hour = 0) {
  const [y, m, d] = day.split("-").map(Number);
  const want = Date.UTC(y, m - 1, d, hour);
  let t = want;
  for (let i = 0; i < 3; i++) t += want - wallMs(t);
  return new Date(t);
}
/** When the recipient's email goes: 07:00 Eastern on its day. */
const sendInstant = (day) => torontoInstant(day, SEND_HOUR);
/** A day the buyer may pick: from today to a year from today, Eastern. { value, invalid: null|"format"|"past"|"too_far" } */
function pickDay(raw, now = new Date()) {
  const v = String(raw == null ? "" : raw).trim();
  if (!v) return { value: null, invalid: null };
  if (!isDay(v)) return { value: null, invalid: "format" };
  const today = torontoToday(now);
  if (v < today) return { value: null, invalid: "past" };
  if (v > addDays(today, MAX_DAYS_AHEAD)) return { value: null, invalid: "too_far" };
  return { value: v, invalid: null };
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "December 25, 2026" for a day, or for an instant (its Eastern day). */
function formatDay(v) {
  if (!v) return "";
  const day = isDay(v) ? v : torontoToday(new Date(v));
  const [y, m, d] = day.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// ── THE BUYER'S FORM ─────────────────────────────────────────────────────────────────────────────────
const clean = (v, max) => String(v == null ? "" : v)
  .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
  // Square brackets become round ones, so nothing a buyer types can look like a "[WORDS: id]" placeholder (review,
  // 2026-11-20: a name or message holding one would otherwise have stopped the emails).
  .replace(/\[/g, "(").replace(/\]/g, ")")
  .replace(/\s+/g, " ").trim().slice(0, max);
const NAME_MAX = 60;
const MESSAGE_MAX = 200;

/**
 * The gift page's form, checked. Only these fields are read; a price, an amount or a code in the body is ignored.
 * { ok: true, form } | { ok: false, errors: ["buyer_email", ...] }
 *   plan            "flourish" | "flourish_plus"
 *   buyer_email     where Email 1 and Stripe's receipt go
 *   delivery        "email" (on a day the buyer picks) | "print" (the buyer prints the card)
 *   recipient_name  required for "email", optional for "print"
 *   recipient_email required for "email", not kept for "print"
 *   message         optional, up to 200 characters
 *   send_on         "email" only: today to a year from today; today means the next run of the sweep
 *   start_on        optional: the earliest day the 12 months may start
 */
function checkGiftForm(body, now = new Date()) {
  const b = body && typeof body === "object" ? body : {};
  const errors = [];
  const plan = GIFT_PLANS.includes(b.plan) ? b.plan : null;
  if (!plan) errors.push("plan");
  const buyer = cleanEmail(clean(b.buyer_email, 254));
  if (!isEmail(buyer)) errors.push("buyer_email");
  const delivery = b.delivery === "email" || b.delivery === "print" ? b.delivery : null;
  if (!delivery) errors.push("delivery");
  const name = clean(b.recipient_name, NAME_MAX);
  const rawMessage = String(b.message == null ? "" : b.message);
  if (clean(rawMessage, MESSAGE_MAX + 1).length > MESSAGE_MAX) errors.push("message");
  const message = clean(rawMessage, MESSAGE_MAX);
  let recipientEmail = null, sendOn = null;
  if (delivery === "email") {
    recipientEmail = cleanEmail(clean(b.recipient_email, 254));
    if (!isEmail(recipientEmail)) errors.push("recipient_email");
    if (!name) errors.push("recipient_name");
    const s = pickDay(b.send_on, now);
    if (!s.value) errors.push("send_on");
    sendOn = s.value;
  }
  const st = pickDay(b.start_on, now);
  if (st.invalid) errors.push("start_on");
  if (errors.length) return { ok: false, errors };
  return { ok: true, form: { plan, buyer_email: buyer, delivery, recipient_name: name || null,
    recipient_email: delivery === "email" ? recipientEmail : null, message: message || null, send_on: sendOn, start_on: st.value } };
}

// ── STRIPE CHECKOUT ──────────────────────────────────────────────────────────────────────────────────
// Stripe Tax exactly as billing.js has it for the website's subscriptions (STRIPE_TAX_ENABLED, a rollback switch):
// automatic tax and the billing address, which Canada's tax follows. There is no Stripe customer for a gift (a guest
// payment), so there is no customer address to save. Prices are tax-EXCLUSIVE ("plus tax").
const taxEnabled = (env = process.env) => env.STRIPE_TAX_ENABLED === "true";

/** The Checkout Session for one checked form. Pure: the caller posts it. */
function checkoutParams(form, { env = process.env, words = GIFT_WORDS, now = new Date() } = {}) {
  const origin = ORIGIN(env);
  const meta = {
    kind: "gift",
    gift_plan: form.plan,
    delivery: form.delivery,
    buyer_email: form.buyer_email,
    recipient_name: form.recipient_name || undefined,
    recipient_email: form.recipient_email || undefined,
    gift_message: form.message || undefined,
    send_on: form.send_on || undefined,
    start_on: form.start_on || undefined,
  };
  return {
    mode: "payment",
    payment_method_types: ["card"],              // card only: paid at once, so checkout.session.completed is the payment
    customer_email: form.buyer_email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: GIFT_PRICES.currency,
        unit_amount: GIFT_PRICES[form.plan],
        tax_behavior: "exclusive",
        product_data: {
          name: giftWords(form.plan === "flourish_plus" ? "gift-stripe-name-plus" : "gift-stripe-name-flourish", {}, words),
          description: giftWords("gift-stripe-description", {}, words),
          metadata: { kind: "gift", gift_plan: form.plan },
        },
      },
    }],
    metadata: meta,
    payment_intent_data: { metadata: { kind: "gift", gift_plan: form.plan } },
    ...(taxEnabled(env)
      ? { automatic_tax: { enabled: true }, billing_address_collection: "required" }
      : { automatic_tax: { enabled: false } }),
    allow_promotion_codes: false,                 // no creator codes, and no other code, on a gift
    expires_at: Math.floor(now.getTime() / 1000) + 60 * 60,
    success_url: `${origin}/gift/?bought=1`,
    cancel_url: `${origin}/gift/`,
  };
}

/** Is this Stripe object (a Checkout Session) one of ours? */
const isGiftSession = (o) => !!o && o.object === "checkout.session" && o.mode === "payment" && o.metadata && o.metadata.kind === "gift";

/** The gift a paid session is for, from its own metadata (written by checkoutParams). null when it is not a gift. */
function giftFromSession(s) {
  if (!isGiftSession(s)) return null;
  const m = s.metadata || {};
  const plan = GIFT_PLANS.includes(m.gift_plan) ? m.gift_plan : null;
  const delivery = m.delivery === "email" || m.delivery === "print" ? m.delivery : null;
  const buyer = cleanEmail(m.buyer_email || (s.customer_details && s.customer_details.email) || s.customer_email || "");
  const recipientEmail = delivery === "email" && isEmail(cleanEmail(m.recipient_email || "")) ? cleanEmail(m.recipient_email) : null;
  const cents = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent && s.payment_intent.id) || null;
  return {
    session_id: s.id, payment_intent: pi, livemode: s.livemode === true, paid: s.payment_status === "paid",
    plan, delivery, buyer_email: isEmail(buyer) ? buyer : null,
    recipient_name: clean(m.recipient_name, NAME_MAX) || null,
    recipient_email: recipientEmail,
    message: clean(m.gift_message, MESSAGE_MAX) || null,
    // Checked at checkout; here only the shape. An emailed gift with no day (cannot happen through the page) goes now.
    send_on: delivery === "email" ? (isDay(m.send_on) ? m.send_on : null) : null,
    start_on: isDay(m.start_on) ? m.start_on : null,
    subtotal: cents(s.amount_subtotal), tax: cents(s.total_details && s.total_details.amount_tax), total: cents(s.amount_total),
    currency: s.currency ? String(s.currency).toLowerCase() : null,
  };
}

// ── THE CARD AND THE LINKS ───────────────────────────────────────────────────────────────────────────
/**
 * The printable card. Everything is in the URL FRAGMENT, never the query: a fragment is not sent to the server, so
 * the code never reaches a log or a Referer. The page is noindex, sends no referrer and loads nothing from elsewhere.
 */
function giftCardUrl({ code, plan, recipientName = "", message = "", startOn = null }, env = process.env) {
  const parts = [`c=${encodeURIComponent(code)}`, `p=${encodeURIComponent(plan)}`];
  if (recipientName) parts.push(`to=${encodeURIComponent(recipientName)}`);
  if (message) parts.push(`m=${encodeURIComponent(message)}`);
  if (startOn) parts.push(`s=${encodeURIComponent(startOn)}`);
  return `${ORIGIN(env)}/gift/card#${parts.join("&")}`;
}
const redeemUrl = (env = process.env) => `${ORIGIN(env)}/gift/redeem`;

// The stores' badges, the same as the founding email's (public/email/). An email cannot pick a store by device, so it
// carries both (Amanda, 2026-11-04: no app call to action goes to the website).
const STORE_BADGES = Object.freeze([
  Object.freeze({ href: "https://apps.apple.com/ca/app/flourish-money-handled/id6792967778", src: "https://flourishmoney.app/email/app-store-badge.png", alt: "Download on the App Store", width: 120, height: 40 }),
  Object.freeze({ href: "https://play.google.com/store/apps/details?id=com.flourishmoney.app", src: "https://flourishmoney.app/email/google-play-badge.png", alt: "Get it on Google Play", width: 135, height: 40 }),
]);

// ── THE EMAILS ───────────────────────────────────────────────────────────────────────────────────────
const planWords = (plan, words) => giftWords(plan === "flourish_plus" ? "gift-plan-plus" : "gift-plan-flourish", {}, words);
const textOf = (paragraphs) => paragraphs.filter((p) => typeof p === "string");

/** Email 1, to the buyer, right after payment: the code, the printable card, how it is redeemed, and the terms. */
function buyerEmailPayload(g, { env = process.env, words = GIFT_WORDS } = {}) {
  const w = (id, vars) => giftWords(id, vars, words);
  const plan = planWords(g.plan, words);
  const card = giftCardUrl({ code: g.code, plan: g.plan, recipientName: g.recipient_name || "", message: g.message || "", startOn: g.start_on }, env);
  const cardLine = `${w("gift-email1-card-line")} ${card}`;
  const paragraphs = [
    w("gift-email1-intro", { plan }),
    g.delivery === "email"
      ? w("gift-email1-delivery-email", { email: g.recipient_email, date: formatDay(g.send_on), name: g.recipient_name || "" })
      : w("gift-email1-delivery-print"),
    `${w("gift-email1-code-label")} ${formatGiftCode(g.code)}`,
    cardLine,
    w("gift-email1-how"),
    g.start_on ? w("gift-email1-start-on", { date: formatDay(g.start_on) }) : w("gift-email1-start-now"),
    w("gift-email1-onetime"),
    w("gift-email1-refund"),
    w("gift-email1-receipt"),
  ];
  const footer = [w("gift-email-footer")];
  const subject = w("gift-email1-subject", { plan });
  return {
    from: FROM, reply_to: SUPPORT, to: [g.buyer_email], subject,
    text: [...textOf(paragraphs), ...footer].join("\n\n"),
    html: emailHtml({ title: subject, paragraphs, link: { line: cardLine, url: card, button: w("gift-email1-card-button") }, footer }),
    tags: [{ name: "kind", value: "gift_buyer" }],
  };
}

/** Email 2, to the recipient, on the day: who it is from is not named (we only hold the buyer's address). */
function recipientEmailPayload(g, { env = process.env, words = GIFT_WORDS } = {}) {
  const w = (id, vars) => giftWords(id, vars, words);
  const plan = planWords(g.plan, words);
  const url = redeemUrl(env);
  const linkLine = `${w("gift-email2-button")} ${url}`;
  const paragraphs = [
    g.recipient_name ? w("gift-email2-hello-name", { name: g.recipient_name }) : w("gift-email2-hello"),
    w("gift-email2-intro", { plan }),
    ...(g.message ? [`${w("gift-email2-message-label")} "${g.message}"`] : []),
    `${w("gift-email2-code-label")} ${formatGiftCode(g.code)}`,
    w("gift-email2-how"),
    linkLine,
    g.start_on ? w("gift-email2-start-on", { date: formatDay(g.start_on) }) : w("gift-email2-start-now"),
    w("gift-email2-apps"),
    { badges: STORE_BADGES },
    w("gift-email2-onetime"),
  ];
  const footer = [w("gift-email-footer")];
  const subject = w("gift-email2-subject", { plan });
  return {
    from: FROM, reply_to: SUPPORT, to: [g.recipient_email], subject,
    text: [...textOf(paragraphs), ...footer].join("\n\n"),
    html: emailHtml({ title: subject, paragraphs, link: { line: linkLine, url, button: w("gift-email2-button") }, footer }),
    tags: [{ name: "kind", value: "gift_recipient" }],
  };
}

const holdsPlaceholder = (payload) => /\[WORDS:/.test(JSON.stringify(payload || ""));

// The lines each email is made of. Whether an email may go is asked of THESE (the words), never of the finished email,
// which also holds what the buyer typed.
const EMAIL1_IDS = Object.freeze(["gift-plan-flourish", "gift-plan-plus", "gift-email1-subject", "gift-email1-intro", "gift-email1-delivery-email",
  "gift-email1-delivery-print", "gift-email1-code-label", "gift-email1-card-line", "gift-email1-card-button", "gift-email1-how",
  "gift-email1-start-now", "gift-email1-start-on", "gift-email1-onetime", "gift-email1-refund", "gift-email1-receipt", "gift-email-footer"]);
const EMAIL2_IDS = Object.freeze(["gift-plan-flourish", "gift-plan-plus", "gift-email2-subject", "gift-email2-hello-name", "gift-email2-hello",
  "gift-email2-intro", "gift-email2-message-label", "gift-email2-code-label", "gift-email2-how", "gift-email2-button", "gift-email2-start-now",
  "gift-email2-start-on", "gift-email2-apps", "gift-email2-onetime", "gift-email-footer"]);
/** Is any line of this email still a placeholder (not approved yet)? */
const wordsPending = (ids, words = GIFT_WORDS) => ids.some((id) => typeof words[id] !== "string" || /\[WORDS:/.test(words[id]));

/**
 * One email through Resend, the sender every flourish email uses. The idempotency key makes a repeat of the same
 * send (a webhook delivered twice, a sweep run that died after sending) one email at Resend.
 * { sent: true } | { sent: false, skipped: "no_key" | "placeholder" } | { sent: false, error, status }
 */
async function sendGiftEmail(payload, idempotencyKey, { env = process.env, fetchImpl = fetch } = {}) {
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!payload) return { sent: false, error: "no_payload" };
  if (holdsPlaceholder(payload)) return { sent: false, skipped: "placeholder" };
  if (!key) return { sent: false, skipped: "no_key" };
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return { sent: false, error: "http", status: res.status };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e && e.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(deadline);
  }
}

// ── THE DATABASE (migration 0050's functions; the table itself is never touched directly) ─────────────
const isMissing = (error) => !!error && /PGRST202|PGRST205|42883|42P01|could not find the function|does not exist/i.test(`${error.code || ""} ${error.message || ""}`);
async function rpc(admin, fn, args) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    const e = new Error(`${fn}: ${error.code || "error"}`);
    e.missing = isMissing(error);
    throw e;
  }
  return data;
}

/**
 * A paid gift session: its one code (made once) and Email 1 (sent once).
 * { ok: true, code, created, emailed, skipped } | { ok: false, reason } (the webhook answers 500 so Stripe retries)
 * An email that is only skipped (no Resend key, or words not approved yet) is not a failure: the code exists and the
 * buyer can be sent it by hand; it is logged.
 */
async function fulfilGift({ admin, session, now = new Date(), env = process.env, words = GIFT_WORDS,
                            send = sendGiftEmail, makeCode = makeGiftCode }) {
  const g = giftFromSession(session);
  if (!g) return { ok: false, reason: "not_gift" };
  if (!g.paid) return { ok: true, unpaid: true };
  if (!g.plan || !g.delivery || !g.buyer_email || !g.session_id) return { ok: false, reason: "bad_session" };
  if (g.delivery === "email" && !g.recipient_email) return { ok: false, reason: "bad_session" };
  const sendOn = g.delivery === "email" ? (g.send_on || torontoToday(now)) : null;

  let row = null;
  for (let tries = 0; tries < 5 && !row; tries++) {
    const r = await rpc(admin, "gift_create", {
      p_code: makeCode(), p_plan: g.plan, p_session: g.session_id, p_payment_intent: g.payment_intent, p_livemode: g.livemode,
      p_buyer_email: g.buyer_email, p_delivery: g.delivery, p_recipient_name: g.recipient_name,
      p_recipient_email: g.recipient_email, p_message: g.message, p_send_on: sendOn, p_start_on: g.start_on,
      p_subtotal: g.subtotal, p_tax: g.tax, p_total: g.total, p_currency: g.currency,
    });
    if (r && r.code) row = r;                  // made now, or by an earlier delivery of this session
  }
  if (!row) return { ok: false, reason: "no_code" };

  const out = { ok: true, code: row.code, created: !!row.created, emailed: false, skipped: null };
  if (row.buyer_emailed_at) return { ...out, emailed: true, already: true };
  // Refunded before its email could go (an email that failed, then a refund, then Stripe's retry): never sent.
  if (row.status === "void") return { ...out, void: true };
  if (wordsPending(EMAIL1_IDS, words)) {
    console.error("[gift] GIFT_BUYER_EMAIL_SKIPPED (placeholder): the words are not approved; the code exists, send it by hand");
    return { ...out, skipped: "placeholder" };
  }
  const mail = buyerEmailPayload({
    code: row.code, plan: row.plan, delivery: row.delivery, buyer_email: row.buyer_email,
    recipient_name: row.recipient_name, recipient_email: row.recipient_email, message: row.gift_message,
    send_on: row.send_on, start_on: row.start_on,
  }, { env, words });
  const sent = await send(mail, `gift-buyer/${g.session_id}`, { env });
  if (sent.sent) {
    await rpc(admin, "gift_mark_buyer_emailed", { p_code: row.code, p_now: new Date().toISOString() })
      .catch(() => console.error("[gift] buyer email went but could not be recorded; a retry sends the same key"));
    return { ...out, emailed: true };
  }
  if (sent.skipped) {
    console.error(`[gift] GIFT_BUYER_EMAIL_SKIPPED (${sent.skipped}): the code exists; send it by hand`);
    return { ...out, skipped: sent.skipped };
  }
  return { ok: false, reason: "email_failed", code: row.code, created: out.created };
}

/**
 * charge.refunded for a gift payment. Only a FULL refund of an UNUSED gift voids its code; a redeemed gift is never
 * taken back by a refund (logged for Amanda). { gift: false } when the charge is not a gift's.
 */
async function refundGift({ admin, charge, now = new Date() }) {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent && charge.payment_intent.id) || null;
  if (!pi) return { gift: false };
  let r;
  try { r = await rpc(admin, "gift_refund", { p_payment_intent: pi, p_full: charge.refunded === true, p_now: now.toISOString() }); }
  catch (e) { if (e.missing) return { gift: false }; throw e; }
  if (!r || !r.found) return { gift: false };
  if (r.redeemed) console.error("[gift] GIFT_REFUND_AFTER_REDEEM: the code was already redeemed and stays as it is; handle the refund by hand");
  else if (r.partial) console.error("[gift] GIFT_PARTIAL_REFUND: a partial refund leaves the code as it is");
  return { gift: true, voided: !!r.voided, redeemed: !!r.redeemed, partial: !!r.partial, already: !!r.already_void };
}

// The entitlement read happens on every plan check of an account with no other plan. Until 0050 is applied it would
// fail every time, so a missing function is remembered for 5 minutes per warm instance.
let missingUntil = 0;
/**
 * Does a redeemed gift make this account paid right now?
 * { covered, plus, ends_at, next_starts_at, unavailable }. unavailable: the read failed (the caller answers 503,
 * never "not paid"). Not applied yet (no function): { covered: false }.
 */
async function giftCover(admin, userId, now = new Date()) {
  if (!userId) return { covered: false, unavailable: false };
  // A client with no rpc at all (a stand-in that knows nothing of gifts) holds no gift.
  if (!admin || typeof admin.rpc !== "function") return { covered: false, unavailable: false };
  if (Date.now() < missingUntil) return { covered: false, unavailable: false };
  try {
    const r = await rpc(admin, "gift_cover", { p_user: userId, p_now: now.toISOString() });
    return { covered: !!(r && r.covered), plus: !!(r && r.plus), ends_at: (r && r.ends_at) || null,
      next_starts_at: (r && r.next_starts_at) || null, unavailable: false };
  } catch (e) {
    // Not applied yet, while gifts are not on sale: no gift can exist, so no gift (remembered for 5 minutes, so the
    // plan check does not ask on every request). Once sales are on, a missing function is a failure like any other.
    if (e.missing && !giftsEnabled()) { missingUntil = Date.now() + 5 * 60000; return { covered: false, unavailable: false }; }
    console.error("[gift] cover read failed:", e.message);
    return { covered: false, unavailable: true };
  }
}
const resetGiftCoverCache = () => { missingUntil = 0; };

/**
 * Redeem one code for a signed-in account. If the account already pays (web or store), the gift's 12 months start
 * when that paid period ends, and the answer says where its renewal is turned off.
 *   { ok: true, result: "ok", plan, starts_at, ends_at, pending, already_paid: null | { provider, renews, period_end } }
 *   { ok: false, result: "invalid" | "used" | "mine" | "void" | "unavailable", ... }
 */
async function redeemGift({ admin, userId, rawCode, now = new Date() }) {
  const code = normaliseGiftCode(rawCode);
  if (!CODE_RE.test(code)) return { ok: false, result: "invalid" };
  const { data: sub, error: subErr } = await admin.from("subscriptions")
    .select("provider, status, current_period_end, cancel_at_period_end").eq("user_id", userId).maybeSingle();
  if (subErr && !isMissing(subErr)) return { ok: false, result: "unavailable" };
  const paid = !subErr && isPaidSubscription(sub, now.getTime()) && sub.current_period_end ? sub : null;
  let r;
  try {
    r = await rpc(admin, "gift_redeem", { p_code: code, p_user: userId, p_not_before: paid ? paid.current_period_end : null, p_now: now.toISOString() });
  } catch (e) {
    console.error("[gift] redeem failed:", e.message);
    return { ok: false, result: "unavailable" };
  }
  const result = r && r.result;
  if (result === "ok") {
    const startsAt = r.starts_at, endsAt = r.ends_at;
    return { ok: true, result, plan: r.plan, starts_at: startsAt, ends_at: endsAt, pending: Date.parse(startsAt) > now.getTime() + 60000,
      already_paid: paid ? { provider: paid.provider || "stripe", renews: !paid.cancel_at_period_end, period_end: paid.current_period_end } : null };
  }
  if (result === "mine") return { ok: false, result, plan: r.plan, starts_at: r.starts_at, ends_at: r.ends_at };
  if (result === "used" || result === "void" || result === "invalid") return { ok: false, result };
  return { ok: false, result: "unavailable" };
}

// ── THE RECIPIENT'S EMAIL ON ITS DAY (gift-send-sweep.js, every 5 minutes) ─────────────────────────────────────────────
const MAX_ATTEMPTS = 10;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
/**
 * One run: every recipient email whose day has reached 07:00 Eastern, claimed five at a time (gift_claim_due_sends:
 * one atomic UPDATE ... RETURNING, so two runs never take the same row), sent with the key gift-recipient/<code>, and
 * recorded. Stops claiming after budgetMs; what is left waits for the next run. Safe to run again at any moment.
 * { sent, failed, skipped, unavailable }
 */
async function runSendSweep({ admin, now = () => new Date(), env = process.env, words = GIFT_WORDS, send = sendGiftEmail,
                              budgetMs = 18000, pauseMs = 250, log = console }) {
  const t0 = Date.now();
  const out = { sent: 0, failed: 0, skipped: 0, unavailable: false, wordsPending: false };
  // The words not approved yet: nothing is claimed, so nothing is used up; the emails wait for the words.
  if (wordsPending(EMAIL2_IDS, words)) { out.wordsPending = true; return out; }
  while (Date.now() - t0 < budgetMs) {
    let batch;
    try { batch = await rpc(admin, "gift_claim_due_sends", { p_now: now().toISOString(), p_limit: 5 }); }
    catch (e) { if (e.missing) { out.unavailable = true; return out; } throw e; }
    if (!Array.isArray(batch) || !batch.length) break;
    for (let i = 0; i < batch.length; i++) {
      const g = batch[i];
      const mail = recipientEmailPayload({ code: g.code, plan: g.plan, recipient_email: g.recipient_email,
        recipient_name: g.recipient_name, message: g.gift_message, start_on: g.start_on }, { env, words });
      let r;
      try { r = await send(mail, `gift-recipient/${g.code}`, { env }); }
      catch { r = { sent: false, error: "send_threw" }; }
      if (r.sent) {
        let marked = await rpc(admin, "gift_mark_sent", { p_code: g.code, p_now: now().toISOString() }).then(() => true, () => false);
        if (!marked) marked = await rpc(admin, "gift_mark_sent", { p_code: g.code, p_now: now().toISOString() }).then(() => true, () => false);
        if (!marked) log.error("[gift-send-sweep] GIFT_SEND_NOT_RECORDED: an email went but its row could not be marked; a later run resends the same key");
        out.sent++;
      } else if (r.skipped === "no_key") {
        // Email is off (no Resend key): nothing can go this run, so every claim goes back and no attempt is used up.
        for (const left of batch.slice(i)) await rpc(admin, "gift_release_send", { p_code: left.code, p_error: "email_no_key" }).catch(() => 0);
        log.error(`[gift-send-sweep] GIFT_EMAIL_OFF (no_key): ${batch.length - i} gift email(s) wait for the next run`);
        out.skipped += batch.length - i;
        return out;
      } else if (r.skipped) {
        // Anything else refused for this one email is this row's failure: it never holds up the others.
        await rpc(admin, "gift_mark_send_failed", { p_code: g.code, p_error: `skipped_${r.skipped}` }).catch(() => 0);
        out.failed++;
        log.error(`[gift-send-sweep] a gift email was refused (${r.skipped}), try ${g.recipient_send_attempts} of ${MAX_ATTEMPTS}`);
      } else {
        await rpc(admin, "gift_mark_send_failed", { p_code: g.code, p_error: r.error ? `${r.error}${r.status ? `_${r.status}` : ""}` : "failed" }).catch(() => 0);
        out.failed++;
        if (g.recipient_send_attempts >= MAX_ATTEMPTS) log.error(`[gift-send-sweep] GIFT_SEND_GAVE_UP after ${MAX_ATTEMPTS} tries; send it by hand (query in migration 0050)`);
        else log.error(`[gift-send-sweep] a gift email failed (${r.error || "error"}), try ${g.recipient_send_attempts} of ${MAX_ATTEMPTS}; next in 30 minutes`);
      }
      if (pauseMs) await sleep(pauseMs);
    }
  }
  return out;
}

module.exports = {
  GIFT_PRICES, GIFT_PLANS, GIFT_MONTHS, ORIGIN, SUPPORT, giftsEnabled, taxEnabled,
  ALPHABET, CODE_RE, makeGiftCode, normaliseGiftCode, isGiftCode, formatGiftCode,
  TZ, SEND_HOUR, MAX_DAYS_AHEAD, torontoToday, isDay, addDays, torontoInstant, sendInstant, pickDay, formatDay,
  NAME_MAX, MESSAGE_MAX, checkGiftForm, checkoutParams, isGiftSession, giftFromSession,
  giftCardUrl, redeemUrl, STORE_BADGES, buyerEmailPayload, recipientEmailPayload, holdsPlaceholder, sendGiftEmail,
  EMAIL1_IDS, EMAIL2_IDS, wordsPending,
  isMissing, fulfilGift, refundGift, giftCover, resetGiftCoverCache, redeemGift, MAX_ATTEMPTS, runSendSweep,
};
