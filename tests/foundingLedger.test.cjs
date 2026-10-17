// tests/foundingLedger.test.cjs
// -----------------------------------------------------------------------------
// ONE LEDGER OF 50 FOUNDING POSITIONS: THE WIRING (migration 0021, founder's decision 2026-10-17).
//
// tests/foundingLedger.sql.test.cjs runs the migration in a real Postgres. This checks, without one, that
// every reader goes through the one ledger and the one lookup:
//   1  0021 replaces waitlist_founding_position_for_email in place (same signature, SECURITY INVOKER), so
//      checkout, the founding link sweep and the confirm flow all read accounts' numbers with no code change;
//   2  checkout (billing.js) gives founding_annual only through mayBuyFoundingPrice, which asks that lookup;
//   3  the landing count (/api/founding) and the waitlist form's "spots full" check count that ledger;
//   4  the migration is additive, its trigger starts disabled, and it carries its apply steps and rollback;
//   5  the account path uses 0014's advisory lock, so a confirmation and a waitlist join queue on one lock.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

(async () => {
  const t = create();
  const M = read("supabase", "migrations", "0021_founding_ledger_accounts.sql");
  const M14 = read("supabase", "migrations", "0014_waitlist_founding.sql");
  const body = M.slice(M.indexOf("-- grants: service_role only\n"));        // the SQL, past the header

  // 1. The lookup, replaced in place.
  t.ok(/create or replace function public\.waitlist_founding_position_for_email\(p_email text\)\s+returns integer\s+language sql\s+stable\s+security invoker/.test(body),
    "1a 0021 replaces the lookup with the same name, signature and SECURITY INVOKER as 0016");
  const lookup = body.slice(body.indexOf("create or replace function public.waitlist_founding_position_for_email"));
  t.ok(/l\.ended_at is null/.test(lookup) && /l\.position between 1 and 50/.test(lookup) && /founding_test_address\(p_email\)/.test(lookup) && /t\.is_test/.test(lookup),
    "1b …and it still requires a number that has not ended, 1 to 50, not a test address or test row");
  t.ok(/or l\.user_id is not null/.test(lookup), "1c …held by a live waitlist row OR recorded against an account (the new way in)");
  const cohort = read("netlify", "functions", "_lib", "foundingCohort.js");
  t.ok(/admin\.rpc\("waitlist_founding_position_for_email"/.test(cohort), "1d the cohort rule calls that lookup by name, so no caller changes");

  // 2. Checkout.
  const billing = read("netlify", "functions", "billing.js");
  t.ok(/if \(planKey === "founding_annual" && !\(await mayBuyFoundingPrice\(admin, user_id, user\)\)\)/.test(billing),
    "2a checkout refuses founding_annual unless mayBuyFoundingPrice says this household holds a position");
  t.ok(/return \(await foundingPositionForEmail\(admin, user\.email\)\) !== null;/.test(cohort) && /emailVerifiedByLink\(user\)/.test(cohort),
    "2b …which needs the address confirmed by our link and a position from the lookup");

  // 3. One count.
  t.ok(/\/rest\/v1\/waitlist_founding_ledger\?select=position/.test(read("netlify", "functions", "founding.js")), "3a /api/founding counts the ledger");
  t.ok(/\/rest\/v1\/waitlist_founding_ledger\?select=position/.test(read("netlify", "functions", "beta.js")), "3b the waitlist form's spots-full check counts the same ledger");
  t.ok(/insert into public\.waitlist_founding_ledger \(position, email_key, source, user_id\)/.test(body), "3c accounts' numbers are rows in that same ledger");

  // 4. Additive, disabled until started, documented.
  t.eq((body.match(/\bdrop\s+(table|column|function|trigger)\b/gi) || []).length, 0, "4a the migration drops nothing (the drops are in the commented rollback only)");
  t.ok(/alter table auth\.users disable trigger founding_account_confirmed;/.test(body) && /alter table auth\.users enable trigger founding_account_confirmed;/.test(body),
    "4b the trigger is created disabled and only founding_accounts_start() enables it");
  t.ok(/raise exception 'founding_accounts_start\(\) has already run/.test(body), "4c start() runs once");
  t.ok(/-- TO APPLY/.test(M) && /-- ROLLBACK/.test(M) && /select public\.founding_accounts_start\(\);/.test(M), "4d the header carries the apply steps and the rollback");
  t.ok(!/@[a-z0-9-]+\.(ca|com|net|org)\b/i.test(M.replace(/getgrowsmart\\?\.com|flourishmoney\\?\.app/g, "")), "4e no household's address is written in the migration");

  // 5. One lock.
  const lockKey = "pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'))";
  t.ok(M14.includes(lockKey) && body.includes(lockKey), "5a accounts take the same advisory lock as 0014's waitlist trigger");
  t.ok(/select count\(\*\) into issued from public\.waitlist_founding_ledger;\s+if issued >= 50 then/.test(body) && /select count\(\*\) into issued from public\.waitlist_founding_ledger;\s+if issued >= 50 then/.test(M14),
    "5b …and the same rule: the next number is the ledger's count plus one, none once 50 are issued");

  t.summary("foundingLedger.test");
})();
