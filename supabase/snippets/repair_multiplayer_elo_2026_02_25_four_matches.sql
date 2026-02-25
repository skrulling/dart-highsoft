-- Targeted multiplayer Elo repair for 4 matches on 2026-02-25.
--
-- Scope:
-- - Rebuilds elo history rows for the four listed matches using the corrected
--   multiplayer Elo function (0041)
-- - Updates current players.elo_rating_multi for the affected players
-- - Restores original elo_ratings_multi.created_at timestamps for those rows
--
-- Safety:
-- - Runs in a single transaction
-- - Creates backup tables before mutation
-- - Aborts if target matches are not a clean replayable suffix for affected players
--
-- IMPORTANT:
-- - Freeze multiplayer Elo writes (disable /api/elo-multi/update) before running.
-- - Review backup table names below. Script aborts if they already exist.

begin;

select pg_advisory_xact_lock(914260225001);

lock table public.elo_ratings_multi in share row exclusive mode;
lock table public.players in row exclusive mode;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

create temp table _target_matches (
  match_id uuid primary key
) on commit drop;

insert into _target_matches (match_id) values
  ('e573efcc-3c3f-44a0-9e4a-3b2c035257a1'),
  ('b93104e4-b61f-4c98-8abe-f82ae052915a'),
  ('3d63894e-746c-4cc0-9380-20c66c73e0bf'),
  ('845df8eb-ce8a-4c31-a593-0835ddc293c5');

do $$
declare
  v_target_count int;
  v_match_count int;
  v_row_count int;
  v_duplicate_pairs int;
  v_bad_field_size_rows int;
  v_bad_function boolean;
  v_non_suffix_rows int;
begin
  select count(*) into v_target_count from _target_matches;
  if v_target_count <> 4 then
    raise exception 'Expected exactly 4 target matches, found %', v_target_count;
  end if;

  select count(*) into v_match_count
  from public.matches m
  join _target_matches t on t.match_id = m.id;
  if v_match_count <> 4 then
    raise exception 'One or more target matches do not exist in public.matches (found %/4)', v_match_count;
  end if;

  select count(*) into v_row_count
  from public.elo_ratings_multi em
  join _target_matches t on t.match_id = em.match_id;
  if v_row_count = 0 then
    raise exception 'No elo_ratings_multi rows found for target matches';
  end if;

  select count(*) into v_duplicate_pairs
  from (
    select em.match_id, em.player_id
    from public.elo_ratings_multi em
    join _target_matches t on t.match_id = em.match_id
    group by em.match_id, em.player_id
    having count(*) <> 1
  ) d;
  if v_duplicate_pairs <> 0 then
    raise exception 'Target rows must have exactly one elo_ratings_multi row per (match_id, player_id); found % violations', v_duplicate_pairs;
  end if;

  select count(*) into v_bad_field_size_rows
  from (
    select em.match_id, em.field_size, count(*) as row_count
    from public.elo_ratings_multi em
    join _target_matches t on t.match_id = em.match_id
    group by em.match_id, em.field_size
  ) s
  where s.field_size <> s.row_count
     or s.field_size <= 2;
  if v_bad_field_size_rows <> 0 then
    raise exception 'Target matches failed field_size validation (% matches)', v_bad_field_size_rows;
  end if;

  select position('sqrt(2)' in pg_get_functiondef(
    'public.update_elo_ratings_multiplayer(uuid,uuid[],integer[],integer)'::regprocedure
  )) = 0
  into v_bad_function;

  if v_bad_function then
    raise exception 'Current DB function update_elo_ratings_multiplayer does not appear to include inverted scaling (sqrt(2) not found)';
  end if;

  -- Safety guard: target rows must be a clean replayable suffix for affected players.
  -- We replay from each affected player's first target row forward. If there are any
  -- non-target multiplayer Elo rows for those players at or after the earliest target
  -- Elo timestamp, a 4-match-only repair is unsafe and we abort.
  with affected_players as (
    select distinct em.player_id
    from public.elo_ratings_multi em
    join _target_matches t on t.match_id = em.match_id
  ),
  earliest_target as (
    select min(em.created_at) as min_target_elo_created_at
    from public.elo_ratings_multi em
    join _target_matches t on t.match_id = em.match_id
  )
  select count(*) into v_non_suffix_rows
  from public.elo_ratings_multi em
  join affected_players ap on ap.player_id = em.player_id
  cross join earliest_target et
  left join _target_matches t on t.match_id = em.match_id
  where t.match_id is null
    and em.created_at >= et.min_target_elo_created_at;

  if v_non_suffix_rows <> 0 then
    raise exception 'Unsafe targeted repair: found % non-target multiplayer Elo rows for affected players at/after earliest target Elo timestamp. Replay a larger suffix or full multiplayer history.', v_non_suffix_rows;
  end if;
end
$$;

do $$
begin
  if to_regclass('public._repair_multielo_20260225_rows_backup') is not null then
    raise exception 'Backup table public._repair_multielo_20260225_rows_backup already exists';
  end if;
  if to_regclass('public._repair_multielo_20260225_players_backup') is not null then
    raise exception 'Backup table public._repair_multielo_20260225_players_backup already exists';
  end if;
end
$$;

create table public._repair_multielo_20260225_rows_backup as
select em.*
from public.elo_ratings_multi em
join _target_matches t on t.match_id = em.match_id;

create table public._repair_multielo_20260225_players_backup as
select p.id as player_id, p.elo_rating_multi
from public.players p
where p.id in (
  select distinct em.player_id
  from public.elo_ratings_multi em
  join _target_matches t on t.match_id = em.match_id
);

create temp table _target_rows on commit drop as
select *
from public._repair_multielo_20260225_rows_backup;

create temp table _affected_players on commit drop as
select distinct player_id
from _target_rows;

create temp table _player_baselines on commit drop as
select player_id, rating_before as baseline_rating
from (
  select
    tr.*,
    row_number() over (
      partition by tr.player_id
      order by tr.created_at asc, tr.match_id asc
    ) as rn
  from _target_rows tr
) x
where x.rn = 1;

create temp table _replay_queue on commit drop as
select
  tr.match_id,
  min(tr.created_at) as original_elo_created_at,
  array_agg(tr.player_id order by tr.rank asc, tr.player_id asc) as player_ids,
  array_agg(tr.rank order by tr.rank asc, tr.player_id asc) as ranks
from _target_rows tr
group by tr.match_id;

-- Delete target history rows first; 0040/0041 idempotency skips matches with existing rows.
delete from public.elo_ratings_multi em
using _target_matches t
where em.match_id = t.match_id;

-- Reset affected players to the ratings they had immediately before their first repaired match.
update public.players p
set elo_rating_multi = b.baseline_rating
from _player_baselines b
where p.id = b.player_id;

do $$
declare
  rec record;
begin
  for rec in
    select rq.match_id, rq.player_ids, rq.ranks
    from _replay_queue rq
    order by rq.original_elo_created_at asc, rq.match_id asc
  loop
    perform public.update_elo_ratings_multiplayer(
      rec.match_id,
      rec.player_ids,
      rec.ranks,
      32
    );
  end loop;
end
$$;

-- Restore original created_at timestamps on regenerated history rows.
update public.elo_ratings_multi em
set created_at = b.created_at
from public._repair_multielo_20260225_rows_backup b
where em.match_id = b.match_id
  and em.player_id = b.player_id;

do $$
declare
  v_backup_rows int;
  v_live_rows int;
  v_missing_pairs int;
  v_bad_formula_rows int;
  v_bad_player_ratings int;
begin
  select count(*) into v_backup_rows from public._repair_multielo_20260225_rows_backup;
  select count(*) into v_live_rows
  from public.elo_ratings_multi em
  join _target_matches t on t.match_id = em.match_id;

  if v_live_rows <> v_backup_rows then
    raise exception 'Validation failed: target row count mismatch (live %, backup %)', v_live_rows, v_backup_rows;
  end if;

  select count(*) into v_missing_pairs
  from public._repair_multielo_20260225_rows_backup b
  left join public.elo_ratings_multi em
    on em.match_id = b.match_id
   and em.player_id = b.player_id
  where em.id is null;

  if v_missing_pairs <> 0 then
    raise exception 'Validation failed: missing regenerated (match_id, player_id) rows (%)', v_missing_pairs;
  end if;

  -- Repaired rows should now match the corrected scaling formula exactly.
  with repaired as (
    select
      em.*,
      greatest(
        100,
        em.rating_before
        + round((32::numeric * sqrt((em.field_size - 1)::numeric) / sqrt(2::numeric)) * (em.observed_score - em.expected_score))::int
      ) as expected_rating_after
    from public.elo_ratings_multi em
    join _target_matches t on t.match_id = em.match_id
  )
  select count(*) into v_bad_formula_rows
  from repaired r
  where r.rating_after <> r.expected_rating_after
     or r.rating_change <> (r.expected_rating_after - r.rating_before);

  if v_bad_formula_rows <> 0 then
    raise exception 'Validation failed: % repaired rows still do not match corrected scaling formula', v_bad_formula_rows;
  end if;

  -- Affected players' current multiplayer ratings must match the latest history row.
  with latest as (
    select distinct on (em.player_id)
      em.player_id,
      em.rating_after as latest_rating_after
    from public.elo_ratings_multi em
    join _affected_players ap on ap.player_id = em.player_id
    order by em.player_id, em.created_at desc, em.match_id desc
  )
  select count(*) into v_bad_player_ratings
  from latest l
  join public.players p on p.id = l.player_id
  where p.elo_rating_multi <> l.latest_rating_after;

  if v_bad_player_ratings <> 0 then
    raise exception 'Validation failed: % affected players have players.elo_rating_multi that does not match latest history row', v_bad_player_ratings;
  end if;
end
$$;

-- Final audit output for operator review.
select
  em.match_id,
  min(m.created_at) as match_created_at,
  min(em.created_at) as elo_created_at,
  count(*) as player_rows,
  min(em.field_size) as field_size,
  sum(case when em.rank = 1 then em.rating_change else 0 end) as winner_change_sum,
  string_agg(
    p.display_name || ' (r' || em.rank || '): ' || em.rating_before || ' -> ' || em.rating_after || ' (' ||
    case when em.rating_change >= 0 then '+' else '' end || em.rating_change || ')',
    '; '
    order by em.rank, p.display_name
  ) as player_changes
from public.elo_ratings_multi em
join _target_matches t on t.match_id = em.match_id
join public.players p on p.id = em.player_id
join public.matches m on m.id = em.match_id
group by em.match_id
order by min(em.created_at), em.match_id;

commit;

