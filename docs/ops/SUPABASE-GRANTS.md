# Supabase: grants on new public tables

**From 2026-10-30, Supabase stops auto-granting Data API access to newly created tables
in the `public` schema.** Existing tables keep the grants they already have and nothing
in production breaks. But any table created after that date — in production, in a new
project, in a preview branch, or locally by `supabase db reset` — is invisible to
`supabase-js` and PostgREST until the migration grants access explicitly. The failure
looks like an empty result or a "relation does not exist" style error from PostgREST,
not a permission error, which is why it is worth catching in the migration rather than
in an incident.

`tests/supabaseGrants.test.cjs` enforces this on every new migration.

## The block every create-table migration must carry

```sql
create table if not exists public.<table> (
  ...
);

alter table public.<table> enable row level security;

-- Data API grants. Supabase no longer adds these automatically (2026-10-30).
grant select, insert, update, delete on table public.<table> to authenticated;
grant all privileges                 on table public.<table> to service_role;
-- anon: nothing. See the rule below before adding any anon grant.
```

Narrow the `authenticated` verbs to what the table actually needs — a table the client
only reads should be `grant select`, not all four.

Two things this does **not** do:

- **It does not replace RLS.** A grant opens the table to the Data API; the RLS policies
  decide which rows a caller sees. A table with grants and no policies returns nothing to
  `anon` and `authenticated` (which is the deliberate state of `waitlist` and
  `plaid_items`). A table with policies and no grants returns nothing to anyone.
- **`service_role` bypasses RLS but still needs the grant.** It is not exempt from table
  privileges.

If a table ever uses `serial`/`identity` rather than `gen_random_uuid()`, the inserting
role also needs its sequence:

```sql
grant usage, select on sequence public.<table>_<column>_seq to authenticated;
```

None of our tables need that line today — every primary key is a `uuid`, a natural key
(`beta_signups.email`), or a composite (`coach_usage_weekly`).

## The anon rule

**`anon` gets `select` and only `select`, and only on a table meant to be readable with
no session. Every other table gets no anon grant at all.**

`anon` is the role behind the publishable key, which ships in the web bundle and in both
native builds — so an anon grant is a grant to the whole internet, gated only by RLS.
Never `grant insert`/`update`/`delete`/`all` to `anon`: if the public needs to write
something, it goes through a Netlify function using the service role, which is how the
waitlist signup already works.

### Which of our tables fall in each group

**anon `select`: none.** No table in this app is meant to be read without a session.
Nothing in `src/` queries Supabase before login — the only client-side table calls are
`user_data` and `profiles` (`src/lib/persistence.js`, `src/App.jsx`), both after a
session exists.

**`authenticated` (client reads and writes its own rows, gated by RLS):**

| table | why |
|---|---|
| `profiles` | the client reads and updates the signed-in user's profile |
| `user_data` | the client persists the user's app state |

**`service_role` only (no anon, no authenticated):**

| table | why |
|---|---|
| `waitlist` | written by a Netlify function on signup; RLS on, no policies |
| `plaid_items` | bank item tokens; server-only, RLS on, no policies |
| `beta_signups` | seats are reserved through `reserve_beta_seat()`, execute granted to `service_role` only |
| `coach_usage_weekly` | the weekly counter, incremented through `increment_coach_usage_weekly()` |
| `coach_usage` | the older daily counter, still read by `netlify/functions/coach.js` |
| `webhook_seen` | Plaid webhook de-duplication |

## Two gaps worth knowing

1. **Three tables in use have no migration in this repo**: `user_data`, `coach_usage`
   and `webhook_seen` are queried by shipped code but are created by no file under
   `supabase/migrations`. They exist in production because they were created outside the
   migration history. A local `supabase db reset` does not produce them, and whenever
   they are finally written as migrations, those migrations need the grants block above.
2. **The ten migrations already in `main` carry no table grants at all.** That is
   correct and must stay that way: they are already applied in production, their tables
   keep the access they were auto-granted, and rewriting an applied migration breaks the
   history. The test grandfathers them by name; see its header.
