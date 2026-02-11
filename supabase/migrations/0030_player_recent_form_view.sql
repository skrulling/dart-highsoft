-- Precompute each player's recent 1v1 form (last 10 match outcomes)
-- so clients can render win/loss sparklines without scanning matches.

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
    and p.display_name not ilike '%test%'
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
