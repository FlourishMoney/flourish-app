// tests/plusRound2Lead.test.cjs
// -----------------------------------------------------------------------------
// PLUS ROUND 2 (2026-11-22), found while checking G-N1: the invest What-If started from the total of the OLD shared
// holdings copy in every mode. With Plus on that is wrong three ways: without Plus it showed a portfolio figure that
// is behind Plus; with Plus it added a partner's holdings to "your portfolio"; and once the old copy is cleared (as
// G-N1 requires) a person with Plus started from $0.
//   today (Plus not switched on)        the household's holdings, as before
//   no Plus, could not check, checking  nothing: no figure from behind Plus
//   Plus                                this person's own holdings (a bank they linked), in one stated currency
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const REPO = path.join(__dirname, "..");
const safe = (fn) => { try { return fn(); } catch (e) { return `THREW ${String(e && e.message).slice(0, 60)}`; } };

(async () => {
  const t = create();
  const X = await import("../src/lib/netWorthAccess.js");
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const old = [{ id: "a_s1", account_id: "a", value: 12000 }, { id: "b_s1", account_id: "b", value: 8000 }];          // the old shared copy: both partners'
  const mine = { id: "a_s1", account_id: "a", value: 12500, currency: "CAD", _item: "item-me" };
  const theirs = { id: "b_s1", account_id: "b", value: 8100, currency: "CAD", _item: "item-them" };
  const owners = { "item-me": "me", "item-them": "partner" };
  const f = (s, inv = old) => safe(() => X.portfolioStartFor(s, inv));

  t.eq(f({ mode: "today" }), 20000, "WI-a Plus not switched on: the What-If starts from the household's holdings, $20,000, as before");
  t.eq([f({ mode: "locked" }), f({ mode: "unavailable" }), f({ mode: "pending" })], [0, 0, 0], "WI-b no Plus, could not check, still checking: it starts from nothing (was $20,000, a figure from behind Plus)");
  t.eq(f({ mode: "plus", holdings: [mine, theirs], owners }), 12500, "WI-c with Plus: this person's own $12,500 (was $20,000 with the partner's in it, then $0 once the old copy was cleared)");
  t.eq(f({ mode: "plus", holdings: [mine, theirs], owners }, []), 12500, "WI-d …the same when the old shared copy is gone");
  t.eq(f({ mode: "plus", holdings: [theirs], owners }), 0, "WI-e a partner's shared holdings are never \"your portfolio\"");
  t.eq(f({ mode: "plus", holdings: [mine, { ...mine, id: "a_s2", value: 100, currency: "USD" }], owners }), 0, "WI-f own holdings in two currencies are not added together: it starts from nothing");
  t.eq(f({ mode: "plus", holdings: [{ ...mine, currencyKnown: false }], owners }), 0, "WI-g a holding whose currency the bank did not state is not counted as dollars");
  t.eq(f({ mode: "plus", holdings: [mine], owners: {} }), 0, "WI-h who linked the bank is not known yet: nothing, never a guess");
  t.eq([f(null), f({ mode: "today" }, []), f({ mode: "today" }, null)], [20000, 0, 0], "WI-i no state at all is today's rule; no holdings is $0");
  const i = app.indexOf("\nfunction WhatIfSimulator("); const j = app.indexOf("\nfunction ", i + 10);
  const sim = app.slice(i, j);
  t.ok(/const portfolioValue = portfolioStartFor\(data\.demo \? \{ mode: "today" \} : nwWhatIf, data\.investments\);/.test(sim) && /const nwWhatIf = useNetWorthState\(\);/.test(sim), "WI-j the What-If uses it (the demo's sample data as today)");
  t.ok(!/const portfolioValue = \(data\.investments \|\| \[\]\)\.reduce/.test(app), "WI-k the old shared total is no longer read directly");
  t.summary("plusRound2Lead");
})().catch((e) => { console.error(e); process.exit(1); });
