-- Optional photo on a city note. Unlike check-in photos (private `photos`
-- bucket, owner-only, signed URLs), note photos are part of a PUBLIC tip, so they
-- live in a separate PUBLIC bucket served by plain public URLs. Writes are still
-- scoped to the author's own folder: note-photos/{auth.uid()}/{photoId}.jpg.

alter table public.city_notes add column if not exists photo_path text;

insert into storage.buckets (id, name, public)
values ('note-photos', 'note-photos', true)
on conflict (id) do nothing;

-- public read (anyone viewing a note sees its photo); writes owner-scoped by folder
create policy "note_photos_public_select" on storage.objects
  for select using (bucket_id = 'note-photos');
create policy "note_photos_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'note-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "note_photos_owner_update" on storage.objects
  for update using (
    bucket_id = 'note-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "note_photos_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'note-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
