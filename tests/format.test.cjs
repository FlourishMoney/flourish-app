// tests/format.test.cjs — the single shared money/number formatter.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { formatMoney, formatNumber, ordinalSuffix } = await import("../src/lib/format.js");

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

  t.summary("format");
})();
