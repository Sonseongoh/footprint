-- Allow multiple photos per city note. Replace the single photo_path with a
-- photo_paths text[] (order = display order). Backfill any existing single photo.

alter table public.city_notes add column if not exists photo_paths text[] not null default '{}';

update public.city_notes
  set photo_paths = array[photo_path]
  where photo_path is not null and photo_paths = '{}';

alter table public.city_notes drop column if exists photo_path;
