// netlify/functions/billing.js
// -----------------------------------------------------------------------------
// CHECKOUT AND THE BILLING PORTAL. Stripe TEST MODE until the founder switches the keys.
//
// Two actions, both requiring a signed-in user:
//   create_checkout_session — start a subscription for a plan key
//   create_portal_session   — a link to Stripe's portal to change card, plan or cancel
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

const { getUserFromRequest, getAdminClient, unauthorized } = require("./_lib/auth");
const { priceIdFor, isValidPlanKey } = require("./_lib/billingPlans");
const { FOUNDING_COHORT_LIMIT, mayBuyFoundingPrice, foundingConfirmNeeded } = require("./_lib/foundingCohort");
const { confirmUrl, checkSendLimit, sendFoundingConfirmEmail } = require("./_lib/foundingConfirm");
const { getStore } = require("@netlify/blobs");
const { stripePost } = require("./_lib/stripeApi");
const { isPaidSubscription } = require("./_lib/planRules");

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
  const CORS = corsHeadersFor(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, CORS, { error: "Method not allowed" });

  // The flag comes before auth, the body and the admin client: while billing is off this function
  // reads nothing, writes nothing and asks Stripe for nothing.
  if (!billingEnabled()) return json(404, CORS, { error: "not_found" });

  // Auth first, every time. Nothing below runs for an anonymous caller.
  const { user_id, error: authError } = await getUserFromRequest(event);
  if (!user_id) return unauthorized(CORS, authError || "unauthorized");

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, CORS, { error: "invalid_json" }); }
  const action = body.action;

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { console.error("[billing] admin client:", e.message); return json(500, CORS, { error: "server_misconfigured" }); }

  try {
    // What the client is allowed to know: whether billing is on, whether this household is already
    // paying, and whether the founding price is available to THEM. No price ids, no amounts (those
    // come from src/lib/pricing.js), and no count of how many slots are gone.
    if (action === "status") {
      const { data: row } = await admin
        .from("subscriptions").select("status, provider_customer_id, current_period_end").eq("user_id", user_id).maybeSingle();

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
        // The server's own rule (_lib/planRules.js isPaidSubscription): Stripe says active or trialing AND
        // the paid period has not ended. The web app's plan takes this answer (src/lib/planFromProfile.js
        // webPlan), so a subscription cancelled at period end stops counting when that period ends, even if
        // the webhook that says so is late. A store app never asks.
        paid: isPaidSubscription(row),
        manageable: !!row?.provider_customer_id,
        founding: { available: foundingAvailable, cohortLimit: FOUNDING_COHORT_LIMIT, confirmEmail },
      });
    }

    if (action === "create_checkout_session") {
      const planKey = body.plan_key;
      if (!isValidPlanKey(planKey)) return json(400, CORS, { error: "unknown_plan" });

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
