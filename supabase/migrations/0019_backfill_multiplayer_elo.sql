-- Backfill multiplayer Elo ratings from historical matches (exclude test players)

drop function if exists backfill_historical_elo_ratings_multiplayer();

create or replace function backfill_historical_elo_ratings_multiplayer()
returns void as $$
declare
  rec record;
  ranks int[];
  i int;
begin
  -- Reset ratings and clear history
  update public.players set elo_rating_multi = 1200;
  delete from public.elo_ratings_multi;

  raise notice 'Starting multiplayer Elo backfill (excluding test players)...';

  -- Iterate completed matches with 3+ participants, excluding any match containing a test-named player
  for rec in
    select 
      m.id,
      m.created_at,
      m.winner_player_id,
      array_agg(mp.player_id order by mp.play_order) as player_ids
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.winner_player_id is not null
      and coalesce(m.ended_early, false) = false
      and not exists (
        select 1
        from public.match_players mp2
        join public.players p on p.id = mp2.player_id
        where mp2.match_id = m.id
          and p.display_name ilike '%test%'
      )
    group by m.id, m.created_at, m.winner_player_id
    having count(mp.player_id) >= 3
    order by m.created_at asc
  loop
    -- Build ranks: winner = 1, everyone else tied at 2
    ranks := array[]::int[];
    for i in 1..array_length(rec.player_ids, 1) loop
      if rec.player_ids[i] = rec.winner_player_id then
        ranks := ranks || 1;
      else
        ranks := ranks || 2;
      end if;
    end loop;

    perform update_elo_ratings_multiplayer(
      rec.id,
      rec.player_ids,
      ranks,
      32
    );

    raise notice 'Processed multiplayer match % at % with % players', rec.id, rec.created_at, array_length(rec.player_ids, 1);
  end loop;

  raise notice 'Multiplayer Elo backfill completed.';
end;
$$ language plpgsql;

-- To run immediately (uncomment)
-- select backfill_historical_elo_ratings_multiplayer();

