-- Optimize recent leaderboard data access with targeted indexes and
-- parameterized helper functions that only scan requested players.

create index if not exists idx_elo_ratings_player_created_at_desc
  on public.elo_ratings (player_id, created_at desc);

create index if not exists idx_elo_ratings_multi_player_created_at_desc
  on public.elo_ratings_multi (player_id, created_at desc);

create index if not exists idx_match_players_player_id_match_id
  on public.match_players (player_id, match_id);

create or replace function public.get_player_recent_elo_trend(
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
    where p.display_name not ilike '%test%'
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

create or replace function public.get_player_recent_elo_multi_trend(
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
    where p.display_name not ilike '%test%'
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
