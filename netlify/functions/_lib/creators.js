// netlify/functions/_lib/creators.js
// -----------------------------------------------------------------------------
// THE CREATOR PROGRAM ON THE SERVER (approved 2026-11-02; docs/product/CREATOR-PROGRAM-SPEC.md).
//
// A household that signs up with a creator's code and subscribes earns the creator 20% of its qualifying payments for
// 12 months from its first payment. The code is tracking only: no discount, and no reward to the person. The rules are
// the database's (the creator_program migration, tests/creators.sql.test.cjs); this file works out what a payment or a
// refund was, and passes it on.
//
// OFF UNLESS CREATORS_ENABLED IS EXACTLY "true", read per request: sign-up ignores the field, /api/creator answers 404,
// and neither webhook looks at a payment for a creator.
//
// WHAT A PAYMENT COUNTS FOR.
//   Stripe   invoice.paid: total_excluding_tax, the price after any discount and before sales tax. (The checkout's
//            amount_subtotal is before discounts, and a subscription event carries no amounts at all.) The first
//            payment comes this way too, so nothing is counted twice.
//   Stores   RevenueCat's event: price_in_purchased_currency less its tax_percentage and commission_percentage, which
//            are RevenueCat's own estimates and can be null. Null means no commission and a note for support, never a
//            guess. These amounts exist only in the delivery, which the webhook has authenticated; they decide what a
//            creator is owed and nothing else (access still comes from the subscriber record).
//   Never    a sandbox purchase, a Family Sharing purchase, or anything but Canadian dollars.
//
// WHAT A REFUND DOES. It claws back the commission on that one payment. A refund that matches no payment changes nothing
// and tells support: nothing is ever taken from the wrong payment.
//
// WHAT A LOST CHARGEBACK DOES (Amanda, 2026-11-03). The same, for a Stripe dispute that closes as lost. A won or
// warning_closed dispute changes nothing. The stores: a chargeback RevenueCat delivers as a refund is handled as a refund;
// no field tells the two apart (docs/ops/CREATOR-PAYOUTS.md).
//
// A note for support carries the account id and the flag, never an amount or an address (_lib/supportAlert.js).
// -----------------------------------------------------------------------------
"use strict";

const { alertSupport } = require("./supportAlert");
const { stripeGet } = require("./stripeApi");
const { isUuid, planKeyFor } = require("./storeSubscriptions");

const creatorsEnabled = (env = process.env) => env.CREATORS_ENABLED === "true";

// Something typed into the field at all?
const creatorCodeTyped = (s) => String(s == null ? "" : s).trim() !== "";
// The code as the database holds it, or null when it could not be one.
function cleanCreatorCode(s) {
  const c = String(s == null ? "" : s).trim().toUpperCase();
  return /^[A-Z0-9]{3,20}$/.test(c) ? c : null;
}

// Where the code came from, by the Origin the store apps' WebViews send (_lib/cors.js).
function creatorSourceOf(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || "";
  if (origin === "capacitor://localhost") return "ios";
  if (origin === "https://localhost") return "android";
  return "web";
}

async function rpc(admin, fn, args) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code || "error"}`);
  return data;
}

// Sign-up, before the account exists: 'ok' or 'invalid'. It is asked about the code and nothing else: the answer can't
// be used to test whether an address is a creator's. Throws when the database can't say.
async function checkCreatorCode(admin, code) {
  const r = await rpc(admin, "creator_code_check", { p_code: code });
  return r && r.result === "ok" ? "ok" : "invalid";
}

// { result } from the database: 'attributed', 'invalid', 'already', 'not_owner', 'too_late', 'paid', 'no_account'.
async function attributeCreatorCode(admin, userId, code, source) {
  const r = await rpc(admin, "creator_attribute", { p_user: userId, p_code: code, p_source: source });
  return (r && r.result) || "invalid";
}

async function creatorStatus(admin, userId) {
  const r = await rpc(admin, "creator_status", { p_user: userId });
  return { may_add: !!(r && r.may_add === true) };
}

// A note for support, on the event's own record and to the inbox. Never throws (alertSupport doesn't).
async function noteForSupport(notes, flag, userId, provider, deps) {
  const alert = deps.alertSupport || alertSupport;
  notes.push(`flag: ${flag}`);
  await alert({ flag, userId, provider }, deps.env ? { env: deps.env } : undefined);
}

// What the database said about a payment that is worth a person's attention.
const NOTE_FOR = Object.freeze({ own_code: "creator_own_code", not_cad: "creator_not_cad" });

async function recordCommission(admin, userId, provider, p, notes, deps) {
  const r = await rpc(admin, "creator_commission_record", {
    p_user: userId, p_provider: provider, p_payment_ref: p.ref, p_original_ref: p.originalRef || null, p_payment_date: p.when,
    p_base_cents: p.baseCents, p_gross_cents: p.grossCents, p_currency: p.currency,
  });
  const result = (r && r.result) || "unknown";
  if (NOTE_FOR[result]) await noteForSupport(notes, NOTE_FOR[result], userId, provider, deps);
  return result;
}

// ── STRIPE ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const subscriptionOfInvoice = (inv) => {
  const direct = inv?.subscription ?? inv?.parent?.subscription_details?.subscription ?? null;
  return typeof direct === "string" ? direct : direct?.id || null;
};
const invoiceMetadataUser = (inv) => {
  const id = inv?.parent?.subscription_details?.metadata?.user_id || inv?.subscription_details?.metadata?.user_id || null;
  return isUuid(id) ? id : null;
};

// invoice.paid -> { ref, when, baseCents, grossCents, currency }, { skip } (no money changed hands, or it is not a
// subscription of ours), or { unknown: true } (paid, but its price before tax can't be read).
function stripeInvoicePayment(inv, eventCreated) {
  if (!inv || typeof inv.id !== "string" || !inv.id) return { skip: "no_invoice" };
  if (!subscriptionOfInvoice(inv)) return { skip: "not_a_subscription" };
  if (!Number.isInteger(inv.amount_paid) || inv.amount_paid <= 0) return { skip: "nothing_paid" };
  const paidAt = inv.status_transitions?.paid_at;
  const seconds = Number.isFinite(paidAt) ? paidAt : eventCreated;
  const when = Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
  if (!Number.isInteger(inv.total_excluding_tax) || inv.total_excluding_tax <= 0 || !when) return { unknown: true, when };
  return {
    ref: inv.id,
    when,
    baseCents: inv.total_excluding_tax,
    grossCents: inv.amount_paid,
    currency: String(inv.currency || "").toUpperCase(),
  };
}

// The account an invoice belongs to: our own row for its subscription, then the id we wrote into the subscription's
// metadata at checkout (the invoice can arrive before the row), then our own row for its customer.
async function stripeInvoiceAccount(admin, inv) {
  const subId = subscriptionOfInvoice(inv);
  const lookup = async (column, value) => {
    if (!value) return null;
    const { data, error } = await admin.from("subscriptions").select("user_id").eq(column, value).maybeSingle();
    if (error) throw new Error(`subscriptions read: ${error.code || "error"}`);
    return data?.user_id || null;
  };
  const customer = typeof inv?.customer === "string" ? inv.customer : inv?.customer?.id;
  return (await lookup("provider_subscription_id", subId)) || invoiceMetadataUser(inv) || (await lookup("provider_customer_id", customer));
}

// A paid invoice. Returns the notes for the event's record. Throws when the database fails, so Stripe retries.
async function creditStripeInvoice(admin, inv, eventCreated, deps = {}) {
  const notes = [];
  const p = stripeInvoicePayment(inv, eventCreated);
  if (p.skip) return notes;
  const userId = await stripeInvoiceAccount(admin, inv);
  if (!userId) return notes;
  if (!(await rpc(admin, "creator_for_payer", { p_user: userId }))) return notes;
  if (p.unknown) {
    // No commission, and a note for support. The payment still happened: if it is the first, the 12 months start now.
    await rpc(admin, "creator_first_payment_seen", { p_user: userId, p_when: p.when });
    await noteForSupport(notes, "creator_amounts_unknown", userId, "stripe", deps);
    return notes;
  }
  await recordCommission(admin, userId, "stripe", p, notes, deps);
  return notes;
}

// A refunded charge -> the invoice it paid. The charge names it on older API versions; since 2025-03-31 the payment
// intent is looked up through Stripe's invoice payments. null when there is none.
async function invoiceOfCharge(charge, deps = {}) {
  const direct = typeof charge?.invoice === "string" ? charge.invoice : charge?.invoice?.id;
  if (direct) return direct;
  const intent = typeof charge?.payment_intent === "string" ? charge.payment_intent : charge?.payment_intent?.id;
  if (!intent) return null;
  const get = deps.stripeGet || stripeGet;
  const found = await get(`/invoice_payments?limit=1&payment[type]=payment_intent&payment[payment_intent]=${encodeURIComponent(intent)}`);
  const first = found?.data?.[0]?.invoice;
  return (typeof first === "string" ? first : first?.id) || null;
}

// charge.refunded. amount_refunded is what has been refunded of this charge so far, so a partial refund claws back
// its share and a later one only what is new. Returns the notes. Throws when Stripe or the database fails, so Stripe retries.
async function clawbackStripeCharge(admin, charge, deps = {}) {
  const notes = [];
  if (!Number.isInteger(charge?.amount_refunded) || charge.amount_refunded <= 0) return notes;
  const ref = await invoiceOfCharge(charge, deps);
  const r = ref ? await rpc(admin, "creator_commission_clawback", {
    p_provider: "stripe", p_payment_ref: ref, p_original_ref: null, p_payment_date: null, p_refunded_cents: charge.amount_refunded,
  }) : null;
  if (r && r.result !== "not_found") return notes;
  await noteIfUnmatched(admin, charge, "creator_refund_unmatched", notes, deps);
  return notes;
}

// No commission on this charge's payment. That is only news if the account has a creator: then something has gone unmatched.
async function noteIfUnmatched(admin, charge, flag, notes, deps) {
  const customer = typeof charge?.customer === "string" ? charge.customer : charge?.customer?.id;
  if (!customer) return;
  const { data: owner, error } = await admin.from("subscriptions").select("user_id").eq("provider_customer_id", customer).maybeSingle();
  if (error) throw new Error(`subscriptions read: ${error.code || "error"}`);
  if (owner?.user_id && await rpc(admin, "creator_for_payer", { p_user: owner.user_id })) {
    await noteForSupport(notes, flag, owner.user_id, "stripe", deps);
  }
}

// charge.dispute.closed. Only a lost dispute takes anything. A dispute names its charge, not its invoice or its customer,
// so the charge is read from Stripe. Its id goes on the clawback, so the same dispute never takes anything twice.
// Returns the notes. Throws when Stripe or the database fails, so Stripe retries.
async function clawbackStripeDispute(admin, dispute, deps = {}) {
  const notes = [];
  if (dispute?.status !== "lost" || typeof dispute.id !== "string" || !dispute.id) return notes;
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return notes;
  const get = deps.stripeGet || stripeGet;
  const charge = await get(`/charges/${encodeURIComponent(chargeId)}`);
  const ref = await invoiceOfCharge(charge, deps);
  const r = ref ? await rpc(admin, "creator_commission_clawback", {
    p_provider: "stripe", p_payment_ref: ref, p_original_ref: null, p_payment_date: null,
    p_refunded_cents: Number.isInteger(dispute.amount) && dispute.amount > 0 ? dispute.amount : null, p_dispute_ref: dispute.id,
  }) : null;
  if (r && r.result !== "not_found") return notes;
  await noteIfUnmatched(admin, charge, "creator_chargeback_unmatched", notes, deps);
  return notes;
}

// ── THE STORES ─────────────────────────────────────────────────────────────────────────────────────────────────────
const STORE_OF = Object.freeze({ APP_STORE: "app_store", PLAY_STORE: "play_store" });
const PAYMENT_EVENTS = new Set(["INITIAL_PURCHASE", "RENEWAL"]);
const isRefund = (evt) => evt?.type === "CANCELLATION" && evt?.cancel_reason === "CUSTOMER_SUPPORT";

// A purchase's proceeds after the store's fee: the price less RevenueCat's estimates of the tax and the store's
// commission, each a fraction of it. null when any of them is missing or makes no sense.
function storeProceedsCents(evt) {
  const price = evt?.price_in_purchased_currency, tax = evt?.tax_percentage, fee = evt?.commission_percentage;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  const share = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 1;
  if (!share(tax) || !share(fee) || tax + fee >= 1) return null;
  const cents = Math.round(price * 100 * (1 - tax - fee));
  return cents > 0 ? cents : null;
}
const eventDate = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);

// One delivery from RevenueCat, after the account's subscription has been synced. Returns the notes for the event's
// record. Throws when the database fails, so RevenueCat retries (the sync it repeats changes nothing).
async function creditStoreEvent(admin, evt, deps = {}) {
  const notes = [];
  const payment = PAYMENT_EVENTS.has(evt?.type);
  const refund = isRefund(evt);
  const reversed = evt?.type === "REFUND_REVERSED";
  if (!payment && !refund && !reversed) return notes;
  // Never a sandbox purchase, whatever IAP_ACCEPT_SANDBOX says about access, and never Family Sharing.
  if (evt.environment !== "PRODUCTION" || evt.is_family_share === true) return notes;
  const provider = STORE_OF[evt.store];
  const userId = evt.app_user_id;
  if (!provider || !isUuid(userId)) return notes;
  if (!(await rpc(admin, "creator_for_payer", { p_user: userId }))) {
    // No creator now, but a refund can still belong to a commission from before (the account has since left a household).
    if (!refund) return notes;
  }
  const ref = typeof evt.transaction_id === "string" && evt.transaction_id ? evt.transaction_id : null;
  const originalRef = typeof evt.original_transaction_id === "string" && evt.original_transaction_id ? evt.original_transaction_id : null;
  const when = eventDate(evt.purchased_at_ms);

  if (reversed) {
    // A refund the store took back. A clawback already taken is a matter for a person: support is told.
    await noteForSupport(notes, "creator_refund_reversed", userId, provider, deps);
    return notes;
  }

  if (refund) {
    const refunded = typeof evt.price_in_purchased_currency === "number" && evt.price_in_purchased_currency < 0
      ? Math.round(-evt.price_in_purchased_currency * 100) : null;
    const r = await rpc(admin, "creator_commission_clawback", {
      p_provider: provider, p_payment_ref: ref || "", p_original_ref: originalRef, p_payment_date: when, p_refunded_cents: refunded,
    });
    if (r && r.result === "not_found" && await rpc(admin, "creator_for_payer", { p_user: userId })) {
      await noteForSupport(notes, "creator_refund_unmatched", userId, provider, deps);
    }
    return notes;
  }

  // A purchase. A price of nothing (a trial) is no payment.
  if (evt.price_in_purchased_currency === 0) return notes;
  const baseCents = storeProceedsCents(evt);
  const grossCents = typeof evt.price_in_purchased_currency === "number" ? Math.round(evt.price_in_purchased_currency * 100) : null;
  if (baseCents === null || !ref || !when || !planKeyFor(evt.product_id)) {
    // No commission, and a note for support. The payment still happened: if it is the first, the 12 months start now.
    await rpc(admin, "creator_first_payment_seen", { p_user: userId, p_when: when || eventDate(evt.event_timestamp_ms) });
    await noteForSupport(notes, "creator_amounts_unknown", userId, provider, deps);
    return notes;
  }
  await recordCommission(admin, userId, provider, {
    ref, originalRef, when, baseCents, grossCents, currency: String(evt.currency || "").toUpperCase(),
  }, notes, deps);
  return notes;
}

module.exports = {
  creatorsEnabled, creatorCodeTyped, cleanCreatorCode, creatorSourceOf, checkCreatorCode, attributeCreatorCode, creatorStatus,
  stripeInvoicePayment, creditStripeInvoice, invoiceOfCharge, clawbackStripeCharge, clawbackStripeDispute, storeProceedsCents, creditStoreEvent,
};
