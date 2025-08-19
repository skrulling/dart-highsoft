-- Backfill ELO ratings for historical matches
-- This script processes all completed 1v1 matches chronologically to calculate historical ELO ratings

-- Function to backfill ELO ratings from historical matches
create or replace function backfill_historical_elo_ratings()
returns void as $$
declare
  match_record record;
  winner_id uuid;
  loser_id uuid;
  player_count int;
begin
  -- Reset all ELO ratings to starting value (1200) before backfill
  update public.players set elo_rating = 1200;
  
  -- Clear existing ELO rating records (since we're recalculating from scratch)
  delete from public.elo_ratings;
  
  raise notice 'Starting ELO backfill for historical matches...';
  
  -- Process all completed matches chronologically
  for match_record in
    select 
      m.id,
      m.winner_player_id,
      m.created_at,
      array_agg(mp.player_id) as player_ids
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.winner_player_id is not null
    group by m.id, m.winner_player_id, m.created_at
    having count(mp.player_id) = 2  -- Only 1v1 matches
    order by m.created_at asc
  loop
    winner_id := match_record.winner_player_id;
    
    -- Find the loser (the other player in the match)
    select player_id into loser_id
    from unnest(match_record.player_ids) as player_id
    where player_id != winner_id
    limit 1;
    
    if loser_id is not null then
      -- Update ELO ratings for this match
      perform update_elo_ratings(
        match_record.id,
        winner_id,
        loser_id,
        32  -- K-factor
      );
      
      raise notice 'Processed match % (% vs %) at %', 
        match_record.id, winner_id, loser_id, match_record.created_at;
    end if;
  end loop;
  
  raise notice 'ELO backfill completed!';
end;
$$ language plpgsql;

-- Execute the backfill (uncomment the line below to run it)
-- select backfill_historical_elo_ratings();

-- After running the backfill, you can drop the function if you don't need it anymore
-- drop function if exists backfill_historical_elo_ratings();