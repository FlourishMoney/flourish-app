// tests/review1122Holdings.test.cjs
// -----------------------------------------------------------------------------
// FULL-APP REVIEW 2026-11-22, P10-06 with the app's half of P3-09: with two banks that hold investments, one bank's
// failed read used to wipe its holdings, because the bank that answered replaced the whole list. Now a bank whose
// read failed (the call threw, or the server said `unavailable`) keeps what it had, the same rule the app already
// uses for liabilities (retainLiabilities). The same defect was fixed for Plus in 05fb6a7 (diff review B1); this is
// the path everyone is on today.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const REPO = path.join(__dirname, "..");
const safe = (fn) => { try { return fn(); } catch (e) { return `THREW ${String(e && e.message).slice(0, 60)}`; } };

(async () => {
  const t = create();
  const M = await import("../src/lib/multibank.js");
  const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
  const acct = new Map([["a-tfsa", "item-A"], ["b-rrsp", "item-B"]]);
  const A1 = { id: "a-tfsa_s1", account_id: "a-tfsa", name: "A Index Fund", value: 12000 };
  const B1 = { id: "b-rrsp_s1", account_id: "b-rrsp", name: "B Bond Fund", value: 8000 };
  const B1new = { ...B1, value: 8100 };
  const ids = (l) => (Array.isArray(l) ? l.map((h) => `${h.id}:${h.value}`).sort() : l);
  const keep = (...a) => safe(() => ids(M.retainHoldings(...a)));

  t.eq(keep([A1, B1], [B1new], acct, new Set(["item-B"])), ["a-tfsa_s1:12000", "b-rrsp_s1:8100"], "P10-06a bank A's read failed and bank B answered: A's $12,000 holding is kept, B's is the new figure (was: only B's left, $12,000 gone)");
  t.eq(keep([A1, B1], [B1new], acct, new Set(["item-A", "item-B"])), ["b-rrsp_s1:8100"], "P10-06b bank A answered and holds nothing now: its old holding goes");
  t.eq(keep([A1, B1], [{ ...A1, value: 12500 }, B1new], acct, new Set(["item-A", "item-B"])), ["a-tfsa_s1:12500", "b-rrsp_s1:8100"], "P10-06c both answered: both new, nothing twice");
  t.eq(keep([{ id: "x_s1", account_id: "gone", name: "Unknown", value: 5 }], [B1new], acct, new Set(["item-B"])), ["b-rrsp_s1:8100", "x_s1:5"], "P10-06d a holding whose bank is not known is kept, as for liabilities");
  t.eq(keep(undefined, [B1new], acct, new Set(["item-B"])), ["b-rrsp_s1:8100"], "P10-06e nothing held before: what came");
  t.eq(keep([A1], [], acct, new Set()), ["a-tfsa_s1:12000"], "P10-06f nothing came at all: nothing changes");
  const before = [A1, B1]; safe(() => M.retainHoldings(before, [B1new], acct, new Set(["item-B"])));
  t.eq(ids(before), ["a-tfsa_s1:12000", "b-rrsp_s1:8000"], "P10-06g the list handed in is not changed (pure)");

  // ── N2 (round 2 review): identity and the all-empty round ──────────────────────────────────────────────────
  const noId = ({ id, ...rest }) => rest;
  t.eq(keep([noId(A1), noId(B1)], [noId(B1new)], acct, new Set(["item-B"]), true), ["undefined:12000", "undefined:8100"], "N2h holdings with no id: bank A's (failed) stays, bank B's is replaced, by their BANK, not by an id that neither has");
  t.eq(keep([A1, B1], [], acct, new Set(["item-A", "item-B"]), false), [], "N2i every bank answered with nothing: nothing is held");
  t.eq(keep([A1, B1], [], acct, new Set(["item-B"]), true), ["a-tfsa_s1:12000"], "N2j one answered with nothing, one failed: the failed bank's stays");
  const manualAcct = new Map([...acct, ["m-1", null]]);
  const typed = { id: "m-1_x", account_id: "m-1", name: "Typed in by hand", value: 50 };
  t.eq(keep([typed, B1], [B1new], manualAcct, new Set(["item-A", "item-B"]), false), ["b-rrsp_s1:8100", "m-1_x:50"], "N2k a holding on an account no bank linked is not a bank's to remove");
  t.eq(keep([{ id: "x_s1", account_id: "gone", name: "Orphan", value: 5 }], [B1new], acct, new Set(["item-A", "item-B"]), false), ["b-rrsp_s1:8100"], "N2l a holding whose account is gone, in a round where every bank answered: it is no failed bank's, so it goes");
  t.eq(keep([{ id: "acc_undefined", account_id: "gone", name: "One", value: 1 }, { id: "acc_undefined", account_id: "gone", name: "Two", value: 2 }], [{ id: "acc_undefined", account_id: "b-rrsp", name: "Three", value: 3 }], acct, new Set(["item-B"]), true),
    ["acc_undefined:1", "acc_undefined:2", "acc_undefined:3"], "N2m an id made from a missing security is no identity: different holdings are never matched on it");

  const i = app.indexOf("// Phase B3: fetch investment holdings per item"); const block = i < 0 ? "" : app.slice(i, i + 1800);
  t.ok(/retainHoldings\(prev\.investments,/.test(block), "P10-06h the app's holdings sync uses it");
  t.ok(/r\.value\.unavailable !== true/.test(block), "P3-09e …and an answer marked unavailable (the server could not read that bank) counts as a failed read, not as \"holds nothing\"");
  t.ok(!/investments: allHoldings \}/.test(block), "P10-06i the whole list is no longer replaced by the banks that happened to answer");
  t.ok(/if \(answered\.size > 0\)/.test(block) && !/if \(allHoldings\.length > 0\)/.test(block), "N2n the app applies a round whenever a bank ANSWERED, also when all of them answered with nothing");
  t.ok(/answered\.size < items\.length/.test(block), "N2o …and tells the rule whether any bank failed");
  t.summary("review1122Holdings");
})().catch((e) => { console.error(e); process.exit(1); });
