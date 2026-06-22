-- Allow multiple photos per check-in. Replace visit_events.photo_path (single)
-- with photo_paths text[] (order = display order). These stay PRIVATE (photos
-- bucket, owner-only signed URLs) — unlike note photos.

alter table public.visit_events add column if not exists photo_paths text[] not null default '{}';

update public.visit_events
  set photo_paths = array[photo_path]
  where photo_path is not null and photo_paths = '{}';

alter table public.visit_events drop column if exists photo_path;
