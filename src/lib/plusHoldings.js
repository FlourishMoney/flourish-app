// src/lib/plusHoldings.js
// -----------------------------------------------------------------------------
// WHAT PLUS GAVE THIS PERSON, KEPT ON THIS DEVICE FOR THIS ACCOUNT ONLY (code review, 2026-11-22).
//
// With Plus, investment holdings are private by default between partners, so they never go in the household's
// shared data (lib/netWorthAccess.js, plaid.js get_investments plus_mode). Until now their only home was the
// running page: a reload, a failed fetch or a failed plan check left a paying person with none, and the old shared
// copy was cleared on the first Plus answer whether or not anything had taken its place.
//
// This is that place: ONE key on the device, { user, holdings, list, owners, at }, written for one account and read
// back only for that account. Never synced, never in the household blob, never sent anywhere. It starts
// "flourish_", so signing out clears it with the rest (App.jsx signOut), and deleting the account wipes it.
//   holdings   the holdings the server sent this person (their own, and their partner's shared accounts' only)
//   list       /api/networth list as it last came (their entries and share choices, and what a partner shared)
//   owners     which bank each person linked
//   at         when the holdings were last delivered (a fresh fetch at most every HOLDINGS_REFRESH_MS)
// savePrivate* reads back what it wrote and answers true only when it is there: the caller clears the old shared
// copy on that answer, never on a hope. Pure: no network, no React.
// -----------------------------------------------------------------------------
export const PLUS_HOLDINGS_KEY = "flourish_plus_holdings";
export const HOLDINGS_REFRESH_MS = 30 * 60 * 1000;

const isId = (v) => typeof v === "string" && v.length > 0;
function record(storage, userId) {
  if (!storage || !isId(userId)) return null;
  try {
    const o = JSON.parse(storage.getItem(PLUS_HOLDINGS_KEY) || "null");
    return o && typeof o === "object" && o.user === userId ? o : null;
  } catch { return null; }
}
function write(storage, userId, patch) {
  if (!storage || !isId(userId)) return false;
  try {
    const text = JSON.stringify({ ...(record(storage, userId) || {}), user: userId, ...patch });
    storage.setItem(PLUS_HOLDINGS_KEY, text);
    return storage.getItem(PLUS_HOLDINGS_KEY) === text;
  } catch { return false; }
}

/** Another account signs in on this device: the last person's copy goes. This account's own is left. */
export function dropPrivateCopyUnless(storage, userId) {
  try { if (storage && storage.getItem(PLUS_HOLDINGS_KEY) !== null && !record(storage, userId)) storage.removeItem(PLUS_HOLDINGS_KEY); } catch { /* private window */ }
}
/** Everything kept for this account: { holdings, list, owners, at }. Another account's copy is never returned. */
export function loadPrivateCopy(storage, userId) {
  const o = record(storage, userId);
  return {
    holdings: o && Array.isArray(o.holdings) ? o.holdings : [],
    list: o && o.list && typeof o.list === "object" && o.list.mine ? o.list : undefined,
    owners: o && o.owners && typeof o.owners === "object" && !Array.isArray(o.owners) ? o.owners : {},
    at: o && Number.isFinite(o.at) ? o.at : null,
  };
}
export const loadPrivateHoldings = (storage, userId) => loadPrivateCopy(storage, userId).holdings;
/** true only when the holdings are on the device after the write (read back). */
export const savePrivateHoldings = (storage, userId, holdings, now = Date.now()) => Array.isArray(holdings) && write(storage, userId, { holdings, at: now });
export const savePrivateList = (storage, userId, list) => !!list && typeof list === "object" && write(storage, userId, { list });
export const savePrivateOwners = (storage, userId, owners) => !!owners && typeof owners === "object" && write(storage, userId, { owners });
/** Fetch the holdings again? Never delivered to this account on this device, or HOLDINGS_REFRESH_MS ago or more. */
export function holdingsStale(storage, userId, now = Date.now()) {
  const { at } = loadPrivateCopy(storage, userId);
  return at === null || now - at >= HOLDINGS_REFRESH_MS || now < at;
}

/**
 * The holdings after one round of get_investments, one answer per bank (Promise.allSettled, in the order of `items`).
 *   prev      what this person had (each holding stamped `_item` with its bank)
 * Returns { holdings, plain, plusMode, delivered, locked }:
 *   plusMode   an answer was Plus's (plus_mode): the holdings are private, and `holdings` is the list to show
 *   delivered  at least one bank's holdings really came (Plus's answer, not locked, not unavailable). Only then may
 *              anything saved change.
 *   locked     an answer said locked (no Plus, or the app must update): nothing came, and nothing changes
 *   plain      Plus off: every holding as it came, for today's path
 * A bank that answered replaces its own holdings (none, if it holds none now). A bank that FAILED (the call threw,
 * or the server said `unavailable`) keeps what it had. A bank no longer in `items` is dropped.
 */
export function mergeHoldings(prev, items, results) {
  const before = Array.isArray(prev) ? prev : [];
  const out = [], plain = [];
  let plusMode = false, delivered = false, locked = false;
  (Array.isArray(items) ? items : []).forEach((it, i) => {
    const itemId = it && it.item_id;
    const r = Array.isArray(results) ? results[i] : null;
    const v = r && r.status === "fulfilled" && r.value && Array.isArray(r.value.holdings) ? r.value : null;
    const kept = before.filter((h) => h && itemId && h._item === itemId);
    if (!v) { out.push(...kept); return; }                      // the call failed, or made no sense
    if (v.plus_mode !== true) { plain.push(...v.holdings); out.push(...kept); return; }
    plusMode = true;
    if (v.locked) { locked = true; out.push(...kept); return; }
    if (v.unavailable) { out.push(...kept); return; }
    delivered = true;
    out.push(...v.holdings.map((h) => ({ ...h, _item: itemId })));
  });
  return { holdings: out, plain, plusMode, delivered, locked };
}
