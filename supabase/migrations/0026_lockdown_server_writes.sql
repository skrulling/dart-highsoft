-- Lock down public writes; move all writes to server-only service role

-- 1) Remove public write/update/delete policies
drop policy if exists "public write" on public.players;
drop policy if exists "public write" on public.matches;
drop policy if exists "public write" on public.legs;
drop policy if exists "public write" on public.match_players;
drop policy if exists "public write" on public.turns;
drop policy if exists "public write" on public.throws;

drop policy if exists "public update" on public.throws;
drop policy if exists "public delete" on public.throws;
drop policy if exists "public update" on public.turns;
drop policy if exists "public delete" on public.turns;
drop policy if exists "public update" on public.match_players;
drop policy if exists "public delete" on public.match_players;
drop policy if exists "public update ended_early" on public.matches;
drop policy if exists "public update" on public.legs;

drop policy if exists "public write" on public.practice_sessions;
drop policy if exists "public update" on public.practice_sessions;
drop policy if exists "public write" on public.practice_turns;
drop policy if exists "public update" on public.practice_turns;
drop policy if exists "public delete" on public.practice_turns;
drop policy if exists "public write" on public.practice_throws;
drop policy if exists "public update" on public.practice_throws;
drop policy if exists "public delete" on public.practice_throws;

drop policy if exists "public write" on public.around_world_sessions;
drop policy if exists "public update" on public.around_world_sessions;

drop policy if exists "public write" on public.elo_ratings;
drop policy if exists "public write elo_ratings_multi" on public.elo_ratings_multi;

-- 2) Revoke direct table privileges for anon/authenticated
revoke insert, update, delete on public.players, public.matches, public.legs, public.match_players, public.turns, public.throws from anon, authenticated;
revoke insert, update, delete on public.practice_sessions, public.practice_turns, public.practice_throws from anon, authenticated;
revoke insert, update, delete on public.around_world_sessions, public.elo_ratings, public.elo_ratings_multi from anon, authenticated;

-- 3) Soft-cancel support
alter table public.practice_sessions add column if not exists is_cancelled boolean not null default false;
alter table public.around_world_sessions add column if not exists is_cancelled boolean not null default false;

-- 4) Update views to exclude cancelled sessions
create or replace view public.practice_session_stats as
select 
  ps.id as session_id,
  ps.player_id,
  ps.started_at,
  ps.ended_at,
  ps.is_active,
  count(pt.id) as total_turns,
  round(avg(pt.total_scored), 2) as avg_turn_score,
  max(pt.total_scored) as max_turn_score,
  sum(case when pt.total_scored >= 100 then 1 else 0 end) as tons,
  sum(case when pt.total_scored >= 140 then 1 else 0 end) as high_finishes,
  sum(case when pt.busted then 1 else 0 end) as busts,
  count(case when pt.finished then 1 end) as games_finished
from public.practice_sessions ps
left join public.practice_turns pt on pt.session_id = ps.id
where ps.is_cancelled = false
group by ps.id, ps.player_id, ps.started_at, ps.ended_at, ps.is_active;

create or replace view public.player_practice_stats as
select 
  p.id as player_id,
  p.display_name,
  count(ps.id) as total_sessions,
  round(avg(pss.avg_turn_score), 2) as overall_avg_score,
  sum(pss.total_turns) as total_practice_turns,
  sum(pss.tons) as total_tons,
  sum(pss.high_finishes) as total_high_finishes,
  sum(pss.busts) as total_busts,
  sum(pss.games_finished) as total_games_finished
from public.players p
left join public.practice_sessions ps on ps.player_id = p.id and ps.ended_at is not null and ps.is_cancelled = false
left join public.practice_session_stats pss on pss.session_id = ps.id
group by p.id, p.display_name;

create or replace view public.around_world_stats as
select 
  aws.id as session_id,
  aws.player_id,
  aws.variant,
  aws.started_at,
  aws.completed_at,
  aws.duration_seconds,
  aws.is_completed,
  case 
    when aws.is_completed then 
      row_number() over (
        partition by aws.player_id, aws.variant 
        order by aws.duration_seconds asc
      )
    else null
  end as rank_in_variant,
  case 
    when aws.is_completed then 
      round(avg(aws2.duration_seconds) over (
        partition by aws.player_id, aws.variant 
        rows between unbounded preceding and 1 preceding
      ), 1)
    else null
  end as previous_avg_seconds
from public.around_world_sessions aws
left join public.around_world_sessions aws2 on 
  aws2.player_id = aws.player_id 
  and aws2.variant = aws.variant 
  and aws2.is_completed = true
  and aws2.is_cancelled = false
  and aws2.completed_at < aws.completed_at
where aws.is_cancelled = false;

create or replace view public.player_around_world_stats as
select 
  p.id as player_id,
  p.display_name,
  count(case when aws.variant = 'single' and aws.is_completed then 1 end) as single_sessions_completed,
  min(case when aws.variant = 'single' and aws.is_completed then aws.duration_seconds end) as single_best_time,
  round(avg(case when aws.variant = 'single' and aws.is_completed then aws.duration_seconds end), 1) as single_avg_time,
  count(case when aws.variant = 'double' and aws.is_completed then 1 end) as double_sessions_completed,
  min(case when aws.variant = 'double' and aws.is_completed then aws.duration_seconds end) as double_best_time,
  round(avg(case when aws.variant = 'double' and aws.is_completed then aws.duration_seconds end), 1) as double_avg_time,
  count(case when aws.is_completed then 1 end) as total_completed_sessions,
  count(aws.id) as total_sessions
from public.players p
left join public.around_world_sessions aws on aws.player_id = p.id and aws.is_cancelled = false
group by p.id, p.display_name;

-- 5) Revoke Elo RPCs for anon/authenticated
revoke execute on function public.update_elo_ratings(uuid, uuid, uuid, integer) from anon, authenticated;
revoke execute on function public.update_elo_ratings_multiplayer(uuid, uuid[], integer[], integer) from anon, authenticated;

-- 6) Ensure view SELECT for anon/authenticated
grant select on public.player_summary, public.player_match_stats, public.player_match_wins, public.player_avg_per_turn to anon, authenticated;
grant select on public.player_throw_stats, public.player_segment_summary, public.player_accuracy_stats, public.player_adjacency_stats to anon, authenticated;
grant select on public.checkout_leaderboard, public.checkout_leaderboard_single_out, public.checkout_leaderboard_double_out, public.quickest_legs_leaderboard to anon, authenticated;
grant select on public.practice_session_stats, public.player_practice_stats, public.around_world_stats, public.player_around_world_stats to anon, authenticated;
grant select on public.player_elo_stats, public.elo_leaderboard, public.recent_elo_changes, public.player_elo_stats_multi, public.elo_leaderboard_multi, public.recent_elo_changes_multi to anon, authenticated;
