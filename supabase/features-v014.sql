-- v0.14: duplicate contests + report types
-- Run in Supabase → SQL Editor

alter table public.potholes
  add column if not exists report_type text not null default 'pothole';

alter table public.potholes
  drop constraint if exists potholes_report_type_check;

alter table public.potholes
  add constraint potholes_report_type_check
  check (report_type in ('pothole', 'road_issue'));

alter table public.contests
  drop constraint if exists contests_reason_check;

alter table public.contests
  add constraint contests_reason_check
  check (reason in ('wrong', 'location', 'fixed', 'duplicate'));
