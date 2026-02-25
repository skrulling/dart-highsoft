-- Switch multiplayer Elo updates to a Plackett-Luce / Bradley-Terry winner-
-- probability model (winner-only observed outcome, constant K-factor).
--
-- Rationale:
-- - Our multiplayer matches have exactly one winner and all others are losers.
-- - The previous pairwise model + field-size scaling made lobby size affect
--   point swings in ways that did not match our desired behavior.
-- - This model uses each player's probability of winning the whole field:
--     s_i = 10^(R_i / 400)
--     P_i(win) = s_i / sum_j s_j
--   and updates:
--     delta_i = K * (observed_i - P_i)
--   with observed_i = 1 for the winner, 0 otherwise.
--
-- Notes:
-- - No backfill is performed; this applies only to future multiplayer matches.
-- - expected_score/observed_score in elo_ratings_multi now represent:
--     expected_score = whole-field win probability
--     observed_score = winner-only outcome (1 or 0)

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
  ratings int[];
  new_ratings int[];
  s numeric[];
  e numeric[];
  q numeric[];
  q_sum numeric := 0;
  r_i int;
  q_i numeric;
  change_i int;
  v_distinct_count int;
  v_existing_count int;
  v_already_rated boolean;
  v_winner_count int;
  v_invalid_rank_count int;
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

  select
    count(*) filter (where r = 1),
    count(*) filter (where r < 1)
  into v_winner_count, v_invalid_rank_count
  from unnest(p_ranks) as r;

  if v_invalid_rank_count <> 0 then
    raise exception 'p_ranks must be positive integers (1 = winner)';
  end if;

  if v_winner_count <> 1 then
    raise exception 'multiplayer Elo requires exactly one winner (rank = 1), got %', v_winner_count;
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
  q := array[]::numeric[];

  for i in 1..n loop
    select coalesce(elo_rating_multi, 1200)
    into r_i
    from public.players
    where id = p_player_ids[i];

    ratings := ratings || r_i;
    q_i := power(10::numeric, r_i::numeric / 400::numeric);
    q := q || q_i;
    q_sum := q_sum + q_i;
  end loop;

  if q_sum <= 0 then
    raise exception 'invalid win-probability denominator in multiplayer Elo update';
  end if;

  e := array[]::numeric[];
  s := array[]::numeric[];
  for i in 1..n loop
    e := e || (q[i] / q_sum);
    s := s || (case when p_ranks[i] = 1 then 1::numeric else 0::numeric end);
  end loop;

  new_ratings := array[]::int[];
  for i in 1..n loop
    r_i := ratings[i];
    change_i := round(p_k_factor * (s[i] - e[i]));
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

