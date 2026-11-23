// tests/review1122Round3.test.cjs
// -----------------------------------------------------------------------------
// ROUND 3 of the full-app review (2026-11-22: ChatGPT and Grok on fix-review-1122 at 6379243).
//   R3-1  holdings: when EVERY bank answered, a holding nobody sent again is gone, also one on an account that carries
//         no bank marker (an older copy). Holdings only ever come from a bank, so there is no "typed in" one to keep.
//         When only some banks answered, a holding whose bank is not known is kept (it may be the failed bank's).
//   R3-2  bills: a fixed bill is settled ("matched") only by a payment that carries its name. A payment of the right
//         amount on the right days with another name is "maybe" at most: the bill stays expected, at its own amount.
//         (Checked first: nothing a person sees used the old answer. The app reads only the variable bills' learned
//         amounts from this function, and the forecast's "already paid" rule has always needed the name.)
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const REPO = path.join(__dirname, "..");
const safe = (fn) => { try { return fn(); } catch (e) { return `THREW ${String(e && e.message).slice(0, 70)}`; } };

(async () => {
  const t = create();
  const M = await import("../src/lib/multibank.js");
  const { reconcileBills } = await import("../src/lib/billReconcile.js");
  const F = await import("../src/lib/financialCalculations.js");
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");

  // ── R3-1 ───────────────────────────────────────────────────────────────────────────────────────
  {
    const h = (id, account_id, value) => ({ id, account_id, name: id, value });
    const show = (l) => (Array.isArray(l) ? l.map((x) => `${x.id}:${x.value}`).sort() : l);
    const keep = (...a) => safe(() => show(M.retainHoldings(...a)));
    // acc-old: a bank account from an older copy, with no bank marker (in the map, owner null). acc-b: bank B's.
    const map = new Map([["acc-old", null], ["acc-b", "item-B"]]);
    const ALL = new Set(["item-A", "item-B"]);
    const legacy = h("old_s1", "acc-old", 5000), b1 = h("b_s1", "acc-b", 8000);
    t.eq(keep([legacy, b1], [], map, ALL, false), [], "R3-1a every bank answered and holds nothing: the old holding on an account with no bank marker goes too (was kept for ever, $5,000 overstated)");
    t.eq(keep([legacy, b1], [h("b_s1", "acc-b", 8100)], map, ALL, false), ["b_s1:8100"], "R3-1b every bank answered, and nobody sent the old one again: it goes; what came is what is held");
    t.eq(keep([legacy, b1], [h("old_s1", "acc-old", 5100), h("b_s1", "acc-b", 8100)], map, ALL, false), ["b_s1:8100", "old_s1:5100"], "R3-1c the old one came again: it is held once, at the new figure");
    t.eq(keep([legacy, b1], [h("b_s1", "acc-b", 8100)], map, new Set(["item-B"]), true), ["b_s1:8100", "old_s1:5000"], "R3-1d only SOME banks answered: the old one is kept, it may be the failed bank's");
    t.eq(keep([legacy], [], map, new Set(), true), ["old_s1:5000"], "R3-1e no bank answered: nothing changes");
    t.eq(keep([h("gone_s1", "acc-gone", 7)], [], map, ALL, false), [], "R3-1f a holding whose account is gone, every bank answered: gone (as before)");
    t.eq(keep([b1], [], map, new Set(["item-A"]), true), ["b_s1:8000"], "R3-1g a holding whose bank is known and failed is kept whatever else happened (as before)");
    // Changed 2026-11-23 (main merged into plus-1.1.8): this branch's one holdings sync applies plainHoldingsAfter, which
    // works out "did every bank answer" from the round itself and gives what retainHoldings gives (plusRound2Holdings N2f3).
    const plusLib = require("fs").readFileSync(require("path").join(__dirname, "..", "src", "lib", "plusHoldings.js"), "utf8");
    t.ok(/plainHoldingsAfter\(prev\.investments, merged, prev\.accounts\)/.test(app) && /const someBankFailed = /.test(plusLib) && /return someBankFailed;/.test(plusLib), "R3-1h the app tells the rule whether every bank answered");
    const writers = (app.match(/investments: /g) || []).length;
    t.ok(writers >= 1 && !/investments:\s*\[\s*\.\.\.\(?prev\.investments/.test(app), "R3-1i (holdings are only ever written by that sync: there is no typed-in holding for the rule to protect)");
  }

  // ── R3-2 ───────────────────────────────────────────────────────────────────────────────────────
  {
    const APRIL = new Date(2026, 3, 10);
    const fixed = (id, name, amount, day) => ({ id, name, amount, dayOfMonth: day, recurring: true, variable: false, origin: "manual" });
    const variable = (id, name, amount, day) => ({ ...fixed(id, name, amount, day), variable: true });
    const one = (bills, txns) => safe(() => reconcileBills(bills, txns, APRIL));
    // The reviewer's example: $200 insurance due the 15th, an unrelated $200 purchase on the 14th, insurance not paid.
    const r1 = one([fixed("ins", "Insurance", 200, 15)], [{ id: "t1", name: "BEST BUY #1021", amount: 200, date: "2026-04-14" }]);
    const b1 = r1.forecastBills[0];
    t.eq([b1.matched, b1.estimated, b1.amount, b1.maybeMatched], [false, true, 200, true], "R3-2a $200 insurance due the 15th and an unrelated $200 purchase on the 14th: the bill is NOT settled; it stays expected at $200, marked \"maybe\" (was: matched, as if paid)");
    t.eq(r1.updatedManualBills[0].amount, 200, "R3-2b …and nothing about the bill is changed");
    const r2 = one([fixed("ins", "Insurance", 200, 15)], [{ id: "t2", name: "ACME INSURANCE CO", amount: 198, date: "2026-04-14" }]);
    t.eq([r2.forecastBills[0].matched, r2.forecastBills[0].amount, !!r2.forecastBills[0].maybeMatched], [true, 198, false], "R3-2c a payment that carries the bill's name settles it, at the amount paid ($198), as before");
    const r3 = one([fixed("ins", "Insurance", 200, 15)], [{ id: "t1", name: "BEST BUY #1021", amount: 200, date: "2026-04-14" }, { id: "t2", name: "ACME INSURANCE CO", amount: 201, date: "2026-04-16" }]);
    t.eq([r3.forecastBills[0].matched, r3.forecastBills[0].amount], [true, 201], "R3-2d with both there, the bill takes the payment with its name, not the nearer stranger");
    const r4 = one([fixed("rent", "Rent", 1850, 1)], [{ id: "t3", name: "E-TRANSFER SENT 0041", amount: 1850, date: "2026-04-01" }]);
    t.eq([r4.forecastBills[0].matched, r4.forecastBills[0].maybeMatched, r4.forecastBills[0].amount], [false, true, 1850], "R3-2e rent paid by e-transfer (no name in common): maybe paid, never settled on the amount and date alone");
    const r5 = one([fixed("a", "Gym", 50, 10), fixed("b", "Storage", 50, 11)], [{ id: "t4", name: "SOMETHING ELSE", amount: 50, date: "2026-04-10" }]);
    t.eq([r5.forecastBills.map((b) => b.matched), r5.forecastBills.map((b) => !!b.maybeMatched)], [[false, false], [true, false]], "R3-2f one stranger payment and two bills it could fit: \"maybe\" for one of them only (the nearer), settled for neither");
    const r6 = one([fixed("a", "Insurance", 200, 15), fixed("b", "Phone", 200, 15)], [{ id: "t5", name: "PHONE CO", amount: 200, date: "2026-04-15" }]);
    t.eq([r6.forecastBills.map((b) => b.matched), r6.forecastBills.map((b) => !!b.maybeMatched)], [[false, true], [false, false]], "R3-2g a payment that settles the bill with its name is not also a \"maybe\" for another");
    const r7 = one([variable("h", "Hydro", 120, 15)], [{ id: "t6", name: "HYDRO ONE", amount: 143.5, date: "2026-04-16" }, { id: "t7", name: "TIM HORTONS", amount: 4.75, date: "2026-04-15" }]);
    t.eq([r7.forecastBills[0].matched, r7.updatedManualBills[0].amount], [true, 143.5], "R3-2h a bill whose amount varies is as before: its name is required, and it learns $143.50");
    const r8 = one([fixed("x", "Net", 100, 15)], [{ id: "t8", name: "STRANGER", amount: 106, date: "2026-04-15" }, { id: "t9", name: "STRANGER", amount: 100, date: "2026-04-25" }]);
    t.eq([r8.forecastBills[0].matched, !!r8.forecastBills[0].maybeMatched], [false, false], "R3-2i outside 5% or outside three days is not even a maybe");
    // What a person sees never used the old answer.
    t.ok(/const \{ updatedManualBills \} = reconcileBills\(manual, markedTxns, new Date\(\)\);/.test(app) && !/forecastBills/.test(app), "R3-2j the app takes only the variable bills' learned amounts from this function; it never read \"matched\"");
    t.eq([F.paysABill({ name: "BEST BUY #1021", amount: 200, date: "2026-04-14" }, { name: "Insurance", amount: 200 }), F.paysABill({ name: "ACME INSURANCE CO", amount: 200, date: "2026-04-14" }, { name: "Insurance", amount: 200 })], [false, true],
      "R3-2k and the forecast's own \"already paid\" rule needs the bill's name: the stranger's $200 never marked the insurance paid");
  }
  t.summary("review1122Round3");
})().catch((e) => { console.error(e); process.exit(1); });
