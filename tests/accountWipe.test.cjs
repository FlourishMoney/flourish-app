// tests/accountWipe.test.cjs
// -----------------------------------------------------------------------------
// AN ACCOUNT DELETED ON THIS DEVICE LEAVES NOTHING OF ITSELF HERE (src/lib/accountWipe.js, 2026-11-13).
// Found on the live site: after a deletion the sign-out re-rendered the app, its save effect wrote the deleted account's
// finances back with no owner, and the next sign-up imported them (no onboarding, no consent step, the old numbers).
//   1  once a deletion starts, no flourish key can be written to localStorage or sessionStorage; others still can
//   2  the wipe: every flourish key (flourish_..., flourishReviewPrompt_v1, ...) from both storages, every flourish IndexedDB
//      database, but the deletion mark; a hanging IndexedDB never holds the reload up; the mark goes first, before the
//      sign-out, and every other open tab locks, clears and reloads once the session is gone
//   3  ownerless local data goes into an account only when it was made minutes ago and no deletion happened here since
//   4  the reproduction: a save after the sweep lands nothing
//   5  the app: lock before the server is asked, unlock on every FAIL CLOSED, sign out, reminders, wipe, reload; the
//      sign-in clears ownerless data it refuses, as another person's
// The browser test (onboardingFirstNumber.browser.test.cjs D1 to D6) runs the whole of it.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");

class FakeStorage {
  constructor(init = {}) { this.m = new Map(Object.entries(init)); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(String(k), String(v)); }
  removeItem(k) { this.m.delete(k); }
  keys() { return [...this.m.keys()].sort(); }
}
const ORIGINAL_SET = FakeStorage.prototype.setItem;

function fakeIdb(names, { hang = false } = {}) {
  const deleted = [];
  return {
    deleted,
    databases: () => hang ? new Promise(() => {}) : Promise.resolve(names.map((name) => ({ name, version: 1 }))),
    deleteDatabase(name) { deleted.push(name); const r = {}; setTimeout(() => r.onsuccess && r.onsuccess(), 5); return r; },
  };
}

(async () => {
  const t = create();
  const W = await import(path.join(REPO, "src", "lib", "accountWipe.js"));

  // ── 1. The lock ─────────────────────────────────────────────────────────────────────────────
  {
    const local = new FakeStorage(), session = new FakeStorage();
    W.lockBrowserStorage(FakeStorage.prototype);
    local.setItem("flourish_v1", "{\"appData\":{}}"); session.setItem("flourish_apple_grant_pending", "1"); local.setItem("flourishReviewPrompt_v1", "x");
    local.setItem("sb-test-auth-token", "s");
    t.eq([local.keys(), session.keys(), W.isStorageLocked()], [["sb-test-auth-token"], [], true], "1a locked: no flourish key lands in either storage; Supabase's own key still can");
    W.unlockBrowserStorage();
    local.setItem("flourish_v1", "back");
    t.eq([local.getItem("flourish_v1"), FakeStorage.prototype.setItem === ORIGINAL_SET, W.isStorageLocked()], ["back", true, false], "1b unlocked (the server said no): saving works as before");
  }

  // ── 2. The wipe ─────────────────────────────────────────────────────────────────────────────
  {
    const local = new FakeStorage({ flourish_v1: "{\"onboarded\":true}", flourish_uid: "u1", flourish_theme: "light", flourishReviewPrompt_v1: "r",
      flourishInstallReferrer_v1: "i", "flourish_consent_pending:u1": "c", "sb-test-auth-token": "s", other_site_key: "o" });
    const session = new FakeStorage({ flourish_apple_grant_pending: "1", unrelated: "u" });
    const idb = fakeIdb(["flourish-cache", "flourish_offline", "someone-else"]);
    W.lockBrowserStorage(FakeStorage.prototype);
    const out = await W.wipeDeletedAccount({ local, session, idb, now: 1763000000000 });
    t.eq(local.keys(), ["flourish_deleted_at", "other_site_key", "sb-test-auth-token"], "2a every flourish key is gone from localStorage; only the deletion mark is written");
    t.eq(session.keys(), ["unrelated"], "2b …and from sessionStorage");
    t.eq(idb.deleted.sort(), ["flourish-cache", "flourish_offline"], "2c …and every flourish IndexedDB database, no one else's");
    t.eq([out.local, out.session, out.databases, local.getItem(W.DELETED_MARK)], [6, 1, 2, "1763000000000"], "2d the mark is the time, nothing else (written although the storage is locked)");
    W.unlockBrowserStorage();
    const hung = fakeIdb(["flourish-x"], { hang: true });
    const t0 = Date.now();
    await W.wipeDeletedAccount({ local: new FakeStorage({ flourish_v1: "x" }), session: new FakeStorage(), idb: hung });
    t.ok(Date.now() - t0 < 4000, "2e an IndexedDB that never answers does not hold the reload up");
    const none = await W.wipeDeletedAccount({ local: null, session: null, idb: null });
    t.eq(none, { local: 0, session: 0, databases: 0 }, "2f no storage at all (a locked-down browser): nothing throws");
  }

  // ── 2g to 2l. Other tabs (the live carry-over: a second tab saved its copy back as the sign-out reached it) ───────────
  {
    const local = new FakeStorage({ flourish_v1: "old", flourish_uid: "u1" });
    W.lockBrowserStorage(FakeStorage.prototype);
    W.markAccountDeleted(local, 1763000000001);
    t.eq(local.getItem(W.DELETED_MARK), "1763000000001", "2g the mark is written past the lock, before the sign-out");
    await W.wipeDeletedAccount({ local, session: new FakeStorage(), idb: null, now: 1763000000999 });
    t.eq([local.keys(), local.getItem(W.DELETED_MARK)], [["flourish_deleted_at"], "1763000000001"], "2h the wipe keeps that mark (every other flourish key goes)");
    W.unlockBrowserStorage();
    const listeners = {};
    const target = { addEventListener: (ev, f) => { (listeners[ev] = listeners[ev] || []).push(f); }, removeEventListener: (ev, f) => { listeners[ev] = (listeners[ev] || []).filter((x) => x !== f); } };
    const fire = (e) => (listeners.storage || []).slice().forEach((f) => f(e));
    let heard = 0;
    const off = W.onDeletionElsewhere(() => { heard++; }, target);
    fire({ key: "flourish_v1", newValue: "x" }); fire({ key: W.DELETED_MARK, newValue: null });
    t.eq(heard, 0, "2i another tab hears nothing for other keys, or for the mark being cleared");
    fire({ key: W.DELETED_MARK, newValue: "1763000000001" }); fire({ key: W.DELETED_MARK, newValue: "1763000000002" });
    t.eq(heard, 1, "2j …and once when an account was deleted in another tab");
    off();
    const l2 = new FakeStorage({ flourish_v1: "old copy", [W.DELETED_MARK]: "1" }), s2 = new FakeStorage({ flourish_landing_viewed: "1" });
    let reloads = 0;
    W.followDeletionElsewhere({ local: l2, session: s2, target, waitMs: 60000, reload: () => { reloads++; }, proto: FakeStorage.prototype });
    l2.setItem("flourish_v1", "saved back as the sign-out reached this tab");
    t.eq([l2.keys(), s2.keys(), reloads], [["flourish_deleted_at"], [], 0], "2k that tab locks and clears at once (nothing it saves lands) and waits for the sign-out");
    fire({ key: "sb-test-auth-token", newValue: null });
    t.eq([reloads, l2.keys()], [1, ["flourish_deleted_at"]], "2l …then reloads, signed out, once");
    fire({ key: "sb-test-auth-token", newValue: null });
    t.eq(reloads, 1, "2m …only once");
    W.unlockBrowserStorage();
  }

  // ── 3. Ownerless local data on sign-in ──────────────────────────────────────────────────────
  {
    const now = Date.UTC(2026, 10, 13, 4, 3, 30);
    const ago = (min) => new Date(now - min * 60000).toISOString();
    const r = (o) => W.refuseOwnerlessLocal({ localUid: null, hasRealData: true, userCreatedAt: ago(1), deletedAtMs: null, now, ...o });
    t.eq(r({}), false, "3a a sign-up on this device a minute ago: what was entered before signing up goes into the account");
    t.eq(r({ deletedAtMs: now - 240000 }), true, "3b …but never after an account was deleted here (the live bug)");
    t.eq(r({ userCreatedAt: ago(11) }), true, "3c …and never into an account older than ten minutes");
    t.eq(r({ userCreatedAt: ago(9) }), false, "3d nine minutes: still a sign-up");
    t.eq(r({ userCreatedAt: undefined }), true, "3e an account of unknown age: the safe side");
    t.eq(r({ localUid: "someone" }), false, "3f data with an owner is the shared-device check's, not this one's");
    t.eq(r({ hasRealData: false, deletedAtMs: now }), false, "3g nothing real on the device: nothing to refuse");
    const s = new FakeStorage({ [W.DELETED_MARK]: "1763000000000" });
    t.eq(W.deletedAt(s), 1763000000000, "3h the mark reads back");
    W.clearDeletedMark(s);
    t.eq([W.deletedAt(s), W.deletedAt(new FakeStorage({ [W.DELETED_MARK]: "nonsense" })), W.deletedAt(null)], [null, null, null], "3i …and clears; a bad or missing mark is no mark");
  }

  // ── 4. The reproduction ─────────────────────────────────────────────────────────────────────
  {
    // The order the website ran on 2026-11-13: the sign-out, the sweep, and then the save effect for "no user".
    const local = new FakeStorage({ flourish_v1: JSON.stringify({ onboarded: true, appData: { incomes: [{ amount: 2100 }] }, userId: "old" }), flourish_uid: "old" });
    const saveState = (patch) => { const cur = JSON.parse(local.getItem("flourish_v1") || "{}"); local.setItem("flourish_v1", JSON.stringify({ ...cur, ...patch })); };
    W.lockBrowserStorage(FakeStorage.prototype);
    await W.wipeDeletedAccount({ local, session: new FakeStorage(), idb: null });
    saveState({ onboarded: true, appData: { incomes: [{ amount: 2100 }] }, isPremium: false });
    t.eq(local.getItem("flourish_v1"), null, "4a the save that ran after the sweep writes nothing: no ownerless copy for the next sign-up");
    W.unlockBrowserStorage();
  }

  // ── 5. The app ──────────────────────────────────────────────────────────────────────────────
  {
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const del = app.slice(app.indexOf("const deleteAllData = async"), app.indexOf("const signOut = async"));
    const at = (s) => del.indexOf(s);
    t.ok(at("lockBrowserStorage();") > 0 && at("lockBrowserStorage();") < at('callPlaid("delete_account"'), "5a the storage is locked before the server is asked");
    const fails = del.split("return; // FAIL CLOSED").length - 1;
    const unlocked = del.split("unlockBrowserStorage(); return; // FAIL CLOSED").length - 1;
    t.ok(fails === 3 && unlocked === fails, "5b every FAIL CLOSED unlocks it again (the account still exists, and so does its data)");
    t.ok(at("supabase.auth.signOut()") < at("cancelAllScheduled()") && at("cancelAllScheduled()") < at("await wipeDeletedAccount()") && at("await wipeDeletedAccount()") < at("window.location.reload()"),
      "5c deleted: sign out, the reminders, every flourish key and database, then reload");
    t.ok(!/Object\.keys\(localStorage\)/.test(del), "5d no second, partial sweep of its own");
    t.ok(at("markAccountDeleted();") > at('callPlaid("delete_account"') && at("markAccountDeleted();") < at("supabase.auth.signOut()"), "5d2 the device is marked after the server confirms and before the sign-out");
    t.ok(/useEffect\(\(\)=>onDeletionElsewhere\(\(\)=>followDeletionElsewhere\(\)\), \[\]\);/.test(app), "5d3 every open tab follows a deletion made in another");
    const hyd = app.slice(app.indexOf("const localUid = loadState()?.userId"), app.indexOf("// Bug A: capture the local recency stamp"));
    t.ok(/refuseOwnerlessLocal\(\{ localUid, hasRealData: hasRealLocalData\(loadState\(\)\?\.appData\), userCreatedAt: user\.created_at, deletedAtMs: deletedHere \}\)/.test(hyd)
      && /if \(\(localUid && localUid !== user\.id\) \|\| ownerlessRefused\) \{/.test(hyd) && /clearAllUserLocal\(\);\s*\n\s*setAppData\(null\); setOnboarded\(false\);/.test(hyd),
      "5e sign-in: refused ownerless data is cleared and onboarding starts, as for another person's data");
    t.ok(hyd.indexOf("deletedAt(localStorage)") < hyd.indexOf("clearAllUserLocal()"), "5f the deletion mark is read before anything is cleared");
    const notes = fs.readFileSync(path.join(REPO, "src", "lib", "notifications.js"), "utf8");
    t.ok(/export async function cancelAllScheduled\(\)[\s\S]{0,260}listScheduled\(\)[\s\S]{0,160}LocalNotifications\.cancel\(\{ notifications: pending\.map/.test(notes),
      "5g iPhone and Android: every reminder the app scheduled is cancelled, whatever its type");
    const pkg = fs.readFileSync(path.join(REPO, "package.json"), "utf8");
    t.ok(!/@capacitor\/preferences|localforage|"idb"/.test(pkg) && !/indexedDB/.test(app.replace(/\/\/.*$/gm, "")),
      "5h flourish keeps nothing in Capacitor storage or its own IndexedDB: the WebView's storage is all there is to clear");
  }

  t.summary("accountWipe.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
