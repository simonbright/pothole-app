-- Photo support for pothole reports
-- Run in Supabase → SQL Editor

alter table public.potholes
  add column if not exists photo_url text;

-- Public storage bucket for pothole photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pothole-photos',
  'pothole-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read pothole photos" on storage.objects;
drop policy if exists "Anon upload pothole photos" on storage.objects;
drop policy if exists "Anon update pothole photos" on storage.objects;

create policy "Public read pothole photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'pothole-photos');

create policy "Anon upload pothole photos"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'pothole-photos');

create policy "Anon update pothole photos"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'pothole-photos');
