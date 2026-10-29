// netlify/functions/_lib/household.js
// -----------------------------------------------------------------------------
// COUPLE MODE (v1): two adults, one household. docs/product/COUPLE-MODE-SPEC.md.
//
// What the server needs to know about a household, in one place:
//   - is the feature on (HOUSEHOLD_ENABLED, read per request: an environment change, not a deploy);
//   - who shares a household with this account (plaid.js lets a member use a bank the other linked;
//     auth.js and billing.js let one subscription cover both);
//   - the invite's secrets: a link token and a 6-character code, of which only SHA-256 hashes are stored;
//   - the invite email, in its approved words (2026-10-29); it is never sent if a placeholder ever comes back.
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

module.exports = {
  householdEnabled, INVITE_TTL_DAYS, INVITES_PER_DAY, CODE_ALPHABET, CODE_LENGTH,
  isMissing, membershipOf, membersOf, peerIdsOf,
  sha256, normalizeCode, isCodeShaped, isTokenShaped, newInviteSecrets, inviteUrl, emailKey,
  INVITE_EMAIL, hasPlaceholder, inviteEmailPayload, sendInviteEmail,
  householdCover,
};
