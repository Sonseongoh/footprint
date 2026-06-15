-- Per-city visit aggregate, so the PUBLIC share page can show "도시 단위 깊이"
-- (which cities were visited) — matching the app. Exposes city-level FILL only;
-- notes/GPS/photos stay private in visit_events.

create table if not exists public.visits_city (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  city_id          text not null,
  region_id        text not null,
  country          text not null check (country in ('KR','JP','TH')),
  first_visited_at timestamptz not null default now(),
  last_visited_at  timestamptz not null default now(),
  visit_count      integer not null default 1,
  unique (user_id, city_id)
);
create index if not exists visits_city_user_country_idx on public.visits_city (user_id, country);

-- extend the aggregate trigger to also roll up per-city (region rollup unchanged)
create or replace function public.apply_visit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.visits (user_id, region_id, country, first_visited_at, last_visited_at, visit_count)
  values (new.user_id, new.region_id, new.country, new.created_at, new.created_at, 1)
  on conflict (user_id, region_id) do update
    set visit_count     = public.visits.visit_count + 1,
        last_visited_at  = greatest(public.visits.last_visited_at, new.created_at);

  if new.city_id is not null then
    insert into public.visits_city (user_id, city_id, region_id, country, first_visited_at, last_visited_at, visit_count)
    values (new.user_id, new.city_id, new.region_id, new.country, new.created_at, new.created_at, 1)
    on conflict (user_id, city_id) do update
      set visit_count     = public.visits_city.visit_count + 1,
          last_visited_at  = greatest(public.visits_city.last_visited_at, new.created_at);
  end if;

  return new;
end;
$$;
-- definer function must not be RPC-invocable (advisor 0028/0029)
revoke execute on function public.apply_visit_event() from public, anon, authenticated;

-- RLS: owner full access + public read when a public share page exists.
alter table public.visits_city enable row level security;

create policy visits_city_select_own on public.visits_city
  for select using (auth.uid() = user_id);
create policy visits_city_select_public on public.visits_city
  for select using (
    exists (
      select 1 from public.share_pages sp
      where sp.user_id = visits_city.user_id
        and sp.country = visits_city.country
        and sp.is_public
    )
  );
create policy visits_city_modify_own on public.visits_city
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- one-time backfill from existing events
insert into public.visits_city (user_id, city_id, region_id, country, first_visited_at, last_visited_at, visit_count)
select user_id, city_id, region_id, country, min(created_at), max(created_at), count(*)
from public.visit_events
where city_id is not null
group by user_id, city_id, region_id, country
on conflict (user_id, city_id) do nothing;
