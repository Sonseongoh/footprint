-- Likes on city notes (여행 공유). Anyone can see counts; you can like/unlike
-- your own row only. A denormalized like_count on city_notes keeps "추천순"
-- sorting and display cheap (maintained by a trigger).

alter table public.city_notes add column if not exists like_count integer not null default 0;

create table if not exists public.city_note_likes (
  note_id    uuid not null references public.city_notes (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);
create index if not exists city_note_likes_user_idx on public.city_note_likes (user_id);

alter table public.city_note_likes enable row level security;

-- counts are public; each user manages only their own like
create policy note_likes_select_public on public.city_note_likes
  for select using (true);
create policy note_likes_insert_own on public.city_note_likes
  for insert with check (auth.uid() = user_id);
create policy note_likes_delete_own on public.city_note_likes
  for delete using (auth.uid() = user_id);

-- keep city_notes.like_count in sync
create or replace function public.apply_note_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.city_notes set like_count = like_count + 1 where id = new.note_id;
  elsif (tg_op = 'DELETE') then
    update public.city_notes set like_count = greatest(0, like_count - 1) where id = old.note_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.apply_note_like() from public, anon, authenticated;

drop trigger if exists on_note_like on public.city_note_likes;
create trigger on_note_like
  after insert or delete on public.city_note_likes
  for each row execute function public.apply_note_like();
