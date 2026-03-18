-- Drop leftover backup tables from the 2026-02-25 multielo repair.
-- These are no longer needed and trigger RLS-disabled warnings.
drop table if exists public._repair_multielo_20260225_rows_backup;
drop table if exists public._repair_multielo_20260225_players_backup;
