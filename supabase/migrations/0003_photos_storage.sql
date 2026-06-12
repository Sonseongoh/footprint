-- Check-in photo storage. Private bucket; each user can only access files under
-- their own folder: photos/{auth.uid()}/... (visit_events.photo_path points here).
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- owner-only access, scoped by the first folder segment = user id
create policy "photos_owner_select" on storage.objects
  for select using (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "photos_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "photos_owner_update" on storage.objects
  for update using (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "photos_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
