// tests/review1122Plus.test.cjs
// -----------------------------------------------------------------------------
// THE PLUS-ONLY FINDINGS OF THE FULL-APP REVIEW (2026-11-22: ChatGPT, Grok and Gemini on the whole app at cdb50f0).
// Findings in code that is live today are fixed and tested on the branch fix-review-1122; these are the ones whose
// code exists only with Plus.
//   1  P5-01 (NOT REAL)  a debt typed as a negative number is still a debt: net worth is the same either way
//   2  P9-01             the desktop sidebar's investment card shows balances only where net worth is as it is today:
//                        never without Plus once Plus is on, and never a partner's private account with Plus
//   3  P8-07             the Plus net worth tile's colour follows the sign, as the tile does today
//   4  P9-03 (Plus part) the export holds what Plus keeps apart from the household's data: this person's holdings
//                        and their own net worth entries
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

const REPO = path.join(__dirname, "..");
// A call that may not exist yet (before the fix) is a failed check, never a crash that hides the others.
const safe = (fn) => { try { return fn(); } catch (e) { return `THREW ${String(e && e.message).slice(0, 60)}`; } };

(async () => {
  const t = create();
  const X = await import("../src/lib/netWorthAccess.js");
  const N = await import("../src/lib/netWorthPlus.js");
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const CA = { country: "CA" };
  const chq = (o = {}) => ({ id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance: 20000, currency: "CAD", ...o });
  const body = (name) => { const i = app.indexOf(`function ${name}(`); const j = app.indexOf("\nfunction ", i + 10); return i < 0 ? "" : app.slice(i, j < 0 ? undefined : j); };

  // ── 1. P5-01: A DEBT TYPED WITH A MINUS SIGN ───────────────────────────────────────────────────
  {
    const withDebt = (balance) => N.householdNetWorth({ profile: CA, accounts: [chq()], debts: [{ id: "d1", name: "Car loan", balance }] });
    const plain = withDebt(5000), minus = withDebt(-5000), text = withDebt("-5000");
    t.eq(plain.totals, [{ currency: "CAD", assetsCents: 2000000, debtsCents: -500000, netCents: 1500000 }], "P5-01a $20,000 in the bank and a $5,000 debt: net worth $15,000");
    t.eq(minus.totals, plain.totals, "P5-01b the same debt typed as -5000 is still $5,000 owed: $15,000, not $25,000");
    t.eq(text.totals, plain.totals, "P5-01c …and the same when the figure arrives as text");
    t.eq(minus.parts.find((p) => p.kind === "debt").cents, -500000, "P5-01d the debt's own row is minus $5,000 either way");
    const viewer = N.viewerNetWorth({ data: { profile: CA, accounts: [chq()], debts: [{ id: "d1", name: "Car loan", balance: -5000 }] }, holdings: [], list: { mine: { entries: [], shared_accounts: [] }, partner: null }, ownerOf: () => null });
    t.eq(viewer.totals && viewer.totals[0].netCents, 1500000, "P5-01e the figure a person with Plus sees is the same $15,000");
  }

  // ── 2. P9-01: THE DESKTOP SIDEBAR'S INVESTMENT CARD ────────────────────────────────────────────
  {
    const f = X.showsAccountBalanceCard;
    t.eq(safe(() => f("today")), true, "P9-01a net worth as it is today (Plus not switched on): the card is shown, as before");
    t.eq(safe(() => ["locked", "unavailable", "pending"].map((m) => f(m))), [false, false, false], "P9-01b no Plus, could not check, still checking: no investment balances on the desktop sidebar");
    t.eq(safe(() => f("plus")), false, "P9-01c with Plus: not here either (this card adds every account in the household, a partner's private one included; the Net Worth tab shows each person their own)");
    t.eq(safe(() => [f(undefined), f(null), f("")]), [false, false, false], "P9-01d no answer at all is not a yes");
    const side = body("DesktopSidebar");
    t.ok(/useNetWorthState\(\)/.test(side) && /showsAccountBalanceCard\(/.test(side), "P9-01e the sidebar asks the same Plus state the home screen does");
    t.ok(/showsAccountBalanceCard\([^)]*\)\s*\?\s*\(data\.accounts\|\|\[\]\)\.filter\(a=>isInvestmentAccount\(a\)\)\s*:\s*\[\]/.test(side), "P9-01f …and without a yes it has no investment accounts to add up or list");
    t.ok(/data\.demo/.test(side), "P9-01g the demo's sample data is shown as today, as on the home screen");
  }

  // ── 3. P8-07: THE PLUS TILE'S COLOUR ───────────────────────────────────────────────────────────
  {
    const tone = N.totalsTone;
    const tot = (...cents) => cents.map((netCents, i) => ({ currency: i ? "USD" : "CAD", assetsCents: Math.max(netCents, 0), debtsCents: Math.min(netCents, 0), netCents }));
    t.eq(safe(() => tone(tot(1450000))), "up", "P8-07a a positive net worth is the app's positive colour");
    t.eq(safe(() => tone(tot(-1450000))), "down", "P8-07b a negative net worth (-$14,500) is the negative colour, not teal");
    t.eq(safe(() => tone(tot(0))), "up", "P8-07c exactly $0 is not a loss");
    t.eq(safe(() => tone(tot(-100, -200))), "down", "P8-07d two currencies, both negative: negative");
    t.eq(safe(() => tone(tot(500000, -200))), "mixed", "P8-07e one positive and one negative: neither colour claims the whole tile");
    t.eq(safe(() => [tone(null), tone([])]), ["up", "up"], "P8-07f no total to show (the words instead of a figure): as before");
    const tile = app.split("\n").find((l) => l.includes('netWorthWords("networth-plus-no-total")') && l.includes('label:"Net worth"')) || "";
    t.ok(/totalsTone\(nwPlus\.totals\)/.test(tile) && !/sub:"",color:C\.teal,/.test(tile), "P8-07g the home tile takes its colour from the totals' sign");
  }

  // ── 4. P9-03: THE EXPORT, WITH PLUS ────────────────────────────────────────────────────────────
  {
    const mine = { entries: [{ id: "e1", kind: "home", label: "Home", value_cents: 50000000, currency: "CAD", shared: false }], shared_accounts: ["acc-1"] };
    const partner = { entries: [{ id: "p1", kind: "vehicle", label: "Their car", value_cents: 900000, currency: "CAD", shared: true }], shared_accounts: [] };
    const hold = [{ id: "acc-1_s1", account_id: "acc-1", name: "Index Fund", value: 1234.5, currency: "CAD", _item: "item-me" }];
    const theirs = { id: "acc-9_s1", account_id: "acc-9", name: "Their Fund", value: 777, currency: "CAD", _item: "item-them" };
    const stray = { id: "acc-8_s1", account_id: "acc-8", name: "Whose Fund", value: 5, currency: "CAD", _item: "item-unknown" };
    const owners = { "item-me": "me", "item-them": "partner" };
    const out = safe(() => X.plusExport({ mode: "plus", holdings: [...hold, theirs, stray], owners, list: { mine, partner } }));
    t.eq(out && out.holdings, hold, "P9-03a with Plus the export holds this person's investment holdings: a partner's shared ones, and any whose owner is not known, are left out");
    t.eq(out && out.netWorthEntries, mine.entries, "P9-03b …and the net worth entries they typed");
    t.ok(out && !/Their car|Their Fund|Whose Fund/.test(JSON.stringify(out)), "P9-03c a partner's entries and holdings are the partner's to export, even the shared ones");
    t.eq(safe(() => X.plusExport({ mode: "today", holdings: hold, owners, list: { mine, partner } })), null, "P9-03d without Plus there is nothing apart to add (holdings are in the household's data, as before)");
    t.eq(safe(() => X.plusExport({ mode: "locked", holdings: [], list: undefined })), null, "P9-03e locked: nothing");
    t.eq(safe(() => X.plusExport({ mode: "plus", holdings: [], list: undefined })), { holdings: [], netWorthEntries: [] }, "P9-03f Plus with nothing loaded yet: empty lists, not a crash");
    const exp = (() => { const i = app.indexOf("const exportMyData = () => {"); return i < 0 ? "" : app.slice(i, i + 3200); })();
    t.ok(/plusExport\(getNetWorthState\(\)\)/.test(exp), "P9-03g Settings' export asks for it");
  }

  // ── 5. P10-06 / P3-09: WITHOUT PLUS, ONE BANK'S FAILED READ ────────────────────────────────────
  // 05fb6a7 (diff review B1) made a failed bank keep its holdings for a person WITH Plus. The path everyone is on
  // until Plus is switched on still let the banks that answered replace the whole list.
  {
    const H = await import("../src/lib/plusHoldings.js");
    const items = [{ item_id: "item-A" }, { item_id: "item-B" }];
    const accounts = [{ id: "a-tfsa", _item: "item-A" }, { id: "b-rrsp", _item: "item-B" }];
    const A1 = { id: "a-tfsa_s1", account_id: "a-tfsa", name: "A Index Fund", value: 12000 };
    const B1 = { id: "b-rrsp_s1", account_id: "b-rrsp", name: "B Bond Fund", value: 8000 };
    const ok = (holdings, more = {}) => ({ status: "fulfilled", value: { holdings, ...more } });
    const failed = { status: "rejected", reason: new Error("bank down") };
    const ids = (l) => (Array.isArray(l) ? l.map((h) => `${h.id}:${h.value}`).sort() : l);
    const after = (results, prev = [A1, B1]) => safe(() => { const m = H.mergeHoldings([], items, results); return ids(H.plainHoldingsAfter(prev, m, accounts)); });
    t.eq(after([failed, ok([{ ...B1, value: 8100 }])]), ["a-tfsa_s1:12000", "b-rrsp_s1:8100"], "P10-06a bank A's read failed and bank B answered: A's $12,000 holding is kept (was: gone)");
    t.eq(after([ok([], { unavailable: true }), ok([{ ...B1, value: 8100 }])]), ["a-tfsa_s1:12000", "b-rrsp_s1:8100"], "P3-09a the server saying it could not read bank A is the same as a failed read");
    t.eq(after([ok([]), ok([{ ...B1, value: 8100 }])]), ["b-rrsp_s1:8100"], "P10-06b bank A answered and holds nothing now: its holding goes");
    t.eq(after([ok([{ ...A1, value: 12500 }]), ok([{ ...B1, value: 8100 }])]), ["a-tfsa_s1:12500", "b-rrsp_s1:8100"], "P10-06c both answered: both new, nothing twice");
    t.eq(after([failed, failed]), null, "P10-06d nothing came at all: nothing to change (null)");
    // Changed 2026-11-22 (Plus review round 2, N2 as on fix-review-1122): this expected null ("nothing changes") when
    // the only bank that answered holds nothing. That was the all-sold defect: bank B answered, so ITS holding goes;
    // bank A failed, so its holding stays.
    t.eq(after([failed, ok([])]), ["a-tfsa_s1:12000"], "P10-06e the only bank that answered holds nothing now: its holding goes, and the failed bank's stays");
    const sync = (() => { const i = app.indexOf("const syncHoldings = useCallback("); return i < 0 ? "" : app.slice(i, i + 2600); })();
    t.ok(/plainHoldingsAfter\(prev\.investments, merged, prev\.accounts\)/.test(sync) && !/investments: allHoldings \}/.test(sync), "P10-06f the app's sync uses it on the path without Plus");
  }

  // ── 6. P3-05 (Plus half): A HOLDING WHOSE CURRENCY THE BANK DID NOT STATE ──────────────────────
  // The server's half is on fix-review-1122: it still answers "CAD" for older apps and adds currencyKnown: false.
  {
    const tfsa = { id: "tfsa", name: "TFSA", type: "investment", subtype: "tfsa", balance: 5000, currency: "CAD" };
    const rows = (h) => N.householdNetWorth({ profile: CA, accounts: [tfsa], investments: [{ id: "tfsa_s1", account_id: "tfsa", name: "Fund", value: 100, ...h }] }).parts[0].holdings;
    t.eq(rows({ currency: "CAD", currencyKnown: false })[0].currency, null, "P3-05a a holding the server marks as currency not stated is not labelled CAD");
    t.eq(rows({ currency: "USD" })[0].currency, "USD", "P3-05b a stated currency is shown as it came");
    t.eq(rows({ currency: "CAD" })[0].currency, "CAD", "P3-05c an answer without the mark (today's server) is as before");
  }

  t.summary("review1122Plus");
})().catch((e) => { console.error(e); process.exit(1); });
