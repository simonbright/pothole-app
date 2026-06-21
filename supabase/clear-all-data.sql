-- Clear ALL pothole logs and contests (production + test data).
-- Run once in Supabase → SQL Editor → New query → Run

truncate table public.contests restart identity cascade;
truncate table public.potholes restart identity cascade;
