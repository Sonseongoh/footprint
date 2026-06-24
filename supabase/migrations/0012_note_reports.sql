-- Reporting for 여행 공유 (city_notes) — store/UGC compliance.
--
-- Anyone signed in (incl. anonymous guests) may report a note once. When a note
-- accumulates enough distinct reports it auto-hides (is_visible = false) so
-- abusive content disappears without waiting for a human; the moderator can still
-- review/restore it in the Supabase dashboard. Reporters can't read other people's
-- reports, only insert their own.

-- threshold of distinct reporters that auto-hides a note
-- (kept as a single source of truth inside the trigger function below)

create table if not exists public.city_note_reports (
  note_id     uuid not null references public.city_notes (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  primary key (note_id, reporter_id)
);
create index if not exists city_note_reports_note_idx on public.city_note_reports (note_id);

alter table public.city_note_reports enable row level security;

-- a reporter may file their own report and see only their own rows
drop policy if exists city_note_reports_insert_own on public.city_note_reports;
create policy city_note_reports_insert_own on public.city_note_reports
  for insert with check (auth.uid() = reporter_id);
drop policy if exists city_note_reports_select_own on public.city_note_reports;
create policy city_note_reports_select_own on public.city_note_reports
  for select using (auth.uid() = reporter_id);

-- auto-hide once a note reaches the report threshold. SECURITY DEFINER so the
-- reporter (who doesn't own the note) can still flip is_visible via the trigger.
create or replace function public.apply_note_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hide_threshold constant int := 3;
  report_total int;
begin
  select count(*) into report_total
  from public.city_note_reports
  where note_id = new.note_id;

  if report_total >= hide_threshold then
    update public.city_notes
      set is_visible = false
      where id = new.note_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_note_report_insert on public.city_note_reports;
create trigger on_note_report_insert
  after insert on public.city_note_reports
  for each row execute function public.apply_note_report();
