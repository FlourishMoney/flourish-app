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
        if (h.text !== `· ${DEMO_STATUS_LABEL}`) leaks.push(`hero ${JSON.stringify(h.text)} bank=${bank}`);
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

  // ── 3. DEMO OFF: identical to what the shell said before this change ─────────────────────────
  // These are main's expressions from App.jsx as of the rebase onto bc63a30, kept here as an oracle.
  const legacyChip = (raw) => {
    const l = raw;
    let detail;
    if (!l) detail = "· up to date";
    else {
      const mm = Math.round((NOW - parseInt(l)) / 60000);
      detail = mm < 1 ? "· just refreshed" : mm < 60 ? `· updated ${mm}m ago` : "· up to date";
    }
    return { label: "Live", detail };
  };
  const legacyHero = (bank) => (bank ? "· live" : "· estimated");
  const legacyStamp = (bank, refreshing, raw) => {
    if (!(bank && !refreshing)) return null;
    const lastRefresh = parseInt(raw || "0");
    if (!lastRefresh) return null;
    const mins = Math.round((NOW - lastRefresh) / 60000);
    return mins < 1 ? "just updated" : mins < 60 ? `updated ${mins}m ago` : mins < 1440 ? `updated ${Math.floor(mins / 60)}h ago` : "updated today";
  };
  {
    const diffs = [];
    let n = 0;
    for (const raw of RAW) {
      const got = statusChip({ demo: false, lastRefreshRaw: raw, nowMs: NOW });
      const want = legacyChip(raw);
      n++;
      if (got.label !== want.label || got.detail !== want.detail) diffs.push(`chip raw=${raw}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
      for (const bank of BOOL) {
        const gh = heroFreshness({ demo: false, bankConnected: bank });
        n++;
        if (gh.text !== legacyHero(bank)) diffs.push(`hero bank=${bank}: ${gh.text} vs ${legacyHero(bank)}`);
        if (gh.kind !== (bank ? "live" : "estimated")) diffs.push(`hero kind bank=${bank}: ${gh.kind}`);
        for (const refreshing of BOOL) {
          const gs = refreshStamp({ demo: false, bankConnected: bank, isRefreshing: refreshing, lastRefreshRaw: raw, nowMs: NOW });
          n++;
          if (gs !== legacyStamp(bank, refreshing, raw)) diffs.push(`stamp bank=${bank} refreshing=${refreshing} raw=${raw}: ${gs} vs ${legacyStamp(bank, refreshing, raw)}`);
        }
      }
    }
    t.eq(diffs, [], `3a demo off: ${n} outputs identical to the original expressions`);
    t.eq(statusChip({ demo: false, lastRefreshRaw: null, nowMs: NOW }), { label: "Live", detail: "· up to date" }, "3b the chip still reads 'Live · up to date' with no refresh on record");
    t.eq(statusChip({ demo: false, lastRefreshRaw: String(NOW - 5 * MIN), nowMs: NOW }).detail, "· updated 5m ago", "3c and still counts minutes since a real refresh");
    t.eq(heroFreshness({ demo: false, bankConnected: true }).text, "· live", "3d a linked household still gets '· live'");
    t.eq(heroFreshness({ demo: false, bankConnected: false }).text, "· estimated", "3e an unlinked one still gets '· estimated'");
    t.eq(refreshStamp({ demo: false, bankConnected: true, isRefreshing: false, lastRefreshRaw: String(NOW - 2 * HR), nowMs: NOW }), "updated 2h ago", "3f the stamp still counts hours");
    t.eq(refreshStamp({ demo: false, bankConnected: true, isRefreshing: true, lastRefreshRaw: String(NOW - 2 * HR), nowMs: NOW }), null, "3g and is still hidden while a refresh is running");
  }
  // demo undefined/absent must behave as "off", not as "on"
  t.eq(statusChip({ lastRefreshRaw: null, nowMs: NOW }).label, "Live", "3h a missing demo flag is treated as off");

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
  t.ok(/data\.demo\?DEMO_STATUS_LABEL:isOnline\?"Live · Your real data":"Offline"/.test(code),
       "6c the Coach header checks demo before it may say 'Live · Your real data'");
  // The Activity subtitle keeps 'Live from your bank', but only behind isDemo (which includes data.demo).
  t.ok(/isDemo\?"Sample data · connect your bank for real insights":"Live from your bank"/.test(code),
       "6d the Activity subtitle checks isDemo before it may say 'Live from your bank'");

  t.summary("demoStatus.test");
})();
