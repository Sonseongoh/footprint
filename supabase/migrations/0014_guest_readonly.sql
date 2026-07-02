-- Guests are viewers (2026-07-02 decision).
--
-- The deferred-auth era let anonymous sessions write (check-ins, likes,
-- reports). Now that check-in is login-gated, an anonymous session must not be
-- able to shape shared reality at all: anonymous users are trivially mass-
-- produced (every sign-out mints a new one), so anonymous likes inflate 추천순
-- and three anonymous reports could auto-hide anyone's 여행 공유.
--
-- Reads stay public (browsing needs no account). Writes require a REAL account:
-- Supabase marks anonymous sessions with an `is_anonymous` JWT claim, and these
-- RESTRICTIVE policies (ANDed with the existing owner policies) reject them.

create or replace function public.is_real_user()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
$$;

-- footprints: the client already gates check-in behind login; this closes the
-- direct-API path (a fake visit_event would also unlock city_notes writes via
-- has_recent_visit)
drop policy if exists visit_events_real_users_only on public.visit_events;
create policy visit_events_real_users_only on public.visit_events
  as restrictive for insert to authenticated
  with check (public.is_real_user());

drop policy if exists city_notes_real_users_only on public.city_notes;
create policy city_notes_real_users_only on public.city_notes
  as restrictive for insert to authenticated
  with check (public.is_real_user());

drop policy if exists city_note_likes_real_users_only on public.city_note_likes;
create policy city_note_likes_real_users_only on public.city_note_likes
  as restrictive for insert to authenticated
  with check (public.is_real_user());

drop policy if exists city_note_reports_real_users_only on public.city_note_reports;
create policy city_note_reports_real_users_only on public.city_note_reports
  as restrictive for insert to authenticated
  with check (public.is_real_user());
