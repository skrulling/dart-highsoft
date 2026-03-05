drop function if exists public.assign_elimination_rank(uuid, uuid);

create function public.assign_elimination_rank(
  p_tournament_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
as $$
declare
  v_total int;
  v_ranked int;
begin
  -- Serialize rank assignment per tournament to avoid duplicate ranks.
  perform pg_advisory_xact_lock(hashtextextended(p_tournament_id::text, 0));

  select count(*) into v_total
    from public.tournament_players
   where tournament_id = p_tournament_id;

  select count(*) into v_ranked
    from public.tournament_players
   where tournament_id = p_tournament_id
     and final_rank is not null;

  update public.tournament_players
     set final_rank = v_total - v_ranked
   where tournament_id = p_tournament_id
     and player_id = p_player_id
     and final_rank is null;
end;
$$;

grant execute on function public.assign_elimination_rank(uuid, uuid)
  to anon, authenticated, service_role;
