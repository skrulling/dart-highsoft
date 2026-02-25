-- Make Elo update functions idempotent: if ratings have already been recorded
-- for a given match, the functions return early without applying changes.
-- This is a defense-in-depth measure on top of the API-level idempotency guard.

-- 1) Recreate 1v1 Elo updater with idempotency check.
drop function if exists public.update_elo_ratings(uuid, uuid, uuid, integer);

create function public.update_elo_ratings(
  p_match_id uuid,
  p_winner_id uuid,
  p_loser_id uuid,
  p_k_factor int default 32
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  winner_rating int;
  loser_rating int;
  expected_winner numeric;
  expected_loser numeric;
  new_winner_rating int;
  new_loser_rating int;
  v_player_count int;
  v_already_rated boolean;
begin
  if p_winner_id = p_loser_id then
    raise exception 'winner and loser must be different players';
  end if;

  -- Idempotency: if elo_ratings already recorded for this match, skip.
  select exists(
    select 1 from public.elo_ratings where match_id = p_match_id limit 1
  ) into v_already_rated;

  if v_already_rated then
    return;
  end if;

  -- Deterministic lock order avoids deadlocks across concurrent updates.
  perform 1
  from public.players
  where id in (p_winner_id, p_loser_id)
  order by id
  for update;

  select count(*) into v_player_count
  from public.players
  where id in (p_winner_id, p_loser_id);

  if v_player_count <> 2 then
    raise exception 'update_elo_ratings requires two existing players';
  end if;

  select elo_rating into winner_rating from public.players where id = p_winner_id;
  select elo_rating into loser_rating from public.players where id = p_loser_id;

  expected_winner := public.calculate_expected_score(winner_rating, loser_rating);
  expected_loser := public.calculate_expected_score(loser_rating, winner_rating);

  new_winner_rating := greatest(winner_rating + round(p_k_factor * (1 - expected_winner)), 100);
  new_loser_rating := greatest(loser_rating + round(p_k_factor * (0 - expected_loser)), 100);

  update public.players
  set elo_rating = new_winner_rating
  where id = p_winner_id;

  update public.players
  set elo_rating = new_loser_rating
  where id = p_loser_id;

  insert into public.elo_ratings (
    player_id, match_id, rating_before, rating_after, rating_change,
    opponent_id, opponent_rating_before, is_winner
  ) values (
    p_winner_id, p_match_id, winner_rating, new_winner_rating,
    new_winner_rating - winner_rating, p_loser_id, loser_rating, true
  );

  insert into public.elo_ratings (
    player_id, match_id, rating_before, rating_after, rating_change,
    opponent_id, opponent_rating_before, is_winner
  ) values (
    p_loser_id, p_match_id, loser_rating, new_loser_rating,
    new_loser_rating - loser_rating, p_winner_id, winner_rating, false
  );
end;
$$;

revoke execute on function public.update_elo_ratings(uuid, uuid, uuid, integer) from anon, authenticated;

-- 2) Recreate multiplayer Elo updater with idempotency check.
drop function if exists public.update_elo_ratings_multiplayer(uuid, uuid[], integer[], integer);

create function public.update_elo_ratings_multiplayer(
  p_match_id uuid,
  p_player_ids uuid[],
  p_ranks int[],
  p_k_factor int default 32
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n int := array_length(p_player_ids, 1);
  i int;
  j int;
  ratings int[];
  new_ratings int[];
  s numeric[];
  e numeric[];
  k_scaled numeric;
  beaten int;
  tied int;
  r_i int;
  r_j int;
  sum_exp numeric;
  change_i int;
  v_distinct_count int;
  v_existing_count int;
  v_already_rated boolean;
begin
  if n is null or n < 2 then
    raise exception 'update_elo_ratings_multiplayer requires at least 2 players';
  end if;

  if array_length(p_ranks, 1) is distinct from n then
    raise exception 'p_player_ids and p_ranks must be the same length';
  end if;

  select count(distinct pid) into v_distinct_count
  from unnest(p_player_ids) as pid;

  if v_distinct_count <> n then
    raise exception 'p_player_ids must not contain duplicates';
  end if;

  -- Idempotency: if elo_ratings_multi already recorded for this match, skip.
  select exists(
    select 1 from public.elo_ratings_multi where match_id = p_match_id limit 1
  ) into v_already_rated;

  if v_already_rated then
    return;
  end if;

  -- Deterministic lock order avoids deadlocks across concurrent updates.
  perform 1
  from public.players
  where id = any(p_player_ids)
  order by id
  for update;

  select count(*) into v_existing_count
  from public.players
  where id = any(p_player_ids);

  if v_existing_count <> n then
    raise exception 'update_elo_ratings_multiplayer requires all players to exist';
  end if;

  ratings := array[]::int[];
  for i in 1..n loop
    select coalesce(elo_rating_multi, 1200)
    into r_i
    from public.players
    where id = p_player_ids[i];
    ratings := ratings || r_i;
  end loop;

  s := array[]::numeric[];
  for i in 1..n loop
    beaten := 0;
    tied := 0;
    for j in 1..n loop
      if j = i then continue; end if;
      if p_ranks[i] < p_ranks[j] then
        beaten := beaten + 1;
      elsif p_ranks[i] = p_ranks[j] then
        tied := tied + 1;
      end if;
    end loop;
    s := s || ((beaten + 0.5 * tied)::numeric / (n - 1));
  end loop;

  e := array[]::numeric[];
  for i in 1..n loop
    r_i := ratings[i];
    sum_exp := 0;
    for j in 1..n loop
      if j = i then continue; end if;
      r_j := ratings[j];
      sum_exp := sum_exp + public.calculate_expected_score(r_i, r_j);
    end loop;
    e := e || (sum_exp / (n - 1));
  end loop;

  k_scaled := p_k_factor / sqrt(n - 1);

  new_ratings := array[]::int[];
  for i in 1..n loop
    r_i := ratings[i];
    change_i := round(k_scaled * (s[i] - e[i]));
    r_i := greatest(100, r_i + change_i);
    new_ratings := new_ratings || r_i;
  end loop;

  for i in 1..n loop
    update public.players
    set elo_rating_multi = new_ratings[i]
    where id = p_player_ids[i];

    insert into public.elo_ratings_multi (
      player_id, match_id, rating_before, rating_after, rating_change,
      field_size, rank, expected_score, observed_score
    ) values (
      p_player_ids[i], p_match_id, ratings[i], new_ratings[i], new_ratings[i] - ratings[i],
      n, p_ranks[i], e[i], s[i]
    );
  end loop;
end;
$$;

revoke execute on function public.update_elo_ratings_multiplayer(uuid, uuid[], integer[], integer) from anon, authenticated;
