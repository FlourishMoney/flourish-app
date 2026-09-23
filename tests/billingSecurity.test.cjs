// tests/billingSecurity.test.cjs
// -----------------------------------------------------------------------------
// NOTHING SECRET, AND NO PRICE ID, MAY REACH A CLIENT BUNDLE.
//
// A Stripe secret key in the web bundle would be readable by anyone who opened
// devtools, and it ships unchanged into both native builds, where it cannot be
// rotated without an App Store release. A price id is not a secret but is still
// wrong there: it differs between test and live mode, so a build would be pinned to
// whichever mode it was built against.
//
// Also pins the signature verifier's own behaviour, and the two migrations' shape.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { verifyStripeSignature, signPayload } = require("../netlify/functions/_lib/stripeSignature.js");
const { priceIdFor, isValidPlanKey, PLAN_KEYS, PRICE_ENV } = require("../netlify/functions/_lib/billingPlans.js");

const REPO = path.join(__dirname, "..");
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(rel, out); }
    else out.push(rel);
  }
  return out;
};

(async () => {
  const t = create();

  // ── 1. The signature verifier ────────────────────────────────────────────────────────────────
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = Date.now(), tSec = Math.floor(now / 1000);
  t.ok(verifyStripeSignature(body, signPayload(body, "whsec_a", tSec), "whsec_a", { now }).ok, "1a a real signature verifies");
  t.eq(verifyStripeSignature(body + " ", signPayload(body, "whsec_a", tSec), "whsec_a", { now }).reason, "signature_mismatch", "1b a tampered body does not");
  t.eq(verifyStripeSignature(body, signPayload(body, "whsec_b", tSec), "whsec_a", { now }).reason, "signature_mismatch", "1c nor another account's secret");
  t.eq(verifyStripeSignature(body, signPayload(body, "whsec_a", tSec - 3600), "whsec_a", { now }).reason, "timestamp_outside_tolerance", "1d nor an hour-old replay");
  t.eq(verifyStripeSignature(body, null, "whsec_a", { now }).reason, "missing_signature", "1e no header, no pass");
  t.eq(verifyStripeSignature(body, signPayload(body, "whsec_a", tSec), "", { now }).reason, "missing_secret", "1f no secret configured, no pass");
  {
    // Two v1 values, as Stripe sends while an endpoint secret is rotating.
    const rotating = `${signPayload(body, "whsec_old", tSec)},${signPayload(body, "whsec_a", tSec).split(",")[1]}`;
    t.ok(verifyStripeSignature(body, rotating, "whsec_a", { now }).ok, "1g either signature matching is enough during a rotation");
  }

  // ── 2. Plan keys map through the environment ─────────────────────────────────────────────────
  t.eq(PLAN_KEYS.join(","), "monthly,annual,founding_annual", "2a three plan keys, matching DECISIONS.md item 1");
  t.eq(priceIdFor("monthly", { STRIPE_PRICE_MONTHLY_CAD: "price_x" }).priceId, "price_x", "2b a key resolves from the env");
  t.eq(priceIdFor("monthly", {}).error, "price_not_configured", "2c an unset price is an error, never a guess");
  t.eq(priceIdFor("price_123", { }).error, "unknown_plan", "2d a raw price id is not a plan key");
  t.ok(!isValidPlanKey("plus") && !isValidPlanKey(""), "2e nor anything else");

  // ── 3. No secret and no price id in anything the client gets ─────────────────────────────────
  // sk_live/sk_test/rk_/whsec_ are Stripe's own prefixes; price_/prod_ are ids.
  const SECRETS = /\b(sk_live_|sk_test_|rk_live_|rk_test_|whsec_)[A-Za-z0-9]/;
  const PRICE_ID = /\b(price_|prod_)[A-Za-z0-9]{6,}/;
  const clientFiles = [...walk("src"), ...(fs.existsSync(path.join(REPO, "dist")) ? walk("dist") : [])]
    .filter(f => /\.(js|jsx|ts|tsx|html|json)$/.test(f));
  t.ok(clientFiles.length > 10, `3a scanning what the client gets (${clientFiles.length} files)`);

  const secretHits = [], priceHits = [];
  for (const f of clientFiles) {
    const text = fs.readFileSync(path.join(REPO, f), "utf8");
    if (SECRETS.test(text)) secretHits.push(f);
    if (PRICE_ID.test(text)) priceHits.push(f);
  }
  t.eq(secretHits.join(", ") || "(none)", "(none)", "3b no Stripe secret or webhook signing key in src/ or dist/");
  t.eq(priceHits.join(", ") || "(none)", "(none)", "3c no Stripe price id either — the client sends a plan key");

  // The env names themselves must only appear server-side.
  const envLeaks = clientFiles.filter(f => Object.values(PRICE_ENV).some(n => fs.readFileSync(path.join(REPO, f), "utf8").includes(n))
    || fs.readFileSync(path.join(REPO, f), "utf8").includes("STRIPE_SECRET_KEY"));
  t.eq(envLeaks.join(", ") || "(none)", "(none)", "3d and no STRIPE_* variable is read from client code");

  // Vite only inlines VITE_-prefixed vars, so a Stripe key could never be bundled by accident —
  // but a VITE_STRIPE_* name would defeat that, so it is banned outright.
  const viteStripe = [...walk("src")].filter(f => /VITE_STRIPE/.test(fs.readFileSync(path.join(REPO, f), "utf8")));
  t.eq(viteStripe.join(", ") || "(none)", "(none)", "3e nothing is named VITE_STRIPE_*, which would inline it into the bundle");

  // ── 4. The migrations ────────────────────────────────────────────────────────────────────────
  const mig = (f) => fs.readFileSync(path.join(REPO, "supabase", "migrations", f), "utf8");
  const subs = mig("0009_billing_subscriptions.sql"), events = mig("0010_billing_events.sql");

  t.ok(/enable row level security/i.test(subs) && /enable row level security/i.test(events), "4a RLS is enabled on both tables");
  t.ok(/grant select\s+on table public\.subscriptions to authenticated/i.test(subs), "4b subscriptions: authenticated may SELECT");
  t.ok(!/grant[^;]*on table public\.subscriptions to authenticated[^;]*(insert|update|delete|all)/i.test(subs),
    "4c …and may not write — a client that could write this table could grant itself a plan");
  t.ok(/grant all privileges\s+on table public\.subscriptions to service_role/i.test(subs), "4d …service_role writes it");
  t.ok(!/to anon/i.test(subs) && !/to anon/i.test(events), "4e neither table grants anon anything");
  t.ok(/grant all privileges on table public\.billing_events to service_role/i.test(events), "4f the event log is service_role only");
  t.ok(!/on table public\.billing_events to authenticated/i.test(events), "4g …with no authenticated grant at all");
  t.ok(/for select using \(auth\.uid\(\) = user_id\)/i.test(subs), "4h the only policy is select-your-own-row");
  t.ok(!/for insert|for update|for delete/i.test(subs), "4i …there is no insert, update or delete policy");
  t.ok(/automatic_tax/.test(subs) && /amount_tax_cents/.test(subs), "4j the Stripe Tax columns exist so switching it on needs no migration");

  t.summary("billingSecurity.test");
})();
