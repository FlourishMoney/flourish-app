// tests/merchantNameCompat.test.cjs
// -----------------------------------------------------------------------------
// THE DISPLAY NAME IS A STORAGE KEY, AND CHANGING IT BREAKS EXISTING HOUSEHOLDS.
//
// userBillOverrides (removed / typed / cadence / amounts) and the category merchant rules
// are filed under the detector's DISPLAY NAME, lowercased. stripAccountNumber changes that
// name, nothing migrates the stored keys, and the failure is silent: a household that
// deleted a bill sees it come back, with no error and no warning.
//
// The fixtures here are built by RUNNING MAIN'S OWN FUNCTION (loaded from a git worktree of
// origin/main), never by typing an expected string — so they stay honest if either side
// changes. The suite stayed green at 2,585 assertions precisely because no fixture had
// these Canadian descriptor shapes in it.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.join(__dirname, "..");

// A throwaway checkout of origin/main's src/lib, so "what main produced" is main's real code.
function mainLibDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flourish-main-"));
  const tar = execFileSync("git", ["-C", REPO, "archive", "origin/main", "src/lib"], { maxBuffer: 64 * 1024 * 1024 });
  const tarPath = path.join(dir, "lib.tar");
  fs.writeFileSync(tarPath, tar);
  execFileSync("tar", ["-x", "-f", tarPath, "-C", dir]);
  return path.join(dir, "src", "lib");
}

(async () => {
  const t = create();
  const br = await import("../src/lib/plaidNormalize.js");
  const co = await import("../src/lib/categoryOverrides.js");

  let main = null;
  try { main = await import(path.join(mainLibDir(), "plaidNormalize.js")); }
  catch (e) { /* no origin/main available (shallow clone): sections 4-5 self-skip below */ }

  // main built the display name inline; this is that expression, verbatim.
  const mainName = (n) => main.stripPosPrefix(String(n).replace(/\s+\d{4,}.*$/, "").trim());
  const brName   = (n) => br.stripPosPrefix(br.stripAccountNumber(n));

  // ── (a) MERCHANT digits WORD — the shape that has a province or city after the number ────────
  {
    t.eq(br.stripAccountNumber("HYDRO ONE 12345 ON"), "HYDRO ONE",
      "a1 a trailing account number AND the province after it are both stripped");
    t.eq(br.stripAccountNumber("BELL CANADA 1234 QC"), "BELL CANADA", "a2 …the same for QC");
    t.eq(br.stripAccountNumber("ROGERS 1234 TORONTO ON"), "ROGERS TORONTO ON",
      "a3 …but a full city name is NOT a province code, so it is kept rather than guessed at");
    t.eq(br.stripAccountNumber("HYDRO ONE 123456789"), "HYDRO ONE", "a4 a bare trailing number still goes");
  }

  // ── (b) A LEADING company number identifies the company ──────────────────────────────────────
  // Numbered companies are the normal incorporation form in Ontario and BC. Deleting the number
  // merged a $1,200 daycare and a $340 property manager into one $1,150 bill.
  {
    t.eq(br.stripAccountNumber("1234567 ONTARIO INC"), "1234567 ONTARIO INC", "b1 a leading company number is kept");
    t.ok(br.stripAccountNumber("1234567 ONTARIO INC") !== br.stripAccountNumber("7654321 ONTARIO INC"),
      "b2 …so two numbered companies remain two companies");
    t.eq(co.merchantKey("1234567 ONTARIO INC"), "1234567 ontario inc", "b3 …and the merchant key keeps them apart too");
    t.ok(co.merchantKey("1234567 ONTARIO INC") !== co.merchantKey("7654321 ONTARIO INC"), "b4 …demonstrably");
  }

  // ── (c) Idempotence ──────────────────────────────────────────────────────────────────────────
  // A single pass turned "HYDRO QUEBEC 1234 5678" into "Hydro Quebec 1234", and a second pass into
  // "Hydro Quebec" — so the same merchant had two names depending on how many times it had been
  // through, which is what made bill healing report "no current transactions" for a merchant with
  // four of them.
  {
    const shapes = ["HYDRO QUEBEC 1234 5678", "HYDRO ONE 12345 ON", "ROGERS 1234 TORONTO ON",
                    "1234567 ONTARIO INC", "POS PURCHASE 1234 LOBLAWS", "Loblaws", "", "   "];
    for (const sh of shapes) {
      const once = br.stripAccountNumber(sh);
      t.eq(br.stripAccountNumber(once), once, `c1 stripAccountNumber is idempotent for ${JSON.stringify(sh)}`);
    }
    t.eq(br.stripAccountNumber("HYDRO QUEBEC 1234 5678"), "HYDRO QUEBEC", "c2 …and takes ALL the trailing groups in one pass");
  }

  // ── (d) A correction stored under main's name is still honoured ──────────────────────────────
  if (!main) {
    t.ok(true, "d0 origin/main not available in this checkout — compatibility sections skipped");
  } else {
    const DESCRIPTORS = ["HYDRO ONE 12345 ON", "ROGERS 1234 TORONTO ON", "BELL CANADA 1234 QC",
                         "HYDRO QUEBEC 1234 5678", "POS PURCHASE 1234 LOBLAWS"];
    // The stored set, as MAIN would have written it. Not typed out.
    const storedRemoved = DESCRIPTORS.map(d => mainName(d).toLowerCase().trim());
    t.ok(storedRemoved.every(Boolean), "d1 built the stored names by running main's own function");

    const txns = DESCRIPTORS.flatMap((name, i) => [0, 1, 2].map(m => {
      const d = new Date(); d.setMonth(d.getMonth() - m);
      return { id: `${i}-${m}`, name, amount: 40 + i, date: d.toISOString().slice(0, 10), cat: "Subscriptions" };
    }));

    const detectedNoOverrides = br.detectRecurringBills(txns, {});
    t.ok(detectedNoOverrides.length >= 4, `d2 the detector finds these merchants (${detectedNoOverrides.length})`);

    const detected = br.detectRecurringBills(txns, { overrides: { removed: storedRemoved } });
    t.eq(detected.map(b => b.name).join(", ") || "(none)", "(none)",
      "d3 every bill the household REMOVED under main's name stays removed — without the compatibility read, they all come back");

    // An amount typed under main's name is still honoured.
    const typedAmounts = { [mainName("HYDRO ONE 12345 ON").toLowerCase().trim()]: 143.9 };
    const withAmount = br.detectRecurringBills(txns, { overrides: { amounts: typedAmounts } });
    const hydro = withAmount.find(b => /hydro one/i.test(b.name));
    t.ok(!!hydro, "d4 the Hydro One bill is detected");
    t.eq(hydro && hydro.amount, "143.90", "d5 …at the amount the household typed under main's name");

    // And the merchant rules honour a rule written under main's key.
    const legacyKey = co.legacyMerchantKey("ROGERS 1234 TORONTO ON");
    t.ok(legacyKey !== co.merchantKey("ROGERS 1234 TORONTO ON"), "d6 this descriptor's key really did change");
    t.eq(co.effectiveCategory({ id: "x", name: "ROGERS 1234 TORONTO ON" }, {}, { [legacyKey]: "Bills" }), "Bills",
      "d7 …and a rule written under the old key still applies");
  }

  // ── (e) The meeting raises nothing for an unchanged bill stored under main's name ────────────
  if (main) {
    const m = await import("../src/lib/meetSnapshot.js");
    const DESC = "HYDRO ONE 12345 ON";
    const storedName = mainName(DESC);                        // what main wrote into data.bills
    const txns = [0, 1, 2].map(k => {
      const d = new Date(); d.setMonth(d.getMonth() - k);
      return { id: `h${k}`, name: DESC, amount: 143.9, date: d.toISOString().slice(0, 10), cat: "Bills" };
    });
    const prompts = m.buildReconcilePrompts({
      transactions: txns,
      bills: [{ name: storedName, amount: "143.90", origin: "observed" }],
      userBillOverrides: {}, debts: [],
    });
    const kinds = prompts.map(p => `${p.kind}:${p.subject}`).join(", ");
    t.eq(kinds || "(none)", "(none)",
      "e1 an unchanged bill stored under main's name raises no appeared/disappeared pair — the first meeting does not ask the household to add bills they already have");

    // CHARACTERISATION, not an endorsement. Fixes 1-3 make the name match again for the common
    // shapes, but not for every one: "ROGERS 1234 TORONTO ON" still keys as "Rogers Toronto On"
    // here and "Rogers" under main, and billsReconcile matches bills by its OWN key
    // (billsReconcile.js billKey), which the compatibility read does not cover. The result is the
    // first-sync event described in KNOWN-DEFECTS 13d: one bill presented as both a new bill and
    // a bill that has ended.
    //
    // This assertion records the CURRENT behaviour so it is visible and counted. When 13d is
    // fixed — by keying bills with merchantKey like everything else — this test fails and should
    // be changed to expect "(none)".
    const DESC2 = "ROGERS 1234 TORONTO ON";
    const stored2 = main.titleCaseBillName(mainName(DESC2));
    const txns2 = [0, 1, 2].map(k => {
      const d = new Date(); d.setMonth(d.getMonth() - k);
      return { id: `r${k}`, name: DESC2, amount: 88, date: d.toISOString().slice(0, 10), cat: "Bills" };
    });
    const prompts2 = m.buildReconcilePrompts({
      transactions: txns2,
      bills: [{ name: stored2, amount: "88.00", origin: "observed" }],
      userBillOverrides: {}, debts: [],
    });
    t.eq(prompts2.map(p => p.kind).sort().join(","), "appeared,disappeared",
      "e2 KNOWN (13d): a descriptor whose name still changes is presented as both a new bill and an ended one — pinned here until 13d is fixed");
    t.ok(prompts2.length === 2, "e3 …which is one bill turned into two questions, and why 13d blocks the 13e/13f wiring");
  }

  t.summary("merchantNameCompat.test");
})();
