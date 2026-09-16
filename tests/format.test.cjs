// tests/format.test.cjs — the single shared money/number formatter.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { formatMoney, formatNumber, ordinalSuffix, roundBalanceDown, formatBalance } = await import("../src/lib/format.js");

  t.eq(formatMoney(2082), "$2,082", "1a thousands separator, whole dollars");
  t.eq(formatMoney(95), "$95", "1b small amount");
  t.eq(formatMoney(2444), "$2,444", "1c");
  t.eq(formatMoney(1234567), "$1,234,567", "1d millions");
  t.eq(formatMoney(-3420), "-$3,420", "1e negative");
  t.eq(formatMoney(2082.5, { cents: true }), "$2,082.50", "1f cents on request");
  t.eq(formatMoney(0), "$0", "1g zero");
  t.eq(formatMoney(NaN), "$0", "1h non-finite → $0");
  t.eq(formatMoney("2082"), "$2,082", "1i numeric string coerced");
  t.eq(formatNumber(2082), "2,082", "2a formatNumber has no currency symbol");
  t.eq(formatNumber(84), "84", "2b");

  // ordinalSuffix — the 11/12/13 exception is the whole point (item 9: "Due the 22th" bug).
  t.eq(ordinalSuffix(1), "st", "3a 1st");
  t.eq(ordinalSuffix(2), "nd", "3b 2nd");
  t.eq(ordinalSuffix(3), "rd", "3c 3rd");
  t.eq(ordinalSuffix(4), "th", "3d 4th");
  t.eq(ordinalSuffix(11), "th", "3e 11th (not 11st)");
  t.eq(ordinalSuffix(12), "th", "3f 12th");
  t.eq(ordinalSuffix(13), "th", "3g 13th");
  t.eq(ordinalSuffix(21), "st", "3h 21st");
  t.eq(ordinalSuffix(22), "nd", "3i 22nd (not 22th)");
  t.eq(ordinalSuffix(23), "rd", "3j 23rd");
  t.eq(ordinalSuffix(31), "st", "3k 31st");
  t.eq(ordinalSuffix("22"), "nd", "3l accepts a string day");

  // ── roundBalanceDown / formatBalance — the ONE "a balance rounds down" rule ────────────────────
  // These would have caught the $3,083-vs-$3084 split: Today floored while Watch used toFixed(0),
  // which rounds to NEAREST and emits no separator.
  t.eq(roundBalanceDown(3083.88), 3083, "4a a balance rounds DOWN, never to nearest (3083.88 -> 3083)");
  t.eq(roundBalanceDown(3083.0), 3083, "4b an exact dollar is unchanged");
  t.eq(roundBalanceDown(0), 0, "4c zero");
  t.eq(roundBalanceDown(0.99), 0, "4d under a dollar floors to 0");
  t.eq(roundBalanceDown(-50.4), -51, "4e a negative balance rounds DOWN i.e. MORE negative (conservative for an overdraft)");
  t.eq(roundBalanceDown(NaN), 0, "4f non-finite -> 0");
  t.eq(roundBalanceDown(undefined), 0, "4g undefined -> 0");
  t.eq(roundBalanceDown(null), 0, "4h null -> 0");
  t.eq(roundBalanceDown("3083.88"), 3083, "4i numeric string coerced");
  t.eq(roundBalanceDown(3083.88), Math.floor(Number(3083.88) || 0), "4j equivalent to the Math.floor it replaced (no behaviour change)");

  t.eq(formatBalance(3083.88), "$3,083", "5a formatBalance floors AND adds the separator");
  t.eq((3083.88).toFixed(0), "3084", "5b …where the old toFixed(0) rounded UP — the $1 defect");
  t.eq(formatBalance(1234567.9), "$1,234,567", "5c thousands separators on a large balance");
  t.eq(formatBalance(0), "$0", "5d zero");
  t.eq(formatBalance(-50.4), "-$51", "5e negative keeps one leading sign, floored");
  t.eq(formatBalance(NaN), "$0", "5f non-finite -> $0");
  t.eq(formatBalance(undefined), "$0", "5g undefined -> $0");
  t.eq(formatBalance(999.99), "$999", "5h no separator below 1000, still floored");

  t.summary("format");
})();
