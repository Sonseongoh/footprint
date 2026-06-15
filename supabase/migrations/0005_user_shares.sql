-- User-level share: ONE shareable link per user ("내 발자국 봐"), whose page
-- shows every country the user has visited as tabs. Supersedes the per-country
-- share_pages flow (those rows/policies stay valid for old links).

create table if not exists public.user_shares (
  slug       text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade unique,
  is_public  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.user_shares enable row level security;

create policy user_shares_all_own on public.user_shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_shares_select_public on public.user_shares
  for select using (is_public);

-- expose region + city fill publicly (any country) when the owner has a public
-- user_share — fill/counts only, never notes/gps/photos.
create policy visits_select_public_user on public.visits
  for select using (
    exists (
      select 1 from public.user_shares us
      where us.user_id = visits.user_id and us.is_public
    )
  );
create policy visits_city_select_public_user on public.visits_city
  for select using (
    exists (
      select 1 from public.user_shares us
      where us.user_id = visits_city.user_id and us.is_public
    )
  );
