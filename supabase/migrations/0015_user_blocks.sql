-- User blocking — Play/App Store UGC compliance (report AND block required).
--
-- A block is personal curation: it hides the blocked user's 여행 공유 from the
-- blocker's feed (client filters on this table). It does not delete content or
-- notify anyone. Stored server-side so blocks survive reinstalls and sync
-- across devices. Only real accounts may block (guests are viewers, 0014).

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

-- each user manages and sees only their own block list
drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own on public.user_blocks
  for select using (auth.uid() = blocker_id);
drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own on public.user_blocks
  for insert with check (auth.uid() = blocker_id);
drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own on public.user_blocks
  for delete using (auth.uid() = blocker_id);

-- guests are viewers: blocking is a real-account action (mirrors 0014)
drop policy if exists user_blocks_real_users_only on public.user_blocks;
create policy user_blocks_real_users_only on public.user_blocks
  as restrictive for insert to authenticated
  with check (public.is_real_user());
