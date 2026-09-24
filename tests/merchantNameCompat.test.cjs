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

  // ── (e) The meeting raises nothing for a bill stored under main's name ──────────────────────
  // 13d, FIXED 2026-09-23. billsReconcile matched bills by its own billKey — the name as written —
  // while the detector's display name had changed shape. One unchanged bill was therefore raised
  // as BOTH a new bill and a bill that had ended: "Rogers Toronto On looks like a new regular bill
  // at $95. Add it?" and "Rogers at $95 has stopped showing up. Has it ended?". The screen does not
  // render agenda.questions, but agendaToText sends them to the facilitator, so it was live.
  // billsReconcile now matches on merchantKey and on the name main produced (carried as legacyName).
  if (main) {
    const m = await import("../src/lib/meetSnapshot.js");

    // Four monthly charges of one amount: a bill by any reading.
    const txnsFor = (desc, amount, tag) => [0, 1, 2, 3].map(k => {
      const d = new Date(); d.setMonth(d.getMonth() - k);
      return { id: `${tag}${k}`, name: desc, amount, date: d.toISOString().slice(0, 10), cat: "Bills" };
    });
    // The stored bill, named by RUNNING MAIN'S OWN FUNCTION — never by typing the expected string.
    const storedUnderMain = (desc, amount) => ({
      name: main.titleCaseBillName(mainName(desc)), amount: amount.toFixed(2), origin: "observed",
    });
    const promptsFor = (txns, bills) =>
      m.buildReconcilePrompts({ transactions: txns, bills, userBillOverrides: {}, debts: [] });
    const kindsOf = (prompts) => prompts.map(p => `${p.kind}:${p.subject}`).sort().join(", ") || "(none)";

    const DESC = "HYDRO ONE 12345 ON";
    t.eq(kindsOf(promptsFor(txnsFor(DESC, 143.9, "h"), [storedUnderMain(DESC, 143.9)])), "(none)",
      "e1 an unchanged bill stored under main's name raises no appeared/disappeared pair — the first meeting does not ask the household to add bills they already have");

    // e2/e3 were pinned to "appeared,disappeared" as a characterisation of 13d. They now expect
    // nothing: this is the fix, and the assertion is what proves it stays fixed.
    const DESC2 = "ROGERS 1234 TORONTO ON";
    const prompts2 = promptsFor(txnsFor(DESC2, 95, "r"), [storedUnderMain(DESC2, 95)]);
    t.eq(kindsOf(prompts2), "(none)",
      "e2 the descriptor whose name changed ('Rogers' stored, 'Rogers Toronto On' detected) raises NOTHING — 13d fixed");
    t.eq(prompts2.length, 0, "e3 …one bill is one bill, not two questions");

    // The detected bill carries the name main produced, which is what makes e2 possible.
    const rogers = br.detectRecurringBills(txnsFor(DESC2, 95, "r"), {})[0];
    t.eq(rogers && rogers.legacyName, main.titleCaseBillName(mainName(DESC2)),
      "e4 the detected bill carries main's name for the same descriptor");
    t.ok(!!(rogers && rogers.legacyName && rogers.name !== rogers.legacyName),
      "e5 …and it really is a different name from the one shown");

    // ── every fixture descriptor, each on its own, stored as main would have written it ─────────
    const DESCRIPTORS = ["HYDRO ONE 12345 ON", "BELL CANADA 1234 QC", "HYDRO QUEBEC 1234 5678",
                         "1234567 ONTARIO INC", "7654321 ONTARIO INC", "ROGERS 1234 TORONTO ON"];
    DESCRIPTORS.forEach((desc, i) => {
      const amount = 40 + i * 7;
      const stored = storedUnderMain(desc, amount);
      // A vacuous pass is impossible: if the detector missed the merchant entirely, the stored
      // observed bill would be raised as "disappeared" and this would fail.
      t.eq(kindsOf(promptsFor(txnsFor(desc, amount, `f${i}`), [stored])), "(none)",
        `e6.${i + 1} ${desc} stored as "${stored.name}" raises no question`);
    });

    // ── and the fix must not silence a bill that IS new ─────────────────────────────────────────
    const mixed = promptsFor(
      [...txnsFor(DESC2, 95, "mr"), ...txnsFor("BELL CANADA 1234 QC", 88, "mb")],
      [storedUnderMain(DESC2, 95)],
    );
    t.eq(kindsOf(mixed), "appeared:Bell Canada",
      "e7 a genuinely different merchant is still raised as new while the renamed one stays quiet");

    // Main's names were LOSSIER than today's: two different POS merchants both became
    // "POS PURCHASE". An alias may therefore claim a stored bill only once, or the second real
    // merchant would be absorbed into the first and never raised.
    const posTxns = [...txnsFor("POS PURCHASE 1234 LOBLAWS", 60, "pa"),
                     ...txnsFor("POS PURCHASE 5678 REIDS DAIRY", 35, "pb")];
    const posPrompts = promptsFor(posTxns, [{ name: "POS PURCHASE", amount: "60.00", origin: "observed" }]);
    t.eq(posPrompts.filter(p => p.kind === "appeared").length, 1,
      "e8 one stored POS bill absorbs one merchant, and the OTHER merchant is still raised");
    t.eq(posPrompts.filter(p => p.kind === "disappeared").length, 0,
      "e9 …and nothing is reported as ended");
  }

  t.summary("merchantNameCompat.test");
})();
