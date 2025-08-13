-- Add ended_early flag to matches table to track games that were terminated early
-- When true, this match and all its data should be excluded from statistics

alter table public.matches
  add column if not exists ended_early boolean not null default false;

-- Update RLS policies to include the new column
create policy "public update ended_early" on public.matches 
  for update using (true) with check (true);

-- Update the player_summary view to exclude ended_early games
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
order by wins desc, avg_per_turn desc;

-- Update player_match_wins view to exclude ended_early games
create or replace view public.player_match_wins as
select p.id as player_id, p.display_name, count(m.*) as wins
from public.players p
left join public.matches m on m.winner_player_id = p.id and m.ended_early = false
group by p.id, p.display_name
order by wins desc;