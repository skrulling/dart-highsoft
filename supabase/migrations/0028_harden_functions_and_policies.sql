-- Harden function execution context and remove lingering permissive RLS policies.

-- 1) Pin search_path for functions flagged as mutable by Supabase linter.
alter function if exists public.calculate_expected_score(int, int)
  set search_path = public, pg_temp;

alter function if exists public.update_elo_ratings(uuid, uuid, uuid, integer)
  set search_path = public, pg_temp;

alter function if exists public.update_elo_ratings_multiplayer(uuid, uuid[], integer[], integer)
  set search_path = public, pg_temp;

alter function if exists public.backfill_historical_elo_ratings()
  set search_path = public, pg_temp;

alter function if exists public.backfill_historical_elo_ratings_multiplayer()
  set search_path = public, pg_temp;

alter function if exists public.cascade_delete_player_matches()
  set search_path = public, pg_temp;

-- 2) Remove permissive write policies that may still exist in production.
drop policy if exists "public update" on public.matches;
drop policy if exists "public update" on public.players;
drop policy if exists "public delete" on public.players;
