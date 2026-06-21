-- Photo review workflow — run in Supabase → SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE)

alter table public.potholes
  add column if not exists photo_url text,
  add column if not exists photo_status text check (photo_status in ('pending', 'approved', 'rejected')),
  add column if not exists photo_path text;

-- Storage bucket (private — previews via signed URLs in review API)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pothole-photos',
  'pothole-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read pothole photos" on storage.objects;
drop policy if exists "Anon upload pothole photos" on storage.objects;
drop policy if exists "Anon update pothole photos" on storage.objects;

create policy "Anon upload pothole photos"
on storage.objects for insert
to public
with check (bucket_id = 'pothole-photos');

create policy "Anon update pothole photos"
on storage.objects for update
to public
using (bucket_id = 'pothole-photos')
with check (bucket_id = 'pothole-photos');

-- Required so the app can attach photo_path / photo_status after upload
drop policy if exists "Allow public update potholes" on public.potholes;

create policy "Allow public update potholes"
on public.potholes
for update
to anon, authenticated
using (true)
with check (true);

-- Existing photos → approved
update public.potholes
set
  photo_path = coalesce(
    photo_path,
    substring(photo_url from 'pothole-photos/(.+)$')
  ),
  photo_status = coalesce(photo_status, 'approved')
where photo_url is not null
  and photo_status is null;
