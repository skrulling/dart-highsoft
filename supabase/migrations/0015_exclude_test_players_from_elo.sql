-- Exclude test players from ELO leaderboards and statistics
-- This migration updates views to filter out players with 'test' in their names

-- Update ELO leaderboard view to exclude test players
drop view if exists public.elo_leaderboard;
create or replace view public.elo_leaderboard as
select 
  player_id,
  display_name,
  current_rating,
  total_rated_matches,
  wins,
  losses,
  win_percentage,
  peak_rating,
  row_number() over (order by current_rating desc, total_rated_matches desc) as rank
from public.player_elo_stats
where total_rated_matches >= 3 -- Only include players with at least 3 rated matches
  and not display_name ilike '%test%' -- Exclude test players
order by current_rating desc, total_rated_matches desc;

-- Update recent ELO changes view to exclude test players
drop view if exists public.recent_elo_changes;
create or replace view public.recent_elo_changes as
select 
  er.id,
  er.player_id,
  p.display_name as player_name,
  er.rating_before,
  er.rating_after,
  er.rating_change,
  er.opponent_id,
  op.display_name as opponent_name,
  er.opponent_rating_before,
  er.is_winner,
  er.match_id,
  er.created_at
from public.elo_ratings er
join public.players p on p.id = er.player_id
join public.players op on op.id = er.opponent_id
where not p.display_name ilike '%test%' -- Exclude test players
  and not op.display_name ilike '%test%' -- Exclude matches against test players
order by er.created_at desc
limit 50;