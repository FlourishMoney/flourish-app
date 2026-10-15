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
//   7. The proof script stays local. 0017 lives on PR #69's branch (this one, once merged from main) and is
//      not part of Monday's runbook.
//   8. The runbook (docs/ops/BILLING-DAY-OCT-26.md) runs the same three, in the same order, and every
//      SQL block it gives is read-only.
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
  const proof = ["run.sh", "seed.sql", "checks.sql", "checks-0017.sql", "local-shims.sql"].map(f => {
    const p = path.join(proofDir, f);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  });
  t.ok(proof.every(Boolean), "7a scripts/billing-day-proof has run.sh, seed.sql, checks.sql, checks-0017.sql and local-shims.sql");
  t.ok(/-U supabase_admin -d postgres/.test(proof[0]) && !/-h localhost[^\n]*supabase_admin|supabase_admin[^\n]*-h localhost/.test(proof[0]),
    "7a2 the local shims run as the container's own supabase_admin, over its socket");
  t.ok(!proof.some(s => /supabase\.co|pooler|SUPABASE_URL|SUPABASE_SECRET|DATABASE_URL/i.test(s)), "7b the proof names no production host, URL or key");
  t.ok(!/docker run[^\n]*\s-p\s/.test(proof[0]) && /trap cleanup EXIT/.test(proof[0]), "7c its container publishes no port and is removed on exit");
  t.ok(/git -C "\$REPO" show origin\/founding-test-rows:/.test(proof[0]) && !/git (checkout|switch|merge|rebase|push)/.test(proof[0]),
    "7d it reads the held 0017 with git show and never checks out, merges or pushes");
  t.ok(!proof.slice(1).some(s => /@(?!example\.test|getgrowsmart\.com)[a-z0-9-]+\.[a-z]/i.test(s)), "7e its addresses are made up (example.test, and the test domain)");
  // On main while PR #69 is held, 0017 was absent. This IS PR #69's branch: 0017 is here, once, and the
  // runbook still says Monday does not run it (8d). It reaches main only when Amanda merges #69 after her
  // dry run.
  t.eq(fs.readdirSync(MIG).filter(f => /^0017/.test(f)), ["0017_waitlist_founding_test_rows.sql"], "7f PR #69's branch: 0017 is here, exactly once (held from Monday's runbook, 8d)");

  // ── 8. the runbook (docs/ops/BILLING-DAY-OCT-26.md) says the same thing ───────────────────────────
  {
    const docPath = path.join(REPO, "docs", "ops", "BILLING-DAY-OCT-26.md");
    const doc = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf8") : "";
    t.ok(doc.length > 0, "8a docs/ops/BILLING-DAY-OCT-26.md exists");
    const runs = [...doc.matchAll(/^### 2\.\d Run `supabase\/migrations\/([0-9]{4})_[a-z_]+\.sql`/gm)].map(m => m[1]);
    t.eq(runs, ["0009", "0010", "0016"], "8b it runs 0009, then 0010, then 0016, and nothing else");
    for (const f of [M0009, M0010, M0016]) t.ok(fs.existsSync(path.join(MIG, f)) && doc.includes(`supabase/migrations/${f}`), `8c the file it names exists: ${f}`);
    t.ok(/\*\*Not\*\* 0017, \*\*not\*\* `waitlist_founding_start\(\)`/.test(doc), "8d it says not to run 0017 or waitlist_founding_start()");
    const blocks = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map(m => m[1]);
    t.ok(blocks.length >= 4, `8e it has a check for each migration (${blocks.length} SQL blocks)`);
    const WRITES = /\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|comment on|call|do)\b|waitlist_founding_start|waitlist_founding_mark_ended/i;
    // Quoted strings are arguments (has_table_privilege(..., 'INSERT')), not statements.
    t.eq(blocks.map((b, i) => (WRITES.test(code(b).replace(/'[^']*'/g, "''").replace(/\bupdated_at\b/g, "")) ? `block ${i + 1}` : null)).filter(Boolean), [],
      "8f every SQL block in it is read-only (select only; no write, no DDL, no founding function that writes)");
    t.ok(blocks.every(b => /^\s*select\b/i.test(b.replace(/--[^\n]*\n/g, ""))), "8g …each one starts with select");
    t.ok(!/@(?!flourishmoney\.app)[a-z0-9-]+\.[a-z]/i.test(blocks.join("\n")), "8h no SQL block holds an email address");
    t.ok(/curl -s -o \/dev\/null -w '%\{http_code\}\\n' -X POST https:\/\/flourishmoney\.app\/api\/billing/.test(doc), "8i it gives the no-secret on/off check (401 on, 404 off)");
    for (const h of ["## Monday, in order", "## 3. Turn billing on", "## 4. The first smoke purchase, and its refund", "## 5. Open signup",
      "## 6. The founding link email", "## 7. The first hour",
      "## 8. The stop condition, and turning billing off", "## 9. What cannot be undone once a real charge clears", "## 10. Holding 0017 (PR #69): what it means on Monday",
      "## 11. Reported, not fixed: what could stop a household paying, or getting what it paid for"]) {
      t.ok(doc.includes(h), `8j it has the section "${h.replace(/^## /, "")}"`);
    }
    t.ok(/create a new deploy/.test(doc) && /Trigger deploy/.test(doc), "8k it says a variable change needs a deploy (Netlify functions keep the values they were deployed with)");
    t.ok(!/sk_live_[A-Za-z0-9]|sk_test_[A-Za-z0-9]|whsec_[A-Za-z0-9]|re_[A-Za-z0-9]{8}|price_[A-Za-z0-9]{8}|eyJ[A-Za-z0-9]/.test(doc), "8l it holds no key, signing secret or price id");
    // Round 2: OPEN_SIGNUP is a numbered step with its own deploy, in the right place in Monday's order.
    const glance = (doc.match(/## Monday, in order\n([\s\S]*?)\n---/) || ["", ""])[1];
    const steps = [...glance.matchAll(/^(\d+)\. (.*)$/gm)].map(m => m[2]);
    const at = (rx) => steps.findIndex(x => rx.test(x));
    const order = [/^Run 0009/, /^Run 0010/, /^Run 0016/, /^Stripe pre-checks:/, /^`BILLING_ENABLED=true` and `STRIPE_TAX_ENABLED=true`/, /^Smoke purchase/, /^`OPEN_SIGNUP=true`/, /^`FOUNDING_LINK_EMAIL=true`/].map(at);
    t.ok(order.every(i => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]),
      "8m Monday, in order: 0009, 0010, 0016, the Stripe pre-checks (portal and tax), billing and tax on together, the smoke purchase, OPEN_SIGNUP, the founding link email");
    t.ok(/`OPEN_SIGNUP=true`, Production, Trigger deploy \(\*\*D2\*\*\)/.test(glance), "8n OPEN_SIGNUP comes with its own deploy (D2)");
    const signupSec = doc.slice(doc.indexOf("## 5. Open signup"), doc.indexOf("## 6. The founding link email"));
    t.ok(/add `OPEN_SIGNUP`, value exactly `true`/.test(signupSec) && /Trigger deploy → Deploy site/.test(signupSec) && /\{"action":"signup_status"\}/.test(signupSec),
      "8o section 5: the variable, its deploy, and a no-secret check that signup is open");
    t.ok(/\*\*Only after section 4 passed and signup is open \(section 5\):\*\*/.test(doc), "8p the founding link email waits for signup to be open");
  }

  t.summary("billingDayMigrations.test");
})();
