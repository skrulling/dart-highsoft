-- Add winner to matches and a stats view
alter table public.matches
  add column if not exists winner_player_id uuid references public.players(id);

-- Simple view for total match wins per player
create or replace view public.player_match_wins as
select p.id as player_id, p.display_name, count(m.*) as wins
from public.players p
left join public.matches m on m.winner_player_id = p.id
group by p.id, p.display_name
order by wins desc;

-- Ensure RLS permits reading the view through base tables
-- (matches and players already have public read policies)

-- Optional: allow updates to matches already added in previous migration
