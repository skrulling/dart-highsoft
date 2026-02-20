-- Fix: migrations 0033 and 0035 used CREATE OR REPLACE VIEW / CREATE VIEW
-- which resets the security_invoker flag that was originally set in 0027.
-- Re-apply security_invoker = true on all public views.

alter view if exists public.player_summary set (security_invoker = true);
alter view if exists public.player_match_wins set (security_invoker = true);
alter view if exists public.player_elo_stats set (security_invoker = true);
alter view if exists public.player_elo_stats_multi set (security_invoker = true);
alter view if exists public.elo_leaderboard set (security_invoker = true);
alter view if exists public.elo_leaderboard_multi set (security_invoker = true);
alter view if exists public.recent_elo_changes set (security_invoker = true);
alter view if exists public.recent_elo_changes_multi set (security_invoker = true);
alter view if exists public.checkout_leaderboard set (security_invoker = true);
alter view if exists public.checkout_leaderboard_single_out set (security_invoker = true);
alter view if exists public.checkout_leaderboard_double_out set (security_invoker = true);
alter view if exists public.quickest_legs_leaderboard set (security_invoker = true);
alter view if exists public.player_recent_form set (security_invoker = true);
alter view if exists public.player_throw_stats set (security_invoker = true);
alter view if exists public.player_segment_summary set (security_invoker = true);
alter view if exists public.player_adjacency_stats set (security_invoker = true);
alter view if exists public.player_accuracy_stats set (security_invoker = true);
alter view if exists public.player_practice_stats set (security_invoker = true);
alter view if exists public.player_around_world_stats set (security_invoker = true);
alter view if exists public.around_world_stats set (security_invoker = true);
alter view if exists public.player_match_stats set (security_invoker = true);
alter view if exists public.player_avg_per_turn set (security_invoker = true);
alter view if exists public.practice_session_stats set (security_invoker = true);
alter view if exists public.player_recent_elo_trend set (security_invoker = true);
alter view if exists public.player_recent_elo_multi_trend set (security_invoker = true);
