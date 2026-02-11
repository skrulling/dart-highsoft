-- Harden ELO update concurrency, normalize test-player filtering,
-- and improve leaderboard/stats query performance.

-- 1) Add explicit test-flag instead of relying on display_name pattern matching.
alter table public.players
  add column if not exists is_test boolean not null default false;

update public.players
set is_test = true
where display_name ilike '%test%';

create index if not exists idx_players_is_test on public.players (is_test);

-- 2) Speed up winner aggregations used by leaderboard views.
create index if not exists idx_matches_winner_non_ended
  on public.matches (winner_player_id)
  where ended_early = false and winner_player_id is not null;

-- 3) Recreate recent-form and trend views with is_test filtering.
drop view if exists public.player_recent_form;

create view public.player_recent_form as
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
)
select
  player_id,
  coalesce(array_agg(result order by created_at desc), '{}'::int[]) as last_10_results,
  coalesce(sum(result), 0)::int as form_score,
  coalesce(sum(case when result = 1 then 1 else 0 end), 0)::int as wins_in_last_10
from participant_results
where rn <= 10
group by player_id;

alter view if exists public.player_recent_form set (security_invoker = true);
grant select on public.player_recent_form to anon, authenticated;

drop view if exists public.player_recent_elo_trend;
drop view if exists public.player_recent_elo_multi_trend;

create view public.player_recent_elo_trend as
with ranked as (
  select
    er.player_id,
    er.rating_after,
    er.created_at,
    row_number() over (
      partition by er.player_id
      order by er.created_at desc
    ) as rn
  from public.elo_ratings er
  join public.players p on p.id = er.player_id
  where p.is_test = false
)
select
  player_id,
  coalesce(array_agg(rating_after order by created_at asc), '{}'::int[]) as last_20_ratings
from ranked
where rn <= 20
group by player_id;

create view public.player_recent_elo_multi_trend as
with ranked as (
  select
    erm.player_id,
    erm.rating_after,
    erm.created_at,
    row_number() over (
      partition by erm.player_id
      order by erm.created_at desc
    ) as rn
  from public.elo_ratings_multi erm
  join public.players p on p.id = erm.player_id
  where p.is_test = false
)
select
  player_id,
  coalesce(array_agg(rating_after order by created_at asc), '{}'::int[]) as last_20_ratings
from ranked
where rn <= 20
group by player_id;

alter view if exists public.player_recent_elo_trend set (security_invoker = true);
alter view if exists public.player_recent_elo_multi_trend set (security_invoker = true);

-- App uses RPC paths for trend sparklines; keep direct view access private.
revoke select on public.player_recent_elo_trend from anon, authenticated;
revoke select on public.player_recent_elo_multi_trend from anon, authenticated;

-- 4) Recreate helper RPCs to use is_test flag.
drop function if exists public.get_player_recent_elo_trend(uuid[], int);
drop function if exists public.get_player_recent_elo_multi_trend(uuid[], int);

create function public.get_player_recent_elo_trend(
  p_player_ids uuid[],
  p_limit int default 20
)
returns table (
  player_id uuid,
  last_20_ratings int[]
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with requested_players as (
    select distinct unnest(p_player_ids)::uuid as player_id
  ),
  limited_ratings as (
    select
      rp.player_id,
      er.rating_after,
      er.created_at
    from requested_players rp
    join public.players p on p.id = rp.player_id
    left join lateral (
      select er.rating_after, er.created_at
      from public.elo_ratings er
      where er.player_id = rp.player_id
      order by er.created_at desc
      limit greatest(coalesce(p_limit, 20), 1)
    ) er on true
    where p.is_test = false
  )
  select
    lr.player_id,
    coalesce(
      array_agg(lr.rating_after order by lr.created_at asc) filter (where lr.rating_after is not null),
      '{}'::int[]
    ) as last_20_ratings
  from limited_ratings lr
  group by lr.player_id;
$$;

create function public.get_player_recent_elo_multi_trend(
  p_player_ids uuid[],
  p_limit int default 20
)
returns table (
  player_id uuid,
  last_20_ratings int[]
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with requested_players as (
    select distinct unnest(p_player_ids)::uuid as player_id
  ),
  limited_ratings as (
    select
      rp.player_id,
      er.rating_after,
      er.created_at
    from requested_players rp
    join public.players p on p.id = rp.player_id
    left join lateral (
      select erm.rating_after, erm.created_at
      from public.elo_ratings_multi erm
      where erm.player_id = rp.player_id
      order by erm.created_at desc
      limit greatest(coalesce(p_limit, 20), 1)
    ) er on true
    where p.is_test = false
  )
  select
    lr.player_id,
    coalesce(
      array_agg(lr.rating_after order by lr.created_at asc) filter (where lr.rating_after is not null),
      '{}'::int[]
    ) as last_20_ratings
  from limited_ratings lr
  group by lr.player_id;
$$;

grant execute on function public.get_player_recent_elo_trend(uuid[], int) to anon, authenticated;
grant execute on function public.get_player_recent_elo_multi_trend(uuid[], int) to anon, authenticated;

-- 5) Recreate 1v1 Elo updater with deterministic row locking.
drop function if exists public.update_elo_ratings(uuid, uuid, uuid, integer);

create function public.update_elo_ratings(
  p_match_id uuid,
  p_winner_id uuid,
  p_loser_id uuid,
  p_k_factor int default 32
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  winner_rating int;
  loser_rating int;
  expected_winner numeric;
  expected_loser numeric;
  new_winner_rating int;
  new_loser_rating int;
  v_player_count int;
begin
  if p_winner_id = p_loser_id then
    raise exception 'winner and loser must be different players';
  end if;

  -- Deterministic lock order avoids deadlocks across concurrent updates.
  perform 1
  from public.players
  where id in (p_winner_id, p_loser_id)
  order by id
  for update;

  select count(*) into v_player_count
  from public.players
  where id in (p_winner_id, p_loser_id);

  if v_player_count <> 2 then
    raise exception 'update_elo_ratings requires two existing players';
  end if;

  select elo_rating into winner_rating from public.players where id = p_winner_id;
  select elo_rating into loser_rating from public.players where id = p_loser_id;

  expected_winner := public.calculate_expected_score(winner_rating, loser_rating);
  expected_loser := public.calculate_expected_score(loser_rating, winner_rating);

  new_winner_rating := greatest(winner_rating + round(p_k_factor * (1 - expected_winner)), 100);
  new_loser_rating := greatest(loser_rating + round(p_k_factor * (0 - expected_loser)), 100);

  update public.players
  set elo_rating = new_winner_rating
  where id = p_winner_id;

  update public.players
  set elo_rating = new_loser_rating
  where id = p_loser_id;

  insert into public.elo_ratings (
    player_id, match_id, rating_before, rating_after, rating_change,
    opponent_id, opponent_rating_before, is_winner
  ) values (
    p_winner_id, p_match_id, winner_rating, new_winner_rating,
    new_winner_rating - winner_rating, p_loser_id, loser_rating, true
  );

  insert into public.elo_ratings (
    player_id, match_id, rating_before, rating_after, rating_change,
    opponent_id, opponent_rating_before, is_winner
  ) values (
    p_loser_id, p_match_id, loser_rating, new_loser_rating,
    new_loser_rating - loser_rating, p_winner_id, winner_rating, false
  );
end;
$$;

revoke execute on function public.update_elo_ratings(uuid, uuid, uuid, integer) from anon, authenticated;

-- 6) Recreate multiplayer Elo updater with deterministic row locking.
drop function if exists public.update_elo_ratings_multiplayer(uuid, uuid[], integer[], integer);

create function public.update_elo_ratings_multiplayer(
  p_match_id uuid,
  p_player_ids uuid[],
  p_ranks int[],
  p_k_factor int default 32
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n int := array_length(p_player_ids, 1);
  i int;
  j int;
  ratings int[];
  new_ratings int[];
  s numeric[];
  e numeric[];
  k_scaled numeric;
  beaten int;
  tied int;
  r_i int;
  r_j int;
  sum_exp numeric;
  change_i int;
  v_distinct_count int;
  v_existing_count int;
begin
  if n is null or n < 2 then
    raise exception 'update_elo_ratings_multiplayer requires at least 2 players';
  end if;

  if array_length(p_ranks, 1) is distinct from n then
    raise exception 'p_player_ids and p_ranks must be the same length';
  end if;

  select count(distinct pid) into v_distinct_count
  from unnest(p_player_ids) as pid;

  if v_distinct_count <> n then
    raise exception 'p_player_ids must not contain duplicates';
  end if;

  -- Deterministic lock order avoids deadlocks across concurrent updates.
  perform 1
  from public.players
  where id = any(p_player_ids)
  order by id
  for update;

  select count(*) into v_existing_count
  from public.players
  where id = any(p_player_ids);

  if v_existing_count <> n then
    raise exception 'update_elo_ratings_multiplayer requires all players to exist';
  end if;

  ratings := array[]::int[];
  for i in 1..n loop
    select coalesce(elo_rating_multi, 1200)
    into r_i
    from public.players
    where id = p_player_ids[i];
    ratings := ratings || r_i;
  end loop;

  s := array[]::numeric[];
  for i in 1..n loop
    beaten := 0;
    tied := 0;
    for j in 1..n loop
      if j = i then continue; end if;
      if p_ranks[i] < p_ranks[j] then
        beaten := beaten + 1;
      elsif p_ranks[i] = p_ranks[j] then
        tied := tied + 1;
      end if;
    end loop;
    s := s || ((beaten + 0.5 * tied)::numeric / (n - 1));
  end loop;

  e := array[]::numeric[];
  for i in 1..n loop
    r_i := ratings[i];
    sum_exp := 0;
    for j in 1..n loop
      if j = i then continue; end if;
      r_j := ratings[j];
      sum_exp := sum_exp + public.calculate_expected_score(r_i, r_j);
    end loop;
    e := e || (sum_exp / (n - 1));
  end loop;

  k_scaled := p_k_factor / sqrt(n - 1);

  new_ratings := array[]::int[];
  for i in 1..n loop
    r_i := ratings[i];
    change_i := round(k_scaled * (s[i] - e[i]));
    r_i := greatest(100, r_i + change_i);
    new_ratings := new_ratings || r_i;
  end loop;

  for i in 1..n loop
    update public.players
    set elo_rating_multi = new_ratings[i]
    where id = p_player_ids[i];

    insert into public.elo_ratings_multi (
      player_id, match_id, rating_before, rating_after, rating_change,
      field_size, rank, expected_score, observed_score
    ) values (
      p_player_ids[i], p_match_id, ratings[i], new_ratings[i], new_ratings[i] - ratings[i],
      n, p_ranks[i], e[i], s[i]
    );
  end loop;
end;
$$;

revoke execute on function public.update_elo_ratings_multiplayer(uuid, uuid[], integer[], integer) from anon, authenticated;

-- 7) Recreate high-traffic stats views with simplified ended_early predicate and is_test filtering.
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
group by p.id, p.display_name
having count(*) > 10;
