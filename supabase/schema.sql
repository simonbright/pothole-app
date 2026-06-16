-- Run in Supabase SQL Editor

alter table public.potholes
  add column if not exists address text,
  add column if not exists user_id uuid references auth.users(id);

create policy "Allow public read"
on public.potholes
for select
to anon, authenticated
using (true);
