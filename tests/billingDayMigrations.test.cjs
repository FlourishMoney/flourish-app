// tests/billingDayMigrations.test.cjs
// -----------------------------------------------------------------------------
// MONDAY'S THREE MIGRATIONS (2026-10-26): 0009, then 0010, then 0016, against production as it is.
//
// Production has 0014 and 0015 applied and waitlist_founding_start() already run once; it does not
// have public.subscriptions (0009 and 0010 were never applied) and does not have 0017 (PR #69, held).
// scripts/billing-day-proof/run.sh proves the order on a throwaway Postgres seeded to that shape. This
// file pins the same facts offline, in the gate, so an edit to any of the three that would change
// Monday's answer fails here first:
//   1. Order. 0016 alters public.subscriptions, so 0009 must come first. 0010 needs neither.
//   2. Nothing destructive: no drop, delete, truncate, rename or type change in any of the three. (Their
//      foreign keys say "on delete cascade" / "on delete set null": what happens when an account is
//      deleted later, not a statement the migration runs.)
//   3. No founding number moves: nothing writes founding_position or inserts into or deletes from the
//      ledger. The only ledger write is 0016's mark_ended, which stamps ended_at once.
//   4. 0016's one data statement marks at most the 2026-10-06 check row as a test row, by md5.
//   5. 0016's lookup fails closed: test rows, ended numbers, blank addresses and anything outside 1 to 50
//      get null.
//   6. Grants: every new table has RLS and a service_role grant in its own file; every new function
//      is revoked from PUBLIC, anon and authenticated and granted to the service role only.
//   7. The proof script stays local, and 0017 is not on this branch.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const MIG = path.join(REPO, "supabase", "migrations");
const read = (f) => fs.readFileSync(path.join(MIG, f), "utf8");
// The SQL a file runs, with its comments removed (the comments talk about deleting accounts).
const code = (sql) => sql.replace(/--[^\n]*/g, "").toLowerCase();

const M0009 = "0009_billing_subscriptions.sql";
const M0010 = "0010_billing_events.sql";
const M0016 = "0016_waitlist_founding_billing.sql";

(() => {
  const t = create();
  const sql = { [M0009]: code(read(M0009)), [M0010]: code(read(M0010)), [M0016]: code(read(M0016)) };

  // ── 1. order ──────────────────────────────────────────────────────────────────────────────────
  t.ok(/alter table public\.subscriptions add column/.test(sql[M0016]), "1a 0016 alters public.subscriptions, so 0009 must run first");
  t.ok(/create table if not exists public\.subscriptions/.test(sql[M0009]), "1b 0009 is what creates it");
  t.ok(!/public\.subscriptions/.test(sql[M0010]), "1c 0010 does not touch subscriptions: it may run before or after 0009");
  t.ok(!/waitlist/.test(sql[M0009]) && !/waitlist/.test(sql[M0010]), "1d 0009 and 0010 never touch the waitlist or the ledger");
  t.ok(/waitlist_email_key\(/.test(sql[M0016]) && /waitlist_founding_ledger/.test(sql[M0016]),
    "1e 0016 needs 0014's ledger and address key, which production already has");

  // ── 2. nothing destructive ───────────────────────────────────────────────────────────────────────
  for (const [f, s] of Object.entries(sql)) {
    for (const [rx, what] of [[/\bdrop\b/, "drop"], [/\bdelete from\b/, "delete"], [/\btruncate\b/, "truncate"], [/\brename\b/, "rename"], [/\balter column\b/, "alter column"]]) {
      t.ok(!rx.test(s), `2 ${f} runs no ${what}`);
    }
  }

  // ── 3. no founding number moves ─────────────────────────────────────────────────────────────────
  for (const [f, s] of Object.entries(sql)) {
    t.ok(!/founding_position\s*=/.test(s.replace(/w\.founding_position\s*=\s*l\.position/g, "")), `3a ${f} writes no founding_position`);
    t.ok(!/insert into public\.waitlist_founding_ledger/.test(s), `3b ${f} issues no number`);
  }
  const ledgerWrites = sql[M0016].match(/update public\.waitlist_founding_ledger[\s\S]*?;/g) || [];
  t.eq(ledgerWrites.length, 1, "3c 0016 has exactly one ledger write");
  t.ok(/set ended_at = now\(\)[\s\S]*and ended_at is null/.test(ledgerWrites[0] || ""), "3d …it stamps ended_at, and only where it is not already set");
  t.ok(!/position\s*=/.test((ledgerWrites[0] || "").replace(/^update[^\n]*\n/, "")), "3e …and never changes a position");

  // ── 4. 0016's one data statement ─────────────────────────────────────────────────────────────────
  const waitlistWrites = sql[M0016].match(/update public\.waitlist\s[\s\S]*?;/g) || [];
  t.eq(waitlistWrites.length, 1, "4a 0016 updates the waitlist in one statement");
  t.ok(/set is_test = true/.test(waitlistWrites[0] || ""), "4b …which only marks a test row");
  t.ok(/where public\.waitlist_email_key\(email\) = '[0-9a-f]{32}'/.test(waitlistWrites[0] || ""),
    "4c …matched by one md5 address key, so no address is in the file");
  t.ok(!/@/.test(read(M0016)), "4d 0016 contains no email address");

  // ── 5. the lookup fails closed ───────────────────────────────────────────────────────────────────
  const lookup = (sql[M0016].match(/function public\.waitlist_founding_position_for_email[\s\S]*?\$\$;/) || [""])[0];
  for (const [rx, what] of [
    [/and l\.ended_at is null/, "an ended number"],
    [/and not w\.is_test/, "a test row"],
    [/l\.position between 1 and 50/, "a number outside 1 to 50"],
    [/coalesce\(p_email, ''\) !~ '\^\\s\*\$'/, "a blank address"],
    [/w\.founding_position = l\.position/, "a number no row holds (a deleted row)"],
  ]) t.ok(rx.test(lookup), `5 the lookup returns null for ${what}`);
  t.ok(/security invoker/.test(lookup) && /returns integer/.test(lookup), "5f the lookup reads as its caller and returns a number or null");

  // ── 6. grants in their own files ─────────────────────────────────────────────────────────────────
  for (const [f, table] of [[M0009, "subscriptions"], [M0010, "billing_events"]]) {
    t.ok(new RegExp(`alter table public\\.${table} enable row level security`).test(sql[f]), `6a ${f} turns RLS on for ${table}`);
    t.ok(new RegExp(`grant all privileges\\s+on table public\\.${table} to service_role`).test(sql[f]), `6b ${f} grants ${table} to the service role`);
    t.ok(!new RegExp(`grant[^;]*on table public\\.${table} to anon`).test(sql[f]), `6c ${f} grants ${table} nothing to anon`);
  }
  t.ok(/grant select\s+on table public\.subscriptions to authenticated/.test(sql[M0009]), "6d a signed-in client may only read subscriptions (RLS: its own row)");
  t.ok(!/to authenticated/.test(sql[M0010]), "6e billing_events grants nothing to authenticated");
  for (const fn of ["waitlist_founding_position_for_email(text)", "waitlist_founding_mark_ended(text)"]) {
    const esc = fn.replace(/[()]/g, "\\$&");
    t.ok(new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated`).test(sql[M0016]), `6f ${fn}: revoked from PUBLIC, anon and authenticated`);
    t.ok(new RegExp(`grant execute on function public\\.${esc} to service_role`).test(sql[M0016]), `6g ${fn}: the service role may call it`);
  }

  // ── 7. the proof stays local; 0017 is not here ───────────────────────────────────────────────────
  const proofDir = path.join(REPO, "scripts", "billing-day-proof");
  const proof = ["run.sh", "seed.sql", "checks.sql", "checks-0017.sql"].map(f => {
    const p = path.join(proofDir, f);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  });
  t.ok(proof.every(Boolean), "7a scripts/billing-day-proof has run.sh, seed.sql, checks.sql and checks-0017.sql");
  t.ok(!proof.some(s => /supabase\.co|pooler|SUPABASE_URL|SUPABASE_SECRET|DATABASE_URL/i.test(s)), "7b the proof names no production host, URL or key");
  t.ok(!/docker run[^\n]*\s-p\s/.test(proof[0]) && /trap cleanup EXIT/.test(proof[0]), "7c its container publishes no port and is removed on exit");
  t.ok(/git -C "\$REPO" show origin\/founding-test-rows:/.test(proof[0]) && !/git (checkout|switch|merge|rebase|push)/.test(proof[0]),
    "7d it reads the held 0017 with git show and never checks out, merges or pushes");
  t.ok(!proof.slice(1).some(s => /@(?!example\.test|getgrowsmart\.com)[a-z0-9-]+\.[a-z]/i.test(s)), "7e its addresses are made up (example.test, and the test domain)");
  t.ok(!fs.readdirSync(MIG).some(f => /^0017/.test(f)), "7f 0017 is not on this branch (PR #69 holds it)");

  t.summary("billingDayMigrations.test");
})();
