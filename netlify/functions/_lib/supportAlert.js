// netlify/functions/_lib/supportAlert.js
// -----------------------------------------------------------------------------
// A NOTE TO THE SUPPORT INBOX THE MOMENT THE SERVER FLAGS A HOUSEHOLD (version 1.1, 2026-10-18).
//
// _lib/storeSubscriptions.js records a flag on the household's row (migration 0022) and calls this once, when the
// flag is first raised, so support hears about it the same day rather than when someone next reads the logs.
// Internal mail only: it goes to our own inbox, never to the household, and carries the account id and the flag,
// never an email address or an amount (support looks the account up in RevenueCat and Supabase).
//
// Never throws, and never holds up the sync that called it: a failed or skipped send is logged and the flag is
// still on the row. Without RESEND_API_KEY (preview deploys, local runs) nothing is sent: SUPPORT_ALERT_SKIPPED.
// Env: RESEND_API_KEY (Production only), SUPPORT_ALERT_TO (optional; default hello@flourishmoney.app).
// -----------------------------------------------------------------------------
"use strict";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM = "Flourish <hello@flourishmoney.app>";
const DEFAULT_TO = "hello@flourishmoney.app";
const TIMEOUT_MS = 5000;

const WHAT = Object.freeze({
  two_store_subscriptions: "two live store subscriptions at once (for example a regular plan and the founding annual, which Apple bills as separate groups)",
  founding_not_eligible: "the founding price bought in a store by a household the server did not offer it to",
  two_stripe_subscriptions: "two live Stripe subscriptions at once (two checkouts completed); the row keeps the first",
  creator_amounts_unknown: "a payment by a household with a creator, whose amounts could not be read (no tax or store fee given): no commission was recorded",
  creator_refund_unmatched: "a refund for a household with a creator that matches no commission: nothing was clawed back",
  creator_chargeback_unmatched: "a lost chargeback for a household with a creator that matches no commission: nothing was clawed back",
  creator_chargeback_given_back: "a lost chargeback for a household with a creator turned into a win and Stripe returned the money: what it took from the creator goes back on the next payout",
  creator_refund_reversed: "a store took back a refund for a household with a creator: any clawback is unchanged",
  creator_own_code: "a payment by a household that includes the creator whose code it holds: no commission was recorded",
  creator_not_cad: "a payment by a household with a creator, not in Canadian dollars: no commission was recorded",
});

// The message, exactly as sent. No address, no amount: the account id is how support finds it.
function supportAlertMessage({ flag, userId, provider }) {
  const what = WHAT[flag] || flag;
  return {
    subject: `[flourish support] ${flag}`,
    text: [
      `The server flagged a household: ${what}.`,
      `Account: ${userId}`,
      `Store: ${provider || "unknown"}`,
      flag.startsWith("creator_")
        ? "Nothing about the household's access changed. Check the payment, and correct creator_commissions by hand if it should count (docs/ops/CREATOR-PAYOUTS.md)."
        : provider === "stripe"
        ? "The household keeps its access. Find the customer in Stripe by the account id (subscription metadata user_id), cancel and refund the extra subscription, then clear support_flag on its subscriptions row."
        : "The household keeps its access. Check the account in RevenueCat, refund or cancel the extra subscription in the store if it is a double charge, then clear support_flag on its subscriptions row.",
    ].join("\n"),
  };
}

async function alertSupport({ flag, userId, provider }, { env = process.env, fetchImpl = (typeof fetch === "function" ? fetch : null) } = {}) {
  try {
    const key = String(env.RESEND_API_KEY || "").trim();
    if (!key || !fetchImpl) { console.log("[support-alert] SUPPORT_ALERT_SKIPPED", flag); return false; }
    const { subject, text } = supportAlertMessage({ flag, userId, provider });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [String(env.SUPPORT_ALERT_TO || DEFAULT_TO).trim()], subject, text }),
        signal: controller.signal,
      });
      if (!res || !res.ok) { console.error("[support-alert] send failed", res ? res.status : "no_status"); return false; }
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error("[support-alert] send failed", e && e.name === "AbortError" ? "timeout" : "no_status");
    return false;
  }
}

module.exports = { alertSupport, supportAlertMessage, DEFAULT_TO };
