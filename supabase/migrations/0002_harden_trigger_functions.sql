-- Security hardening (Supabase advisor 0028/0029).
-- The SECURITY DEFINER trigger functions run with definer rights via the trigger
-- mechanism and must NOT be invocable directly through PostgREST RPC. Revoke
-- EXECUTE from the exposed roles; triggers keep working.
revoke execute on function public.apply_visit_event() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
