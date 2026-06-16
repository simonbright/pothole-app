-- Run in Supabase SQL Editor (fixes 400 errors for address + empty History)

alter table public.potholes
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists reporter_email text,
  add column if not exists created_at timestamptz not null default now();

-- Remove empty trial rows (no address saved)
delete from public.potholes where address is null;

drop policy if exists "Allow public read" on public.potholes;

create policy "Allow public read"
on public.potholes
for select
to anon, authenticated
using (true);

-- Contests (run once)
create table if not exists public.contests (
  id bigint generated always as identity primary key,
  pothole_id bigint not null references public.potholes(id) on delete cascade,
  reason text not null check (reason in ('wrong', 'location', 'fixed')),
  reporter_email text,
  created_at timestamptz not null default now()
);

alter table public.contests enable row level security;

drop policy if exists "Allow public read contests" on public.contests;
drop policy if exists "Allow public insert contests" on public.contests;

create policy "Allow public read contests"
on public.contests for select to anon, authenticated using (true);

create policy "Allow public insert contests"
on public.contests for insert to anon, authenticated with check (true);

drop policy if exists "Allow public update potholes" on public.potholes;

create policy "Allow public update potholes"
on public.potholes
for update
to anon, authenticated
using (true)
with check (true);
