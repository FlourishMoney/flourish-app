// tests/format.test.cjs — the single shared money/number formatter.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { formatMoney, formatNumber } = await import("../src/lib/format.js");

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

  t.summary("format");
})();
