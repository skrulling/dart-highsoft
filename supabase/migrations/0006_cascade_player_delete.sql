-- Ensure deleting a player removes related data
-- 1) Adjust FKs to cascade where appropriate
alter table if exists public.match_players
  drop constraint if exists match_players_player_id_fkey;
alter table if exists public.match_players
  add constraint match_players_player_id_fkey
  foreign key (player_id) references public.players(id) on delete cascade;

alter table if exists public.turns
  drop constraint if exists turns_player_id_fkey;
alter table if exists public.turns
  add constraint turns_player_id_fkey
  foreign key (player_id) references public.players(id) on delete cascade;

-- legs.starting_player_id and legs.winner_player_id will be removed by match deletion;
-- we keep them as-is to avoid partial leg deletion outside of match removal.

-- 2) Trigger to delete matches a player participated in
create or replace function public.cascade_delete_player_matches()
returns trigger
language plpgsql as $$
begin
  delete from public.matches m
  using public.match_players mp
  where mp.player_id = OLD.id and mp.match_id = m.id;
  return OLD;
end;
$$;

drop trigger if exists trg_cascade_player_delete on public.players;
create trigger trg_cascade_player_delete
before delete on public.players
for each row execute function public.cascade_delete_player_matches();

-- 3) RLS policy to allow deleting players (adjust in production as needed)
create policy if not exists "public delete" on public.players for delete using (true);
