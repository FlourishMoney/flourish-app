// tests/dayDueOrdinal.test.cjs
// -----------------------------------------------------------------------------
// WATCH → ACTIVITY → A TRANSACTION → ADD TO BILLS → DAY DUE (live defect, health checks of Sept 27, Oct 4
// and Oct 14): the hint under the form read "on the 1th", "2th", "3th", "21th", "22th", "23th" because it
// added a literal "th". It now uses the one ordinal helper, src/lib/format.js ordinalSuffix.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const { ordinalSuffix } = await import("../src/lib/format.js");
  const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
  const EXPECTED = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th", "13th", "14th", "15th", "16th",
    "17th", "18th", "19th", "20th", "21st", "22nd", "23rd", "24th", "25th", "26th", "27th", "28th", "29th", "30th", "31st"];
  for (let d = 1; d <= 31; d++) {
    // The hint receives the select's value, a string.
    t.eq(String(d) + ordinalSuffix(String(d)), EXPECTED[d - 1], `1 day ${d}: "on the ${EXPECTED[d - 1]}"`);
  }
  t.ok(/Your Plan screen will now include \$\{billForm\.amount\}\/month on the \{billForm\.date \? billForm\.date\+ordinalSuffix\(billForm\.date\) : ""\}/.test(APP),
    "2a the Add to Bills hint uses ordinalSuffix");
  t.ok(!/\+\s*"th"|\+\s*'th'/.test(APP), "2b no literal \"th\" is added to a day anywhere in App.jsx");
  t.summary("dayDueOrdinal.test");
})();
