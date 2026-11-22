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
// A CHECK THAT DOES NOT GET THROUGH TAKES NOTHING AWAY FROM A DEVICE THE SERVER HAS NEVER TOLD "PLUS IS ON" (Amanda,
// 2026-11-21). While PLUS_ENABLED is off that is every device: no answer, a 500, a 502, a 401 or anything else that is
// not an answer shows net worth as it does today, on a new device too. "unavailable" is only for a device that has been
// told Plus is on: a 200 from the server's Plus code, or its own 503 status_unavailable (NW_TOLD_KEY, and kept in this
// page for a device that can save nothing). A 404 takes the device back to "today" and clears it.
// A SERVER THAT HAS NO PLUS CODE AT ALL (it answers 400 unknown_action to plus_status: any deploy from before the Plus
// add-on, which is production until 1.1.8's server is live) is "today" too: this app must work exactly as before
// against it, never show a locked or "couldn't check" state for something that server has never heard of.
// AN APP OLDER THAN THE SERVER'S MINIMUM FOR PLUS DATA (plus_status min_client, lib/plusClient.js) is sent none, so
// it shows no figure: "unavailable" for now (a line of its own is to come).
// -----------------------------------------------------------------------------
import { useSyncExternalStore } from "react";
import { plusClientFields, clientTooOld } from "./plusClient.js";

export const NW_MODE_KEY = "flourish_nw_mode";
export const NW_TOLD_KEY = "flourish_nw_plus_told";
const KEEPABLE = ["today", "plus"];
const isObj = (res) => !!res && typeof res === "object";
// The server says there is no Plus here: PLUS_ENABLED off (404), or a server from before the Plus add-on (400 unknown_action).
const saysToday = (res) => isObj(res) && (res.status === 404 || (res.status === 400 && !!res.body && res.body.error === "unknown_action"));
// The server's Plus code answered: Plus is on there for this account, whatever the answer says about the household.
const saysPlusOn = (res) => isObj(res) && (res.status === 200 || (res.status === 503 && !!res.body && res.body.error === "status_unavailable"));
/** Ask again? Yes when the check did not get through (no answer, or a failed one); never after an answer. */
export const plusAskAgain = (res) => res !== undefined && !saysToday(res) && !(isObj(res) && res.status === 200);

// neverTold: this device has never been told Plus is on (setPlusAnswer reads it). Without it, exactly as before.
export function netWorthMode(res, lastMode = null, neverTold = false) {
  if (res === undefined) return "pending";
  if (saysToday(res)) return "today";
  if (isObj(res) && res.status === 200) {
    const b = res.body;
    if (!b || b.enabled !== true || typeof b.plus !== "boolean") return "unavailable";
    if (clientTooOld(b.min_client)) return "unavailable";
    return b.plus ? "plus" : "locked";
  }
  // The check did not get through.
  if (neverTold && !saysPlusOn(res) && lastMode !== "plus") return "today";
  if (!isObj(res)) return KEEPABLE.includes(lastMode) ? lastMode : "unavailable";   // no answer (offline)
  return "unavailable";
}
/** May this screen show a net worth figure or investment holdings? Only in "today" or "plus". */
export const showsNetWorth = (mode) => mode === "today" || mode === "plus";

// ── the one store every screen reads ─────────────────────────────────────────────────────────────
// answer: the server's last plus_status answer as it came ({ status, body }, null for none, undefined before the first),
// for the screens that offer or manage Plus (lib/plusBuy.js plusScreenView). buy / buyNotice: the Plus purchase screen
// is open (and what it was opened for: a return from Stripe). Nothing here grants anything.
let state = { mode: "pending", holdings: [], list: undefined, owners: {}, answer: undefined, buy: false, buyNotice: null };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const read = (storage, key = NW_MODE_KEY) => { try { return storage ? storage.getItem(key) : null; } catch { return null; } };
let told = false;   // this page has been told Plus is on: for a device that can save nothing (a private window)
export function setPlusAnswer(res, storage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  const mode = netWorthMode(res, read(storage), !told && !read(storage, NW_TOLD_KEY));
  if (saysPlusOn(res)) told = true; else if (saysToday(res)) told = false;
  // Only an answer is saved, never a guess made because the check did not get through.
  const answered = saysToday(res) || (isObj(res) && res.status === 200);
  try { if (storage && answered && KEEPABLE.includes(mode)) storage.setItem(NW_MODE_KEY, mode); if (storage && mode === "locked") storage.removeItem(NW_MODE_KEY); } catch { /* private window */ }
  try { if (storage && saysPlusOn(res)) storage.setItem(NW_TOLD_KEY, "1"); if (storage && saysToday(res)) storage.removeItem(NW_TOLD_KEY); } catch { /* private window */ }
  state = { ...state, mode, answer: res, ...(mode === "plus" ? {} : { holdings: [], list: undefined, owners: {} }) };
  emit();
  return mode;
}
/** Open the flourish Plus screen (notice: "success" | "cancelled" | "portal_return" when Stripe sent the person back). */
export function openPlusBuy(notice = null) { state = { ...state, buy: true, buyNotice: notice }; emit(); }
export function closePlusBuy() { if (!state.buy && state.buyNotice === null) return; state = { ...state, buy: false, buyNotice: null }; emit(); }
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
export function _resetForTests() { told = false; state = { mode: "pending", holdings: [], list: undefined, owners: {}, answer: undefined, buy: false, buyNotice: null }; emit(); }

// ── the calls ──────────────────────────────────────────────────────────────────────────────────
/** The server's Plus answer as { status, body }, or null when there was no answer at all. */
export async function askPlusStatus(opts = {}) { return askPlus("plus_status", {}, opts); }
/** Any of the server's Plus actions (billing.js PLUS_ACTIONS), the same way: { status, body } or null. */
export async function askPlus(action, params = {}, { apiBase = "", jwt, fetchImpl = (typeof fetch !== "undefined" ? fetch : null) } = {}) {
  if (!jwt || !fetchImpl) return null;
  try {
    const res = await fetchImpl(`${apiBase}/api/billing`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action, ...params, ...plusClientFields() }) });
    let body = null; try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  } catch { return null; }
}
/** /api/networth: { status, body } or null. */
export async function callNetWorth(action, params = {}, { apiBase = "", jwt, fetchImpl = (typeof fetch !== "undefined" ? fetch : null) } = {}) {
  if (!jwt || !fetchImpl) return null;
  try {
    const res = await fetchImpl(`${apiBase}/api/networth`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action, ...params, ...plusClientFields() }) });
    let body = null; try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  } catch { return null; }
}
