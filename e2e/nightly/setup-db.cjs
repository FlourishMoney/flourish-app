// e2e/nightly/setup-db.cjs
// -----------------------------------------------------------------------------
// Fills the nightly test's throwaway database (e2e/nightly/supabase/config.toml) the way production was built:
// first the one table no migration creates (public.user_data, made by hand in the dashboard; the same stand-in the
// SQL tests use, tests/household.sql.test.cjs), then every file in supabase/migrations, in name order, each in one
// go and stopping at the first error. Then PostgREST is told to read the schema again.
// It talks to the stack's own Postgres container only (docker exec): there is no address or password here that
// could point anywhere else.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const CONTAINER = "supabase_db_flourish-e2e";

const USER_DATA = `
create table if not exists public.user_data (user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb, schema_version integer not null default 1, updated_at timestamptz not null default now());
alter table public.user_data enable row level security;
drop policy if exists user_data_own on public.user_data;
create policy user_data_own on public.user_data for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.user_data to authenticated, service_role;
`;

function psql(sql, label) {
  try {
    execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
      { input: sql, stdio: ["pipe", "ignore", "pipe"] });
  } catch (e) {
    const err = String((e.stderr && e.stderr.toString()) || e.message).split("\n").filter(Boolean).slice(0, 6).join("\n  ");
    console.error(`✗ ${label} did not apply:\n  ${err}`);
    process.exit(1);
  }
}

psql(USER_DATA, "public.user_data (the table no migration creates)");
const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) psql(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"), f);
psql("notify pgrst, 'reload schema';", "the schema reload");
console.log(`✓ the test database is built: public.user_data and ${files.length} migrations (${files[0]} to ${files[files.length - 1]})`);
