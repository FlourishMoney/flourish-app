// netlify/functions/networth.js
// -----------------------------------------------------------------------------
// NET WORTH WITH PLUS: EACH PERSON'S OWN ENTRIES AND SHARE CHOICES (2026-11-10, migration 0045). POST, signed in.
// Answers 404 to everything while PLUS_ENABLED is unset, and reads nothing. The tester-only switch (_lib/plusAddon.js
// PLUS_TESTER_USER_IDS): with the flag off, a tester's account is answered and everyone else still gets that 404.
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
// OLDER APPS (2026-11-21): only a client that says it is 1.1.8 or newer is answered (_lib/plusAddon.js plusClientOk).
// Anything else gets 426 update_required and no data, before anything is read.
// Nothing is logged but an error code: no amount, no label, no account.
// -----------------------------------------------------------------------------
"use strict";

const { getUserFromRequest, getAdminClient, unauthorized } = require("./_lib/auth");
const { corsHeadersFor } = require("./_lib/cors");
const { plusOnForAnyone, plusEnabledFor, getPlusEntitlement, plusClientOk, updateRequired } = require("./_lib/plusAddon");
const { peerIdsOf } = require("./_lib/household");
const { entriesInOrder } = require("./_lib/settleOrder");

const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const KINDS = ["home", "car", "pension"];
const CURRENCIES = ["CAD", "USD"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ENTRIES = 50;
// The waits between looks when a new entry lands past the cap but is not itself the extra one (save_entry, N4), and
// the one order every save reads the entries in (_lib/settleOrder.js: when entered, then id).
const RECHECK_WAITS_MS = [150, 300, 600];
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
  if (!plusOnForAnyone()) return json(404, CORS, { error: "not_found" });
  if (event.httpMethod !== "POST") return json(405, CORS, { error: "Method not allowed" });
  const { user_id, error: authError } = await getUserFromRequest(event);
  if (!user_id) return unauthorized(CORS, authError || "unauthorized");
  if (!plusEnabledFor(user_id)) return json(404, CORS, { error: "not_found" });   // the flag off, and not a tester
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, CORS, { error: "invalid_json" }); }

  if (!plusClientOk(body)) return json(426, CORS, { error: "update_required", ...updateRequired() });

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
      // A NEW ENTRY SAVED TWICE IS ONE ENTRY (review 2026-11-22, M4). The app gives each new entry an id of its own
      // (client_id) and sends it again if the first answer was lost: the second send finds the first and updates it,
      // instead of adding the same home or car again. Only one's own: an id that is somebody else's entry is refused
      // and changes nothing. An app that sends no client_id saves as before.
      let clientId = null;
      if (body.client_id != null) {
        if (typeof body.client_id !== "string" || !UUID.test(body.client_id)) return json(400, CORS, { error: "invalid_entry" });
        clientId = body.client_id.toLowerCase();
      }
      const saveAgain = async () => {
        const { data, error } = await admin.from("net_worth_entries").update({ ...row, updated_at: now }).eq("id", clientId).eq("user_id", user_id).select("id");
        if (error) return fail("entry update", error);
        return data && data.length ? json(200, CORS, { ok: true, id: clientId }) : null;
      };
      if (clientId) { const again = await saveAgain(); if (again) return again; }
      const { data: have, error: cErr } = await admin.from("net_worth_entries").select("id").eq("user_id", user_id);
      if (cErr) return fail("entries count", cErr);
      if ((have || []).length >= MAX_ENTRIES) return json(409, CORS, { error: "too_many_entries" });
      const { data, error } = await admin.from("net_worth_entries").insert({ ...(clientId ? { id: clientId } : {}), ...row, user_id, entered_at: now, updated_at: now }).select("id");
      if (error) {
        // The id is taken: this person's own first send landed a moment ago (saved again), or it is not theirs.
        if (clientId && error.code === "23505") return (await saveAgain()) || json(409, CORS, { error: "invalid_entry" });
        return fail("entry insert", error);
      }
      const id = data && data[0] ? data[0].id : null;
      // TWO SAVES AT THE SAME MOMENT (review 2026-11-22, M3): the count above was read before the write, so it is
      // read again. Past the cap, the entry just written is taken back out and refused, as it would have been.
      // WHICH ONE IS THE EXTRA (round 2, N4): two saves at 49 each saw 51 and both took themselves out. Now each reads
      // the person's entries in one fixed order (when entered, then id). An entry beyond the cap in that order goes at
      // once. One inside the cap waits a moment for the extra to go and looks again; if there are still too many
      // after the last wait (the other save never saw this one and is staying), it goes too. An entry stays only on
      // a look that found the cap respected, so there are never more than MAX_ENTRIES, whatever the timing.
      for (let look = 0; id; look++) {
        const { data: now2, error: c2Err } = await admin.from("net_worth_entries").select("id, entered_at").eq("user_id", user_id);
        if (c2Err || (now2 || []).length <= MAX_ENTRIES) break;                 // read failed: nothing undone on a guess
        const place = now2.slice().sort(entriesInOrder).findIndex((e) => e.id === id);
        if (place < 0) break;
        if (place < MAX_ENTRIES && look < RECHECK_WAITS_MS.length) { await new Promise((r) => setTimeout(r, RECHECK_WAITS_MS[look])); continue; }
        const { error: dErr } = await admin.from("net_worth_entries").delete().eq("id", id).eq("user_id", user_id);
        if (!dErr) return json(409, CORS, { error: "too_many_entries" });
        console.error("[networth] entry over the cap not removed:", dErr.code || "error");
        break;
      }
      return json(200, CORS, { ok: true, id });
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
exports._test = { handle, cleanEntry, RECHECK_WAITS_MS };
