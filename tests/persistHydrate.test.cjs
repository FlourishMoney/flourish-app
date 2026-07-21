// tests/persistHydrate.test.cjs
// -----------------------------------------------------------------------------
// Persistence regression tests for the two data-loss bugs found on 2026-07-21.
//
// BUG A — hydrate skipped a VALID remote row.
//   The save effect stamped local `savedAt` on every run, including when logged out with EMPTY
//   appData. Hydrate then read that stamp AFTER awaiting the network fetch, so local always looked
//   newer than the server row and applyBlob never ran. A returning user whose local cache was empty
//   (fresh install — `npx cap run ios` wipes WKWebView storage) landed in a BLANK ONBOARDING while
//   their real data sat on the server.
//
// BUG B — the exit beacon silently ate saves.
//   The pagehide path dispatched a keepalive beacon and then DISCARDED the pending payload on mere
//   dispatch, skipping the awaited flush. `keepalive` is unreliable in iOS/WKWebView and the fetch is
//   fire-and-forget, so a beacon that failed in flight lost that write forever — which is how the
//   server row froze at its last successful save while the user kept using the app.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { decideHydrate, hasRealLocalData, makeDebouncedSaver, isBlobEmpty } =
    await import("../src/lib/persistence.js");
  const t = create();

  const REMOTE = "2026-07-17T10:00:00.000Z";   // the real server row
  const NOW    = "2026-07-21T09:00:00.000Z";   // a stamp written during the fetch
  const REAL   = { profile: { name: "Amanda" }, bills: [], accounts: [] };

  // ── hasRealLocalData — agrees with isBlobEmpty ─────────────────────────────────────────────────
  t.eq(hasRealLocalData(null), false, "null appData is not real data");
  t.eq(hasRealLocalData(undefined), false, "undefined appData is not real data");
  t.eq(hasRealLocalData({}), false, "an empty appData object is not real data");
  t.eq(hasRealLocalData(REAL), true, "appData with a profile name IS real data");
  t.eq(hasRealLocalData({ demo: true, profile: { name: "Sarah" } }), false,
       "demo data is never treated as real — it must not outrank a server row");
  t.eq(hasRealLocalData(REAL), !isBlobEmpty({ core: { appData: REAL } }),
       "hasRealLocalData is exactly the inverse of isBlobEmpty (single definition of 'empty')");

  // ══ BUG A — THE REGRESSION TEST ═══════════════════════════════════════════════════════════════
  // A save-effect write DURING the in-flight hydrate fetch must NOT cause a valid remote row to be
  // skipped when local is empty.
  {
    const d = decideHydrate({ remoteUpdatedAt: REMOTE, localSavedAt: NOW, localHasRealData: false });
    t.eq(d.apply, true,
         "BUG A: local cache is EMPTY and a valid remote row exists → the remote MUST be applied, " +
         "even though savedAt was stamped to 'now' during the fetch (the poisoned-stamp case that " +
         "produced a blank onboarding while the server held the user's data)");
    t.eq(d.reason, "local-empty", "…and the reason names the short-circuit that saved it");
    t.eq(d.pushLocal, false, "…and we never push the empty local state up over a good row");
  }

  // Same, with no stamp at all (a genuinely fresh device).
  t.eq(decideHydrate({ remoteUpdatedAt: REMOTE, localSavedAt: null, localHasRealData: false }).apply, true,
       "fresh device, no stamp, valid remote → apply the remote");

  // ── Genuine local-newer still wins (we did NOT break the conflict rule) ────────────────────────
  {
    const d = decideHydrate({ remoteUpdatedAt: REMOTE, localSavedAt: NOW, localHasRealData: true });
    t.eq(d.apply, false, "local has REAL data and a genuinely newer stamp → local still wins");
    t.eq(d.pushLocal, true, "…and local is pushed up to the server");
    t.eq(d.reason, "local-newer", "…for the right reason");
  }

  // ── Remote newer than real local data → remote wins (cross-device edit) ────────────────────────
  {
    const d = decideHydrate({ remoteUpdatedAt: NOW, localSavedAt: REMOTE, localHasRealData: true });
    t.eq(d.apply, true, "a remote row newer than real local data wins (edited on another device)");
    t.eq(d.reason, "db-newer", "…for the right reason");
  }

  // ── Real local data with no stamp → remote wins (can't prove local is newer) ───────────────────
  t.eq(decideHydrate({ remoteUpdatedAt: REMOTE, localSavedAt: null, localHasRealData: true }).reason,
       "no-local-stamp", "real local data but no stamp → cannot claim local is newer, remote applies");

  // ── No remote row ─────────────────────────────────────────────────────────────────────────────
  {
    const withLocal = decideHydrate({ remoteUpdatedAt: null, localSavedAt: NOW, localHasRealData: true });
    t.eq(withLocal.apply, false, "no remote row → nothing to apply");
    t.eq(withLocal.pushLocal, true, "…but real local data migrates UP to the server");

    const noLocal = decideHydrate({ remoteUpdatedAt: null, localSavedAt: NOW, localHasRealData: false });
    t.eq(noLocal.pushLocal, false,
         "no remote row AND empty local → push nothing (never create a row from an empty state)");
  }

  // ── Equal timestamps → remote wins (>=), preserving prior behaviour ────────────────────────────
  t.eq(decideHydrate({ remoteUpdatedAt: REMOTE, localSavedAt: REMOTE, localHasRealData: true }).apply, true,
       "identical timestamps resolve to the DB (>=), unchanged from before");

  // ══ BUG B — a failed beacon must NOT lose the pending write ═══════════════════════════════════
  {
    const sent = [];
    const saver = makeDebouncedSaver((payload) => { sent.push(payload); }, 50);
    const payload = { userId: "u1", blob: { core: { appData: REAL } } };

    saver.schedule(payload);
    t.eq(saver.hasPending(), true, "a scheduled save is pending");

    // Simulate the exit path: the beacon peeks the payload and dispatches it… and that dispatch FAILS
    // in flight (keepalive dropped by WKWebView). peek() must NOT consume the payload.
    const peeked = saver.peek();
    t.eq(peeked, payload, "peek() returns the pending payload for the beacon");
    t.eq(saver.hasPending(), true,
         "BUG B: peek() must NOT consume the pending write — the old code called discard() on mere " +
         "dispatch, so a beacon that failed in flight lost the save permanently");

    // The awaited flush is authoritative and still delivers the write.
    saver.flush();
    t.eq(sent.length, 1, "the awaited flush still delivers the write after a failed beacon");
    t.eq(sent[0], payload, "…and delivers the exact pending payload — nothing is lost");
    t.eq(saver.hasPending(), false, "…and only then is the payload consumed");
  }

  // ── flush() with nothing pending is a no-op (exit path runs unconditionally now) ───────────────
  {
    const sent = [];
    const saver = makeDebouncedSaver((p) => sent.push(p), 50);
    saver.flush();
    t.eq(sent.length, 0, "flush() with no pending write sends nothing — safe to call on every exit");
  }

  // ── discard() still consumes (API intact for deliberate callers) ───────────────────────────────
  {
    const sent = [];
    const saver = makeDebouncedSaver((p) => sent.push(p), 50);
    saver.schedule({ userId: "u2", blob: {} });
    saver.discard();
    t.eq(saver.hasPending(), false, "discard() still consumes when called deliberately");
    saver.flush();
    t.eq(sent.length, 0, "…and a discarded payload is not delivered");
  }

  t.summary("persistHydrate.test");
})();
