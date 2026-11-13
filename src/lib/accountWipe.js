// src/lib/accountWipe.js
// -----------------------------------------------------------------------------
// AN ACCOUNT DELETED ON THIS DEVICE LEAVES NOTHING OF ITSELF HERE (2026-11-13).
//
// What went wrong on the website: deleting the account removed every flourish_ key and reloaded, but signing out first
// made the app render once more with no user, and its save effect wrote the deleted account's finances back to
// localStorage with no owner on them. The next sign-in took that ownerless copy for data entered before signing up and
// saved it into the NEW account: no onboarding, no consent step, the old numbers.
//
// So, two guards:
//   1. Once a deletion starts, nothing may write a flourish key to the browser again (lockBrowserStorage). When the
//      server confirms it, the device is marked (DELETED_MARK, a time and nothing else) before the sign-out, so every
//      other open tab locks, clears and reloads first (followDeletionElsewhere: a second tab is how the live carry-over
//      happened, its in-memory copy saved back as the sign-out reached it). After the sign-out every flourish key goes
//      from localStorage and sessionStorage but the mark, and every flourish IndexedDB database (wipeDeletedAccount),
//      and the page reloads.
//   2. On sign-in, ownerless local data is never imported into an account older than a few minutes, nor after a
//      deletion on this device (refuseOwnerlessLocal); it is cleared instead.
// The same code runs in the iPhone and Android apps (their WebView's own localStorage; flourish keeps nothing in
// Capacitor storage); the app also cancels its own scheduled reminders there (notifications.js cancelAllScheduled).
// -----------------------------------------------------------------------------

/** Every key and database of ours starts with this ("flourish_..." and the device records "flourishInstallReferrer_v1", ...). */
export const PREFIX = "flourish";
/** Set after a deletion's wipe: the time, nothing else. Read and removed by the next sign-in. */
export const DELETED_MARK = "flourish_deleted_at";
/** Ownerless local data is imported only into an account made this recently (a sign-up on this device, just now). */
export const OWNERLESS_IMPORT_WINDOW_MS = 10 * 60 * 1000;

const ours = (k) => typeof k === "string" && k.startsWith(PREFIX);
const storageProto = () => { try { return globalThis.Storage ? globalThis.Storage.prototype : null; } catch { return null; } };

let locked = false;
let originalSetItem = null;
let lockedProto = null;

/** Whether a deletion has locked this page's storage. */
export function isStorageLocked() { return locked; }

/** From the moment a deletion starts: no flourish key can be written to localStorage or sessionStorage on this page. */
export function lockBrowserStorage(proto = storageProto()) {
  if (locked) return;
  locked = true;
  if (!proto || typeof proto.setItem !== "function") return;
  lockedProto = proto;
  originalSetItem = proto.setItem;
  const real = originalSetItem;
  proto.setItem = function setItem(k, v) {
    if (locked && ours(String(k))) return undefined;   // a deletion is under way: nothing of ours is written
    return real.call(this, k, v);
  };
}

/** The deletion did not happen (the server said no): the page saves again as before. */
export function unlockBrowserStorage() {
  if (lockedProto && originalSetItem) lockedProto.setItem = originalSetItem;
  locked = false; originalSetItem = null; lockedProto = null;
}

/** Removes every key of ours from one Storage, but those in keep. Returns how many went. */
export function clearOurKeys(storage, keep = []) {
  if (!storage) return 0;
  let n = 0;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (ours(k) && !keep.includes(k)) keys.push(k); }
    for (const k of keys) { try { storage.removeItem(k); n++; } catch { /* the rest still go */ } }
  } catch { /* no storage: nothing to clear */ }
  return n;
}

const settle = (p, ms) => Promise.race([Promise.resolve(p).catch(() => null), new Promise((ok) => setTimeout(() => ok(null), ms))]);

/** Deletes every IndexedDB database of ours. Never waits more than timeoutMs in all. Returns how many were asked to go. */
export async function clearOurDatabases(idb = globalThis.indexedDB, timeoutMs = 1500) {
  if (!idb || typeof idb.databases !== "function") return 0;
  const list = await settle(idb.databases(), timeoutMs);
  const names = (Array.isArray(list) ? list : []).map((d) => d && d.name).filter(ours);
  await settle(Promise.all(names.map((name) => new Promise((ok) => {
    try { const r = idb.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => ok(); } catch { ok(); }
  }))), timeoutMs);
  return names.length;
}

const defaultLocal = () => { try { return globalThis.localStorage; } catch { return null; } };
const defaultSession = () => { try { return globalThis.sessionStorage; } catch { return null; } };

/**
 * The server has deleted the account: mark this device (DELETED_MARK, the time) BEFORE signing out. Every other open tab
 * of the app hears it first (followDeletionElsewhere) and stops saving before the sign-out reaches it; the next sign-in
 * imports nothing ownerless while it is there. Written past the lock. Never throws.
 */
export function markAccountDeleted(local = defaultLocal(), now = Date.now()) {
  try {
    const write = originalSetItem || (local && local.setItem);
    if (local && write) write.call(local, DELETED_MARK, String(now));
  } catch { /* the account's age still guards the next sign-in */ }
}

/**
 * After the server deleted the account and the session was signed out: every flourish key and database goes but the
 * deletion mark (written again if it is missing). Never throws.
 */
export async function wipeDeletedAccount({ local, session, idb, now = Date.now() } = {}) {
  const L = local !== undefined ? local : defaultLocal();
  const S = session !== undefined ? session : defaultSession();
  const keep = [DELETED_MARK];
  const out = { local: clearOurKeys(L, keep), session: clearOurKeys(S), databases: 0 };
  try { out.databases = await clearOurDatabases(idb !== undefined ? idb : globalThis.indexedDB); } catch { /* best effort */ }
  out.local += clearOurKeys(L, keep);   // anything written while the databases were going (nothing should be: the lock)
  if (!deletedAt(L)) markAccountDeleted(L, now);
  return out;
}

/**
 * Another tab of the app on this device deleted the account (it set DELETED_MARK). Calls onDeleted once. A tab that
 * kept the deleted account's finances in memory would otherwise save them back, ownerless, the moment the sign-out
 * reached it: the live carry-over of 2026-11-13. Returns the unsubscribe.
 */
export function onDeletionElsewhere(onDeleted, target = globalThis) {
  if (!target || typeof target.addEventListener !== "function") return () => {};
  let fired = false;
  const h = (e) => { if (!fired && e && e.key === DELETED_MARK && e.newValue) { fired = true; try { onDeleted(); } catch { /* the next sign-in still refuses */ } } };
  target.addEventListener("storage", h);
  return () => target.removeEventListener("storage", h);
}

/**
 * What a tab does when the account was deleted in another: lock, clear everything of ours but the mark, and reload once
 * the other tab's sign-out has removed the session (or after waitMs), so it does not come back signed in to an account
 * that no longer exists.
 */
export function followDeletionElsewhere({ local = defaultLocal(), session = defaultSession(), target = globalThis, waitMs = 5000,
  reload = () => globalThis.location && globalThis.location.reload(), proto = storageProto() } = {}) {
  lockBrowserStorage(proto);
  clearOurKeys(local, [DELETED_MARK]);
  clearOurKeys(session);
  let done = false, timer = null;
  const go = () => { if (done) return; done = true; if (timer) clearTimeout(timer); try { target && target.removeEventListener && target.removeEventListener("storage", h); } catch {} clearOurKeys(local, [DELETED_MARK]); try { reload(); } catch { /* the lock holds until it does */ } };
  const h = (e) => { if (e && typeof e.key === "string" && /^sb-.*-auth-token$/.test(e.key) && !e.newValue) go(); };
  try { target && target.addEventListener && target.addEventListener("storage", h); } catch { /* the timer still reloads */ }
  timer = setTimeout(go, waitMs);
}

/** When this device last had an account deleted (ms), or null. */
export function deletedAt(storage) {
  try { const v = Number(storage && storage.getItem(DELETED_MARK)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}

export function clearDeletedMark(storage) { try { storage && storage.removeItem(DELETED_MARK); } catch { /* fine */ } }

/**
 * Whether ownerless local data must NOT go into this account (it is cleared instead). Data with an owner is the
 * shared-device check's business, and an empty device has nothing to import.
 */
export function refuseOwnerlessLocal({ localUid, hasRealData, userCreatedAt, deletedAtMs = null, now = Date.now() }) {
  if (localUid || !hasRealData) return false;
  if (deletedAtMs) return true;                                     // an account was deleted here and nobody has signed in since
  const made = Date.parse(userCreatedAt || "");
  if (!Number.isFinite(made)) return true;                          // an account of unknown age: the safe side
  return now - made > OWNERLESS_IMPORT_WINDOW_MS;
}
