-- Player average points per round (turn) and summary view
create or replace view public.player_avg_per_turn as
select t.player_id, avg(t.total_scored)::numeric(10,2) as avg_per_turn
from public.turns t
group by t.player_id;

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
  where winner_player_id is not null
  group by winner_player_id
) w on w.winner_player_id = p.id
left join public.player_avg_per_turn a on a.player_id = p.id
order by wins desc, avg_per_turn desc;
