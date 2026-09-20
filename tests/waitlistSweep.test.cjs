// tests/waitlistSweep.test.cjs
// -----------------------------------------------------------------------------
// THE SWEEP IS WHAT GUARANTEES THE EMAIL. The request path is best effort: a send can fail, time out,
// or be skipped entirely (an insert that timed out but committed sends nothing at all), and a retry
// cannot fix it, because the unique constraint turns the retry into "already joined", which also sends
// nothing. Every 15 minutes this function picks up whatever was missed.
//
// What it must get right, in the order it matters:
//   1. It emails ONLY rows that are still unwelcomed and old enough not to race the request path.
//   2. It cannot exhaust a shared free tier: a per-run cap AND a rolling 24-hour ceiling.
//   3. It finishes inside Netlify's 30s scheduled limit: it stops starting sends at 20s.
//   4. It sends the SAME message with the SAME idempotency key as the request path, then marks the row.
//   5. With no RESEND_API_KEY it does nothing at all, and it never logs an address.
//
// It runs the REAL handler and the real shared send module with global fetch stubbed. The budget and
// caps are exercised with small injected values rather than by waiting out the real ones, and the real
// ones are asserted to be the numbers the brief specified.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");

const SWEEP = path.join(__dirname, "..", "netlify", "functions", "waitlist-sweep.js");
const KEY_NAME = ["RESEND", "API", "KEY"].join("_");
const KEY_SENTINEL = "re_TESTONLY_thisisnotarealkey";
const HOUR = 60 * 60 * 1000;

// Build `n` pending rows, oldest first, each older than the 5-minute floor.
const pendingRows = (n, startId = 1) => Array.from({ length: n }, (_, i) => ({
  id: startId + i,
  email: `person${startId + i}@example.com`,
  created_at: new Date(Date.now() - HOUR - i * 1000).toISOString(),
}));

// Run the real sweep against a stubbed Supabase and Resend.
//   count   — what the rolling 24h count returns (a number, or {fail:…} / {noHeader:true})
//   rows    — what the pending select returns, or {fail:status}
//   resend  — per-call outcome: ok, a status, or {slowMs} to make each send take time
async function run({ count = 0, rows = pendingRows(3), resend = { ok: true }, withKey = true, opts = {}, viaHandler = false } = {}) {
  const calls = [];
  const logs = [];
  const realFetch = global.fetch;
  const realError = console.error, realLog = console.log, realWarn = console.warn;
  const capture = (...args) => logs.push(args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));

  const prevKey = process.env[KEY_NAME];
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  if (withKey) process.env[KEY_NAME] = KEY_SENTINEL; else delete process.env[KEY_NAME];

  global.fetch = async (url, o = {}) => {
    const u = String(url);
    calls.push({ url: u, method: o.method || "GET", headers: o.headers || {}, body: o.body, signal: o.signal });

    if (u.includes("api.resend.com")) {
      if (resend.slowMs) await new Promise(r => setTimeout(r, resend.slowMs));
      return { ok: resend.ok !== false, status: resend.status || 200, json: async () => ({}), text: async () => "" };
    }
    if (o.method === "PATCH") return { ok: true, status: 204, json: async () => ({}), text: async () => "" };
    // The 24h count read asks for count=exact and reads content-range.
    if ((o.headers || {}).Prefer === "count=exact") {
      if (count && count.fail) return { ok: false, status: count.fail, headers: { get: () => null }, json: async () => [] };
      const header = count && count.noHeader ? null : `0-0/${typeof count === "number" ? count : 0}`;
      return { ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === "content-range" ? header : null) }, json: async () => [] };
    }
    // The pending select.
    if (rows && rows.fail) return { ok: false, status: rows.fail, json: async () => [], text: async () => "" };
    return { ok: true, status: 200, json: async () => rows, text: async () => "" };
  };
  console.error = capture; console.log = capture; console.warn = capture;

  let result, res;
  try {
    delete require.cache[require.resolve(SWEEP)];
    const mod = require(SWEEP);
    if (viaHandler) {
      res = await mod.handler({});
      result = JSON.parse(res.body);
    } else {
      result = await mod.runSweep(opts);
    }
  } finally {
    global.fetch = realFetch;
    console.error = realError; console.log = realLog; console.warn = realWarn;
    if (prevKey === undefined) delete process.env[KEY_NAME]; else process.env[KEY_NAME] = prevKey;
  }

  const sends = calls.filter(c => c.url.includes("api.resend.com"));
  return {
    result, res, calls, logs, sends,
    selects: calls.filter(c => c.method === "GET" && !c.url.includes("api.resend.com") && (c.headers || {}).Prefer !== "count=exact"),
    patches: calls.filter(c => c.method === "PATCH"),
    keys: sends.map(s => s.headers["Idempotency-Key"]),
    recipients: sends.map(s => JSON.parse(s.body).to[0]),
  };
}

(async () => {
  const t = create();
  const mod = require(SWEEP);

  // ── 1. The production numbers are the ones that were agreed ────────────────────────────────
  {
    t.eq(mod.PER_RUN_CAP, 25, "1a at most 25 sends per run");
    t.eq(mod.RUN_BUDGET_MS, 20000, "1b new sends stop after 20s, inside Netlify's 30s scheduled limit");
    t.eq(mod.MIN_AGE_MS, 5 * 60 * 1000, "1c a row must be 5 minutes old before the sweep touches it");
    t.eq(mod.DAILY_CAP, 50, "1d a rolling 24-hour ceiling, because 96 runs a day at 25 each would be 2,400 emails");
    t.ok(mod.DAILY_CAP < 100, "1e …and it stays under the Resend free tier of 100 a day, which GrowSmart shares");
  }

  // ── 2. It asks for the right rows ──────────────────────────────────────────────────────────
  {
    const r = await run({ rows: pendingRows(2) });
    t.eq(r.selects.length, 1, "2a one select for the pending rows");
    const u = r.selects[0].url;
    t.ok(u.includes("welcomed_at=is.null"), "2b only rows that were never welcomed");
    t.ok(/created_at=lt\./.test(u), "2c only rows older than the age floor, so it never races the request path");
    t.ok(u.includes("order=created_at.asc"), "2d oldest first, so nobody is left behind while newer signups jump the queue");
    t.ok(u.includes("limit=25"), "2e no more than the per-run cap is even fetched");
    t.ok(!!r.selects[0].signal, "2f the read carries an abort signal");
    const cutoff = Date.parse(decodeURIComponent((/created_at=lt\.([^&]+)/.exec(u) || [])[1]));
    const age = Date.now() - cutoff;
    t.ok(age >= 4.5 * 60 * 1000 && age <= 6 * 60 * 1000, `2g the cutoff really is about 5 minutes ago (it is ${Math.round(age / 1000)}s)`);
  }

  // ── 3. It sends the same message, keyed the same way, and marks the row ────────────────────
  {
    const rows = pendingRows(3);
    const r = await run({ rows });
    t.eq(r.sends.length, 3, "3a one send per pending row");
    t.eq(r.recipients.join(","), rows.map(x => x.email).join(","), "3b …to those rows' addresses, oldest first");
    t.eq(r.keys.join(","), rows.map(x => `waitlist-welcome/${x.id}`).join(","),
      "3c …with the SAME idempotency key the request path uses, so a row already emailed there cannot be emailed twice");
    t.eq(r.patches.length, 3, "3d each successful send stamps welcomed_at");
    t.ok(r.patches.every((p, i) => p.url.includes(`id=eq.${rows[i].id}`)), "3e …on that row, by id");
    const body = JSON.parse(r.sends[0].body);
    const lib = require(path.join(__dirname, "..", "netlify", "functions", "_lib", "waitlistWelcome.js"));
    t.eq(body.text, lib.WELCOME_TEXT, "3f the body is the shared copy, not a second version of it");
    t.eq(body.subject, lib.WELCOME_SUBJECT, "3g …with the shared subject");
    t.eq(r.result.sent, 3, "3h the run reports what it sent");
  }

  // ── 4. A send that fails leaves the row for the next run ───────────────────────────────────
  {
    const r = await run({ rows: pendingRows(2), resend: { ok: false, status: 500 } });
    t.eq(r.sends.length, 2, "4a it still tries every row");
    t.eq(r.patches.length, 0, "4b …but stamps welcomed_at on none of them, so the next run picks them up again");
    t.eq(r.result.failed, 2, "4c and reports them as failed");
    t.eq(r.result.sent, 0, "4d …not as sent");
  }

  // ── 5. Caps: per run, and the rolling 24-hour ceiling ──────────────────────────────────────
  {
    const many = await run({ rows: pendingRows(40) });
    t.eq(many.sends.length, 25, "5a even if the database returns more rows than asked for, only the cap is sent");

    const nearCap = await run({ count: 48, rows: pendingRows(25) });
    t.eq(nearCap.sends.length, 2, "5b with 48 of the 50 daily ceiling used, only 2 more go out");
    t.ok(nearCap.selects[0].url.includes("limit=2"), "5c …and only 2 rows are even fetched");

    const atCap = await run({ count: 50, rows: pendingRows(25) });
    t.eq(atCap.sends.length, 0, "5d at the ceiling nothing is sent");
    t.eq(atCap.result.skipped, "daily_cap_reached", "5e …and the run says why");

    const overCap = await run({ count: 90, rows: pendingRows(5) });
    t.eq(overCap.sends.length, 0, "5f past the ceiling (a busy day on the shared account) nothing is sent");

    // If the ceiling cannot be read there is no ceiling, so the run stops rather than sending blind.
    const noCount = await run({ count: { fail: 500 }, rows: pendingRows(5) });
    t.eq(noCount.sends.length, 0, "5g a count read that fails stops the run: no ceiling means no sending");
    t.eq(noCount.result.skipped, "daily_count_unreadable", "5h …and says so");
    const noHeader = await run({ count: { noHeader: true }, rows: pendingRows(5) });
    t.eq(noHeader.sends.length, 0, "5i a missing count header does the same");
  }

  // ── 6. The time budget stops it starting new sends ─────────────────────────────────────────
  // Exercised with small values: 4 rows, each send taking 40ms, and a 60ms budget.
  {
    const r = await run({ rows: pendingRows(4), resend: { ok: true, slowMs: 40 }, opts: { budgetMs: 60 } });
    t.ok(r.sends.length < 4, `6a it stops starting sends once the budget is gone (sent ${r.sends.length} of 4)`);
    t.ok(r.sends.length >= 1, "6b …after sending what it had time for");
    t.eq(r.result.stoppedEarly, true, "6c and the run reports that it stopped early");
    t.eq(r.patches.length, r.sends.length, "6d every send it did start was marked");
    // The rows it did not reach keep welcomed_at null, so the next run takes them.
    t.ok(r.result.sent + r.result.failed < 4, "6e the rest are left for the next run, still unwelcomed");
  }

  // ── 7. No key, no work ─────────────────────────────────────────────────────────────────────
  {
    const r = await run({ withKey: false, rows: pendingRows(5) });
    t.eq(r.calls.length, 0, "7a with no key it makes no request at all: it does not even read the table");
    t.eq(r.result.skipped, "no_api_key", "7b …and says why");
    t.eq(r.logs.join("|"), "", "7c …silently");
  }

  // ── 8. A select that fails sends nothing ───────────────────────────────────────────────────
  {
    // A 400 is what a missing created_at or id column looks like, which is the case the migration's
    // check queries exist to rule out before this ships.
    const r = await run({ rows: { fail: 400 } });
    t.eq(r.sends.length, 0, "8a a failed select sends nothing");
    t.eq(r.result.skipped, "select_failed", "8b …and says why");
    t.ok(/pending select failed/.test(r.logs.join("|")) && /\b400\b/.test(r.logs.join("|")), "8c …logging the status");
  }

  // ── 9. Nothing sensitive is ever logged ────────────────────────────────────────────────────
  {
    const runs = [
      await run({ rows: pendingRows(3) }),
      await run({ rows: pendingRows(2), resend: { ok: false, status: 422 } }),
      await run({ count: 50 }),
      await run({ rows: { fail: 400 } }),
      await run({ count: { fail: 503 } }),
    ];
    const all = runs.map(r => r.logs.join("|")).join("|");
    t.ok(!/@example\.com/.test(all), "9a no log line contains an address");
    t.ok(!all.includes(KEY_SENTINEL), "9b no log line contains the key");
    t.ok(!/Bearer|test-service-role/i.test(all), "9c no log line contains a credential header");
    t.ok(!all.includes("Thanks for joining"), "9d no log line contains the message body");
    t.ok(!/waitlist\?|welcomed_at=is\.null|id=eq\./.test(all), "9e no log line contains a request URL");
    t.ok(/considered/.test(all) && /sent/.test(all), "9f the summary line is counts only, and it is there");
    const viaHandler = await run({ rows: pendingRows(3), viaHandler: true });
    t.eq(viaHandler.sends.length, 3, "9g the scheduled entry point does the same work as runSweep");
    t.eq(JSON.parse(viaHandler.res.body).sent, 3, "9h …and returns the same counts");
  }

  t.summary("waitlistSweep.test");
})();
