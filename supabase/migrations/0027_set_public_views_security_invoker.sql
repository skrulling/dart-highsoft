-- Ensure public stats/leaderboard views run with invoker privileges.
-- This avoids SECURITY DEFINER behavior and aligns view access with caller RLS.

alter view if exists public.player_summary set (security_invoker = true);
alter view if exists public.quickest_legs_leaderboard set (security_invoker = true);
alter view if exists public.player_accuracy_stats set (security_invoker = true);
alter view if exists public.player_throw_stats set (security_invoker = true);
alter view if exists public.player_adjacency_stats set (security_invoker = true);
alter view if exists public.player_practice_stats set (security_invoker = true);
alter view if exists public.recent_elo_changes_multi set (security_invoker = true);
alter view if exists public.checkout_leaderboard set (security_invoker = true);
alter view if exists public.player_around_world_stats set (security_invoker = true);
alter view if exists public.checkout_leaderboard_single_out set (security_invoker = true);
alter view if exists public.recent_elo_changes set (security_invoker = true);
alter view if exists public.player_match_stats set (security_invoker = true);
alter view if exists public.around_world_stats set (security_invoker = true);
alter view if exists public.checkout_leaderboard_double_out set (security_invoker = true);
alter view if exists public.elo_leaderboard_multi set (security_invoker = true);
alter view if exists public.player_segment_summary set (security_invoker = true);
alter view if exists public.player_match_wins set (security_invoker = true);
alter view if exists public.elo_leaderboard set (security_invoker = true);
alter view if exists public.player_elo_stats set (security_invoker = true);
alter view if exists public.player_elo_stats_multi set (security_invoker = true);
alter view if exists public.practice_session_stats set (security_invoker = true);
alter view if exists public.player_avg_per_turn set (security_invoker = true);
