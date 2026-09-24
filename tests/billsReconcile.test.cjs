// tests/billsReconcile.test.cjs
// -----------------------------------------------------------------------------
// BILLS ASK THE SAME WAY INCOME DOES — with one dismissal per change, not per set.
//
// The trap this file exists to catch: sharing a signature across all bill changes.
// Declining "Netflix went up" would then silence "a new gym bill appeared", and adding
// a third change would un-silence both. Section 4 pins that they are independent.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

(async () => {
  const m = await import("../src/lib/billsReconcile.js");
  const t = create();
  const observed = (name, amount) => ({ name, amount: String(amount), origin: "observed" });
  const typed = (name, amount) => ({ name, amount: String(amount) });
  const kinds = (det, cur) => m.billChanges(det, cur).map(c => `${c.kind}:${c.key}`).join(",");

  // ── 1. The three changes ─────────────────────────────────────────────────────────────────────
  t.eq(kinds([{ name: "Hydro", amount: "95" }], []), "appeared:hydro", "1a a charge the household has not recorded has appeared");
  t.eq(kinds([], [observed("Gym", 45)]), "disappeared:gym", "1b an observed bill the bank no longer sees has disappeared");
  t.eq(kinds([{ name: "Netflix", amount: "24.99" }], [observed("Netflix", 18.99)]), "amount:netflix", "1c a bill whose amount moved is a change");
  t.eq(kinds([{ name: "Netflix", amount: "18.99" }], [observed("Netflix", 18.99)]), "", "1d …and one that did not move is not");
  t.eq(kinds([], []), "", "1e nothing on either side is nothing to say");

  // ── 2. A typed bill is not a disappearance ───────────────────────────────────────────────────
  // The household pays rent by e-transfer; the bank detector has never seen it and never will.
  // Raising "your rent stopped" every sync would be the feature making itself unusable.
  t.eq(kinds([], [typed("Rent", 1650)]), "", "2a a bill the household typed is never raised as disappeared");
  t.eq(kinds([], [typed("Rent", 1650), observed("Gym", 45)]), "disappeared:gym", "2b …while an observed one beside it still is");
  t.eq(kinds([{ name: "Rent", amount: "1800" }], [typed("Rent", 1650)]), "amount:rent",
    "2c but a typed bill the bank DOES see can still have moved — absence is the only thing origin gates");

  // ── 3. Tolerance and matching ────────────────────────────────────────────────────────────────
  t.eq(kinds([{ name: "Phone", amount: "68" }], [observed("Phone", 65)]), "", "3a a 4.6% move is noise, matching income's 5%");
  t.eq(kinds([{ name: "Phone", amount: "69" }], [observed("Phone", 65)]), "amount:phone", "3b a 6.2% move is news");
  t.eq(kinds([{ name: "  NETFLIX  " , amount: "24.99" }], [observed("netflix", 18.99)]), "amount:netflix",
    "3c case and spacing do not make it a different bill");
  t.eq(kinds([{ name: "", amount: "10" }], []), "", "3d a nameless charge is not a question");
  // Both sides must carry the SAME bill, or the amount branch is never reached and the guard this
  // is named for is never exercised.
  t.eq(kinds([{ name: "Zero", amount: "10" }], [observed("Zero", 0)]), "", "3e a current amount of zero cannot divide by zero, and is not a change");
  t.eq(kinds([{ name: "Zero", amount: "0" }], [observed("Zero", 25)]), "", "3e2 …nor is a detected amount of zero, which is a detector artefact rather than news");

  // ── 4. One dismissal per change — the whole point ────────────────────────────────────────────
  {
    const cur = [observed("Netflix", 18.99), observed("Gym", 45)];
    const det = [{ name: "Netflix", amount: "24.99" }, { name: "Hydro", amount: "95" }];
    const all = m.shouldPromptBills({ detectedBills: det, currentBills: cur });
    t.eq(all.filter(d => d.prompt).length, 3, "4a three changes, three questions");

    const netflixSig = m.billChangeSignature(all.find(d => d.change.key === "netflix").change);
    const after = m.shouldPromptBills({ detectedBills: det, currentBills: cur, dismissedSignatures: [netflixSig] });
    t.eq(after.find(d => d.change.key === "netflix").reason, "dismissed", "4b declining Netflix silences Netflix");
    t.eq(after.filter(d => d.prompt).map(d => d.change.key).sort().join(","), "gym,hydro",
      "4c …and leaves the other two asking, which one shared signature would not");

    // A further change must not be silenced by an earlier dismissal.
    const det2 = [{ name: "Netflix", amount: "29.99" }, { name: "Hydro", amount: "95" }];
    t.eq(m.shouldPromptBills({ detectedBills: det2, currentBills: cur, dismissedSignatures: [netflixSig] })
          .find(d => d.change.key === "netflix").prompt, true,
      "4d Netflix moving AGAIN asks again — a dismissal silences one answer, not the subject");
  }

  // ── 5. Signatures ────────────────────────────────────────────────────────────────────────────
  {
    const c1 = m.billChanges([{ name: "Netflix", amount: "24.99" }], [observed("Netflix", 18.99)])[0];
    const c2 = m.billChanges([{ name: "netflix", amount: "25.01" }], [observed("Netflix", 19.02)])[0];
    t.eq(m.billChangeSignature(c1), m.billChangeSignature(c2), "5a cents of redetection jitter do not defeat a dismissal");
    t.eq(m.billChangeSignature(c1), "amount|netflix|19|25", "5b …because amounts round to whole dollars");
    t.eq(m.billChangeSignature(null), null, "5c no change, no signature");
    t.eq(m.billChangeSignature({ kind: "amount" }), null, "5d …nor without a key");
    const appeared = m.billChanges([{ name: "Hydro", amount: "95" }], [])[0];
    t.eq(m.billChangeSignature(appeared), "appeared|hydro|?|95", "5e a missing side is ? rather than 0, which would collide with a real zero");
  }

  // ── 6. Applying an answer ────────────────────────────────────────────────────────────────────
  {
    const cur = [observed("Netflix", 18.99), typed("Rent", 1650)];
    const appeared = m.billChanges([{ name: "Hydro", amount: "95", date: "22", type: "variable" }], cur)[0];
    const added = m.applyBillChange(cur, appeared, { name: "Hydro", amount: "95", date: "22", type: "variable", freq: "monthly" });
    t.eq(added.length, 3, "6a accepting an appearance adds the bill");
    t.eq(added[2].origin, "observed", "6b …marked observed, so its later disappearance can be raised");
    t.eq(added[2].date + "/" + added[2].type + "/" + added[2].freq, "22/variable/monthly", "6c …keeping the due day, type and cadence the detector found");
    t.eq(cur.length, 2, "6d …without mutating the list it was given");

    const moved = m.billChanges([{ name: "Netflix", amount: "24.99" }], cur)[0];
    const updated = m.applyBillChange(cur, moved);
    // The SIGNATURE rounds to whole dollars (so jitter cannot defeat a dismissal); the stored
    // amount must not, or every accepted change would quietly lose the cents.
    t.eq(updated[0].amount, "24.99", "6e accepting an amount change stores the real amount, cents and all");
    t.eq(m.billChangeSignature(moved), "amount|netflix|19|25", "6e2 …while its signature still rounds");
    t.eq(updated[0].name + "/" + updated.length, "Netflix/2", "6f …and changes nothing else");

    const gone = m.billChanges([], [observed("Gym", 45)])[0];
    t.eq(m.applyBillChange([observed("Gym", 45)], gone).length, 0, "6g accepting a disappearance removes it");
    t.eq(m.applyBillChange(cur, { kind: "nonsense", key: "x" }).length, 2, "6h an unknown answer changes nothing rather than guessing");
    t.eq(m.applyBillChange(cur, appeared, { name: "Hydro" }).length, 3, "6i re-applying is additive once");
    t.eq(m.applyBillChange(m.applyBillChange(cur, appeared), appeared).length, 3, "6j …and applying the same appearance twice does not duplicate it");

    // 13d, the LATENT half. billChanges no longer raises a bill stored under the detector's older
    // display name as new — but if applying an answer matched by the written name alone, the same
    // double count would simply arrive later, in the stored data instead of in a question.
    // (A change reaching here by any other route — an older agenda, a replayed answer — is enough.)
    const storedOldName = [observed("Rogers", 95)];
    const detectedNewName = { name: "Rogers Toronto On", legacyName: "Rogers", amount: "95", date: "14", type: "fixed" };
    const wouldAdd = { kind: "appeared", key: "rogers toronto on", name: "Rogers Toronto On", currentAmount: null, detectedAmount: 95 };
    t.eq(m.applyBillChange(storedOldName, wouldAdd, detectedNewName).length, 1,
      "6k accepting an appearance for a bill already stored under its older name adds nothing");
    t.eq(m.applyBillChange(storedOldName, wouldAdd, detectedNewName).map(b => b.name).join(","), "Rogers",
      "6l …and leaves the household's own name for it alone");

    // The other two answers have to find that same bill, or they operate on nothing at all.
    const amountUnderNewName = { kind: "amount", key: "rogers toronto on", name: "Rogers Toronto On", currentAmount: 95, detectedAmount: 110 };
    t.eq(m.applyBillChange(storedOldName, amountUnderNewName, detectedNewName)[0].amount, "110",
      "6m an accepted amount change updates the bill stored under the older name");
    t.eq(m.applyBillChange(storedOldName, { ...amountUnderNewName, kind: "disappeared" }, detectedNewName).length, 0,
      "6n …and an accepted disappearance removes it rather than silently keeping it");

    // Matching more loosely must not start swallowing unrelated bills.
    const twoBills = [observed("Rogers", 95), typed("Rent", 1650)];
    t.eq(m.applyBillChange(twoBills, wouldAdd, detectedNewName).map(b => b.name).join(","), "Rogers,Rent",
      "6o …while a different bill in the same list is untouched");
  }

  // ── 7. Remembering ───────────────────────────────────────────────────────────────────────────
  {
    const change = m.billChanges([{ name: "Netflix", amount: "24.99" }], [observed("Netflix", 18.99)])[0];
    const once = m.rememberBillDismissal([], change);
    t.eq(once.length, 1, "7a declining remembers one signature");
    t.eq(m.rememberBillDismissal(once, change).length, 1, "7b declining the same thing twice does not grow the list");
    t.eq(m.rememberBillDismissal(null, change).length, 1, "7c a missing list is treated as empty");
  }

  // ── 8. The question is short enough to say out loud ──────────────────────────────────────────
  for (const [det, cur, expected] of [
    [[{ name: "Hydro", amount: "95" }], [], "Hydro looks like a new regular bill at $95. Add it?"],
    [[], [observed("Gym", 45)], "Gym at $45 has stopped showing up. Has it ended?"],
    [[{ name: "Netflix", amount: "24.99" }], [observed("Netflix", 18.99)], "Netflix went up from $19 to $25. Is that right?"],
    [[{ name: "Netflix", amount: "12" }], [observed("Netflix", 18.99)], "Netflix went down from $19 to $12. Is that right?"],
  ]) {
    const q = m.billChangeQuestion(m.billChanges(det, cur)[0]);
    t.eq(q, expected, `8 ${expected.slice(0, 34)}…`);
    t.ok(q.length < 90 && q.split(".").length <= 3, "8 …and it is one short sentence plus a question");
  }


  // ── 9. How long a "no" lasts (settled product decision) ──────────────────────────────────────
  // It holds while the pattern holds, reopens IMMEDIATELY when the amount or cadence materially
  // changes, and reopens ONCE after twelve months — never sooner.
  {
    const loop = await import("../src/lib/reconcileLoop.js");
    const cur = [observed("Netflix", 18.99)], det = [{ name: "Netflix", amount: "24.99" }];
    const change = m.billChanges(det, cur)[0];
    const sig = m.billChangeSignature(change);
    const NOW = Date.parse("2027-01-01T00:00:00Z");
    const asks = (d) => m.billPrompts({ detectedBills: det, currentBills: cur, dismissedSignatures: d, now: NOW }).length;

    t.eq(loop.DISMISSAL_REOPEN_DAYS, 365, "9a twelve months is the reopen window");
    t.eq(asks([]), 1, "9b with no dismissal the change is asked about");
    t.eq(asks([{ signature: sig, at: "2026-12-01T00:00:00Z" }]), 0, "9c a month later it still holds");
    t.eq(asks([{ signature: sig, at: "2026-02-05T00:00:00Z" }]), 0, "9d …and at eleven months it still holds — never sooner");
    t.eq(asks([{ signature: sig, at: "2026-01-01T00:00:01Z" }]), 0, "9e …right up to the anniversary");
    t.eq(asks([{ signature: sig, at: "2025-12-31T00:00:00Z" }]), 1, "9f …and past twelve months it reopens");

    // A material change does not wait for the clock.
    t.eq(m.billPrompts({ detectedBills: [{ name: "Netflix", amount: "31.99" }], currentBills: cur,
                         dismissedSignatures: [{ signature: sig, at: "2026-12-01T00:00:00Z" }], now: NOW }).length, 1,
      "9g a further move is asked about immediately, dismissal or not — the signature carries the amount");

    // Saying no again restarts the clock rather than the question reopening on the first no's
    // anniversary.
    const first = m.rememberBillDismissal([], change, new Date("2026-01-01T00:00:00Z"));
    t.eq(first.length, 1, "9h declining records one entry");
    t.ok(first[0].at, "9i …with the date it was said");
    const again = m.rememberBillDismissal(first, change, new Date("2026-12-01T00:00:00Z"));
    t.eq(again.length, 1, "9j saying no again replaces it rather than appending");
    t.eq(again[0].at, "2026-12-01T00:00:00.000Z", "9k …and the clock restarts from the latest no");
    t.eq(asks(again), 0, "9l …so it holds for another twelve months from then");

    // Anything already stored without a date keeps holding: reopening every existing dismissal at
    // once is the one thing "never sooner" rules out.
    t.eq(asks([sig]), 0, "9m a bare signature stored before the clock existed still holds");
    t.eq(asks([{ signature: sig, at: "not-a-date" }]), 0, "9n …and an unparseable date is treated the same way");
  }

  t.summary("billsReconcile.test");
})();
