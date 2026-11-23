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
/**
 * A list that is NOT a fresh answer from the banks (the server's kept copy, shown when a bank could not be read) is
 * saved without touching `at`: the screen has it after a reload, and the banks are still asked again at the next
 * plan check. true only when it is on the device.
 */
export const keepPrivateHoldings = (storage, userId, holdings) => Array.isArray(holdings) && write(storage, userId, { holdings });
export const savePrivateList = (storage, userId, list) => !!list && typeof list === "object" && write(storage, userId, { list });
export const savePrivateOwners = (storage, userId, owners) => !!owners && typeof owners === "object" && write(storage, userId, { owners });
/** Fetch the holdings again? Never delivered to this account on this device, or HOLDINGS_REFRESH_MS ago or more. */
export function holdingsStale(storage, userId, now = Date.now()) {
  const { at } = loadPrivateCopy(storage, userId);
  return at === null || now - at >= HOLDINGS_REFRESH_MS || now < at;
}

/**
 * The holdings after one round of get_investments, one answer per bank (Promise.allSettled, in the order of `items`).
 *   prev      what this person had (each holding stamped `_item` with its bank, and `_at` with when it came)
 *   items     the banks (list_items: `linked_by` is set on the other member's)
 * Returns { holdings, plain, plainAnswered, plusMode, delivered, stale, marked, locked, banks }:
 *   plusMode   an answer was Plus's (plus_mode): the holdings are private, and `holdings` is the list to show
 *   delivered  at least one bank's holdings really came from the bank (Plus's answer, not locked, not unavailable,
 *              not stale). Only then may anything saved change.
 *   stale      a bank could not be read and the list the SERVER kept for it (migration 0055) is shown in its place.
 *              Shown, never "delivered": nothing is cleared on it.
 *   marked     a bank could not be refreshed and what THIS DEVICE already held for it was kept and marked `_stale`
 *              (real-world proof 2026-11-23). Shown, so the screen can say when they are from; never "delivered", and
 *              nothing is cleared on it. Without this a round where no bank answered live was dropped whole, and a
 *              person with one bank never saw the line.
 *   locked     an answer said locked (no Plus, or the app must update): nothing came, and nothing changes
 *   plain      Plus off: every holding as it came, for today's path (plainAnswered: the banks they came from)
 *   banks      one per bank: { item, mine, got: "live" | "stale" | "none", stored }. stored: the server says that
 *              bank's list is kept there in its OWNER's name. withoutCoveredSharedCopy reads these.
 * A bank that answered replaces its own holdings (none, if it holds none now). A bank that FAILED (the call threw,
 * or the server said `unavailable`) keeps what it had. The server's kept list replaces what this device holds for
 * that bank only when the device holds nothing for it or the kept list is the newer. A bank no longer in `items`
 * is dropped. A holding's BANK decides, never its id.
 */
export function mergeHoldings(prev, items, results, now = Date.now()) {
  const before = Array.isArray(prev) ? prev : [];
  const out = [], plain = [], banks = [];
  let plusMode = false, delivered = false, locked = false, stale = false, marked = false;
  const plainAnswered = [];
  (Array.isArray(items) ? items : []).forEach((it, i) => {
    const itemId = it && it.item_id;
    const r = Array.isArray(results) ? results[i] : null;
    const v = r && r.status === "fulfilled" && r.value && Array.isArray(r.value.holdings) ? r.value : null;
    const kept = before.filter((h) => h && itemId && h._item === itemId);
    const bank = { item: itemId, mine: !(it && it.linked_by), got: "none", stored: false };
    banks.push(bank);
    // A bank's holdings that could NOT be refreshed in a round that tried are marked `_stale` (round 3, NEW-4), so the
    // screen can say when they are from (`_at`). A live answer brings new objects, so the mark goes with the old ones.
    const old = () => { if (kept.length) marked = true; return kept.map((h) => ({ ...h, _stale: true })); };
    if (!v) { out.push(...old()); return; }                     // the call failed, or made no sense
    if (v.plus_mode !== true) { if (v.unavailable !== true) { plain.push(...v.holdings); plainAnswered.push(itemId); } out.push(...kept); return; }
    plusMode = true;
    if (v.locked) { locked = true; out.push(...kept); return; }
    if (v.unavailable) { out.push(...old()); return; }
    if (v.stale === true) {
      const asOf = Date.parse(v.as_of);
      const heldAt = kept.reduce((m, h) => (Number.isFinite(h._at) && h._at > m ? h._at : m), -Infinity);
      if (kept.length && !(Number.isFinite(asOf) && asOf > heldAt)) { out.push(...old()); return; }  // this device's is as new, or newer
      stale = true; bank.got = "stale";
      out.push(...v.holdings.map((h) => ({ ...h, _item: itemId, _at: Number.isFinite(asOf) ? asOf : 0, _stale: true })));
      return;
    }
    delivered = true; bank.got = "live"; bank.stored = v.stored === true;
    out.push(...v.holdings.map((h) => ({ ...h, _item: itemId, _at: now })));
  });
  return { holdings: out, plain, plainAnswered, plusMode, delivered, stale, marked, locked, banks };
}

/**
 * Does a Plus round change what is shown? Yes when a bank answered live, when the server's kept list was put in a
 * bank's place, or when this device's own holdings were marked "could not be refreshed" (so their as-of line shows).
 * A round that did none of these, or that has a locked answer in it, changes nothing.
 */
// A round with a LOCKED answer changes nothing at all (mergeHoldings: "nothing came, and nothing changes"), also when
// another bank's call failed in it and was marked (PLUS-NEW-01 review, 2026-11-23: the marks alone used to get it shown).
export const roundShows = (merged) => !!(merged && merged.locked !== true && (merged.delivered === true || merged.stale === true || merged.marked === true));

/**
 * PLUS-NEW-01 (2026-11-23): a round where no bank answered at all, and what this device held for a bank was marked
 * "could not be refreshed" (`marked`), carries nothing that says Plus (`plusMode` is false: that comes only from a
 * plus_mode answer). Its marks may reach the Plus display, so the as-of line shows, ONLY when every one of these holds:
 *   knownPlus   the app knows this account is in Plus mode (lib/netWorthAccess.js plusKnownFor). Never for a Plus-off
 *               household: there the kept holdings are the shared ones, and nothing changes.
 *   the round is marked only: no live answer, no server-kept list, no locked answer, no bank that answered without Plus
 *   the round is for the account still signed in
 * The caller shows the marked list and does nothing else: nothing is saved with a time (stale is never fresh), and
 * the household's shared copy is never touched.
 */
export function markedRoundShows(merged, { forUser, signedIn, knownPlus } = {}) {
  if (!merged || merged.marked !== true || merged.plusMode === true) return false;
  if (merged.delivered === true || merged.stale === true || merged.locked === true) return false;
  if (Array.isArray(merged.plainAnswered) && merged.plainAnswered.length > 0) return false;
  return knownPlus === true && isId(forUser) && signedIn === forUser;
}

/**
 * THE OLD SHARED COPY (appData.investments, from before Plus), after a round with Plus. Round 2 of the Plus review,
 * Gemini G-N1 with ChatGPT B1, and Amanda's rule for both: private holdings must never be in the household's shared
 * data, AND a person must never lose their holdings.
 *
 * So a bank's old holdings leave the shared copy when, and only when, that bank's holdings have a LASTING PRIVATE
 * HOME FOR THEIR OWNER:
 *   - the bank answered this round (really, from the bank), AND
 *   - the server says it keeps that bank's list (stored), OR it is this person's own bank and this device saved it
 *     (savedOnDevice: written and read back). This device's copy is no home for a PARTNER's holdings, so a
 *     partner's bank counts only on the server's word.
 * A bank that failed, was locked, or was answered from the server's kept copy clears nothing. When every bank is
 * covered the key itself goes (with anything in it that no bank owns); until then a holding whose bank is not known
 * stays. What is left is only ever a part of what was already there: nothing Plus sent is ever put here.
 * Returns the same object when nothing changes.
 */
export function withoutCoveredSharedCopy(appData, merged, savedOnDevice) {
  if (!appData || typeof appData !== "object" || !("investments" in appData)) return appData;
  const banks = merged && Array.isArray(merged.banks) ? merged.banks : [];
  const covered = new Set(banks.filter((b) => b && b.item && b.got === "live" && (b.stored === true || (savedOnDevice === true && b.mine === true))).map((b) => b.item));
  if (!covered.size) return appData;
  if (banks.every((b) => b && covered.has(b.item))) { const { investments, ...rest } = appData; return rest; }
  const old = Array.isArray(appData.investments) ? appData.investments : [];
  const itemOf = new Map((Array.isArray(appData.accounts) ? appData.accounts : []).map((a) => [a && a.id, (a && a._item) || null]));
  const left = old.filter((h) => !(h && covered.has(itemOf.get(h.account_id))));
  return left.length === old.length ? appData : { ...appData, investments: left };
}

// A holding's identity, for one with NO known bank only: its id, or its account and security when it has none. An id
// made from a missing security ("acct_undefined") is none. null: it is never matched to another.
const holdingKey = (h) => {
  if (!h) return null;
  if (typeof h.id === "string" && h.id && !/_(undefined|null)$/.test(h.id)) return `id:${h.id}`;
  const what = h.security_id ?? h.ticker ?? h.name;
  return h.account_id != null && what != null && what !== "" ? `at:${h.account_id}|${what}` : null;
};

/**
 * Plus off: the household's holdings after a round (full-app review 2026-11-22, P10-06 with P3-09; round 2, N2, as
 * lib/multibank.js retainHoldings on fix-review-1122). The banks that answered used to replace the whole list, so one
 * bank's failed read wiped its holdings whenever another answered.
 * A holding's BANK decides, whatever its id: kept when its bank did not answer (the call failed, or the server said
 * `unavailable`), gone when its bank answered (what that bank holds now came with the answer, which may be nothing:
 * sold). Only a holding with no known bank is matched by identity, so it is not listed twice when it comes again. Of
 * those not come again: kept only while some bank failed (it may be that bank's), whether or not its account is still
 * there (main's R3-1: holdings only ever come from a bank).
 *   prev      appData.investments now      merged   mergeHoldings' answer      accounts   appData.accounts (_item)
 * Returns the new list, or null when NO bank answered (nothing changes). A round where every bank answered with
 * nothing is applied: the list is then what is left, which may be empty.
 */
export function plainHoldingsAfter(prev, merged, accounts) {
  const came = merged && Array.isArray(merged.plain) ? merged.plain : [];
  const answered = new Set((merged && merged.plainAnswered) || []);
  if (!answered.size) return null;
  const someBankFailed = !(merged && Array.isArray(merged.banks)) || merged.banks.some((b) => !answered.has(b && b.item));
  const itemOf = new Map((Array.isArray(accounts) ? accounts : []).map((a) => [a && a.id, (a && a._item) || null]));
  const cameKeys = new Set(came.map(holdingKey).filter(Boolean));
  const kept = (Array.isArray(prev) ? prev : []).filter((h) => {
    if (!h) return false;
    const item = itemOf.get(h.account_id);
    if (item != null) return !answered.has(item);
    const key = holdingKey(h);
    if (key && cameKeys.has(key)) return false;
    // No bank known for it (main's R3-1, live since 2026-11-23, lib/multibank.js retainHoldings): holdings only ever
    // come from a bank, so it is an older copy's. Kept while some bank failed (it may be that bank's), gone otherwise.
    return someBankFailed;
  });
  return [...kept, ...came];
}
