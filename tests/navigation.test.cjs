// tests/navigation.test.cjs — Step 6: every previously reachable screen is still reachable.
"use strict";
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const { TABS, TAB_SCREENS, PRE_STEP6_SCREENS, tabForScreen, isReachableScreen } =
    await import("../src/lib/navigation.js");

  t.eq([...TABS], ["home", "watch", "do", "coach", "family"], "1a five tabs (Today/Watch/Do/Learn/Meet)");

  // THE reachability contract: nothing dropped in the redesign.
  PRE_STEP6_SCREENS.forEach(s => t.ok(isReachableScreen(s), `1b "${s}" is still reachable`));

  // re-homing
  t.ok(TAB_SCREENS.watch.includes("plan") && TAB_SCREENS.watch.includes("spend"), "2a Watch holds Plan + Activity");
  t.ok(TAB_SCREENS.do.includes("budget") && TAB_SCREENS.do.includes("goals") && TAB_SCREENS.do.includes("credit"),
       "2b Do holds Budget + Goals + Credit");

  // active-tab mapping for every re-homed screen
  t.eq(tabForScreen("plan"),   "watch",  "3a plan → Watch");
  t.eq(tabForScreen("spend"),  "watch",  "3b spend → Watch");
  t.eq(tabForScreen("budget"), "do",     "3c budget → Do");
  t.eq(tabForScreen("goals"),  "do",     "3d goals → Do");
  t.eq(tabForScreen("credit"), "do",     "3e credit → Do");
  t.eq(tabForScreen("home"),   "home",   "3f home → Today");
  t.eq(tabForScreen("coach"),  "coach",  "3g coach → Learn");
  t.eq(tabForScreen("family"), "family", "3h family → Meet");
  t.eq(tabForScreen("watch"),  "watch",  "3i tab id resolves to itself");
  t.eq(tabForScreen("do"),     "do",     "3j tab id resolves to itself");

  // standalone full-screen routes: reachable, but no bottom-nav highlight
  ["widget", "kids", "privacy", "terms"].forEach(s => {
    t.ok(isReachableScreen(s), `4a "${s}" reachable`);
    t.eq(tabForScreen(s), null, `4b "${s}" has no active tab`);
  });

  // nothing invented that didn't exist before
  Object.values(TAB_SCREENS).flat().forEach(s =>
    t.ok(PRE_STEP6_SCREENS.includes(s), `5a tab screen "${s}" existed before Step 6`));

  t.summary("navigation");
})();
