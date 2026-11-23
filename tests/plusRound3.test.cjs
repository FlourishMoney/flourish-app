// tests/plusRound3.test.cjs
// -----------------------------------------------------------------------------
// PLUS ROUND 3 (2026-11-22), NEW-4: holdings the app could not refresh are shown with the date they are from, next to
// that bank's holdings only.
//   1  the merge marks them: a bank the server answered from its kept list, and a bank that failed and is shown from
//      this device's copy; a bank that answered live is never marked
//   2  the net worth model gives each investment account the date its holdings are from, or nothing
//   3  the line, approved 2026-11-23, word for word: "We couldn't reach this bank just now. These holdings are from
//      {date}." It is shown with the date filled in; with no date, or a bad one, nothing is shown
//   4  the real-world proof of 2026-11-23: a round where NO bank answered live still shows the marks (one bank, down)
// (NEW-1, NEW-2, NEW-3 and M3 are tested beside what they change: plusHoldingsStore.sql, plusRound2Holdings,
//  plusRound2Limits.)
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const REPO = path.join(__dirname, "..");
const safe = (fn) => { try { return fn(); } catch (e) { return `THREW ${String(e && e.message).slice(0, 70)}`; } };

(async () => {
  const t = create();
  const H = await import("../src/lib/plusHoldings.js");
  const N = await import("../src/lib/netWorthPlus.js");
  const W = await import("../src/lib/netWorthWords.js");
  const screen = fs.readFileSync(path.join(REPO, "src", "NetWorthPlusScreen.jsx"), "utf8");
  const now = Date.parse("2026-11-22T15:00:00.000Z");
  const DAY = 86400000;
  const h = (id, account_id, value) => ({ id, account_id, name: id, value, currency: "CAD" });
  const live = (holdings, more = {}) => ({ status: "fulfilled", value: { holdings, plus_mode: true, ...more } });
  const failed = { status: "rejected", reason: new Error("bank down") };
  const items = [{ item_id: "i-a" }, { item_id: "i-b" }];
  const mark = (list) => (Array.isArray(list) ? list.map((x) => `${x.id}:${x._stale === true ? "stale" : "live"}:${x._at}`).sort() : list);

  // ── 1. the merge ───────────────────────────────────────────────────────────────────────────────
  {
    const asOf = new Date(now - 2 * DAY).toISOString();
    const m1 = safe(() => H.mergeHoldings([], items, [live([h("a1", "acc-a", 100)], { stale: true, as_of: asOf }), live([h("b1", "acc-b", 200)], { stored: true })], now));
    t.eq(mark(m1.holdings), [`a1:stale:${now - 2 * DAY}`, `b1:live:${now}`], "NEW4-a a bank answered from the server's kept list is marked, with when that list came; the bank that answered live is not");
    const held = [{ ...h("a1", "acc-a", 100), _item: "i-a", _at: now - 3 * DAY }, { ...h("b1", "acc-b", 200), _item: "i-b", _at: now - 3 * DAY }];
    const m2 = safe(() => H.mergeHoldings(held, items, [failed, live([h("b1", "acc-b", 210)], { stored: true })], now));
    t.eq(mark(m2.holdings), [`a1:stale:${now - 3 * DAY}`, `b1:live:${now}`], "NEW4-b a bank that failed and is shown from this device's copy is marked too, with when this device got it");
    const m3 = safe(() => H.mergeHoldings(held, items, [live([], { unavailable: true }), live([h("b1", "acc-b", 210)], { stored: true })], now));
    t.eq(mark(m3.holdings), [`a1:stale:${now - 3 * DAY}`, `b1:live:${now}`], "NEW4-c …and the same when the server says it could not read that bank");
    const again = safe(() => H.mergeHoldings(m2.holdings, items, [live([h("a1", "acc-a", 105)], { stored: true }), live([h("b1", "acc-b", 210)], { stored: true })], now + 60000));
    t.eq(mark(again.holdings), [`a1:live:${now + 60000}`, `b1:live:${now + 60000}`], "NEW4-d once the bank answers again the mark is gone");
    const newer = [{ ...h("a1", "acc-a", 100), _item: "i-a", _at: now - 3600000 }];
    const m4 = safe(() => H.mergeHoldings(newer, [{ item_id: "i-a" }], [live([h("old", "acc-a", 90)], { stale: true, as_of: asOf })], now));
    t.eq(mark(m4.holdings), [`a1:stale:${now - 3600000}`], "NEW4-e this device's copy is newer than the server's kept list: it is kept, and marked with its own time");
    const m5 = safe(() => H.mergeHoldings(held, items, [live([], { locked: true }), live([], { locked: true })], now));
    t.eq(mark(m5.holdings), [`a1:live:${now - 3 * DAY}`, `b1:live:${now - 3 * DAY}`], "NEW4-f a locked answer (no Plus) marks nothing: nothing is shown then anyway");
  }

  // ── 2. the model ───────────────────────────────────────────────────────────────────────────────
  {
    const acct = (id) => ({ id, name: id, type: "investment", subtype: "tfsa", balance: 1000, currency: "CAD" });
    const data = { profile: { country: "CA" }, accounts: [acct("acc-a"), acct("acc-b"), acct("acc-c")] };
    const inv = [
      { ...h("a1", "acc-a", 100), _stale: true, _at: now - 2 * DAY }, { ...h("a2", "acc-a", 50), _stale: true, _at: now - 5 * DAY },
      { ...h("b1", "acc-b", 200), _at: now },
      { ...h("c1", "acc-c", 300), _stale: true },                                  // an old device copy with no time
    ];
    const parts = safe(() => N.householdNetWorth({ ...data, investments: inv }).parts);
    const of = (id) => (Array.isArray(parts) ? (parts.find((p) => p.id === id) || {}).holdingsAsOf : parts);
    t.eq(of("acc-a"), new Date(now - 5 * DAY).toISOString(), "NEW4-g an account whose holdings could not be refreshed says when they are from (the oldest of them: nothing shown is older)");
    t.eq(of("acc-b"), null, "NEW4-h an account whose bank answered says nothing");
    t.eq(of("acc-c"), null, "NEW4-i marked but with no time known: nothing, never a made-up date");
    t.ok(Array.isArray(parts) && parts.every((p) => (p.holdings || []).every((x) => !("_stale" in x) && !("_at" in x))), "NEW4-j the rows themselves are as before");
    const v = safe(() => N.viewerNetWorth({ data, holdings: inv, list: { mine: { entries: [], shared_accounts: [] }, partner: null }, ownerOf: () => null }));
    t.eq(v && [...v.mine, ...v.partner, ...v.household].find((p) => p.id === "acc-a").holdingsAsOf, new Date(now - 5 * DAY).toISOString(), "NEW4-k the screen's own model carries it");
  }

  // ── 3. the line ────────────────────────────────────────────────────────────────────────────────
  {
    const iso = "2026-11-21T15:00:00.000Z";
    t.eq(W.HOLDINGS_AS_OF_ID, "networth-plus-holdings-as-of", "NEW4-l the line has an id of its own");
    // Changed 2026-11-23 (round 4, R4-3): the words were approved that day (ChatGPT 100 AGREE, Grok 100 AGREE). These two
    // used to hold that the line was NOT in the app and that nothing was shown.
    t.eq(W.NET_WORTH_WORDS[W.HOLDINGS_AS_OF_ID], "We couldn't reach this bank just now. These holdings are from {date}.", "NEW4-m the approved line is in the app, word for word");
    t.eq(safe(() => W.holdingsAsOfLine(iso)), "We couldn't reach this bank just now. These holdings are from November 21, 2026.", "NEW4-n and it is shown with the date filled in");
    const doc = fs.readFileSync(path.join(REPO, "docs", "product", "NET-WORTH-WORDS.md"), "utf8");
    const rowOf = doc.split("\n").find((l) => l.startsWith("| `networth-plus-holdings-as-of` |")) || "";
    t.ok(rowOf.split("|").map((c) => c.trim()).includes("We couldn't reach this bank just now. These holdings are from {date}."), "NEW4-n2 the words doc lists it with the same line");
    t.eq(safe(() => W.netWorthWords(W.HOLDINGS_AS_OF_ID, { date: "November 21, 2026" })).includes("[WORDS:"), false, "NEW4-n3 it is not a placeholder");
    const approved = { ...W.NET_WORTH_WORDS, [W.HOLDINGS_AS_OF_ID]: "TEST WORDS {date} END" };
    t.eq(safe(() => W.holdingsAsOfLine(iso, approved)), "TEST WORDS November 21, 2026 END", "NEW4-o the day the approved line is added under that id it shows, with the date filled in");
    t.eq(safe(() => [W.holdingsAsOfLine(null, approved), W.holdingsAsOfLine("not a date", approved), W.holdingsAsOfLine(iso, { ...approved, [W.HOLDINGS_AS_OF_ID]: "[WORDS: networth-plus-holdings-as-of]" })]), ["", "", ""],
      "NEW4-p no date, a bad date, or a placeholder for the words: nothing");
    t.ok(/const asOfLine = holdingsAsOfLine\(p\.holdingsAsOf\);/.test(screen) && /\{asOfLine && <div data-nw-holdings-as-of=""[^>]*>\{asOfLine\}<\/div>\}/.test(screen), "NEW4-q the Plus net worth screen has the place for it, under that account's holdings only");
    t.ok(screen.indexOf("{asOfLine && <div data-nw-holdings-as-of") > screen.indexOf("p.holdings.map((h, i)") && screen.indexOf("{asOfLine && <div data-nw-holdings-as-of") < screen.indexOf("{canShare && ("), "NEW4-r …right after the holdings rows");
  }
  // ── 4. the real-world proof, 2026-11-23 (step 1C.4 with Plus): a round where NO bank answered live ─────────────
  // Found on the local site with Plaid's sandbox: a person with ONE bank whose holdings call failed kept the holdings
  // but never saw the line. The merge marked this device's copy `_stale`, then the app dropped the whole round,
  // because it took a round only when a bank answered live (`delivered`) or the server's kept list was put in its
  // place (`stale`). Section 1 never caught it: there the other bank always answered live.
  {
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const one = [{ item_id: "i-a" }];
    const held = [{ ...h("a1", "acc-a", 100), _item: "i-a", _at: now - 3 * DAY }, { ...h("a2", "acc-a", 50), _item: "i-a", _at: now - 3 * DAY }];
    const asOf = new Date(now - 3 * DAY - 500).toISOString();          // the server's kept list is a touch OLDER than this device's
    const viaServer = safe(() => H.mergeHoldings(held, one, [live([h("a1", "acc-a", 100), h("a2", "acc-a", 50)], { stale: true, as_of: asOf })], now));
    const viaFail = safe(() => H.mergeHoldings(held, one, [failed], now));
    const viaDown = safe(() => H.mergeHoldings(held, one, [live([], { unavailable: true })], now));
    for (const [name, m] of [["the server answers its kept list, no newer than this device's", viaServer], ["the call fails", viaFail], ["the server says unavailable", viaDown]]) {
      t.eq(mark(m.holdings), [`a1:stale:${now - 3 * DAY}`, `a2:stale:${now - 3 * DAY}`], `PROOF-a (${name}) this device's holdings are kept and marked, with when they came`);
      t.eq([m.delivered, m.stale, m.marked], [false, false, true], `PROOF-b (${name}) nothing was delivered and nothing of the server's was put in; the round still says it MARKED what is shown`);
      t.eq(safe(() => H.roundShows(m)), true, `PROOF-c (${name}) so the round is shown`);
    }
    // What does not mark: nothing held, a locked answer, a live answer, Plus off.
    const none = safe(() => H.mergeHoldings([], one, [failed], now));
    const lockedRound = safe(() => H.mergeHoldings(held, one, [live([], { locked: true })], now));
    const liveRound = safe(() => H.mergeHoldings(held, one, [live([h("a1", "acc-a", 101)], { stored: true })], now));
    const plainRound = safe(() => H.mergeHoldings(held, one, [{ status: "fulfilled", value: { holdings: [h("a1", "acc-a", 101)] } }], now));
    t.eq([none.marked, safe(() => H.roundShows(none))], [false, false], "PROOF-d a bank that fails with nothing held: nothing to mark, nothing to show");
    t.eq([lockedRound.marked, safe(() => H.roundShows(lockedRound)), mark(lockedRound.holdings)], [false, false, [`a1:live:${now - 3 * DAY}`, `a2:live:${now - 3 * DAY}`]], "PROOF-e a locked answer marks nothing and changes nothing");
    t.eq([liveRound.marked, liveRound.delivered, safe(() => H.roundShows(liveRound)), mark(liveRound.holdings)], [false, true, true, [`a1:live:${now}`]], "PROOF-f a live answer is shown, unmarked");
    t.eq([plainRound.marked, plainRound.plusMode], [false, false], "PROOF-g Plus off: nothing is marked (today's path)");
    t.eq(safe(() => [H.roundShows(null), H.roundShows({}), H.roundShows({ stale: true }), H.roundShows({ delivered: true })]), [false, false, true, true], "PROOF-h roundShows: live, the server's kept list, or marks; never anything else");
    // Added 2026-11-23 (PLUS-NEW-01 review): a locked answer anywhere in the round keeps the whole round from changing
    // anything, marks included (a failed bank beside a locked one used to be shown).
    t.eq(safe(() => [H.roundShows({ marked: true, locked: true }), H.roundShows({ delivered: true, locked: true }), H.roundShows({ marked: true, locked: false })]), [false, false, true], "PROOF-h2 roundShows: never with a locked answer in the round");
    // Nothing is cleared from the shared copy on such a round (the rule of withoutCoveredSharedCopy stands).
    const blob = { accounts: [{ id: "acc-a", _item: "i-a" }], investments: [h("a1", "acc-a", 100)] };
    t.ok(safe(() => H.withoutCoveredSharedCopy(blob, viaFail, false)) === blob, "PROOF-i a round that only marked clears nothing from the household's data");
    // To the screen: the model gives the date, and the approved line is what is shown.
    const acct = { id: "acc-a", name: "acc-a", type: "investment", subtype: "tfsa", balance: 150, currency: "CAD" };
    const v = safe(() => N.viewerNetWorth({ data: { profile: { country: "CA" }, accounts: [acct] }, holdings: viaFail.holdings, list: { mine: { entries: [], shared_accounts: [] }, partner: null }, ownerOf: () => null }));
    const part = v && [...v.mine, ...v.partner, ...v.household].find((p) => p.id === "acc-a");
    t.eq(part && part.holdingsAsOf, new Date(now - 3 * DAY).toISOString(), "PROOF-j the screen's model says when that account's holdings are from");
    t.eq(safe(() => W.holdingsAsOfLine(part.holdingsAsOf)), "We couldn't reach this bank just now. These holdings are from November 19, 2026.", "PROOF-k and the approved line is what a person reads");
    // The app takes the round on roundShows, for the person still signed in; it is not dropped as before.
        // Changed 2026-11-23 (PLUS-NEW-01): the round code moved, unchanged, out of syncHoldings into the top-level
        // applyHoldingsRound (so a test runs it); this reads it there. Its early return now hands back the round.
        const sync = app.slice(app.indexOf("function applyHoldingsRound("), app.indexOf("// END applyHoldingsRound"));
    t.ok(/import \{[^}]*\broundShows\b[^}]*\} from "\.\/lib\/plusHoldings\.js";/.test(app), "PROOF-l the app imports roundShows");
    t.ok(/if \(!roundShows\(merged\) \|\| getNetWorthState\(\)\.user !== forUser\) return merged;\s*\n\s*setPlusHoldings\(allHoldings\);/.test(sync), "PROOF-m the holdings sync shows every round that roundShows says to, for the person still signed in");
    t.ok(!/!\(merged\.delivered \|\| merged\.stale\) \|\|/.test(sync), "PROOF-n the old test, which dropped a round that only marked, is gone");
    t.ok(/const onDevice = merged\.delivered \? savePrivateHoldings\(deviceStore\(\), forUser, allHoldings\) : \(keepPrivateHoldings\(deviceStore\(\), forUser, allHoldings\), false\);/.test(sync), "PROOF-o saved with a time only on a live answer, as before: a round that only marked never counts as fresh");
  }
  t.summary("plusRound3");
})().catch((e) => { console.error(e); process.exit(1); });
