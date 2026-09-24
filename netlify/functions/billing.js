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
// STRIPE TAX IS OFF (P16: prices are quoted plus tax). automatic_tax is sent explicitly
// as false rather than omitted, so switching it on is a one-line change here plus the
// dashboard setting, and the columns in migration 0009 are already waiting for it.
// -----------------------------------------------------------------------------
"use strict";

const { getUserFromRequest, getAdminClient, unauthorized } = require("./_lib/auth");
const { priceIdFor, isValidPlanKey, mayBuyFoundingPrice } = require("./_lib/billingPlans");
const { FOUNDING_COHORT_LIMIT, foundingSlotsOpen, countFoundingSubscriptions } = require("./_lib/foundingCohort");
const { stripePost } = require("./_lib/stripeApi");
const { SUBSCRIPTION_PAID_STATUSES: PAID_STATUSES } = require("./_lib/planRules");

const ALLOWED_ORIGINS = new Set([
  "https://flourishmoney.app",
  "capacitor://localhost",
  "http://localhost:5173",
  "http://localhost:8888",
]);

function corsHeadersFor(event) {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://flourishmoney.app";
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type":                 "application/json",
  };
}

// BILLING IS OFF UNTIL IT IS SWITCHED ON. Billing goes live 2026-10-26, and nothing in src/
// calls these endpoints — but merging deploys them, and a Netlify function is a public URL: any
// signed-in beta user could POST here with their own token and be handed a real Stripe checkout
// for a price no one has seen yet. Read per request, not once at module load, so switching it on
// is an environment change in Netlify and not a deploy.
//
// The response is 404, deliberately: an endpoint that is not open yet should look absent rather
// than advertise that billing exists and is merely switched off.
const billingEnabled = () => process.env.BILLING_ENABLED === "true";

const APP_ORIGIN = () => (process.env.APP_ORIGIN || "https://flourishmoney.app").trim();
const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });

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
      const { data: profile } = await admin
        .from("profiles").select("founder_flag").eq("user_id", user_id).maybeSingle();
      const { data: row } = await admin
        .from("subscriptions").select("status, provider_customer_id").eq("user_id", user_id).maybeSingle();

      let foundingAvailable = false;
      if (mayBuyFoundingPrice(profile)) {
        // Same question the checkout asks. If the two disagreed, the screen would offer a price
        // the next call refuses.
        foundingAvailable = foundingSlotsOpen(await countFoundingSubscriptions(admin));
      }
      return json(200, CORS, {
        enabled: true,
        paid: PAID_STATUSES.includes(row?.status),
        manageable: !!row?.provider_customer_id,
        founding: { available: foundingAvailable, cohortLimit: FOUNDING_COHORT_LIMIT },
      });
    }

    if (action === "create_checkout_session") {
      const planKey = body.plan_key;
      if (!isValidPlanKey(planKey)) return json(400, CORS, { error: "unknown_plan" });

      const { data: profile } = await admin
        .from("profiles").select("founder_flag").eq("user_id", user_id).maybeSingle();

      // The cap is enforced HERE, not only in what the screen offers. A client can post this
      // action directly, and the screen's copy is a promise about the price we can honour.
      if (planKey === "founding_annual" && !foundingSlotsOpen(await countFoundingSubscriptions(admin))) {
        return json(403, CORS, { error: "founding_cohort_full" });
      }
      if (planKey === "founding_annual" && !mayBuyFoundingPrice(profile)) {
        // Refused outright rather than downgraded to the standard price: charging someone
        // $99.99 when they clicked $79.99 is worse than an error they can read.
        return json(403, CORS, { error: "founding_price_not_available" });
      }

      const { priceId, error: priceError } = priceIdFor(planKey);
      if (priceError) {
        console.error("[billing] price lookup:", priceError, planKey);
        return json(500, CORS, { error: priceError });
      }

      const { data: userRes } = await admin.auth.admin.getUserById(user_id);
      const customerId = await ensureCustomer(admin, user_id, userRes?.user?.email);

      const session = await stripePost("/checkout/sessions", {
        mode: "subscription",
        customer: customerId,
        client_reference_id: user_id,
        line_items: [{ price: priceId, quantity: 1 }],
        // Both carry user_id: the session for checkout.session.completed, the subscription
        // for every later customer.subscription.* event, which never sees the session.
        metadata: { user_id, plan_key: planKey },
        subscription_data: { metadata: { user_id, plan_key: planKey } },
        automatic_tax: { enabled: false },          // P16 — prices are quoted plus tax
        allow_promotion_codes: true,
        success_url: `${APP_ORIGIN()}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${APP_ORIGIN()}/?billing=cancelled`,
      }, { idempotencyKey: `checkout:${user_id}:${planKey}:${Math.floor(Date.now() / 60000)}` });

      return json(200, CORS, { url: session.url });
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
