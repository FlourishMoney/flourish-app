// src/lib/netWorthAccess.js
// -----------------------------------------------------------------------------
// WHO MAY SEE NET WORTH AND INVESTMENTS (Amanda, 2026-11-10): they move behind Plus. The net worth figure, Goals'
// Net Worth tab, Today's net worth card, Wrapped's net worth part and investment holdings. Every bank, card and loan
// balance stays where it is shown today. The server decides (billing.js plus_status, _lib/plusAddon.js); this only
// turns its answer into one of five modes, the one place every screen reads:
//   "today"        PLUS_ENABLED is off (the server answers 404): everything as it is today
//   "plus"         the household has Plus: net worth with Plus (private by default between partners)
//   "locked"       no Plus: a plain locked state where net worth was, never a blank or a broken screen
//   "unavailable"  the plan could not be read (503, or no answer at all): the locked state with a plain line,
//                  never a figure, unless the last answer this device had was "today" or "plus" (kept for offline)
//   "pending"      not asked yet: the card's shell with no figure
// -----------------------------------------------------------------------------
import { useSyncExternalStore } from "react";

export const NW_MODE_KEY = "flourish_nw_mode";
const KEEPABLE = ["today", "plus"];

export function netWorthMode(res, lastMode = null) {
  if (res === undefined) return "pending";
  const fallback = KEEPABLE.includes(lastMode) ? lastMode : "unavailable";
  if (!res || typeof res !== "object") return fallback;              // no answer (offline)
  if (res.status === 404) return "today";
  if (res.status === 503) return "unavailable";
  const b = res.body;
  if (res.status !== 200 || !b || b.enabled !== true || typeof b.plus !== "boolean") return "unavailable";
  return b.plus ? "plus" : "locked";
}
/** May this screen show a net worth figure or investment holdings? Only in "today" or "plus". */
export const showsNetWorth = (mode) => mode === "today" || mode === "plus";

// ── the one store every screen reads ─────────────────────────────────────────────────────────────
let state = { mode: "pending", holdings: [], list: undefined, owners: {} };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const read = (storage) => { try { return storage ? storage.getItem(NW_MODE_KEY) : null; } catch { return null; } };
export function setPlusAnswer(res, storage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  const mode = netWorthMode(res, read(storage));
  try { if (storage && KEEPABLE.includes(mode) && res && res.status) storage.setItem(NW_MODE_KEY, mode); if (storage && mode === "locked") storage.removeItem(NW_MODE_KEY); } catch { /* private window */ }
  state = { ...state, mode, ...(mode === "plus" ? {} : { holdings: [], list: undefined, owners: {} }) };
  emit();
  return mode;
}
export function setPlusHoldings(holdings) { state = { ...state, holdings: Array.isArray(holdings) ? holdings : [] }; emit(); }
export function setNetWorthList(list) { state = { ...state, list }; emit(); }
// Which bank each account came from, and who linked it (list_items: linked_by "partner" for the other member's).
export function setItemOwners(items) {
  const owners = {};
  for (const it of Array.isArray(items) ? items : []) if (it && it.item_id) owners[it.item_id] = it.linked_by ? "partner" : "me";
  state = { ...state, owners }; emit();
}
/** An account's owner from its stamped bank (`_item`): "me", "partner", or null (no bank linked it, or not stamped). */
export const ownerOfFrom = (owners) => (a) => (a && a._item && owners && owners[a._item]) || null;
export const getNetWorthState = () => state;
export function useNetWorthState() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
}
export function _resetForTests() { state = { mode: "pending", holdings: [], list: undefined, owners: {} }; emit(); }

// ── the calls ──────────────────────────────────────────────────────────────────────────────────
/** The server's Plus answer as { status, body }, or null when there was no answer at all. */
export async function askPlusStatus({ apiBase = "", jwt, fetchImpl = (typeof fetch !== "undefined" ? fetch : null) } = {}) {
  if (!jwt || !fetchImpl) return null;
  try {
    const res = await fetchImpl(`${apiBase}/api/billing`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action: "plus_status" }) });
    let body = null; try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  } catch { return null; }
}
/** /api/networth: { status, body } or null. */
export async function callNetWorth(action, params = {}, { apiBase = "", jwt, fetchImpl = (typeof fetch !== "undefined" ? fetch : null) } = {}) {
  if (!jwt || !fetchImpl) return null;
  try {
    const res = await fetchImpl(`${apiBase}/api/networth`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action, ...params }) });
    let body = null; try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  } catch { return null; }
}
