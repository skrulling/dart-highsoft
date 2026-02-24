-- Filter tiebreak turns (tiebreak_round IS NOT NULL) from all stats/leaderboard views.
-- Tiebreak turns are "high round" turns played during fair-ending resolution
-- and must not pollute player averages, checkout stats, or leaderboard figures.

-- 1. player_summary – avg subquery joins turns
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
    and t.tiebreak_round is null
  group by t.player_id
) a on a.player_id = p.id
where p.is_active = true
order by wins desc, avg_per_turn desc;

alter view public.player_summary set (security_invoker = true);

-- 2. checkout_leaderboard – depends on turns t
-- Must drop dependent views first
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
    and t.tiebreak_round is null
    and t.turn_number = (
        select max(t2.turn_number)
        from public.turns t2
        where t2.leg_id = t.leg_id
          and t2.player_id = t.player_id
          and t2.tiebreak_round is null
    );

alter view public.checkout_leaderboard set (security_invoker = true);

create view public.checkout_leaderboard_single_out as
select turn_id, player_id, display_name, score, darts_used, date
from public.checkout_leaderboard
where finish = 'single_out';

alter view public.checkout_leaderboard_single_out set (security_invoker = true);

create view public.checkout_leaderboard_double_out as
select turn_id, player_id, display_name, score, darts_used, date
from public.checkout_leaderboard
where finish = 'double_out';

alter view public.checkout_leaderboard_double_out set (security_invoker = true);

grant select on public.checkout_leaderboard to anon, authenticated, service_role;
grant select on public.checkout_leaderboard_single_out to anon, authenticated, service_role;
grant select on public.checkout_leaderboard_double_out to anon, authenticated, service_role;

-- 3. quickest_legs_leaderboard – subquery joins turns
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
        where tu.leg_id = l.id
          and tu.player_id = l.winner_player_id
          and tu.tiebreak_round is null
    ) as dart_count
from public.legs l
join public.matches m on l.match_id = m.id
join public.players p on l.winner_player_id = p.id
where
    l.winner_player_id is not null
    and (m.ended_early = false or m.ended_early is null)
    and p.is_active = true
    and p.is_test = false;

alter view public.quickest_legs_leaderboard set (security_invoker = true);
grant select on public.quickest_legs_leaderboard to anon, authenticated, service_role;

-- 4. player_throw_stats – joins turns tu
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
  and tu.tiebreak_round is null
group by p.id, p.display_name, t.segment, t.scored;

alter view public.player_throw_stats set (security_invoker = true);

-- 5. player_segment_summary – joins turns tu
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
  and tu.tiebreak_round is null
group by p.id, p.display_name, t.segment;

alter view public.player_segment_summary set (security_invoker = true);

-- 6. player_adjacency_stats – depends on player_segment_summary (already filtered)
-- Recreate to re-apply security_invoker after player_segment_summary change
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

alter view public.player_adjacency_stats set (security_invoker = true);

-- 7. player_accuracy_stats – joins turns tu
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
  and tu.tiebreak_round is null
group by p.id, p.display_name
having count(*) > 10;

alter view public.player_accuracy_stats set (security_invoker = true);
