-- City notes: public "what's here / recommendations" tips attached to a place
-- (country + region_id — for KR that's the 시, for JP/TH the prefecture/province).
--
-- Trust model: anyone may READ (discovery), but you may only WRITE about a place
-- you actually visited recently. Write eligibility is enforced in the DB (RLS),
-- not the client: an INSERT/UPDATE is allowed only if the author has a check-in
-- (visit_events) for that same place within the last 7 days. The window keeps
-- tips fresh and tied to a real, recent visit.

create table if not exists public.city_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  country    text not null check (country in ('KR','JP','TH')),
  region_id  text not null,
  -- denormalized display label captured at write time (e.g. "수원"); the place
  -- key is (country, region_id), this is just for listing without a join.
  city_name  text,
  body       text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_visible boolean not null default true
);

create index if not exists city_notes_place_idx
  on public.city_notes (country, region_id) where is_visible;
create index if not exists city_notes_user_idx on public.city_notes (user_id);

alter table public.city_notes enable row level security;

-- the 7-day "recently visited this place" gate, reused by insert + update
create or replace function public.has_recent_visit(p_country text, p_region_id text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.visit_events ve
    where ve.user_id = auth.uid()
      and ve.country = p_country
      and ve.region_id = p_region_id
      and ve.created_at > now() - interval '7 days'
  );
$$;

-- READ: anyone sees visible notes; owner also sees their own hidden ones
create policy city_notes_select_public on public.city_notes
  for select using (is_visible);
create policy city_notes_select_own on public.city_notes
  for select using (auth.uid() = user_id);

-- WRITE: must be the author AND have visited this place in the last 7 days
create policy city_notes_insert_eligible on public.city_notes
  for insert with check (
    auth.uid() = user_id and public.has_recent_visit(country, region_id)
  );
create policy city_notes_update_eligible on public.city_notes
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.has_recent_visit(country, region_id));

-- owner may always remove their own note (no time gate on deletion)
create policy city_notes_delete_own on public.city_notes
  for delete using (auth.uid() = user_id);
