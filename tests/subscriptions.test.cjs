// tests/subscriptions.test.cjs
// -----------------------------------------------------------------------------
// Sprint C Fix 5 — subscription opportunity must normalize to a real monthly amount.
//
// The detector summed every subscription charge over ~90 days and labelled it "$X/mo, N active" using
// the raw row count: three monthly $19 Netflix charges → "$57/mo, 3 active", with a 30% badge off the
// inflated number. This pins the corrected analysis: group by merchant, count DISTINCT active
// merchants, estimate ONE monthly amount per merchant (median charge, never a sum).
//
// Frozen dates only — `now` is injected.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { analyzeSubscriptions, normalizeMerchant, SUBSCRIPTION_ACTIVE_WINDOW_DAYS } =
    await import("../src/lib/subscriptions.js");
  const t = create();

  const NOW = new Date(2026, 5, 30, 12, 0, 0); // Jun 30 2026
  const iso = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => { const d = new Date(NOW); d.setDate(d.getDate() - n); return iso(d); };
  const sub = (name, amount, date) => ({ name, amount, date, cat: "Subscriptions" });

  // ── Merchant normalization ──────────────────────────────────────────────────────────────────────
  t.eq(normalizeMerchant("NETFLIX.COM"), "netflix", "NETFLIX.COM → netflix");
  t.eq(normalizeMerchant("Netflix"), "netflix", "Netflix → netflix");
  t.eq(normalizeMerchant("NETFLIX 1234"), "netflix", "NETFLIX 1234 → netflix (transaction number dropped)");
  t.eq(normalizeMerchant("Spotify"), "spotify", "Spotify → spotify");
  t.ok(normalizeMerchant("Netflix") !== normalizeMerchant("Spotify"), "distinct merchants stay distinct");

  // ── 1. Three monthly Netflix $19 → $19/mo, ONE subscription (not $57/3) ──────────────────────────
  {
    const txns = [sub("Netflix", 19, daysAgo(5)), sub("Netflix", 19, daysAgo(33)), sub("Netflix", 19, daysAgo(61))];
    const r = analyzeSubscriptions(txns, NOW);
    t.eq(r.monthlyTotal, 19,
         "three monthly $19 Netflix charges are ONE $19/mo sub — not $57 summed across the window");
    t.eq(r.activeCount, 1, "one distinct active merchant, not three transaction rows");
  }

  // ── 2. Netflix $19 + Spotify $12 + iCloud $4 → $35/mo, 3 subscriptions ───────────────────────────
  {
    const txns = [
      sub("Netflix", 19, daysAgo(4)),
      sub("Spotify", 12, daysAgo(8)),
      sub("Apple.com/Bill", 4, daysAgo(10)), // iCloud
    ];
    const r = analyzeSubscriptions(txns, NOW);
    t.eq(r.monthlyTotal, 35, "three distinct subs sum to $35/mo (19 + 12 + 4)");
    t.eq(r.activeCount, 3, "three distinct active merchants");
  }

  // ── 3. Duplicate merchant naming counts once ────────────────────────────────────────────────────
  {
    const txns = [
      sub("NETFLIX.COM", 19, daysAgo(3)),
      sub("Netflix", 19, daysAgo(31)),
      sub("NETFLIX 1234", 19, daysAgo(12)),
    ];
    const r = analyzeSubscriptions(txns, NOW);
    t.eq(r.activeCount, 1, "NETFLIX.COM / Netflix / NETFLIX 1234 are the SAME merchant → counted once");
    t.eq(r.monthlyTotal, 19, "…and estimated as one $19/mo sub");
  }

  // ── 4. A charge outside the active window isn't counted active ───────────────────────────────────
  {
    const txns = [
      sub("Netflix", 19, daysAgo(5)),                                     // active
      sub("OldGymApp", 40, daysAgo(SUBSCRIPTION_ACTIVE_WINDOW_DAYS + 20)), // last charge too old
    ];
    const r = analyzeSubscriptions(txns, NOW);
    t.eq(r.activeCount, 1, "a merchant whose last charge predates the window is NOT active");
    t.eq(r.monthlyTotal, 19, "…and its amount does not inflate the monthly total");
  }

  // ── 5. Multiple charges in one month don't inflate the estimate ─────────────────────────────────
  {
    // Two Netflix charges in the same recent month (e.g. a refund+recharge) — median, not sum.
    const txns = [sub("Netflix", 19, daysAgo(2)), sub("Netflix", 19, daysAgo(14))];
    const r = analyzeSubscriptions(txns, NOW);
    t.eq(r.monthlyTotal, 19, "two same-month charges still estimate $19/mo (median), never $38");
    t.eq(r.activeCount, 1, "still one merchant");
  }

  // ── 6. Empty / malformed data → no NaN, no false "/mo", no false count ──────────────────────────
  {
    const empty = analyzeSubscriptions([], NOW);
    t.eq(empty.monthlyTotal, 0, "no transactions → $0, not NaN");
    t.eq(empty.activeCount, 0, "no transactions → 0 active");

    t.eq(analyzeSubscriptions(null, NOW).monthlyTotal, 0, "null input → 0, no throw");
    t.eq(analyzeSubscriptions(undefined, NOW).activeCount, 0, "undefined input → 0 active");

    const malformed = [
      { name: "Netflix", amount: NaN, date: daysAgo(3), cat: "Subscriptions" },       // NaN amount
      { name: "Spotify", amount: 12, date: "not-a-date", cat: "Subscriptions" },       // bad date
      { name: "", amount: 10, date: daysAgo(3), cat: "Subscriptions" },                // empty merchant
      { name: "Groceries Co", amount: 50, date: daysAgo(3), cat: "Groceries" },        // not a subscription
      { name: "RealSub", amount: 15, date: daysAgo(3), cat: "Subscriptions" },         // the only valid one
    ];
    const r = analyzeSubscriptions(malformed, NOW);
    t.eq(r.monthlyTotal, 15, "malformed rows are skipped; only the one valid $15 sub counts (no NaN)");
    t.eq(r.activeCount, 1, "only the valid subscription is counted; the Groceries row is excluded");
    t.ok(Number.isFinite(r.monthlyTotal), "monthlyTotal is always a finite number");
  }

  // ── The 30% savings figure the badge uses is built off the CORRECTED total ──────────────────────
  {
    const txns = [sub("Netflix", 19, daysAgo(3)), sub("Netflix", 19, daysAgo(33)), sub("Spotify", 12, daysAgo(6))];
    const r = analyzeSubscriptions(txns, NOW);
    t.eq(r.monthlyTotal, 31, "corrected monthly total is $31 (Netflix 19 + Spotify 12), not a 90-day sum");
    t.eq(Math.round(r.monthlyTotal * 0.3), 9, "the 30% badge is ~$9/mo off the real $31, not off an inflated figure");
  }

  t.summary("subscriptions.test");
})();
