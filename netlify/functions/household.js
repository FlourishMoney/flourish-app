// netlify/functions/household.js
// -----------------------------------------------------------------------------
// COUPLE MODE (v1). Settings > Household talks to this, and only this, to change who is in a household.
// docs/product/COUPLE-MODE-SPEC.md.
//
// Actions, all POST and all signed in (the user is the verified token's, never the body's):
//   status          am I in a household; who (roles, never names); an open invite (the owner only);
//                   whether one subscription covers us and, if we both pay, whether mine is the extra one
//   create_invite   { email, consent: true }   the owner invites one partner (link + 6-character code)
//   revoke_invite   the owner cancels the open invite
//   accept_invite   { token | code, consent: true }   the partner joins
//   leave           either member leaves (and starts fresh)
//   remove_partner  the owner removes the partner
//
// OFF UNTIL IT IS SWITCHED ON: every action answers 404 unless HOUSEHOLD_ENABLED is exactly "true", and the
// app shows no Household row while it does. Read per request, so switching it on is an environment change.
// Membership itself changes only in the database functions of migration 0031, which only the service
// role may call; this file checks the caller and passes their id.
// -----------------------------------------------------------------------------
"use strict";

const { getUserFromRequest, getAdminClient, unauthorized } = require("./_lib/auth");
const { corsHeadersFor } = require("./_lib/cors");
const { cleanEmail, isEmail } = require("./_lib/emailAddress");
const H = require("./_lib/household");

const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const MAX_BODY_BYTES = 4096;
const ACTIONS = new Set(["status", "create_invite", "revoke_invite", "accept_invite", "leave", "remove_partner"]);

// The account as Supabase Auth holds it: the email it signed in with. Never the client's word for it.
async function authEmail(admin, userId) {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const u = data && data.user;
    return u && (u.email_confirmed_at || u.confirmed_at) ? cleanEmail(u.email) : null;
  } catch { return null; }
}

async function rpc(admin, fn, args) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code || "error"}`);
  return data || {};
}

// A purchase this person started and has not finished stops them creating or joining a household (0031, audit round
// 5): the database answers purchase_in_progress. One that can no longer charge (a checkout Stripe says has expired,
// after we expire it, or completed; a store purchase now on their own row) is cleared by its id, and the call is
// made once more (_lib/household.js settlePurchaseAttempt). Anything else stays purchase_in_progress. Only the
// caller's own attempt is ever settled: household_purchase_in_progress (the household's hold, round 6) is not.
async function settledRpc(admin, userId, deps, fn, args) {
  let r = await rpc(admin, fn, args);
  if (r.result === "purchase_in_progress" && await H.settlePurchaseAttempt(admin, userId, r, deps)) r = await rpc(admin, fn, args);
  return r;
}

// The status the app shows on Settings > Household. Roles only: the app knows "you" and "your partner".
async function statusFor(admin, userId, deps = {}) {
  // Read directly rather than through membershipOf: any failed read here, a missing table included, is a 503 (this
  // function answers only while HOUSEHOLD_ENABLED is on, when a missing table is a failure: audit round 4).
  const { data: mine, error: readErr } = await admin.from("household_members").select("household_id, role").eq("user_id", userId).maybeSingle();
  if (readErr) throw new Error(`household read: ${readErr.code || "error"}`);
  if (!mine) return { enabled: true, household: null };
  const members = await H.membersOf(admin, mine.household_id);
  let invite = null;
  if (mine.role === "owner") {
    const { data: inv, error } = await admin.from("household_invites")
      .select("email_key, expires_at").eq("household_id", mine.household_id).is("used_at", null).is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`invite read: ${error.code || "error"}`);
    if (inv) invite = { email: inv.email_key, expires_at: inv.expires_at };
  }
  // One subscription covers both. If both pay, exactly one of the two is the extra (_lib/household.js extraPayer),
  // and only its holder is told where to cancel it; the household is reconciled (our extra one stops renewing).
  const payers = await H.payersOf(admin, mine.household_id);
  const extra = H.extraPayer(payers);
  if (extra) await H.reconcileHouseholdBilling(admin, userId, deps);
  return {
    enabled: true,
    household: {
      role: mine.role,
      members: members.map((m) => ({ role: m.role, you: m.user_id === userId, joined_at: m.joined_at }))
        .sort((a, b) => (b.you ? 1 : 0) - (a.you ? 1 : 0)),
      invite,
      billing: {
        covered: payers.length > 0,
        paid_by: payers.length === 0 ? null : payers.some((m) => m.user_id === userId) ? (payers.length > 1 ? "both" : "you") : "partner",
        // Both pay: the holder of the extra one is told it is extra and where to cancel it.
        your_extra: extra && extra.user_id === userId ? extra.provider : null,
      },
    },
  };
}

async function invitesToday(admin, userId) {
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count, error } = await admin.from("household_invites").select("id", { count: "exact", head: true }).eq("created_by", userId).gte("created_at", since);
  if (error) throw new Error(`invite count: ${error.code || "error"}`);
  return count || 0;
}

exports.handler = async (event, _ctx, deps = {}) => {
  const env = deps.env || process.env;
  const CORS = corsHeadersFor(event);
  if (!H.householdEnabled(env)) return json(404, CORS, { error: "not_found" });
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, CORS, { error: "Method not allowed" });
  if ((event.body || "").length > MAX_BODY_BYTES) return json(413, CORS, { error: "too_large" });

  const { user_id, error: authError } = await getUserFromRequest(event);
  if (!user_id) return unauthorized(CORS, authError || "unauthorized");

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, CORS, { error: "invalid_json" }); }
  const action = body && body.action;
  if (!ACTIONS.has(action)) return json(400, CORS, { error: "unknown_action" });

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { console.error("[household] admin client:", e.message); return json(500, CORS, { error: "server_misconfigured" }); }

  try {
    if (action === "status") return json(200, CORS, await statusFor(admin, user_id, deps));

    if (action === "create_invite") {
      // The owner sees the same consent the partner will, and says yes, before anything is made.
      if (body.consent !== true) return json(400, CORS, { error: "consent_required" });
      const to = cleanEmail(body.email);
      if (!isEmail(to)) return json(400, CORS, { error: "invalid_email" });
      const own = await authEmail(admin, user_id);
      if (!own) return json(403, CORS, { error: "email_not_confirmed" });
      if (to === own) return json(400, CORS, { error: "own_email" });
      if (await invitesToday(admin, user_id) >= H.INVITES_PER_DAY) return json(429, CORS, { error: "too_many_invites" });
      let made = null, secrets = null;
      for (let i = 0; i < 3 && !made; i++) {
        secrets = H.newInviteSecrets();
        const r = await settledRpc(admin, user_id, deps, "household_create_invite", { p_owner: user_id, p_email_key: H.emailKey(to), p_token_hash: secrets.tokenHash, p_code_hash: secrets.codeHash });
        if (r.result === "code_taken") continue;
        if (r.result !== "invited") return json(409, CORS, { error: r.result || "not_invited" });
        made = r;
      }
      if (!made) return json(503, CORS, { error: "unavailable" });
      const payload = H.inviteEmailPayload(to, H.inviteUrl(secrets.token, env), secrets.code, made.expires_at);
      const emailSent = await H.sendInviteEmail(payload, `household-invite:${made.invite_id}`, { env, fetchImpl: deps.fetch || fetch });
      // The code is shown to the owner once, now, to share in person or by message; only its hash is kept.
      return json(200, CORS, { ok: true, household_created: !!made.created, household_id: made.household_id, invite: { email: to, expires_at: made.expires_at, code: secrets.code, email_sent: emailSent } });
    }

    if (action === "revoke_invite") {
      const r = await rpc(admin, "household_revoke_invite", { p_owner: user_id });
      return r.result === "revoked" ? json(200, CORS, { ok: true }) : json(409, CORS, { error: r.result || "not_revoked" });
    }

    if (action === "accept_invite") {
      if (body.consent !== true) return json(400, CORS, { error: "consent_required" });
      const byToken = H.isTokenShaped(body.token);
      if (!byToken && !H.isCodeShaped(body.code)) return json(400, CORS, { error: "invalid" });
      const own = await authEmail(admin, user_id);
      if (!own) return json(403, CORS, { error: "email_not_confirmed" });
      // The attempt limits are the database's (0031): per account, per invited address and per network (a keyed
      // hash, never the address), each failed try recorded in the same transaction as its answer.
      const r = await settledRpc(admin, user_id, deps, "household_accept_invite", {
        p_user: user_id, p_email_key: H.emailKey(own),
        p_token_hash: byToken ? H.sha256(body.token) : null,
        p_code_hash: byToken ? null : H.sha256(H.normalizeCode(body.code)),
        p_net_key: H.netKeyOf(event),
      });
      if (r.result === "joined") await H.reconcileHouseholdBilling(admin, user_id, deps);   // both already paying: one is the extra
      if (r.result === "joined" || r.result === "already_member") return json(200, CORS, { ok: true, result: r.result });
      // household_purchase_in_progress (round 6): the household's own purchase hold is live, the owner's checkout or
      // store sheet. It is not this person's attempt, so settledRpc leaves it alone: they wait for it to end.
      const code = r.result === "too_many_attempts" ? 429
        : ["household_full", "in_another_household", "purchase_in_progress", "household_purchase_in_progress"].includes(r.result) ? 409 : 400;
      return json(code, CORS, { error: r.result || "invalid" });
    }

    // Leaving or removing: afterwards, a Stripe subscription we had set to end as the household's extra one is
    // resumed, for both people (_lib/household.js resumeHouseholdExtra): each pays for themselves again.
    if (action === "leave") {
      const peers = await H.peerIdsOf(admin, user_id);
      const r = await rpc(admin, "household_leave", { p_user: user_id });
      if (r.result !== "left") return json(409, CORS, { error: r.result || "not_member" });
      await H.resumeHouseholdExtra(admin, [user_id, ...peers], deps);
      return json(200, CORS, { ok: true, remaining: r.remaining });
    }

    if (action === "remove_partner") {
      const r = await rpc(admin, "household_remove_partner", { p_owner: user_id });
      if (r.result !== "removed") return json(409, CORS, { error: r.result || "not_removed" });
      await H.resumeHouseholdExtra(admin, [user_id, r.partner].filter(Boolean), deps);
      return json(200, CORS, { ok: true });
    }
  } catch (e) {
    // Every failure is a 503, a missing table or function included (audit round 4): the switch is on, so 0030/0031
    // not being there is a failure, never "the feature is not there yet" (that is the 404 above, while it is off).
    console.error("[household]", action, e && e.message);
    return json(503, CORS, { error: "unavailable" });
  }
  return json(400, CORS, { error: "unknown_action" });
};
