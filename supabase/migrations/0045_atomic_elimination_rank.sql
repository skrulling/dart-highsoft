create or replace function public.assign_elimination_rank(
  p_tournament_id uuid,
  p_player_id uuid
)
returns void language plpgsql as $$
declare
  v_total int;
  v_ranked int;
begin
  select count(*) into v_total
    from tournament_players
   where tournament_id = p_tournament_id
     for update;

  select count(*) into v_ranked
    from tournament_players
   where tournament_id = p_tournament_id
     and final_rank is not null;

  update tournament_players
     set final_rank = v_total - v_ranked
   where tournament_id = p_tournament_id
     and player_id = p_player_id
     and final_rank is null;
end;
$$;

grant execute on function public.assign_elimination_rank(uuid, uuid)
  to anon, authenticated, service_role;
