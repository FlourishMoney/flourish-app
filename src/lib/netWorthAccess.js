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
// CODE REVIEW 2026-11-22:
//   - ONE ACCOUNT AT A TIME (setPlusUser). Everything here belongs to the signed-in account: when it changes, the page
//     holds nothing of the last person's (their list, holdings and banks are private), the saved answer is theirs no
//     longer (NW_USER_KEY), and an answer that arrives late for them is dropped (every setter's `forUser`).
//   - A PERSON WHOSE LAST ANSWER WAS "plus" KEEPS IT through any check that did not get through, a failed answer as
//     much as no answer: only a real answer (404, 400 unknown_action, or a 200) ends it. They paid for the figure.
//   - WHAT PLUS GAVE THEM IS KEPT ON THE DEVICE, for that account only (lib/plusHoldings.js): holdings, the list and
//     who linked each bank come back from it the moment the mode is "plus", so a reload, no signal or a failed call
//     still shows their own net worth.
// A SERVER THAT HAS NO PLUS CODE AT ALL (it answers 400 unknown_action to plus_status: any deploy from before the Plus
// add-on, which is production until 1.1.8's server is live) is "today" too: this app must work exactly as before
// against it, never show a locked or "couldn't check" state for something that server has never heard of.
// AN APP OLDER THAN THE SERVER'S MINIMUM FOR PLUS DATA (plus_status min_client, lib/plusClient.js) is sent none, so
// it shows no figure: "unavailable" for now (a line of its own is to come).
// -----------------------------------------------------------------------------
import { useSyncExternalStore } from "react";
import { plusClientFields, clientTooOld } from "./plusClient.js";
import { loadPrivateCopy, savePrivateList, savePrivateOwners, dropPrivateCopyUnless } from "./plusHoldings.js";

export const NW_MODE_KEY = "flourish_nw_mode";
export const NW_TOLD_KEY = "flourish_nw_plus_told";
export const NW_USER_KEY = "flourish_nw_user";   // whose saved answer NW_MODE_KEY and NW_TOLD_KEY are
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
  if (lastMode === "plus") return "plus";                   // a person with Plus keeps it until a real answer says otherwise
  if (neverTold && !saysPlusOn(res)) return "today";
  if (!isObj(res)) return KEEPABLE.includes(lastMode) ? lastMode : "unavailable";   // no answer (offline)
  return "unavailable";
}
/** May this screen show a net worth figure or investment holdings? Only in "today" or "plus". */
export const showsNetWorth = (mode) => mode === "today" || mode === "plus";

// ── the one store every screen reads ─────────────────────────────────────────────────────────────
// answer: the server's last plus_status answer as it came ({ status, body }, null for none, undefined before the first),
// for the screens that offer or manage Plus (lib/plusBuy.js plusScreenView). buy / buyNotice: the Plus purchase screen
// is open (and what it was opened for: a return from Stripe). Nothing here grants anything.
const EMPTY = { mode: "pending", holdings: [], list: undefined, owners: {}, answer: undefined, buy: false, buyNotice: null };
let state = { ...EMPTY, user: null };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const read = (storage, key = NW_MODE_KEY) => { try { return storage ? storage.getItem(key) : null; } catch { return null; } };
const deviceStore = () => (typeof localStorage !== "undefined" ? localStorage : null);
let told = false;   // this page has been told Plus is on: for a device that can save nothing (a private window)
// Is this for someone who is no longer the signed-in account? (forUser not given: the caller did not say, as before.)
const notFor = (forUser) => forUser !== undefined && forUser !== state.user;
/**
 * WHO IS SIGNED IN (null: nobody). A different account: the page starts again from "pending" with nothing held, and
 * the saved answer on the device is cleared unless it is this account's. Signing out keeps the saved answer, so the
 * same person signing back in with no signal still has theirs.
 */
export function setPlusUser(userId, storage = deviceStore()) {
  const id = typeof userId === "string" && userId ? userId : null;
  if (id === state.user) return;
  state = { ...EMPTY, user: id };
  told = false;
  if (id) {
    try {
      if (storage && storage.getItem(NW_USER_KEY) !== id) { storage.removeItem(NW_MODE_KEY); storage.removeItem(NW_TOLD_KEY); storage.setItem(NW_USER_KEY, id); }
    } catch { /* private window */ }
    dropPrivateCopyUnless(storage, id);   // the last person's holdings and list do not stay on a shared device
  }
  emit();
}
export function setPlusAnswer(res, storage = deviceStore(), forUser = undefined) {
  if (notFor(forUser)) return state.mode;
  const mode = netWorthMode(res, read(storage), !told && !read(storage, NW_TOLD_KEY));
  if (saysPlusOn(res)) told = true; else if (saysToday(res)) told = false;
  // Only an answer is saved, never a guess made because the check did not get through.
  const answered = saysToday(res) || (isObj(res) && res.status === 200);
  try { if (storage && answered && KEEPABLE.includes(mode)) storage.setItem(NW_MODE_KEY, mode); if (storage && mode === "locked") storage.removeItem(NW_MODE_KEY); } catch { /* private window */ }
  try { if (storage && saysPlusOn(res)) storage.setItem(NW_TOLD_KEY, "1"); if (storage && saysToday(res)) storage.removeItem(NW_TOLD_KEY); } catch { /* private window */ }
  // With Plus: whatever the page does not hold yet comes from this account's copy on the device (lib/plusHoldings.js).
  // Without: nothing is held in the page, and that copy is left alone.
  let held = { holdings: [], list: undefined, owners: {} };
  if (mode === "plus") {
    const kept = loadPrivateCopy(storage, state.user);
    held = { holdings: state.holdings.length ? state.holdings : kept.holdings, list: state.list !== undefined ? state.list : kept.list, owners: Object.keys(state.owners).length ? state.owners : kept.owners };
  }
  state = { ...state, mode, answer: res, ...held };
  emit();
  return mode;
}
/** Open the flourish Plus screen (notice: "success" | "cancelled" | "portal_return" when Stripe sent the person back). */
export function openPlusBuy(notice = null) { state = { ...state, buy: true, buyNotice: notice }; emit(); }
export function closePlusBuy() { if (!state.buy && state.buyNotice === null) return; state = { ...state, buy: false, buyNotice: null }; emit(); }
export function setPlusHoldings(holdings, forUser = undefined) { if (notFor(forUser)) return; state = { ...state, holdings: Array.isArray(holdings) ? holdings : [] }; emit(); }
export function setNetWorthList(list, forUser = undefined, storage = deviceStore()) {
  if (notFor(forUser)) return;
  state = { ...state, list };
  savePrivateList(storage, state.user, list);
  emit();
}
// Which bank each account came from, and who linked it (list_items: linked_by "partner" for the other member's).
export function setItemOwners(items, forUser = undefined, storage = deviceStore()) {
  if (notFor(forUser)) return;
  const owners = {};
  for (const it of Array.isArray(items) ? items : []) if (it && it.item_id) owners[it.item_id] = it.linked_by ? "partner" : "me";
  state = { ...state, owners };
  savePrivateOwners(storage, state.user, owners);
  emit();
}
/** An account's owner from its stamped bank (`_item`): "me", "partner", or null (no bank linked it, or not stamped). */
export const ownerOfFrom = (owners) => (a) => (a && a._item && owners && owners[a._item]) || null;
export const getNetWorthState = () => state;
/**
 * The desktop sidebar's old investment card adds up EVERY investment account in the household's data, with no idea
 * who linked which. That is right only where net worth is as it is today. Once Plus is on it is never shown: without
 * Plus the balances are behind Plus, and with Plus a partner's private account must not be in a figure (the Net Worth
 * tab shows each person their own). Full-app review 2026-11-22, P9-01.
 */
export const showsAccountBalanceCard = (mode) => mode === "today";
/**
 * What Plus keeps apart from the household's data, for Settings' "Export my data": this person's own holdings (a
 * bank they linked) and the net worth entries they typed. A partner's are the partner's to export, shared or not.
 * null without Plus: there is nothing apart to add. Full-app review 2026-11-22, P9-03.
 */
export function plusExport(s) {
  if (!s || s.mode !== "plus") return null;
  const mineOf = ownerOfFrom(s.owners);
  const entries = s.list && s.list.mine && Array.isArray(s.list.mine.entries) ? s.list.mine.entries : [];
  return { holdings: (Array.isArray(s.holdings) ? s.holdings : []).filter((h) => mineOf(h) === "me"), netWorthEntries: entries };
}
export function useNetWorthState() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
}
export function _resetForTests() { told = false; state = { ...EMPTY, user: null }; emit(); }

/**
 * An id of its own for a NEW net worth entry, made once when its form opens and sent with every try (save_entry
 * client_id): a second tap after an answer that was lost is the same entry to the server, never a second one.
 */
export function newEntryId(c = (typeof globalThis !== "undefined" ? globalThis.crypto : null)) {
  if (c && typeof c.randomUUID === "function") { try { return c.randomUUID(); } catch { /* below */ } }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => { const r = Math.floor(Math.random() * 16); return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16); });
}

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
