#!/usr/bin/env bash
# scripts/billing-day-proof/run.sh
# -----------------------------------------------------------------------------
# PROVES MONDAY'S MIGRATION ORDER (0009, then 0010, then 0016) ON A THROWAWAY LOCAL DATABASE.
#
# Never connects to production. It starts the Supabase Postgres image (17.6.1.167, the one 0015 was
# checked against) in a container with NO published port, builds production's shape of 2026-10-14
# (seed.sql: 16 rows holding 1 to 15 and 22, 28 ledger numbers, made-up addresses), and removes the
# container on exit, pass or fail.
#
# Each migration is sent as ONE query, which is how the Supabase SQL editor sends a pasted file: Postgres
# then runs it as one transaction, so the first error undoes the whole file.
#
#   scripts/billing-day-proof/run.sh              the Monday order, every check in checks.sql
#   scripts/billing-day-proof/run.sh --with-0017  then the HELD 0017, read from origin/founding-test-rows
#                                                 with git show (never checked out), and checks-0017.sql
# Needs Docker. Exit status 0 only when every assertion passed.
# -----------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIG="$REPO/supabase/migrations"
IMAGE="public.ecr.aws/supabase/postgres:17.6.1.167"
NAME="flourish-billing-proof-$$"
WITH_0017=0
[ "${1:-}" = "--with-0017" ] && WITH_0017=1

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql_file() { docker exec -i "$NAME" psql -U postgres -h localhost -q -v ON_ERROR_STOP=1 "$@"; }
# One file as ONE query, the SQL editor's way.
as_one_query() { docker exec "$NAME" psql -U postgres -h localhost -q -v ON_ERROR_STOP=1 -c "$(cat "$1")" >/dev/null 2>&1; }
# A checks file passes only when psql exits 0 AND it reached its last line. Otherwise the failed assertion
# is printed and the run stops with status 1.
run_checks() {
  local out
  if out="$(psql_file < "$1" 2>&1)" && printf '%s' "$out" | grep -q "every assertion passed"; then
    echo "   $(basename "$1"): every assertion passed"
  else
    printf '%s\n' "$out" | grep -E "ERROR|CONTEXT" | head -4
    echo "   FAIL: $(basename "$1")"; exit 1
  fi
}

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=throwaway-local-only "$IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
sleep 4   # the image runs its own init scripts after it first accepts connections

echo "1. production's shape: the migrations production has, then seed.sql"
for f in 00000_waitlist.sql 00001_plaid_items.sql 0001_profiles.sql 0002_profiles_guard.sql \
         0003_founder_grandfather.sql 0004_plaid_cursor.sql 0005_z3_ai_consent_beta_seats.sql \
         0006_waitlist_welcomed_at.sql 0007_trial_only_signups.sql 0008_coach_usage_weekly.sql \
         0011_meeting_records.sql 0012_waitlist_consent.sql 0014_waitlist_founding.sql 0015_waitlist_founding_grants.sql; do
  psql_file -1 < "$MIG/$f" >/dev/null 2>&1
done
psql_file < "$HERE/seed.sql" >/dev/null
echo "   16 rows holding 1-15 and 22, 28 ledger numbers"

echo "2. the wrong order: 0016 before 0009 must fail and change nothing"
if as_one_query "$MIG/0016_waitlist_founding_billing.sql"; then
  echo "   FAIL: 0016 ran without public.subscriptions"; exit 1
fi
psql_file -At -c "do \$\$ begin
  assert to_regprocedure('public.waitlist_founding_position_for_email(text)') is null, 'wrong order left the lookup behind';
  assert not exists (select 1 from information_schema.columns where table_name = 'waitlist_founding_ledger' and column_name = 'ended_at'), 'wrong order left ended_at behind';
end \$\$;" >/dev/null
echo "   refused (relation public.subscriptions does not exist); nothing left behind"

echo "3. Monday: 0009, 0010, 0016, each as one query, then each again (re-running is a no-op)"
for f in 0009_billing_subscriptions.sql 0010_billing_events.sql 0016_waitlist_founding_billing.sql; do
  as_one_query "$MIG/$f"; echo "   $f ok"
done
for f in 0009_billing_subscriptions.sql 0010_billing_events.sql 0016_waitlist_founding_billing.sql; do
  as_one_query "$MIG/$f"
done
echo "   all three re-ran cleanly"

echo "4. checks.sql"
run_checks "$HERE/checks.sql"

if [ "$WITH_0017" = 1 ]; then
  echo "5. the HELD 0017, read from origin/founding-test-rows (git show; the branch is not touched)"
  # A fresh shape, so the checks see production's state rather than what checks.sql did to it.
  cleanup
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=throwaway-local-only "$IMAGE" >/dev/null
  for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
  sleep 4
  for f in 00000_waitlist.sql 00001_plaid_items.sql 0001_profiles.sql 0002_profiles_guard.sql \
           0003_founder_grandfather.sql 0004_plaid_cursor.sql 0005_z3_ai_consent_beta_seats.sql \
           0006_waitlist_welcomed_at.sql 0007_trial_only_signups.sql 0008_coach_usage_weekly.sql \
           0011_meeting_records.sql 0012_waitlist_consent.sql 0014_waitlist_founding.sql 0015_waitlist_founding_grants.sql; do
    psql_file -1 < "$MIG/$f" >/dev/null 2>&1
  done
  psql_file < "$HERE/seed.sql" >/dev/null
  for f in 0009_billing_subscriptions.sql 0010_billing_events.sql 0016_waitlist_founding_billing.sql; do as_one_query "$MIG/$f"; done
  HELD="$(mktemp -d)/0017.sql"
  git -C "$REPO" show origin/founding-test-rows:supabase/migrations/0017_waitlist_founding_test_rows.sql > "$HELD"
  as_one_query "$HELD"; echo "   0017 ok (local only)"
  run_checks "$HERE/checks-0017.sql"
  rm -f "$HELD"; rmdir "$(dirname "$HELD")"
fi
echo "done: container removed on exit"
