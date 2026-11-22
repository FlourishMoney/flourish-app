// tests/plusRound3.test.cjs
// -----------------------------------------------------------------------------
// PLUS ROUND 3 (2026-11-22), NEW-4: holdings the app could not refresh are shown with the date they are from, next to
// that bank's holdings only.
//   1  the merge marks them: a bank the server answered from its kept list, and a bank that failed and is shown from
//      this device's copy; a bank that answered live is never marked
//   2  the net worth model gives each investment account the date its holdings are from, or nothing
//   3  THE WORDS ARE NOT APPROVED YET: the line's id is not in the words, so nothing is shown. The day the approved
//      line is added under that id, it shows, with the date filled in
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
    t.ok(!(W.HOLDINGS_AS_OF_ID in W.NET_WORTH_WORDS), "NEW4-m its words are NOT in the app: they are a draft until Amanda has them approved");
    t.eq(safe(() => W.holdingsAsOfLine(iso)), "", "NEW4-n so today nothing is shown");
    const approved = { ...W.NET_WORTH_WORDS, [W.HOLDINGS_AS_OF_ID]: "TEST WORDS {date} END" };
    t.eq(safe(() => W.holdingsAsOfLine(iso, approved)), "TEST WORDS November 21, 2026 END", "NEW4-o the day the approved line is added under that id it shows, with the date filled in");
    t.eq(safe(() => [W.holdingsAsOfLine(null, approved), W.holdingsAsOfLine("not a date", approved), W.holdingsAsOfLine(iso, { ...approved, [W.HOLDINGS_AS_OF_ID]: "[WORDS: networth-plus-holdings-as-of]" })]), ["", "", ""],
      "NEW4-p no date, a bad date, or a placeholder for the words: nothing");
    t.ok(/const asOfLine = holdingsAsOfLine\(p\.holdingsAsOf\);/.test(screen) && /\{asOfLine && <div data-nw-holdings-as-of=""[^>]*>\{asOfLine\}<\/div>\}/.test(screen), "NEW4-q the Plus net worth screen has the place for it, under that account's holdings only");
    t.ok(screen.indexOf("{asOfLine && <div data-nw-holdings-as-of") > screen.indexOf("p.holdings.map((h, i)") && screen.indexOf("{asOfLine && <div data-nw-holdings-as-of") < screen.indexOf("{canShare && ("), "NEW4-r …right after the holdings rows");
  }
  t.summary("plusRound3");
})().catch((e) => { console.error(e); process.exit(1); });
