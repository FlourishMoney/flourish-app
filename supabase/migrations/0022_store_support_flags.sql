-- 0022_store_support_flags.sql
-- -----------------------------------------------------------------------------
-- WHAT SUPPORT MUST LOOK AT, ON THE HOUSEHOLD'S OWN ROW (version 1.1, 2026-10-18).
--
-- The founding annual is sold in an App Store subscription group of its own (docs/ops/IAP-1.1.md item 6), and
-- Apple bills each group separately, so one household could hold a regular subscription and the founding one at
-- the same time. The app never sells that (StorePaywall's founding guard), but a household can still reach it
-- from its own Apple subscription settings. When the server sees it (netlify/functions/_lib/storeSubscriptions.js),
-- the household keeps its access and the row records it for support:
--   support_flag     "two_store_subscriptions" (two live store subscriptions), or "founding_not_eligible" (the
--                    founding price bought by a household the server did not offer it to)
--   support_flag_at  when it was first seen. A repeat of the same flag keeps the first time.
-- The same moment, an alert goes to the support inbox (_lib/supportAlert.js). Nothing here clears a flag:
-- support does, by hand, once it is resolved.
--
-- ADDITIVE AND IDEMPOTENT. Two nullable columns; no row changes.
--
-- TO APPLY (Supabase SQL editor), after 0020 and before IAP_ENABLED is set in Netlify.
-- ROLLBACK:
--   alter table public.subscriptions drop column if exists support_flag_at;
--   alter table public.subscriptions drop column if exists support_flag;
-- -----------------------------------------------------------------------------
-- grants: service_role only

alter table public.subscriptions add column if not exists support_flag text;
alter table public.subscriptions add column if not exists support_flag_at timestamptz;
