-- scripts/billing-day-proof/local-shims.sql
-- -----------------------------------------------------------------------------
-- LOCAL ONLY. What this Supabase Postgres image lacks and production Supabase has, so the proof runs the
-- migrations' own code unchanged. Run by run.sh as supabase_admin, before anything else. Never run this
-- against production: production already has these.
-- -----------------------------------------------------------------------------

-- auth.jwt(): read by 0002's profiles_guard_privileged(). Supabase's own definition.
do $$
begin
  if to_regprocedure('auth.jwt()') is null then
    create function auth.jwt() returns jsonb language sql stable as $f$
      select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                      nullif(current_setting('request.jwt.claims', true), ''))::jsonb
    $f$;
    grant execute on function auth.jwt() to anon, authenticated, service_role;
  end if;
end $$;
