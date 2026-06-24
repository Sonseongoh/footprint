-- Self-service account deletion — store/privacy compliance (App Store §5.1.1(v),
-- Google Play account-deletion requirement).
--
-- Every public table FKs auth.users with `on delete cascade`, so removing the
-- auth user wipes the caller's profile, visits, visit_events, share_pages,
-- city_notes, likes and reports in one shot. SECURITY DEFINER lets the function
-- delete from the auth schema (the client/anon role can't) while still being
-- scoped to the *caller's own* id via auth.uid() — a user can only delete
-- themselves. Storage objects (photos) are best-effort removed by the client
-- before calling this (it owns them via storage RLS).

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- cascades to all public.* rows owned by this user
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated, anon;
