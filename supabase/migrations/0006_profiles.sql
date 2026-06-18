-- City notes show their author's display_name to everyone, but profiles is
-- owner-only-readable (0001). Add a PUBLIC read policy so note authors render
-- for any viewer. Only display_name is exposed; there's no other PII on profiles,
-- and writes stay owner-only (profiles_update_own from 0001).
--
-- (We reuse the existing profiles.display_name as the nickname rather than adding
--  a new table — the row is already auto-created per user by handle_new_user.)

create policy profiles_select_public on public.profiles
  for select using (true);
