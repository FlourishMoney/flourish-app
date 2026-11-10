// netlify/functions/networth.js
// -----------------------------------------------------------------------------
// NET WORTH WITH PLUS: EACH PERSON'S OWN ENTRIES AND SHARE CHOICES (2026-11-10, migration 0045). POST, signed in.
// Answers 404 to everything while PLUS_ENABLED is unset, and reads nothing.
//
// Plus, server-checked (_lib/plusAddon.js): no Plus is 403 plus_required; a plan read that fails is 503, never "no
// Plus". Private by default (Amanda, 2026-11-10): a person's entries and their accounts' share choices are theirs.
// Their partner gets only what they shared, and only while the two are in one household (read each time, so after a
// leave the one who stays sees nothing of the leaver's, and the leaver keeps every entry: they go with them).
//   list          { mine: { entries, shared_accounts }, partner: null | { entries, shared_accounts, all_shared } }
//                 all_shared: every one of the partner's entries and every bank account they linked is shared. Only
//                 a yes or no: never a count or anything about what is not shared.
//   save_entry    { id?, kind: home|car|pension, label, value (dollars, a number), currency: CAD|USD, shared }
//   delete_entry  { id }
//   set_share     { account_id, shared }: only for an account this person linked
// Nothing is logged but an error code: no amount, no label, no account.
// -----------------------------------------------------------------------------
"use strict";

const { getUserFromRequest, getAdminClient, unauthorized } = require("./_lib/auth");
const { corsHeadersFor } = require("./_lib/cors");
const { plusEnabled, getPlusEntitlement } = require("./_lib/plusAddon");
const { peerIdsOf } = require("./_lib/household");

const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const KINDS = ["home", "car", "pension"];
const CURRENCIES = ["CAD", "USD"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ENTRIES = 50;
const ENTRY_COLS = "id, kind, label, value_cents, currency, shared, entered_at";

// An entry as the household typed it, or null. Dollars to whole cents; never negative, never a word.
function cleanEntry(b) {
  if (!b || !KINDS.includes(b.kind) || !CURRENCIES.includes(b.currency)) return null;
  const v = typeof b.value === "number" ? b.value : NaN;
  if (!Number.isFinite(v) || v < 0 || v > 1e11) return null;
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 60) : "";
  return { kind: b.kind, label, value_cents: Math.round(v * 100), currency: b.currency, shared: b.shared === true };
}

async function handle(event, deps = {}) {
  const CORS = corsHeadersFor(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (!plusEnabled()) return json(404, CORS, { error: "not_found" });
  if (event.httpMethod !== "POST") return json(405, CORS, { error: "Method not allowed" });
  const { user_id, error: authError } = await getUserFromRequest(event);
  if (!user_id) return unauthorized(CORS, authError || "unauthorized");
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, CORS, { error: "invalid_json" }); }

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { console.error("[networth] admin client:", e.message); return json(500, CORS, { error: "server_misconfigured" }); }

  const ent = await getPlusEntitlement(admin, user_id);
  if (ent.status_unavailable) return json(503, CORS, { error: "status_unavailable" });
  if (!ent.plus) return json(403, CORS, { error: "plus_required" });

  const fail = (where, e) => { console.error(`[networth] ${where}:`, (e && (e.code || e.message)) || "error"); return json(503, CORS, { error: "unavailable" }); };
  try {
    if (body.action === "list") {
      const mineE = await admin.from("net_worth_entries").select(ENTRY_COLS).eq("user_id", user_id);
      if (mineE.error) return fail("entries read", mineE.error);
      const mineS = await admin.from("net_worth_shares").select("account_id, shared").eq("user_id", user_id);
      if (mineS.error) return fail("shares read", mineS.error);
      const peers = await peerIdsOf(admin, user_id);   // throws on a failed read: 503 below
      let partner = null;
      for (const peer of peers) {
        const e = await admin.from("net_worth_entries").select(ENTRY_COLS).eq("user_id", peer);
        if (e.error) return fail("partner entries read", e.error);
        const s = await admin.from("net_worth_shares").select("account_id, shared").eq("user_id", peer);
        if (s.error) return fail("partner shares read", s.error);
        const o = await admin.from("plaid_account_owners").select("account_id").eq("user_id", peer);
        if (o.error) return fail("partner accounts read", o.error);
        const sharedIds = new Set((s.data || []).filter((r) => r.shared === true).map((r) => r.account_id));
        const entries = (e.data || []).filter((r) => r.shared === true);
        const allShared = (e.data || []).every((r) => r.shared === true) && (o.data || []).every((r) => sharedIds.has(r.account_id));
        partner = { entries, shared_accounts: [...sharedIds], all_shared: allShared };
      }
      return json(200, CORS, {
        mine: { entries: mineE.data || [], shared_accounts: (mineS.data || []).filter((r) => r.shared === true).map((r) => r.account_id) },
        partner,
      });
    }

    if (body.action === "save_entry") {
      const row = cleanEntry(body);
      if (!row) return json(400, CORS, { error: "invalid_entry" });
      const now = new Date().toISOString();
      if (body.id != null) {
        if (!UUID.test(String(body.id))) return json(400, CORS, { error: "invalid_entry" });
        // Only one's own: the filter names the person, so another's id changes nothing.
        const { data, error } = await admin.from("net_worth_entries").update({ ...row, updated_at: now }).eq("id", body.id).eq("user_id", user_id).select("id");
        if (error) return fail("entry update", error);
        if (!data || !data.length) return json(404, CORS, { error: "not_found" });
        return json(200, CORS, { ok: true, id: body.id });
      }
      const { data: have, error: cErr } = await admin.from("net_worth_entries").select("id").eq("user_id", user_id);
      if (cErr) return fail("entries count", cErr);
      if ((have || []).length >= MAX_ENTRIES) return json(409, CORS, { error: "too_many_entries" });
      const { data, error } = await admin.from("net_worth_entries").insert({ ...row, user_id, entered_at: now, updated_at: now }).select("id");
      if (error) return fail("entry insert", error);
      return json(200, CORS, { ok: true, id: data && data[0] ? data[0].id : null });
    }

    if (body.action === "delete_entry") {
      if (!UUID.test(String(body.id || ""))) return json(400, CORS, { error: "invalid_entry" });
      const { error } = await admin.from("net_worth_entries").delete().eq("id", body.id).eq("user_id", user_id);
      if (error) return fail("entry delete", error);
      return json(200, CORS, { ok: true });
    }

    if (body.action === "set_share") {
      const accountId = typeof body.account_id === "string" ? body.account_id : "";
      if (!accountId || accountId.length > 200 || typeof body.shared !== "boolean") return json(400, CORS, { error: "invalid_share" });
      // Only an account this person linked (Plaid's own answer, recorded before any account is returned).
      const { data: own, error: oErr } = await admin.from("plaid_account_owners").select("account_id").eq("user_id", user_id).eq("account_id", accountId).maybeSingle();
      if (oErr) return fail("owner read", oErr);
      if (!own) return json(403, CORS, { error: "not_your_account" });
      const { error } = await admin.from("net_worth_shares").upsert({ user_id, account_id: accountId, shared: body.shared, updated_at: new Date().toISOString() }, { onConflict: "user_id,account_id" });
      if (error) return fail("share write", error);
      return json(200, CORS, { ok: true });
    }

    return json(400, CORS, { error: "unknown_action" });
  } catch (e) {
    return fail("failed", e);
  }
}

exports.handler = (event) => handle(event, {});
exports._test = { handle, cleanEntry };
