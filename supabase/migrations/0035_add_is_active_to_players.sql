-- Add is_active flag to players table.
-- Inactive players are hidden from leaderboards and player selection UI.
-- Toggle directly in the database: UPDATE players SET is_active = false WHERE id = '...';

alter table public.players
  add column if not exists is_active boolean not null default true;

create index if not exists idx_players_is_active on public.players (is_active);

-- Recreate player_summary to exclude inactive players
create or replace view public.player_summary as
select
  p.id as player_id,
  p.display_name,
  coalesce(w.wins, 0) as wins,
  coalesce(a.avg_per_turn, 0)::numeric(10,2) as avg_per_turn
from public.players p
left join (
  select winner_player_id, count(*)::int as wins
  from public.matches
  where winner_player_id is not null and ended_early = false
  group by winner_player_id
) w on w.winner_player_id = p.id
left join (
  select t.player_id, avg(t.total_scored)::numeric(10,2) as avg_per_turn
  from public.turns t
  join public.legs l on t.leg_id = l.id
  join public.matches m on l.match_id = m.id
  where m.ended_early = false
  group by t.player_id
) a on a.player_id = p.id
where p.is_active = true
order by wins desc, avg_per_turn desc;

-- Recreate player_match_wins to exclude inactive players
create or replace view public.player_match_wins as
select p.id as player_id, p.display_name, count(m.*) as wins
from public.players p
left join public.matches m on m.winner_player_id = p.id and m.ended_early = false
where p.is_active = true
group by p.id, p.display_name
order by wins desc;

-- Recreate 1v1 Elo stats view to exclude inactive players
create or replace view public.player_elo_stats as
select
  p.id as player_id,
  p.display_name,
  p.elo_rating as current_rating,
  count(er.id) as total_rated_matches,
  count(case when er.is_winner then 1 end) as wins,
  count(case when not er.is_winner then 1 end) as losses,
  case
    when count(er.id) > 0 then
      round((count(case when er.is_winner then 1 end)::float / count(er.id) * 100)::numeric, 1)
    else 0.0
  end as win_percentage,
  max(er.rating_after) as peak_rating,
  min(er.rating_after) as lowest_rating,
  coalesce(
    (select er2.rating_after
     from public.elo_ratings er2
     where er2.player_id = p.id
     order by er2.created_at desc
     limit 1),
    p.elo_rating
  ) as latest_rating
from public.players p
left join public.elo_ratings er on er.player_id = p.id
where p.is_active = true
group by p.id, p.display_name, p.elo_rating;

-- Recreate 1v1 Elo leaderboard (depends on player_elo_stats above)
drop view if exists public.elo_leaderboard;
create view public.elo_leaderboard as
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
where total_rated_matches >= 3
order by current_rating desc, total_rated_matches desc;

-- Recreate recent 1v1 Elo changes to exclude inactive players
drop view if exists public.recent_elo_changes;
create view public.recent_elo_changes as
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
where p.is_active = true
  and op.is_active = true
order by er.created_at desc
limit 50;

-- Recreate multiplayer Elo stats view to exclude inactive players
create or replace view public.player_elo_stats_multi as
select
  p.id as player_id,
  p.display_name,
  p.elo_rating_multi as current_rating,
  count(em.id) as total_rated_matches,
  count(case when em.rank = 1 then 1 end) as wins,
  count(case when em.rank > 1 then 1 end) as losses,
  case
    when count(em.id) > 0 then
      round((count(case when em.rank = 1 then 1 end)::float / count(em.id) * 100)::numeric, 1)
    else 0.0
  end as win_percentage,
  max(em.rating_after) as peak_rating,
  min(em.rating_after) as lowest_rating,
  coalesce(
    (select em2.rating_after
     from public.elo_ratings_multi em2
     where em2.player_id = p.id
     order by em2.created_at desc
     limit 1),
    p.elo_rating_multi
  ) as latest_rating
from public.players p
left join public.elo_ratings_multi em on em.player_id = p.id
where p.is_active = true
group by p.id, p.display_name, p.elo_rating_multi;

-- Recreate multiplayer Elo leaderboard (depends on player_elo_stats_multi above)
drop view if exists public.elo_leaderboard_multi;
create view public.elo_leaderboard_multi as
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
from public.player_elo_stats_multi
where total_rated_matches >= 3
order by current_rating desc, total_rated_matches desc;

-- Recreate recent multiplayer Elo changes to exclude inactive players
drop view if exists public.recent_elo_changes_multi;
create view public.recent_elo_changes_multi as
select
  em.id,
  em.player_id,
  p.display_name as player_name,
  em.rating_before,
  em.rating_after,
  em.rating_change,
  em.match_id,
  em.field_size,
  em.rank,
  em.expected_score,
  em.observed_score,
  em.created_at
from public.elo_ratings_multi em
join public.players p on p.id = em.player_id
where p.is_active = true
order by em.created_at desc
limit 50;

-- Recreate checkout leaderboard to exclude inactive players
drop view if exists public.checkout_leaderboard_single_out;
drop view if exists public.checkout_leaderboard_double_out;
drop view if exists public.checkout_leaderboard;

create view public.checkout_leaderboard as
select
    t.id as turn_id,
    t.player_id,
    p.display_name,
    t.total_scored as score,
    greatest(
        1,
        (
            select count(*)
            from public.throws th
            where th.turn_id = t.id
              and th.segment is not null
              and th.segment <> ''
              and th.segment not ilike 'miss%'
        )
    ) as darts_used,
    l.created_at as date,
    m.finish
from public.turns t
join public.legs l on t.leg_id = l.id
join public.matches m on l.match_id = m.id
join public.players p on t.player_id = p.id
where
    l.winner_player_id = t.player_id
    and (m.ended_early = false or m.ended_early is null)
    and p.is_active = true
    and p.is_test = false
    and t.total_scored > 0
    and t.turn_number = (
        select max(t2.turn_number)
        from public.turns t2
        where t2.leg_id = t.leg_id
          and t2.player_id = t.player_id
    );

create view public.checkout_leaderboard_single_out as
select turn_id, player_id, display_name, score, darts_used, date
from public.checkout_leaderboard
where finish = 'single_out';

create view public.checkout_leaderboard_double_out as
select turn_id, player_id, display_name, score, darts_used, date
from public.checkout_leaderboard
where finish = 'double_out';

grant select on public.checkout_leaderboard to anon, authenticated, service_role;
grant select on public.checkout_leaderboard_single_out to anon, authenticated, service_role;
grant select on public.checkout_leaderboard_double_out to anon, authenticated, service_role;

-- Recreate quickest legs leaderboard to exclude inactive players
drop view if exists public.quickest_legs_leaderboard;

create view public.quickest_legs_leaderboard as
select
    l.id as leg_id,
    l.winner_player_id as player_id,
    p.display_name,
    l.created_at as date,
    m.finish as finish_rule,
    m.start_score,
    (
        select count(*)
        from public.throws t
        join public.turns tu on t.turn_id = tu.id
        where tu.leg_id = l.id and tu.player_id = l.winner_player_id
    ) as dart_count
from public.legs l
join public.matches m on l.match_id = m.id
join public.players p on l.winner_player_id = p.id
where
    l.winner_player_id is not null
    and (m.ended_early = false or m.ended_early is null)
    and p.is_active = true
    and p.is_test = false;

grant select on public.quickest_legs_leaderboard to anon, authenticated, service_role;

-- Recreate stats views from 0033 to also filter is_active
create or replace view public.player_recent_form as
with participant_results as (
  select
    mp.player_id,
    m.created_at,
    case when mp.player_id = m.winner_player_id then 1 else -1 end as result,
    row_number() over (
      partition by mp.player_id
      order by m.created_at desc
    ) as rn
  from public.matches m
  join public.match_players mp on mp.match_id = m.id
  join public.players p on p.id = mp.player_id
  where m.ended_early = false
    and m.winner_player_id is not null
    and p.is_test = false
    and p.is_active = true
)
select
  player_id,
  coalesce(array_agg(result order by created_at desc), '{}'::int[]) as last_10_results,
  coalesce(sum(result), 0)::int as form_score,
  coalesce(sum(case when result = 1 then 1 else 0 end), 0)::int as wins_in_last_10
from participant_results
where rn <= 10
group by player_id;

create or replace view public.player_throw_stats as
select
  p.id as player_id,
  p.display_name,
  t.segment,
  count(*) as hit_count,
  t.scored,
  avg(t.scored) as avg_score_per_dart
from public.players p
join public.turns tu on tu.player_id = p.id
join public.throws t on t.turn_id = tu.id
join public.legs l on l.id = tu.leg_id
join public.matches m on m.id = l.match_id
where m.ended_early = false
  and p.is_test = false
  and p.is_active = true
group by p.id, p.display_name, t.segment, t.scored;

create or replace view public.player_segment_summary as
select
  p.id as player_id,
  p.display_name,
  t.segment,
  count(*) as total_hits,
  sum(t.scored) as total_score,
  avg(t.scored) as avg_score,
  case
    when t.segment ~ '^[0-9]+$' then t.segment::int
    when t.segment ~ '^S[0-9]+$' then substring(t.segment from 2)::int
    when t.segment ~ '^D[0-9]+$' then substring(t.segment from 2)::int
    when t.segment ~ '^T[0-9]+$' then substring(t.segment from 2)::int
    when t.segment = 'InnerBull' then 25
    when t.segment = 'OuterBull' then 25
    else 0
  end as segment_number
from public.players p
join public.turns tu on tu.player_id = p.id
join public.throws t on t.turn_id = tu.id
join public.legs l on l.id = tu.leg_id
join public.matches m on m.id = l.match_id
where m.ended_early = false
  and p.is_test = false
  and p.is_active = true
group by p.id, p.display_name, t.segment;

create or replace view public.player_adjacency_stats as
select
  p.id as player_id,
  p.display_name,
  sum(case when pss.segment_number = 20 then pss.total_hits else 0 end) as hits_20,
  sum(case when pss.segment_number = 1 then pss.total_hits else 0 end) as hits_1,
  sum(case when pss.segment_number = 5 then pss.total_hits else 0 end) as hits_5,
  sum(case when pss.segment_number in (1, 5, 20) then pss.total_hits else 0 end) as hits_20_area,
  sum(case when pss.segment_number = 19 then pss.total_hits else 0 end) as hits_19,
  sum(case when pss.segment_number = 3 then pss.total_hits else 0 end) as hits_3,
  sum(case when pss.segment_number = 7 then pss.total_hits else 0 end) as hits_7,
  sum(case when pss.segment_number in (3, 7, 19) then pss.total_hits else 0 end) as hits_19_area,
  sum(pss.total_hits) as total_throws,
  round(
    (sum(case when pss.segment_number = 20 then pss.total_hits else 0 end)::decimal /
     nullif(sum(case when pss.segment_number in (1, 5, 20) then pss.total_hits else 0 end), 0)) * 100,
    2
  ) as accuracy_20_in_area,
  round(
    (sum(case when pss.segment_number = 19 then pss.total_hits else 0 end)::decimal /
     nullif(sum(case when pss.segment_number in (3, 7, 19) then pss.total_hits else 0 end), 0)) * 100,
    2
  ) as accuracy_19_in_area
from public.players p
left join public.player_segment_summary pss on pss.player_id = p.id
where p.is_test = false
  and p.is_active = true
group by p.id, p.display_name
having sum(pss.total_hits) > 10;

create or replace view public.player_accuracy_stats as
select
  p.id as player_id,
  p.display_name,
  sum(case when t.segment ~ '^D[0-9]+$' then 1 else 0 end) as doubles_attempted,
  sum(case when t.segment ~ '^D[0-9]+$' and t.scored > 0 then 1 else 0 end) as doubles_hit,
  round(
    (sum(case when t.segment ~ '^D[0-9]+$' and t.scored > 0 then 1 else 0 end)::decimal /
     nullif(sum(case when t.segment ~ '^D[0-9]+$' then 1 else 0 end), 0)) * 100,
    1
  ) as doubles_accuracy,
  sum(case when t.segment ~ '^T[0-9]+$' then 1 else 0 end) as trebles_attempted,
  sum(case when t.segment ~ '^T[0-9]+$' and t.scored > 0 then 1 else 0 end) as trebles_hit,
  round(
    (sum(case when t.segment ~ '^T[0-9]+$' and t.scored > 0 then 1 else 0 end)::decimal /
     nullif(sum(case when t.segment ~ '^T[0-9]+$' then 1 else 0 end), 0)) * 100,
    1
  ) as trebles_accuracy,
  count(*) as total_throws
from public.players p
join public.turns tu on tu.player_id = p.id
join public.throws t on t.turn_id = tu.id
join public.legs l on l.id = tu.leg_id
join public.matches m on m.id = l.match_id
where m.ended_early = false
  and p.is_test = false
  and p.is_active = true
group by p.id, p.display_name
having count(*) > 10;
