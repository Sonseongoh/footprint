-- Nicknames (profiles.display_name) must be unique — they're the only thing
-- other users see of an author, so two people sharing one is confusing on a
-- 여행 공유 board. Case-insensitive so "BusanFox" and "busanfox" don't coexist.
-- NULLs stay allowed (a user who hasn't set/been-assigned one yet).
--
-- Existing duplicates are de-duplicated first (append a short id suffix to the
-- later ones) so the unique index can be created without error.

with dups as (
  select id,
         display_name,
         row_number() over (partition by lower(display_name) order by created_at) as rn
  from public.profiles
  where display_name is not null
)
update public.profiles p
set display_name = p.display_name || substr(p.id::text, 1, 4)
from dups
where p.id = dups.id
  and dups.rn > 1;

create unique index if not exists profiles_display_name_unique
  on public.profiles (lower(display_name))
  where display_name is not null;
