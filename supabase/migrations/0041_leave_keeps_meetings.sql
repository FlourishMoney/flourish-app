-- 0041_leave_keeps_meetings.sql
-- -----------------------------------------------------------------------------
-- LEAVING A HOUSEHOLD: THE LEAVER'S MONEY MEETINGS LEAVE WITH THEM (2026-11-08). NOT APPLIED.
--
-- 0031's household_leave_locked handed the leaver's meeting records from their join date on to the person who
-- stays (where that person had none of their own for the day), and deleted the rest of the leaver's records.
-- So the one who stays was left holding meetings someone else recorded, dated from the leaver's join, and the
-- leaver lost every meeting they had ever held, including the ones from before the household.
--
-- Amanda's rule (2026-11-08): the leaver's meetings leave with them; the partner who stays keeps only the
-- meetings they held. So nothing about meeting_records changes on a leave: each record stays in the name of the
-- person who recorded it. Once they no longer share a household, 0030's meeting_records_select_household policy
-- (shares_household_record) no longer matches, and each of them reads only their own.
--
-- This replaces household_leave_locked with 0031's function exactly, minus the two meeting_records statements.
-- Everything else a leave does (the leaver's banks out of the blob, their user_data and private rows deleted,
-- their purchase hold, their membership, the last-one-out path) is unchanged. A removal by the owner
-- (household_remove_partner) calls the same function, so it follows the same rule. Deleting an account still
-- deletes its meeting records (meeting_records.user_id references auth.users on delete cascade).
--
-- Needs 0030 and 0031. Run in the Supabase SQL editor. Safe to run more than once. No data changes when it runs:
-- it only replaces a function, so leaves that already happened stay as they were.
-- -----------------------------------------------------------------------------

create or replace function public.household_leave_locked(p_household uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare their_role text; others integer;
begin
  select role into their_role from public.household_members where household_id = p_household and user_id = p_user;
  select count(*) into others from public.household_members where household_id = p_household and user_id <> p_user;
  if others > 0 then
    perform public.household_strip_member_banks(p_household, p_user);
    delete from public.user_data where user_id = p_user;
    -- The money meeting's records stay with whoever recorded them (0041): nothing moves to the one who stays, and
    -- nothing of the leaver's is deleted.
  else
    insert into public.user_data (user_id, data, schema_version)
    select p_user,
           case when jsonb_typeof(d.data) = 'object'
                then jsonb_set(d.data, '{sideKeys}', coalesce(case when jsonb_typeof(d.data -> 'sideKeys') = 'object' then d.data -> 'sideKeys' end, '{}'::jsonb)
                                                     || coalesce((select p.data from public.household_member_private p where p.user_id = p_user), '{}'::jsonb))
                else d.data end,
           d.schema_version
      from public.household_data d where d.household_id = p_household
    on conflict (user_id) do update set data = excluded.data, schema_version = excluded.schema_version;
  end if;
  delete from public.household_member_private where user_id = p_user;
  delete from public.household_purchase_holds where household_id = p_household and user_id = p_user;
  delete from public.household_members where household_id = p_household and user_id = p_user;   -- the trigger promotes or removes
  return jsonb_build_object('result', 'left', 'household_id', p_household, 'role', their_role, 'remaining', others);
end; $$;

-- As 0031 left it: only household_leave and household_remove_partner (which take the household's lock) call this.
revoke all on function public.household_leave_locked(uuid, uuid) from public, anon, authenticated, service_role;

-- ============================================================================
-- READ-ONLY CHECK (after running): the leave no longer touches meeting_records, and the inner function is still
-- out of everyone's reach.
--   select position('meeting_records' in pg_get_functiondef('public.household_leave_locked(uuid, uuid)'::regprocedure)) = 0,
--          has_function_privilege('service_role', 'public.household_leave_locked(uuid, uuid)', 'execute'),
--          has_function_privilege('authenticated', 'public.household_leave_locked(uuid, uuid)', 'execute');
-- Expected after: true, false, false.
-- ============================================================================
-- ROLLBACK: run 0031_couple_household_private.sql's "create or replace function public.household_leave_locked"
-- statement again (it is safe to run on its own), then its revoke line for household_leave_locked.
-- ============================================================================
