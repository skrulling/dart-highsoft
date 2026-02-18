-- Invert multiplayer Elo K-factor scaling so that larger fields reward winners more.
--
-- Before: k_scaled = K / sqrt(n-1)   → bigger games = smaller changes (punishes large lobbies)
-- After:  k_scaled = K * sqrt(n-1)/sqrt(2) → bigger games = larger changes, normalized so 3 players = base K
--
-- Example winner gains for equal-rated players (K=32):
--   3 players: +16  (was +11)
--   4 players: +20  (was +9)
--   6 players: +25  (was +6)
--  10 players: +34  (was +5)

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

  -- Inverted scaling: larger fields reward winners more.
  -- Normalized so that 3 players (sqrt(2)/sqrt(2)) = base K.
  k_scaled := p_k_factor * sqrt(n - 1) / sqrt(2);

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
