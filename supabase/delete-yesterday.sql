-- Delete production/test logs from "yesterday" (Toronto / Eastern, UTC-4).
-- Window: June 15, 2026 00:00 EDT → June 16, 2026 00:00 EDT
-- (UTC: 2026-06-15 04:00 → 2026-06-16 04:00)
--
-- As of 2026-06-16 this removes 33 potholes (ids ~3–35).
-- Keeps entries from today morning (e.g. ids 36–37).
-- Contests for deleted potholes are removed automatically (ON DELETE CASCADE).
--
-- Run in Supabase → SQL Editor → New query → Run

delete from public.potholes
where created_at >= '2026-06-15 04:00:00+00'
  and created_at <  '2026-06-16 04:00:00+00';
