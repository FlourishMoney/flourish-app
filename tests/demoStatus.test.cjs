// tests/demoStatus.test.cjs
// -----------------------------------------------------------------------------
// DEMO MODE NEVER SAYS "LIVE".
//
// The demo builds its state with bankConnected:true so the whole app has accounts to draw. Anything
// keyed on that flag therefore claimed live data over sample numbers: the safe-to-spend headline said
// "· live", and the Today header chip said "Live · 6 engines" without looking at demo at all. Meet said
// "Example · sample data" and was right. A visitor reading "Live" beside numbers that are made up is
// the same class of problem as the truth-stack fixes.
//
// There is no DOM harness in this repo, so this file pins the rule in two places:
//   1. the pure decision functions in src/lib/demoStatus.js, swept over every input combination;
//   2. App.jsx itself (source-scan, an established pattern here): every site is routed through them
//      and no hard-coded "Live" chip or freshness literal has crept back.
// Non-demo behaviour is pinned against a copy of the ORIGINAL expressions, so "unchanged when demo is
// off" is checked mechanically rather than asserted.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");
const t = create();

(async () => {
  const m = await import("../src/lib/demoStatus.js");
  const { DEMO_STATUS_LABEL, statusChip, heroFreshness, refreshStamp } = m;

  const NOW = 1_800_000_000_000;
  const MIN = 60000, HR = 3600000, DAY = 86400000;
  // Every shape flourish_last_refresh can plausibly take in localStorage.
  const RAW = [
    null, "", "0", "garbage",
    String(NOW), String(NOW - 30_000), String(NOW - 5 * MIN), String(NOW - 59 * MIN), String(NOW - 60 * MIN),
    String(NOW - 90 * MIN), String(NOW - 23 * HR), String(NOW - 25 * HR), String(NOW - 3 * DAY),
    String(NOW + 5 * MIN), // a clock that ran ahead: negative minutes
  ];
  const BOOL = [true, false];

  // ── 1. the wording is Meet's ─────────────────────────────────────────────────────────────────
  t.eq(DEMO_STATUS_LABEL, "Example · sample data", "1a the shared label is the wording Meet uses");
  t.ok(!/live/i.test(DEMO_STATUS_LABEL), "1b and it contains no 'live'");

  // ── 2. DEMO ON: nothing says live, everything says example, whatever localStorage holds ──────
  {
    let chips = 0, heroes = 0, stamps = 0, leaks = [];
    for (const raw of RAW) {
      const c = statusChip({ demo: true, lastRefreshRaw: raw, nowMs: NOW });
      chips++;
      if (c.label !== DEMO_STATUS_LABEL) leaks.push(`chip label ${JSON.stringify(c.label)} for raw=${raw}`);
      if (c.detail !== "") leaks.push(`chip detail ${JSON.stringify(c.detail)} for raw=${raw}`);
      if (/live|engine|refreshed|updated/i.test(c.label + c.detail)) leaks.push(`chip claims freshness for raw=${raw}`);

      for (const bank of BOOL) {
        const h = heroFreshness({ demo: true, bankConnected: bank });
        heroes++;
        if (h.text !== DEMO_STATUS_LABEL) leaks.push(`hero ${JSON.stringify(h.text)} bank=${bank}`);
        // It can wrap onto its own line at phone width, so it must never START with a separator.
        if (/^\s*[·•|\-–—]/.test(h.text)) leaks.push(`hero suffix starts with a separator: ${JSON.stringify(h.text)}`);
        if (/live/i.test(h.text)) leaks.push(`hero says live, bank=${bank}`);
        if (h.kind !== "example") leaks.push(`hero kind ${h.kind}`);

        for (const refreshing of BOOL) {
          const s = refreshStamp({ demo: true, bankConnected: bank, isRefreshing: refreshing, lastRefreshRaw: raw, nowMs: NOW });
          stamps++;
          if (s !== null) leaks.push(`stamp ${JSON.stringify(s)} bank=${bank} refreshing=${refreshing} raw=${raw}`);
        }
      }
    }
    t.eq(leaks, [], `2a demo mode: no live/freshness wording across ${chips} chips, ${heroes} hero suffixes, ${stamps} stamps`);
    t.eq(statusChip({ demo: true, lastRefreshRaw: String(NOW - 5 * MIN), nowMs: NOW }).label, DEMO_STATUS_LABEL,
         "2b a stale real-session timestamp in localStorage cannot make the demo chip say 'updated 5m ago'");
  }

  // ── 3. DEMO OFF: "live" only while the bank answered within the hour (balance-truth, 2026-11-06) ─────────
  // This section used to pin the shell's original expressions, and with them their fault: the chip read "· up to date"
  // whenever the last refresh was over an hour old or missing, and the stamp read "updated today" for anything over a
  // day, so balances from a bank whose sign-in had run out were shown as live for weeks. The rule now: under an hour,
  // the same words as before ("· just refreshed", "· updated Nm ago", "just updated", "updated Nm ago", "· live");
  // otherwise when the bank last answered (lib/balanceTruth.js lastUpdatedLine), never "up to date" or "today".
  const BT = await import("../src/lib/balanceTruth.js");
  const BW = await import("../src/lib/balanceWords.js");
  const UNKNOWN = BW.balanceWords("balance-last-updated-unknown");
  const AT = (ms) => BW.balanceWords("balance-last-updated", { when: BT.whenText(ms, NOW) });
  {
    const want = (raw) => {
      const at = parseInt(raw || "0");
      if (!Number.isFinite(at) || at <= 0) return { chip: { label: UNKNOWN, detail: "", stale: true }, hero: "", stamp: UNKNOWN };
      const mm = Math.round((NOW - at) / 60000);
      if (NOW - at >= 60 * MIN) return { chip: { label: AT(at), detail: "", stale: true }, hero: "", stamp: AT(at) };
      return { chip: { label: "Live", detail: mm < 1 ? "· just refreshed" : `· updated ${mm}m ago` }, hero: "· live", stamp: mm < 1 ? "just updated" : `updated ${mm}m ago` };
    };
    const diffs = [];
    let n = 0;
    for (const raw of RAW) {
      const w = want(raw);
      const got = statusChip({ demo: false, lastRefreshRaw: raw, nowMs: NOW });
      n++;
      if (JSON.stringify(got) !== JSON.stringify(w.chip)) diffs.push(`chip raw=${raw}: ${JSON.stringify(got)} vs ${JSON.stringify(w.chip)}`);
      for (const bank of BOOL) {
        const gh = heroFreshness({ demo: false, bankConnected: bank, lastRefreshRaw: raw, nowMs: NOW });
        n++;
        const wh = bank ? w.hero : "· estimated";
        if (gh.text !== wh) diffs.push(`hero bank=${bank} raw=${raw}: ${JSON.stringify(gh.text)} vs ${JSON.stringify(wh)}`);
        for (const refreshing of BOOL) {
          const gs = refreshStamp({ demo: false, bankConnected: bank, isRefreshing: refreshing, lastRefreshRaw: raw, nowMs: NOW });
          n++;
          const ws = bank && !refreshing ? w.stamp : null;
          if (gs !== ws) diffs.push(`stamp bank=${bank} refreshing=${refreshing} raw=${raw}: ${JSON.stringify(gs)} vs ${JSON.stringify(ws)}`);
        }
      }
    }
    t.eq(diffs, [], `3a demo off: ${n} outputs follow the rule (live under an hour, else when the bank last answered)`);
    const every = [];
    for (const raw of RAW) {
      every.push(JSON.stringify(statusChip({ demo: false, lastRefreshRaw: raw, nowMs: NOW })));
      for (const r of BOOL) every.push(String(refreshStamp({ demo: false, bankConnected: true, isRefreshing: r, lastRefreshRaw: raw, nowMs: NOW })));
    }
    t.eq(every.filter((x) => /up to date|updated today/.test(x)), [], "3b no input says \"up to date\" or \"updated today\" any more");
    t.eq(statusChip({ demo: false, lastRefreshRaw: null, nowMs: NOW }), { label: UNKNOWN, detail: "", stale: true }, "3c with no bank answer on record the chip says it can't say when, with no live dot (stale)");
    t.eq(statusChip({ demo: false, lastRefreshRaw: String(NOW - 5 * MIN), nowMs: NOW }).detail, "· updated 5m ago", "3d …and still counts minutes since a real refresh");
    t.eq(heroFreshness({ demo: false, bankConnected: true, lastRefreshRaw: String(NOW - 5 * MIN), nowMs: NOW }).text, "· live", "3e a linked household refreshed 5 minutes ago still gets '· live'");
    t.eq(heroFreshness({ demo: false, bankConnected: false }).text, "· estimated", "3f an unlinked one still gets '· estimated'");
    t.eq(refreshStamp({ demo: false, bankConnected: true, isRefreshing: false, lastRefreshRaw: String(NOW - 2 * HR), nowMs: NOW }), AT(NOW - 2 * HR), "3g two hours old: when the bank last answered, not \"updated 2h ago\" beside a live claim");
    t.eq(refreshStamp({ demo: false, bankConnected: true, isRefreshing: true, lastRefreshRaw: String(NOW - 2 * HR), nowMs: NOW }), null, "3h and is still hidden while a refresh is running");

    // The app passes bankFreshness's answer, which also knows a bank that needs a fresh sign-in.
    const acct = (id, at, item = "item-1") => ({ id, type: "depository", institution: "Scotiabank", _item: item, balance: 100, bankAnsweredAt: at == null ? undefined : new Date(at).toISOString() });
    const fresh = (accounts, signIn = []) => BT.bankFreshness({ accounts, nowMs: NOW, signIn });
    t.eq(statusChip({ demo: false, nowMs: NOW, freshness: fresh([acct("a", NOW - 3 * MIN)]) }), { label: "Live", detail: "· updated 3m ago" }, "3i answered 3 minutes ago: Live");
    t.eq(statusChip({ demo: false, nowMs: NOW, freshness: fresh([acct("a", NOW - 3 * MIN)], [{ item_id: "item-1" }]) }).stale, true, "3j …but its bank needs a fresh sign-in: not live");
    t.eq(statusChip({ demo: false, nowMs: NOW, freshness: fresh([acct("a", NOW - 3 * MIN), acct("b", NOW - 3 * DAY, "item-2")]) }).label, AT(NOW - 3 * DAY), "3k two banks: the OLDEST answer decides, and is the date shown");
    t.eq(statusChip({ demo: false, nowMs: NOW, freshness: fresh([acct("a", NOW - 3 * MIN), acct("b", null, "item-2")]) }).label, UNKNOWN, "3l one account with no answer on record: it can't say when");
    t.eq(statusChip({ demo: false, nowMs: NOW, bankConnected: true, freshness: fresh([{ id: "m", institution: "Manual", balance: 5, balanceEntered: true }]) }), null, "3m no bank-linked account at all: no bank chip");
    t.eq(heroFreshness({ demo: false, bankConnected: true, nowMs: NOW, freshness: fresh([acct("a", NOW - 2 * DAY)]) }), { text: "", kind: "stale" }, "3n the hero has no suffix when not live (the stamp under the figure says when)");
  }
  // demo undefined/absent must behave as "off", not as "on"
  t.eq(statusChip({ lastRefreshRaw: null, nowMs: NOW }).label, UNKNOWN, "3o a missing demo flag is treated as off");

  // ── 4. App.jsx routes every site through the helper ──────────────────────────────────────────
  const raw = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");
  // Comments legitimately quote the old wording; strip them so only live code is scanned.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  const count = (re) => (code.match(re) || []).length;

  t.ok(/import\s*\{[^}]*\bDEMO_STATUS_LABEL\b[^}]*\bstatusChip\b[^}]*\bheroFreshness\b[^}]*\brefreshStamp\b[^}]*\}\s*from\s*"\.\/lib\/demoStatus\.js"/.test(code),
       "4a App.jsx imports the four helpers from demoStatus.js");
  t.eq(count(/statusChip\(\{demo:!!data\.demo/g), 1, "4b the header chip is decided by statusChip, with the demo flag");
  t.eq(count(/heroFreshness\(\{demo:!!data\.demo/g), 1, "4c the safe-to-spend suffix is decided by heroFreshness, with the demo flag");
  t.eq(count(/refreshStamp\(\{demo:!!data\.demo/g), 1, "4d the 'updated Nm ago' stamp is decided by refreshStamp, with the demo flag");

  // ── 5. no hard-coded freshness literal has crept back ────────────────────────────────────────
  t.eq(count(/<span[^>]*>\s*Live\s*<\/span>/g), 0, "5a no hard-coded <span>Live</span> chip");
  t.eq(count(/["'`]· live["'`]/g), 0, "5b no hard-coded '· live'");
  t.eq(count(/["'`]· estimated["'`]/g), 0, "5c no hard-coded '· estimated'");
  t.eq(count(/· 6 engines|· up to date/g), 0, "5d no hard-coded '· up to date' (or the older '· 6 engines')");
  t.eq(count(/just refreshed|just updated/g), 0, "5e no hard-coded 'just refreshed' / 'just updated'");
  t.eq(count(/updated \$\{/g), 0, "5f no hard-coded 'updated ${n}m ago'");

  // ── 6. one source for the example wording ────────────────────────────────────────────────────
  t.eq(count(/["'`]Example · [Ss]ample data["'`]/g), 0, "6a the example wording is not re-typed anywhere in App.jsx");
  t.ok(count(/\{DEMO_STATUS_LABEL\}/g) >= 1, "6b Meet renders the shared label");
  // The Coach header keeps its non-demo 'Live · Your real data', but only AFTER the demo branch.
  //
  // This used to pin the one-line ternary that rendered DEMO_STATUS_LABEL inline. That shape put the
  // label in C.green with a green dot — the colour AND shape of the live state — so the branch was
  // right and the styling said the opposite. The demo arm is now the shared example tag, which is
  // what the regex pins: green is unreachable from the demo branch, not merely unwritten.
  t.ok(/\{data\.demo\s*\?\s*<span style=\{exampleTagStyle\(\)\}>\{DEMO_STATUS_LABEL\}<\/span>\s*:\s*<div[\s\S]{0,400}?"Live · Your real data"/.test(code),
       "6c the Coach header renders the shared example tag in demo, and only its else-branch may say 'Live · Your real data'");
  t.eq(count(/"Live · Your real data"/g), 1,
       "6e …and there is exactly one place in App.jsx that can say it");
  // Every render of the shared label goes through the shared style. The browser suite checks the
  // colour that actually comes out (layout.browser.test.cjs section 8); this is the source-side twin,
  // so a new site cannot introduce a fourth look without one of the two failing.
  const labelSites = [...code.matchAll(/\{DEMO_STATUS_LABEL\}/g)];
  t.ok(labelSites.length >= 2, `6f the shared label is rendered in more than one place (${labelSites.length})`);
  t.eq(labelSites.filter(m => !/exampleTagStyle\(\)/.test(code.slice(Math.max(0, m.index - 120), m.index))).length, 0,
       "6g …and every one of them is wrapped in exampleTagStyle()");
  // The Activity subtitle keeps 'Live from your bank', but only behind isDemo (data.demo) AND a linked
  // bank (tester suggestions item 4: a household with no bank says "From your statements and entries").
  t.ok(/isDemo\?"Sample data · connect your bank for real insights":data\.bankConnected&&spendFresh\.state!=="none"\?\(spendFresh\.state==="live"\?"Live from your bank":lastUpdatedLine\(spendFresh, Date\.now\(\)\)\):"From your statements and entries"/.test(code),
       "6d the Activity subtitle checks isDemo, a linked bank account (not statements only), and that the bank answered within the hour (balance-truth), before it may say 'Live from your bank'");

  t.summary("demoStatus.test");
})();
