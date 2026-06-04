-- Footprint v1 schema. See DESIGN.md.
--
-- Collection unit = admin-1 region (region_id is a stable text id like "JP-13",
-- matching the bundled GeoJSON; reference geometry lives in the app, not the DB).
-- visits = one aggregate per (user, region); visit_events = each check-in.
--
-- Privacy model (RLS): a user fully owns their own rows. A PUBLIC share page
-- exposes ONLY fill + counts (the `visits` table) for that user+country.
-- visit_events (notes, GPS, photos) are NEVER readable by the public.

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- auto-create a profile row for every new auth user (incl. anonymous)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── visits (aggregate, public-readable via share pages) ──────────────────────
create table if not exists public.visits (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  region_id        text not null,
  country          text not null check (country in ('KR','JP','TH')),
  first_visited_at timestamptz not null default now(),
  last_visited_at  timestamptz not null default now(),
  visit_count      integer not null default 1,
  unique (user_id, region_id)
);
create index if not exists visits_user_country_idx on public.visits (user_id, country);

-- ── visit_events (per check-in, owner-only) ──────────────────────────────────
create table if not exists public.visit_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  region_id   text not null,
  city_id     text,
  city_name   text,
  country     text not null check (country in ('KR','JP','TH')),
  created_at  timestamptz not null default now(),
  source      text not null default 'live' check (source in ('live','recovered')),
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  double precision,
  note        text,
  photo_path  text
);
create index if not exists visit_events_user_region_idx on public.visit_events (user_id, region_id);

-- ── share_pages (public country fill map) ────────────────────────────────────
create table if not exists public.share_pages (
  slug       text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  country    text not null check (country in ('KR','JP','TH')),
  is_public  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, country)
);

-- ── aggregate trigger: keep visits in sync from visit_events ─────────────────
-- Server-side aggregation avoids client races on re-visit counting.
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
  return new;
end;
$$;

drop trigger if exists on_visit_event_insert on public.visit_events;
create trigger on_visit_event_insert
  after insert on public.visit_events
  for each row execute function public.apply_visit_event();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.visits        enable row level security;
alter table public.visit_events  enable row level security;
alter table public.share_pages   enable row level security;

-- profiles: owner only
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

-- visits: owner full access, PLUS public read when a public share page exists
-- for that user+country (exposes only fill + counts, never notes/gps/photos).
create policy visits_select_own on public.visits
  for select using (auth.uid() = user_id);
create policy visits_select_public on public.visits
  for select using (
    exists (
      select 1 from public.share_pages sp
      where sp.user_id = visits.user_id
        and sp.country = visits.country
        and sp.is_public
    )
  );
create policy visits_modify_own on public.visits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- visit_events: owner only — NEVER public (notes, gps, photos are private)
create policy visit_events_all_own on public.visit_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- share_pages: owner manages; anyone may read a public page row (to resolve slug)
create policy share_pages_all_own on public.share_pages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy share_pages_select_public on public.share_pages
  for select using (is_public);
