-- One-time cleanup: delete empty trial rows from history
delete from public.potholes where address is null;
