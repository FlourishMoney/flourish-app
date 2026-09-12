// tests/todayPriorities.test.cjs — Today's "one thing to know" selector.
// Core guarantee (item 4): the know line is a forecast/behaviour/next-bill item and NEVER the
// safe-to-spend hero figure; when there is no such item it is null (line hidden).
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { todayKnowItem } = await import("../src/lib/todayPriorities.js");

  const HERO_SAFE = 2082; // the hero figure the know line must never repeat

  // next bill drives the know line (not the safe number)
  const k1 = todayKnowItem({ overdraftImmediate: false, sevenDayOverdraft: false, nextBill: { name: "Hydro", amount: "95", date: "11" } });
  t.ok(k1 && k1.includes("Hydro") && k1.includes("$95") && k1.includes("11th"), "1a next bill (name, amount, ordinal date) drives the know line");
  t.ok(!k1.includes(String(HERO_SAFE)) && !/safe to spend/i.test(k1), "1b know line does not repeat the hero safe-to-spend figure");

  // overdraft/forecast items take priority
  t.ok(/can't cover/.test(todayKnowItem({ overdraftImmediate: true, nextBill: { name: "Hydro", amount: "95", date: "11" } })), "2a immediate overdraft outranks the next bill");
  t.ok(/negative within a week/.test(todayKnowItem({ sevenDayOverdraft: true })), "2b 7-day overdraft risk surfaces");

  // the whole point: safe-to-spend is not even an input to todayKnowItem, so no hero value can leak in.
  const kBill = todayKnowItem({ nextBill: { name: "Rent", amount: 1650, date: "1" } });
  t.ok(!/safe to spend/i.test(kBill), "3a know line is never phrased as the safe-to-spend hero");
  for (const hero of [84, 2082, 12000]) {
    t.ok(!kBill.includes(`$${hero}`) && !kBill.includes(hero.toLocaleString("en-US")), `3b.${hero} know line does not contain the hero figure $${hero}`);
  }

  // nothing noteworthy → null (hide the know line, keep "one thing you could do")
  t.eq(todayKnowItem({}), null, "4a no risk & no bill → null (line hidden)");
  t.eq(todayKnowItem({ nextBill: {} }), null, "4b bill without a name → null");
  t.eq(todayKnowItem({ overdraftImmediate: false, sevenDayOverdraft: false, nextBill: null }), null, "4c explicit no-signal → null");

  // ordinal formatting
  t.ok(todayKnowItem({ nextBill: { name: "X", amount: 1, date: "1" } }).includes("1st"), "5a 1 → 1st");
  t.ok(todayKnowItem({ nextBill: { name: "X", amount: 1, date: "22" } }).includes("22nd"), "5b 22 → 22nd");
  t.ok(todayKnowItem({ nextBill: { name: "X", amount: 1, date: "15" } }).includes("15th"), "5c 15 → 15th");

  t.summary("todayPriorities");
})();
