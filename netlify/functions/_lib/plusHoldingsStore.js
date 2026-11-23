// netlify/functions/_lib/plusHoldingsStore.js
// -----------------------------------------------------------------------------
// PLUS: A BANK'S INVESTMENT HOLDINGS, KEPT PRIVATELY ON THE SERVER (migration 0055_plus_holdings_private.sql;
// round 2 of the Plus review, 2026-11-22: Gemini G-N1 with ChatGPT B1).
//
// With Plus, holdings are private by default between partners, so they are never in the household's shared data.
// This is their lasting home: one row per bank, in the name of the person who linked it, written only by
// plaid.js get_investments (service role) when that bank's holdings really came, and read only by it when the bank
// cannot be read. WHO is sent what is decided there, by the same filter as a live answer; nothing here decides it.
//
// Every function answers quietly when the table is not there yet (0055 not run) or the database refuses: false, or
// null. Nothing here throws, so the holdings read works exactly as it did before the store existed.
// -----------------------------------------------------------------------------
"use strict";

const TABLE = "plus_holdings";
const say = (what, error) => console.warn(`[plus] holdings store, ${what}:`, (error && error.code) || "error");

/** Keep this bank's list (replacing the last one). true only when the database took it. */
async function savePlusHoldings(admin, ownerId, itemId, holdings) {
  if (!admin || !ownerId || !itemId || !Array.isArray(holdings)) return false;
  try {
    const { error } = await admin.from(TABLE)
      .upsert({ user_id: ownerId, item_id: itemId, holdings, fetched_at: new Date().toISOString() }, { onConflict: "user_id,item_id" });
    if (error) { say("save", error); return false; }
    return true;
  } catch (e) { say("save", e); return false; }
}

/** The list last kept for this bank: { holdings, fetched_at }, or null (none, the table is not there, or it cannot be read). */
async function loadPlusHoldings(admin, ownerId, itemId) {
  if (!admin || !ownerId || !itemId) return null;
  try {
    const { data, error } = await admin.from(TABLE).select("holdings, fetched_at").eq("user_id", ownerId).eq("item_id", itemId).maybeSingle();
    if (error) { say("read", error); return null; }
    return data && Array.isArray(data.holdings) ? { holdings: data.holdings, fetched_at: data.fetched_at || null } : null;
  } catch (e) { say("read", e); return null; }
}

/** Is a list kept for this bank? (For a partner's bank where nothing is shared: no holdings are sent, only this.) */
async function hasPlusHoldings(admin, ownerId, itemId) {
  return (await loadPlusHoldings(admin, ownerId, itemId)) !== null;
}

/** The bank is disconnected: its kept list goes. (0055's trigger does the same for every other way its row can go.) */
async function dropPlusHoldings(admin, ownerId, itemId) {
  if (!admin || !ownerId || !itemId) return false;
  try {
    const { error } = await admin.from(TABLE).delete().eq("user_id", ownerId).eq("item_id", itemId);
    if (error) { say("remove", error); return false; }
    return true;
  } catch (e) { say("remove", e); return false; }
}

module.exports = { TABLE, savePlusHoldings, loadPlusHoldings, hasPlusHoldings, dropPlusHoldings };
