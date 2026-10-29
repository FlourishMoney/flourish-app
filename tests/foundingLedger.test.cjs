// tests/foundingLedger.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING 50: THE WIRING (migration 0025, Amanda's decision 2026-10-20; it replaces 0017 and 0021).
//
// tests/foundingLedger.sql.test.cjs runs the migration in a real Postgres. This checks, without one, that
// every reader goes through the one ledger, the one issuing rule and the one lookup:
//   1  the lookup waitlist_founding_number_for_email, and 0016's name is the same answer (kept: the founding
//      email names a number; since 2026-10-29 it no longer decides who may buy the founding price);
//   2  checkout (billing.js) gives founding_annual only through mayBuyFoundingPrice, which counts founding
//      seats (0029), never the ledger;
//   3  the waitlist form's "spots full" check counts the REAL holders; the landing count counts seats;
//   4  the waitlist trigger and confirmed accounts issue through one function, under 0014's lock, with one cap;
//   5  the migration never alters auth.users (Supabase's auth admin owns it), runs as one transaction, numbers
//      the confirmed accounts once, and carries its dry run, check and rollback.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

(async () => {
  const t = create();
  const M = read("supabase", "migrations", "0025_founding_ledger.sql");
  const M14 = read("supabase", "migrations", "0014_waitlist_founding.sql");
  const body = M.slice(M.indexOf("\nbegin;\n"), M.indexOf("\ncommit;\n") + 9);        // the SQL, past the header, before the footer
  const fnBody = (name) => { const i = body.indexOf(`function public.${name}(`); return i < 0 ? "" : body.slice(i, body.indexOf("$$;", body.indexOf("$$", i) + 2)); };

  // 1. The lookup.
  const lookup = fnBody("waitlist_founding_number_for_email");
  t.ok(/returns integer\s+language sql\s+stable\s+security invoker/.test(lookup), "1a the lookup is SECURITY INVOKER, like 0016's");
  t.ok(/l\.void_at is null/.test(lookup) && /l\.ended_at is null/.test(lookup) && /waitlist_is_test_email\(p_email\)/.test(lookup) && /t\.is_test/.test(lookup),
    "1b it requires a number that is not void and has not ended, and not a test address or test row");
  t.ok(/or l\.user_id is not null/.test(lookup), "1c …held by a live waitlist row OR recorded against an account");
  t.ok(/select public\.waitlist_founding_number_for_email\(p_email\);/.test(fnBody("waitlist_founding_position_for_email")), "1d 0016's name answers the same");
  const cohort = read("netlify", "functions", "_lib", "foundingCohort.js");
  t.ok(/admin\.rpc\("waitlist_founding_number_for_email"/.test(cohort), "1e foundingPositionForEmail still calls that lookup by name");

  // 2. Checkout.
  const billing = read("netlify", "functions", "billing.js");
  t.ok(/if \(planKey === "founding_annual" && !\(await mayBuyFoundingPrice\(admin, user_id, user\)\)\)/.test(billing),
    "2a checkout refuses founding_annual unless mayBuyFoundingPrice says so");
  const rule = cohort.slice(cohort.indexOf("async function mayBuyFoundingPrice"), cohort.indexOf("module.exports"));
  t.ok(/const held = await seatsTaken\(admin\);\s+return held !== null && held < FOUNDING_COHORT_LIMIT;/.test(rule) && /emailConfirmed\(user\)/.test(rule) && !/foundingPositionForEmail/.test(rule),
    "2b …which needs a confirmed address and fewer than 50 seats held, and never the ledger");

  // 3. One count: the real holders.
  t.ok(/\/rest\/v1\/rpc\/founding_seats_taken/.test(read("netlify", "functions", "founding.js")) && !/waitlist_founding_ledger/.test(read("netlify", "functions", "founding.js")),
    "3a /api/founding counts founding seats (0029), not the ledger");
  t.ok(/\/rest\/v1\/waitlist_founding_ledger\?select=position&void_at=is\.null/.test(read("netlify", "functions", "beta.js")), "3b the waitlist form's spots-full check counts the same");
  t.ok(/insert into public\.waitlist_founding_ledger \(position, email_key, source, user_id\)/.test(fnBody("founding_issue_for_key")), "3c accounts' numbers are rows in that same ledger");

  // 4. One rule, one lock, one cap.
  const lockKey = "pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'))";
  t.ok(M14.includes(lockKey) && fnBody("founding_issue_for_key").includes(lockKey) && fnBody("founding_accounts_start").includes(lockKey),
    "4a the issuing rule and the start take the same advisory lock as 0014's waitlist trigger");
  t.ok(/public\.founding_issue_for_key\(k, 'waitlist', null\)/.test(fnBody("waitlist_assign_founding_position"))
    && /public\.founding_issue_for_key\(k, 'account', p_user_id\)/.test(fnBody("founding_issue_for_account")),
    "4b the waitlist trigger and confirmed accounts both issue through founding_issue_for_key");
  t.eq((body.match(/insert into public\.waitlist_founding_ledger/g) || []).length, 1, "4c …the only place a number is ever written");
  t.ok(/where p\.user_id = p_user_id and p\.founder_flag/.test(fnBody("founding_issue_for_account")) && /founding_is_beta_founder_key\(p_key\)/.test(fnBody("founding_issue_for_key")),
    "4d beta founders never take a number, by account or by address");

  // 5. Safe to run in Supabase, once, with its proof.
  t.ok(!/alter table auth\.users/i.test(body) && /create trigger founding_account_confirmed\s+after insert or update of email_confirmed_at on auth\.users/.test(body),
    "5a it creates a trigger on auth.users and never alters that table (only its owner, Supabase's auth admin, may)");
  t.ok(/if not exists \(select 1 from public\.founding_settings where accounts_started_at is not null\) then\s+return new;/.test(fnBody("founding_on_account_confirmed")),
    "5b the trigger does nothing until founding_settings says accounts take seats");
  t.ok(/raise exception 'founding_accounts_start\(\) has already run/.test(body) && /update public\.founding_settings set accounts_started_at = now\(\) where id;/.test(fnBody("founding_accounts_start")),
    "5c founding_accounts_start() runs once, and it is what turns the trigger's work on");
  t.ok(/if not exists \(select 1 from public\.founding_settings where accounts_started_at is not null\) then\s+perform public\.founding_accounts_start\(\);/.test(body),
    "5d the migration runs it, once: a second run of the file skips it");
  t.ok(body.startsWith("\nbegin;\n") && body.trimEnd().endsWith("commit;"), "5e the migration is one transaction");
  t.eq((body.match(/\bdrop\s+(table|column|function|trigger)\b/gi) || []).length, 0, "5f the migration drops nothing (the drops are in the commented rollback only)");
  t.ok(/-- READ-ONLY DRY RUN/.test(M) && /-- READ-ONLY CHECK AFTERWARDS/.test(M) && /-- ROLLBACK/.test(M), "5g the footer carries the dry run, the check and the rollback");
  t.ok(!/@[a-z0-9-]+\.(ca|com|net|org)\b/i.test(M.replace(/getgrowsmart\\?\.com|flourishmoney\\?\.app/g, "")), "5h no household's address is written in the migration");
  t.eq(fs.readdirSync(path.join(ROOT, "supabase", "migrations")).filter((f) => /^00(17|21)_/.test(f)), [], "5i 0017 and 0021 are gone: one founding migration");

  t.summary("foundingLedger.test");
})();
