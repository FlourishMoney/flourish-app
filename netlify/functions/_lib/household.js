// netlify/functions/_lib/household.js
// -----------------------------------------------------------------------------
// COUPLE MODE (v1): two adults, one household. docs/product/COUPLE-MODE-SPEC.md.
//
// What the server needs to know about a household, in one place:
//   - is the feature on (HOUSEHOLD_ENABLED, read per request: an environment change, not a deploy);
//   - who shares a household with this account (plaid.js lets a member use a bank the other linked;
//     auth.js and billing.js let one subscription cover both);
//   - the invite's secrets: a link token and a 6-character code, of which only SHA-256 hashes are stored;
//   - the network a join comes from, as a keyed hash only (the attempt limits, migration 0031);
//   - the invite email, in its approved words (2026-10-29); it is never sent if a placeholder ever comes back;
//   - one purchase at a time (a hold), and what happens if a household ever pays twice (reconcileHouseholdBilling).
//
// UNTIL MIGRATIONS 0030 AND 0031 RUN, there is no household table. A read that finds the table (or the
// function) missing answers "no household", so every existing path behaves exactly as before. Any other
// failed read is an error the caller must not mistake for "no household" (item 16: a paying household is
// never refused because the database blinked).
// -----------------------------------------------------------------------------
"use strict";

const crypto = require("crypto");
const { deriveEntitlement, isPaidSubscription } = require("./planRules");
const { cleanEmail, isEmail } = require("./emailAddress");
const { emailHtml } = require("./emailLayout");
const { subjectKey } = require("./limiterKeys");
const { stripeGet, stripePost } = require("./stripeApi");

const householdEnabled = (env = process.env) => env.HOUSEHOLD_ENABLED === "true";

const INVITE_TTL_DAYS = 7;
const INVITES_PER_DAY = 5;           // invites an owner may send in 24 hours (each one is an email)
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L: read out loud or typed from a screen
const CODE_LENGTH = 6;

// PostgREST's and Postgres's answers for a table or function that does not exist (yet).
const MISSING = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
function isMissing(error) {
  if (!error) return false;
  if (MISSING.has(error.code)) return true;
  return /does not exist|schema cache/i.test(String(error.message || ""));
}

// This account's household: { household_id, role } or null. Throws on a read that failed for another reason.
async function membershipOf(admin, userId) {
  const { data, error } = await admin.from("household_members").select("household_id, role").eq("user_id", userId).maybeSingle();
  if (error) { if (isMissing(error)) return null; throw new Error(`household read: ${error.code || "error"}`); }
  return data || null;
}

// Everyone in the household with this account, this account first: [{ user_id, role, joined_at }]. [] for no household.
async function membersOf(admin, householdId) {
  const { data, error } = await admin.from("household_members").select("user_id, role, joined_at").eq("household_id", householdId);
  if (error) { if (isMissing(error)) return []; throw new Error(`household members read: ${error.code || "error"}`); }
  return data || [];
}

// The OTHER member's user id, or [] (no household, or alone in it). Throws on a failed read.
async function peerIdsOf(admin, userId) {
  const mine = await membershipOf(admin, userId);
  if (!mine) return [];
  return (await membersOf(admin, mine.household_id)).map((m) => m.user_id).filter((id) => id !== userId);
}

// ── THE INVITE'S SECRETS ─────────────────────────────────────────────────────────────────────────────
const sha256 = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const normalizeCode = (s) => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCodeShaped = (s) => normalizeCode(s).length === CODE_LENGTH && [...normalizeCode(s)].every((c) => CODE_ALPHABET.includes(c));
function newCode() {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}
function newInviteSecrets() {
  const token = crypto.randomBytes(32).toString("base64url");
  const code = newCode();
  return { token, code, tokenHash: sha256(token), codeHash: sha256(normalizeCode(code)) };
}
const isTokenShaped = (t) => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

// The network a request came from, for the join limits: a keyed hash (_lib/limiterKeys.js), never the address.
// A request with no address, or no hashing secret, shares one bucket with every other such request, so a missing
// header never means no limit.
function netKeyOf(event, secret) {
  const h = (event && event.headers) || {};
  const ip = String(h["x-nf-client-connection-ip"] || h["x-forwarded-for"] || "").split(",")[0].trim();
  const key = secret === undefined ? subjectKey("household-net", ip || "unknown") : subjectKey("household-net", ip || "unknown", secret);
  return key || "household-net/none";
}

const APP_ORIGIN = (env = process.env) => (env.APP_ORIGIN || "https://flourishmoney.app").trim();
const inviteUrl = (token, env = process.env) => `${APP_ORIGIN(env)}/?household_invite=${encodeURIComponent(token)}`;
const emailKey = (email) => cleanEmail(email);

// ── THE INVITE EMAIL ─────────────────────────────────────────────────────────────────────────────────
// The approved words (ChatGPT + Grok, 2026-10-29; docs/product/COUPLE-MODE-WORDS.md), word for word.
// The email states no amount, no balance and no name: only that an invite exists, the link, the code
// and when it ends. hasPlaceholder still stops any email that ever carries a "[WORDS:" again.
const INVITE_EMAIL = Object.freeze({
  subject: "You're invited to share a household on flourish",
  intro: "You've been invited to share a household on flourish. You'll both see and edit the same money, including linked bank accounts. Nothing changes until you agree in the app.",
  button: "Open the invite",
  code: "Using the iPhone or Android app? Enter this code in Settings > Household:",
  expires: "This invite works once and ends on",
  ignore: "Not expecting this? Ignore this email and nothing will change.",
  footer: ["flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0. Questions? hello@flourishmoney.app"],
});
const hasPlaceholder = (v) => /\[WORDS:/.test(JSON.stringify(v));

function inviteEmailPayload(to, url, code, expiresAt, words = INVITE_EMAIL) {
  if (!isEmail(cleanEmail(to)) || !url || !code) return null;
  const ends = new Date(expiresAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" });
  const linkLine = `${words.button} ${url}`;
  const paragraphs = [words.intro, linkLine, `${words.code} ${code}`, `${words.expires} ${ends}`, words.ignore];
  return {
    from: "Flourish <hello@flourishmoney.app>",
    reply_to: "hello@flourishmoney.app",
    to: [cleanEmail(to)],
    subject: words.subject,
    text: [...paragraphs, ...words.footer].join("\n\n"),
    html: emailHtml({ title: words.subject, paragraphs, link: { line: linkLine, url, button: words.button }, footer: words.footer }),
    tags: [{ name: "kind", value: "household_invite" }],
  };
}

// true when Resend accepted it. Never sends a payload that still carries a placeholder, or without a key.
async function sendInviteEmail(payload, idempotencyKey, { env = process.env, fetchImpl = fetch } = {}) {
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!payload || !key || hasPlaceholder(payload)) return false;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) { console.error("[household] invite email failed", res.status); return false; }
    return true;
  } catch (e) {
    console.error("[household] invite email failed", e && e.name === "AbortError" ? "timeout" : "no_status");
    return false;
  } finally {
    clearTimeout(deadline);
  }
}

// ── ONE SUBSCRIPTION COVERS THE HOUSEHOLD ────────────────────────────────────────────────────────────
// The other member's own entitlement, read by the same rule as theirs (_lib/planRules.js): a paid
// subscription (web, App Store or Play) or a beta founder covers both. A TRIAL DOES NOT: each person's
// 14 days are their own, or a new address every fortnight would be a free plan.
// Answers { covered, provider, period_end, unavailable }. unavailable: a read failed (the caller answers
// 503, never "not paid"). No household, or the tables not there yet: { covered: false }.
async function householdCover(admin, userId, now = Date.now()) {
  try {
    const peers = await peerIdsOf(admin, userId);
    for (const peer of peers) {
      const prof = await admin.from("profiles").select("plan, trial_started_at, trial_ends_at, founder_flag").eq("user_id", peer).maybeSingle();
      if (prof.error) return { covered: false, unavailable: true };
      const sub = await admin.from("subscriptions").select("provider, status, current_period_end").eq("user_id", peer).maybeSingle();
      if (sub.error) return { covered: false, unavailable: true };
      const ent = deriveEntitlement(prof.data, sub.data, now);
      if (isPaidSubscription(sub.data, now)) {
        return { covered: true, provider: sub.data.provider || "stripe", period_end: sub.data.current_period_end || null, unavailable: false };
      }
      if (ent.plan === "beta_founder" || ent.plan === "premium") return { covered: true, provider: null, period_end: null, unavailable: false };
    }
    return { covered: false, unavailable: false };
  } catch (e) {
    console.error("[household] cover read failed:", e.message);
    return { covered: false, unavailable: true };
  }
}

// ── ONE PURCHASE AT A TIME (audit H5, round 2 a) ───────────────────────────────────────────────────
// ONE purchase attempt holds the household (migration 0031): a Stripe checkout (its session id) or one tap in
// the store app (a random id the app makes). Any other attempt is refused while it holds, whoever makes it and on
// whatever platform. A Stripe checkout made under a hold ends at CHECKOUT_MINUTES, before the hold (HOLD_MINUTES);
// a store purchase the store calls pending holds the household until the store reports it (PENDING_BACKSTOP_DAYS
// at most). Only a member of a household is held: for everyone else nothing is stored.
//   holdPurchase  { held, household, mine, provider, attempt_id }; attempt_id only for one's own blocking attempt
// Throws on any other failed call: the caller sells nothing rather than risk two subscriptions.
const HOLD_MINUTES = 32;
const CHECKOUT_MINUTES = 31;
const PENDING_BACKSTOP_DAYS = 7;
const isAttemptId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(v);
async function holdPurchase(admin, userId, provider, attemptId, { replaces = null } = {}) {
  const args = { p_user: userId, p_provider: provider, p_attempt: attemptId, p_ttl: `${HOLD_MINUTES} minutes` };
  if (replaces) args.p_replaces = replaces;
  const { data, error } = await admin.rpc("household_hold_purchase", args);
  if (error) { if (isMissing(error)) return { held: true, household: false }; throw new Error(`purchase hold: ${error.code || "error"}`); }
  const r = (data && data.result) || "";
  if (r === "no_household") return { held: true, household: false };
  if (r === "held") return { held: true, household: true };
  if (r === "held_elsewhere") return { held: false, household: true, mine: !!data.mine, provider: data.provider || null, attempt_id: data.attempt_id || null };
  throw new Error(`purchase hold: ${r || "no_answer"}`);
}
// The store said the purchase is pending: the hold lasts until the store reports. true when it was this attempt's.
async function holdPending(admin, userId, attemptId) {
  const { data, error } = await admin.rpc("household_hold_pending", { p_user: userId, p_attempt: attemptId, p_backstop: `${PENDING_BACKSTOP_DAYS} days` });
  if (error) { if (isMissing(error)) return false; throw new Error(`purchase pending: ${error.code || "error"}`); }
  return !!data && data.result === "pending";
}
// The attempt ended (null: every attempt of this person's, their purchase completed). Never throws.
async function releasePurchase(admin, userId, attemptId = null) {
  try {
    const { error } = await admin.rpc("household_release_purchase", { p_user: userId, p_attempt: attemptId });
    if (error && !isMissing(error)) console.error("[household] release hold:", error.code || "error");
  } catch (e) { console.error("[household] release hold:", e.message); }
}

// ── WHO LINKED EACH BANK ACCOUNT (audit round 2 c) ─────────────────────────────────────────────────
// Recorded from Plaid's own answers whenever plaid.js lists an item's accounts, against the person who linked the
// item (never the member who happens to be asking). Leaving and disconnecting clean up by it, so neither depends on
// the client's stamps or on a Plaid row that may be gone. Never throws; before 0031 runs it records nothing.
async function recordAccountOwners(admin, ownerId, itemId, accountIds) {
  const ids = [...new Set((accountIds || []).filter((x) => typeof x === "string" && x))];
  if (!ownerId || !itemId || !ids.length) return;
  try {
    const now = new Date().toISOString();
    const { error } = await admin.from("plaid_account_owners")
      .upsert(ids.map((account_id) => ({ user_id: ownerId, item_id: itemId, account_id, seen_at: now })), { onConflict: "user_id,account_id" });
    if (error && !isMissing(error)) console.error("[household] account owners:", error.code || "error");
  } catch (e) { console.error("[household] account owners:", e.message); }
}

// Disconnecting one's own bank: what came from it leaves the shared blob, then its plaid_items row goes, in one
// transaction (0031 household_disconnect_item). Before 0031 runs: the row is deleted as before. Answers
// { removed } or throws on a failed call (the caller answers 500, as before).
async function disconnectItem(admin, userId, itemId) {
  const { data, error } = await admin.rpc("household_disconnect_item", { p_user: userId, p_item: itemId });
  if (!error) return { removed: !!data && data.result === "removed" };
  if (!isMissing(error)) throw new Error(`disconnect: ${error.code || "error"}`);
  const { error: delErr } = await admin.from("plaid_items").delete().eq("user_id", userId).eq("item_id", itemId);
  if (delErr) throw new Error(`disconnect: ${delErr.code || delErr.message || "error"}`);
  return { removed: true };
}

// ── A HOUSEHOLD THAT PAYS TWICE (audit H5) ─────────────────────────────────────────────────────────
// The hold and the checks make it rare, but it can happen: both people already paid before one joined, or a store
// purchase made outside the app. Then exactly ONE of the two is the extra, by this rule, the same everywhere:
//   1. a founding subscription is kept over a regular one (nobody loses the founding price);
//   2. then a store subscription is kept over a Stripe one (the store's we cannot stop; ours we can);
//   3. then the owner's is kept, and the partner's is the extra.
// payers: [{ user_id, role, provider, plan_key }] (both paid). Pure. Answers the extra one, or null.
function extraPayer(payers) {
  if (!Array.isArray(payers) || payers.length < 2) return null;
  const rank = (p) => [p.plan_key === "founding_annual" ? 1 : 0, (p.provider || "stripe") !== "stripe" ? 1 : 0, p.role === "owner" ? 1 : 0];
  const [a, b] = payers;
  const ra = rank(a), rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? a : b;
  return b;
}

// The members of this account's household who pay, with their rows: [{ user_id, role, row }]. Throws on a failed read.
async function payersOf(admin, householdId, now = Date.now()) {
  const out = [];
  for (const m of await membersOf(admin, householdId)) {
    const { data, error } = await admin.from("subscriptions")
      .select("provider, status, current_period_end, plan_key, provider_subscription_id, cancel_at_period_end, support_flag, support_flag_at")
      .eq("user_id", m.user_id).maybeSingle();
    if (error) throw new Error(`subscription read: ${error.code || "error"}`);
    if (isPaidSubscription(data, now)) out.push({ user_id: m.user_id, role: m.role, provider: data.provider || "stripe", plan_key: data.plan_key || null, row: data });
  }
  return out;
}

// Two paid plans in one household: logged; the extra one's row is flagged for support (support_flag, as a
// store's double subscription is, migration 0022); the extra one's holder is shown the approved cancel-extra line
// (household.js status: billing.your_extra, by the same rule); and if the extra is a Stripe subscription, OURS,
// it is set to end at the end of the period it is paid for, so it is never charged again (nobody is charged twice
// by us). It is marked in its Stripe metadata, so that if the two stop sharing a household it is resumed
// (resumeHouseholdExtra). A store's subscription is the store's to stop: its holder is told where.
// Never throws; answers { extra_user_id, provider, action } or null.
const EXTRA_FLAG = "household_two_paid";
async function reconcileHouseholdBilling(admin, userId, deps = {}) {
  try {
    const mine = await membershipOf(admin, userId);
    if (!mine) return null;
    const payers = await payersOf(admin, mine.household_id, deps.now);
    const extra = extraPayer(payers);
    if (!extra) return null;
    console.error("[household] two paid plans in one household", { household: String(mine.household_id).slice(0, 8), extra_role: extra.role, extra_provider: extra.provider });
    if (extra.row.support_flag !== EXTRA_FLAG) {
      const { error } = await admin.from("subscriptions").update({ support_flag: EXTRA_FLAG, support_flag_at: new Date().toISOString() }).eq("user_id", extra.user_id);
      if (error) console.error("[household] support flag:", error.code || "error");
    }
    let action = "told";
    if (extra.provider === "stripe" && extra.row.provider_subscription_id && !extra.row.cancel_at_period_end) {
      const post = deps.stripePost || stripePost;
      const id = extra.row.provider_subscription_id;
      await post(`/subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: true, metadata: { flourish_household_extra: String(mine.household_id) } },
        { idempotencyKey: `household-extra:${id}:${new Date().toISOString().slice(0, 10)}` });
      // What Stripe now holds, written ahead of its webhook so the next look does not ask again.
      const { error } = await admin.from("subscriptions").update({ cancel_at_period_end: true }).eq("user_id", extra.user_id);
      if (error) console.error("[household] extra row:", error.code || "error");
      action = "stripe_ends_at_period_end";
    }
    return { extra_user_id: extra.user_id, provider: extra.provider, action };
  } catch (e) {
    console.error("[household] reconcile:", e && (e.statusCode || e.message));
    return null;
  }
}

// After two people stop sharing a household: a Stripe subscription WE set to end because it was the extra one is
// resumed, so neither loses a plan they pay for. Only ours (the metadata mark), only while it is still live and
// still set to end. Never throws.
async function resumeHouseholdExtra(admin, userIds, deps = {}) {
  const get = deps.stripeGet || stripeGet;
  const post = deps.stripePost || stripePost;
  for (const uid of userIds || []) {
    try {
      const { data: row, error } = await admin.from("subscriptions")
        .select("provider, status, current_period_end, provider_subscription_id, cancel_at_period_end, support_flag").eq("user_id", uid).maybeSingle();
      if (error || !row || (row.provider || "stripe") !== "stripe" || !row.provider_subscription_id || !isPaidSubscription(row)) continue;
      const sub = await get(`/subscriptions/${encodeURIComponent(row.provider_subscription_id)}`);
      if (!sub || !sub.cancel_at_period_end || !(sub.metadata && sub.metadata.flourish_household_extra)) continue;
      await post(`/subscriptions/${encodeURIComponent(row.provider_subscription_id)}`, { cancel_at_period_end: false, metadata: { flourish_household_extra: "" } });
      if (row.support_flag === EXTRA_FLAG) await admin.from("subscriptions").update({ support_flag: null, support_flag_at: null }).eq("user_id", uid);
    } catch (e) {
      console.error("[household] resume extra:", e && (e.statusCode || e.message));
    }
  }
}

module.exports = {
  householdEnabled, INVITE_TTL_DAYS, INVITES_PER_DAY, CODE_ALPHABET, CODE_LENGTH,
  isMissing, membershipOf, membersOf, peerIdsOf,
  sha256, normalizeCode, isCodeShaped, isTokenShaped, newInviteSecrets, inviteUrl, emailKey, netKeyOf,
  INVITE_EMAIL, hasPlaceholder, inviteEmailPayload, sendInviteEmail,
  householdCover,
  HOLD_MINUTES, CHECKOUT_MINUTES, PENDING_BACKSTOP_DAYS, isAttemptId, holdPurchase, holdPending, releasePurchase,
  recordAccountOwners, disconnectItem,
  EXTRA_FLAG, extraPayer, payersOf, reconcileHouseholdBilling, resumeHouseholdExtra,
};
