-- Precompute recent ELO trends per player to avoid loading full rating history
-- and trimming client-side for leaderboard sparklines.

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
  where p.display_name not ilike '%test%'
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
  where p.display_name not ilike '%test%'
)
select
  player_id,
  coalesce(array_agg(rating_after order by created_at asc), '{}'::int[]) as last_20_ratings
from ranked
where rn <= 20
group by player_id;

alter view if exists public.player_recent_elo_trend set (security_invoker = true);
alter view if exists public.player_recent_elo_multi_trend set (security_invoker = true);

grant select on public.player_recent_elo_trend to anon, authenticated;
grant select on public.player_recent_elo_multi_trend to anon, authenticated;
