// netlify/functions/billing.js
// -----------------------------------------------------------------------------
// CHECKOUT AND THE BILLING PORTAL. Stripe TEST MODE until the founder switches the keys.
//
// Actions, all requiring a signed-in user:
//   create_checkout_session — start a subscription for a plan key
//   create_portal_session   — a link to Stripe's portal to change card, plan or cancel
//   store_status, store_sync — version 1.1, in-app purchase (below); behind IAP_ENABLED, not BILLING_ENABLED
//
// WHAT THE CLIENT MAY SAY: a plan key ("monthly" | "annual" | "founding_annual") and
// nothing else. Not a price, not an amount, not a customer id, not a user id — the user
// comes from the verified JWT, and the price comes from the environment via
// _lib/billingPlans.js. A request that names a price is refused by not being read.
//
// STRIPE TAX (from the first sale, 2026-10-26). Prices are quoted "plus tax" (P16) and their Stripe prices
// are tax-exclusive, so with STRIPE_TAX_ENABLED on, Checkout works out GST/HST (and provincial tax where
// GrowSmart is registered) from the billing address it collects, and adds it on top. Off, automatic_tax is
// sent as false, exactly as before. See taxParams() below.
// -----------------------------------------------------------------------------
"use strict";

const { getUserFromRequest, getAdminClient, unauthorized, readWithRetry } = require("./_lib/auth");
const { priceIdFor, isValidPlanKey } = require("./_lib/billingPlans");
const { FOUNDING_COHORT_LIMIT, mayBuyFoundingPrice, foundingConfirmNeeded } = require("./_lib/foundingCohort");
const { confirmUrl, checkSendLimit, sendFoundingConfirmEmail } = require("./_lib/foundingConfirm");
const { getStore } = require("@netlify/blobs");
const { connectBlobs } = require("./_lib/blobsContext");
const { stripePost } = require("./_lib/stripeApi");
const { isPaidSubscription } = require("./_lib/planRules");
const { syncStoreSubscription, isLiveRow, STORE_PROVIDERS } = require("./_lib/storeSubscriptions");

const { corsHeadersFor, isNativeRequest } = require("./_lib/cors");

// BILLING IS OFF UNTIL IT IS SWITCHED ON. Billing goes live 2026-10-26, and nothing in src/
// calls these endpoints — but merging deploys them, and a Netlify function is a public URL: any
// signed-in beta user could POST here with their own token and be handed a real Stripe checkout
// for a price no one has seen yet. Read per request, not once at module load, so switching it on
// is an environment change in Netlify and not a deploy.
//
// The response is 404, deliberately: an endpoint that is not open yet should look absent rather
// than advertise that billing exists and is merely switched off.
const billingEnabled = () => process.env.BILLING_ENABLED === "true";

// IN-APP PURCHASE IS OFF UNTIL IT IS SWITCHED ON (version 1.1). The two store actions answer only while
// IAP_ENABLED is exactly "true", and BILLING_ENABLED does not open them; while it is off they are as absent as
// the rest of this function is while billing is off.
//   store_status  what a store app needs before it shows the paywall: does this household already pay, and
//                 through which provider; is the founding price available to it. The same answer the web's
//                 status call gives, from the same row.
//   store_sync    "I just bought (or restored) in the store; look now": the row is brought up to date from
//                 RevenueCat's server (_lib/storeSubscriptions.js), never from anything the app says.
const iapEnabled = () => process.env.IAP_ENABLED === "true";
const STORE_ACTIONS = Object.freeze(["store_status", "store_sync"]);

// The founding confirmation links' send counter (Netlify Blobs), or null, which checkSendLimit refuses.
function confirmSendStore() {
  try { return getStore("founding_confirm_sends"); }
  catch { console.error("[billing] founding confirm", "store_unavailable"); return null; }
}

// STRIPE_TAX_ENABLED IS A ROLLBACK SWITCH. It is on from the first sale (docs/ops/BILLING-DAY-OCT-26.md,
// set with BILLING_ENABLED). Unset it, and deploy, only if Stripe Tax itself fails at checkout: new checkouts
// then go through without tax, while subscriptions already made keep theirs. Exactly "true" or it is off.
const taxEnabled = () => process.env.STRIPE_TAX_ENABLED === "true";
// What a Checkout Session needs for Stripe Tax (Stripe's "Collect tax with Checkout", existing customers):
// automatic tax on; the billing address, always (Canada's tax follows the province); and that address saved to
// the customer we pass, so renewals are taxed from it too.
function taxParams() {
  return taxEnabled()
    ? { automatic_tax: { enabled: true }, billing_address_collection: "required", customer_update: { address: "auto" } }
    : { automatic_tax: { enabled: false } };          // P16: prices are quoted plus tax
}

const APP_ORIGIN = () => (process.env.APP_ORIGIN || "https://flourishmoney.app").trim();
const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });

// The account as Supabase Auth holds it: its email and whether that email is confirmed. Never the
// client's word for either.
async function authUser(admin, user_id) {
  try {
    const { data } = await admin.auth.admin.getUserById(user_id);
    return data?.user || null;
  } catch {
    return null;
  }
}

// The Stripe customer for this user, created once and remembered on the subscriptions row.
async function ensureCustomer(admin, user_id, email) {
  const { data: row } = await admin
    .from("subscriptions").select("provider_customer_id").eq("user_id", user_id).maybeSingle();
  if (row?.provider_customer_id) return row.provider_customer_id;

  // metadata.user_id is how the webhook maps a Stripe event back to an account when the
  // checkout session is not in front of it.
  const customer = await stripePost("/customers", {
    email: email || undefined,
    metadata: { user_id },
  }, { idempotencyKey: `customer:${user_id}` });

  await admin.from("subscriptions")
    .upsert({ user_id, provider: "stripe", provider_customer_id: customer.id, updated_at: new Date().toISOString() },
            { onConflict: "user_id" });
  return customer.id;
}

exports.handler = async (event) => {
  connectBlobs(event);   // before any getStore: Lambda-style functions get their Blobs context on the event
  const CORS = corsHeadersFor(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, CORS, { error: "Method not allowed" });

  // The flag comes before auth and the admin client: while billing is off this function reads nothing,
  // writes nothing and asks Stripe for nothing. Which flag depends on the action, so the body is parsed
  // first (parsing it reads nothing either); a body that is not JSON is answered after auth, as before.
  let body = {};
  let badJson = false;
  try { body = JSON.parse(event.body || "{}"); } catch { body = {}; badJson = true; }
  const storeAction = STORE_ACTIONS.includes(body && body.action);
  if (storeAction ? !iapEnabled() : !billingEnabled()) return json(404, CORS, { error: "not_found" });

  // Auth first, every time. Nothing below runs for an anonymous caller.
  const { user_id, error: authError } = await getUserFromRequest(event);
  if (!user_id) return unauthorized(CORS, authError || "unauthorized");

  if (badJson) return json(400, CORS, { error: "invalid_json" });
  const action = body.action;

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { console.error("[billing] admin client:", e.message); return json(500, CORS, { error: "server_misconfigured" }); }

  try {
    // What the client is allowed to know: whether billing is on, whether this household is already
    // paying, and whether the founding price is available to THEM. No price ids, no amounts (those
    // come from src/lib/pricing.js), and no count of how many slots are gone.
    if (action === "status") {
      // Item 16: a read that fails is a 503 (the app retries), never "not paid": a paying household must not be
      // shown the plans because the database blinked. Retried first, as getUserPlan does.
      const { data: row, error: rowErr } = await readWithRetry(() => admin
        .from("subscriptions").select("provider, status, provider_customer_id, current_period_end").eq("user_id", user_id).maybeSingle());
      if (rowErr) { console.error("[billing] status read:", rowErr.message || rowErr); return json(503, CORS, { error: "status_unavailable" }); }

      // A STORE APP IS TOLD ONE THING: whether this household pays on the web, so the iOS and Android apps
      // give a paying household full access (_lib/planRules.js deriveEntitlement). Nothing else: no
      // founding offer, no confirmation link and no portal, because a store app shows no price, no upgrade
      // button and no link to pay (Apple 3.1.1, Google Play's payments policy).
      if (isNativeRequest(event)) return json(200, CORS, { enabled: true, paid: isPaidSubscription(row) });

      // Same question the checkout asks, of the same account. If the two disagreed, the screen would
      // offer a price the next call refuses.
      const user = await authUser(admin, user_id);
      const foundingAvailable = await mayBuyFoundingPrice(admin, user_id, user);
      // An older account holding a founding address may ask for a confirmation link (round 4).
      const confirmEmail = !foundingAvailable && await foundingConfirmNeeded(admin, user_id, user);
      return json(200, CORS, {
        enabled: true,
        // Where the subscription is (version 1.1): "stripe", "app_store", "play_store", or null. The website uses it
        // to say where a store subscription is cancelled when the household deletes its account.
        provider: row ? row.provider || "stripe" : null,
        // The server's own rule (_lib/planRules.js isPaidSubscription): Stripe says active or trialing AND
        // the paid period has not ended. The web app's plan takes this answer (src/lib/planFromProfile.js
        // webPlan), so a subscription cancelled at period end stops counting when that period ends, even if
        // the webhook that says so is late. A store app never asks.
        paid: isPaidSubscription(row),
        // When the paid period ends (only while paid): the app keeps this answer until then if a later status read
        // fails (item 16), as the store apps do with store_status.
        period_end: isPaidSubscription(row) && row && row.current_period_end ? row.current_period_end : null,
        manageable: !!row?.provider_customer_id,
        founding: { available: foundingAvailable, cohortLimit: FOUNDING_COHORT_LIMIT, confirmEmail },
      });
    }

    // VERSION 1.1: THE STORE APPS. One row per household, read by the same rule as the web's status above.
    if (action === "store_status" || action === "store_sync") {
      const user = await authUser(admin, user_id);
      // The row as it is, for both actions. A read that fails is a 503, never "not paid": a paying household
      // must not be shown the paywall, or sold a second subscription, because the database blinked.
      const { data: row, error: rowErr } = await admin
        .from("subscriptions").select("provider, status, current_period_end, plan_key, cancel_at_period_end").eq("user_id", user_id).maybeSingle();
      if (rowErr) { console.error("[billing] store status read:", rowErr.message); return json(503, CORS, { error: "unavailable" }); }
      let state;
      if (action === "store_sync") {
        state = await syncStoreSubscription(admin, user_id, { user, mayBuyFounding: mayBuyFoundingPrice });
      } else {
        state = { paid: isPaidSubscription(row), provider: row ? row.provider || "stripe" : null, plan_key: row ? row.plan_key : null, conflict: false, conflictKind: null };
      }
      // A web subscription Stripe is still collecting (a renewal that failed): not paid, so no access, but still
      // live, so the app must not sell a store subscription on top of it. The household fixes the card on the web.
      const webAttention = !state.paid && isLiveRow(row) && (row.provider || "stripe") === "stripe";
      const foundingAvailable = (state.paid || webAttention) ? false : await mayBuyFoundingPrice(admin, user_id, user);
      // A FOUNDING HOLDER ON A REGULAR STORE PLAN (2026-10-18). The founding annual is an App Store group of its own,
      // and Apple bills each group separately, so buying it on top of a live regular store subscription (a free
      // month included) would bill both. Such a household is never offered the founding price on top (above: a
      // paying household is offered nothing); it is told so, with the store's own screen to cancel the regular one,
      // and is offered the founding price once that subscription has ended. renews: the regular one will renew.
      let heldOnRegular = null;
      if (state.paid && STORE_PROVIDERS.includes(state.provider) && (state.plan_key === "monthly" || state.plan_key === "annual")) {
        let live = row;
        if (action === "store_sync") {
          const { data: after } = await admin.from("subscriptions").select("cancel_at_period_end, current_period_end").eq("user_id", user_id).maybeSingle();
          live = after || row;
        }
        if (await mayBuyFoundingPrice(admin, user_id, user)) {
          heldOnRegular = { renews: !(live && live.cancel_at_period_end), period_end: live && live.current_period_end ? live.current_period_end : null };
        }
      }
      return json(200, CORS, {
        enabled: true,
        paid: !!state.paid,
        provider: state.provider || null,
        plan_key: state.plan_key || null,
        conflict: !!state.conflict,
        conflict_kind: state.conflictKind || null,
        web_attention: webAttention,
        // When access ends unless renewed (only while paid): the app keeps its last answer until then (offline).
        period_end: state.paid && row && row.current_period_end ? row.current_period_end : null,
        founding: { available: !!foundingAvailable, held_on_regular_plan: heldOnRegular },
      });
    }

    if (action === "create_checkout_session") {
      const planKey = body.plan_key;
      if (!isValidPlanKey(planKey)) return json(400, CORS, { error: "unknown_plan" });

      // ONE PAID STATE AT A TIME. A household that already pays (on the web, or in a store from 1.1) is not
      // sold a second subscription: Stripe would happily create one and charge both. Refused before anything
      // is created, whatever the screen offered.
      // A web subscription Stripe is still collecting (past_due) counts too: a second checkout would charge twice
      // once the card works. A read that fails is logged and checkout goes on, as it always has (the web hides
      // checkout from a household whose status says it pays; tests/foundingBilling.test.cjs 6f).
      {
        const { data: current, error: curErr } = await admin
          .from("subscriptions").select("provider, status, current_period_end").eq("user_id", user_id).maybeSingle();
        if (curErr) console.error("[billing] checkout guard read:", curErr.message);
        if (!curErr && isLiveRow(current)) {
          return json(409, CORS, { error: "already_subscribed", provider: current.provider || "stripe" });
        }
      }

      const user = await authUser(admin, user_id);

      // The founding rule is enforced HERE, not only in what the screen offers. A client can post
      // this action directly; only the plan key is read from it. Ended, beta founder and waitlist
      // number are all looked up for this account (_lib/foundingCohort.js).
      if (planKey === "founding_annual" && !(await mayBuyFoundingPrice(admin, user_id, user))) {
        // Refused outright rather than downgraded to the standard price: charging someone
        // $99.99 when they clicked $79.99 is worse than an error they can read.
        return json(403, CORS, { error: "founding_price_not_available" });
      }

      const { priceId, error: priceError } = priceIdFor(planKey);
      if (priceError) {
        console.error("[billing] price lookup:", priceError, planKey);
        return json(500, CORS, { error: priceError });
      }

      const customerId = await ensureCustomer(admin, user_id, user?.email);

      const session = await stripePost("/checkout/sessions", {
        mode: "subscription",
        customer: customerId,
        client_reference_id: user_id,
        line_items: [{ price: priceId, quantity: 1 }],
        // Both carry user_id: the session for checkout.session.completed, the subscription
        // for every later customer.subscription.* event, which never sees the session.
        metadata: { user_id, plan_key: planKey },
        subscription_data: { metadata: { user_id, plan_key: planKey } },
        ...taxParams(),                             // Stripe Tax, behind STRIPE_TAX_ENABLED
        allow_promotion_codes: true,
        success_url: `${APP_ORIGIN()}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${APP_ORIGIN()}/?billing=cancelled`,
      }, { idempotencyKey: `checkout:${user_id}:${planKey}:${Math.floor(Date.now() / 60000)}` });

      return json(200, CORS, { url: session.url });
    }

    // "Send me a confirmation link" (round 4): only for an account that needs one, at most three in 24 hours,
    // to the account's own address. The link sets the server-only "link" marker (founding-confirm.js).
    if (action === "send_founding_confirmation") {
      const user = await authUser(admin, user_id);
      if (!(await foundingConfirmNeeded(admin, user_id, user))) return json(409, CORS, { error: "not_needed" });
      const limit = await checkSendLimit(confirmSendStore(), user_id);
      if (!limit.allowed) return json(limit.reason === "rate_limited" ? 429 : 503, CORS, { error: limit.reason });
      const url = confirmUrl(user_id, user.email);
      if (!url) { console.error("[billing] founding confirm", "no_secret"); return json(500, CORS, { error: "server_misconfigured" }); }
      const sent = await sendFoundingConfirmEmail(user.email, url, `founding-confirm/${user_id}/${new URL(url).searchParams.get("x")}`);
      return sent ? json(200, CORS, { sent: true }) : json(502, CORS, { error: "send_failed" });
    }

    if (action === "create_portal_session") {
      const { data: row } = await admin
        .from("subscriptions").select("provider_customer_id").eq("user_id", user_id).maybeSingle();
      if (!row?.provider_customer_id) return json(404, CORS, { error: "no_customer" });

      const session = await stripePost("/billing_portal/sessions", {
        customer: row.provider_customer_id,
        return_url: `${APP_ORIGIN()}/?billing=portal_return`,
      });
      return json(200, CORS, { url: session.url });
    }

    return json(400, CORS, { error: "unknown_action" });
  } catch (e) {
    // Stripe's message can name the account or the price; it does not go to the client.
    console.error("[billing]", action, e.message);
    return json(502, CORS, { error: "billing_provider_error" });
  }
};
