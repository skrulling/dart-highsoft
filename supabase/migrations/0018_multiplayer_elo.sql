-- Multiplayer Elo Rating System (separate from 1v1 Elo)

-- Current multiplayer rating stored separately from 1v1
alter table public.players add column if not exists elo_rating_multi int not null default 1200;

-- Ensure pgcrypto is available for gen_random_uuid()
create extension if not exists pgcrypto;

-- Elo rating history for multiplayer matches
create table if not exists public.elo_ratings_multi (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  rating_before int not null,
  rating_after int not null,
  rating_change int not null,
  field_size int not null,
  rank int not null,
  expected_score numeric not null,
  observed_score numeric not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_elo_ratings_multi_player_id on public.elo_ratings_multi(player_id);
create index if not exists idx_elo_ratings_multi_match_id on public.elo_ratings_multi(match_id);
create index if not exists idx_elo_ratings_multi_created_at on public.elo_ratings_multi(created_at);

-- RLS
alter table public.elo_ratings_multi enable row level security;
drop policy if exists "public read elo_ratings_multi" on public.elo_ratings_multi;
create policy "public read elo_ratings_multi" on public.elo_ratings_multi for select using (true);
drop policy if exists "public write elo_ratings_multi" on public.elo_ratings_multi;
create policy "public write elo_ratings_multi" on public.elo_ratings_multi for insert with check (true);

-- Multiplayer Elo update function
-- Inputs:
--  p_match_id: match id
--  p_player_ids: array of player ids participating
--  p_ranks: array of finish ranks aligned to p_player_ids (1 = first, 2 = second, ...; ties share the same rank)
--  p_k_factor: base K factor (will be scaled by 1/sqrt(n-1))
create or replace function update_elo_ratings_multiplayer(
  p_match_id uuid,
  p_player_ids uuid[],
  p_ranks int[],
  p_k_factor int default 32
)
returns void as $$
declare
  n int := array_length(p_player_ids, 1);
  i int;
  j int;
  ratings int[];
  new_ratings int[];
  s numeric[]; -- observed scores
  e numeric[]; -- expected scores
  k_scaled numeric;
  beaten int;
  tied int;
  r_i int;
  r_j int;
  sum_exp numeric;
  change_i int;
begin
  if n is null or n < 2 then
    raise exception 'update_elo_ratings_multiplayer requires at least 2 players';
  end if;

  if array_length(p_ranks, 1) is distinct from n then
    raise exception 'p_player_ids and p_ranks must be the same length';
  end if;

  -- Load current multiplayer ratings for each player
  ratings := array[]::int[];
  for i in 1..n loop
    select coalesce(elo_rating_multi, 1200) into r_i from public.players where id = p_player_ids[i];
    ratings := ratings || r_i;
  end loop;

  -- Compute observed scores Si = (beaten + 0.5 * tied) / (n-1)
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

  -- Compute expected scores Ei = (1/(n-1)) * sum_j!=i expected(i beats j)
  e := array[]::numeric[];
  for i in 1..n loop
    r_i := ratings[i];
    sum_exp := 0;
    for j in 1..n loop
      if j = i then continue; end if;
      r_j := ratings[j];
      sum_exp := sum_exp + calculate_expected_score(r_i, r_j);
    end loop;
    e := e || (sum_exp / (n - 1));
  end loop;

  -- Scale K by field size to temper swings in large games
  k_scaled := p_k_factor / sqrt(n - 1);

  -- Apply rating updates and record history
  new_ratings := array[]::int[];
  for i in 1..n loop
    r_i := ratings[i];
    change_i := round(k_scaled * (s[i] - e[i]));
    r_i := greatest(100, r_i + change_i);
    new_ratings := new_ratings || r_i;
  end loop;

  -- Persist updates and insert history rows
  for i in 1..n loop
    update public.players set elo_rating_multi = new_ratings[i] where id = p_player_ids[i];

    insert into public.elo_ratings_multi (
      player_id, match_id, rating_before, rating_after, rating_change,
      field_size, rank, expected_score, observed_score
    ) values (
      p_player_ids[i], p_match_id, ratings[i], new_ratings[i], new_ratings[i] - ratings[i],
      n, p_ranks[i], e[i], s[i]
    );
  end loop;
end;
$$ language plpgsql;

-- Player multiplayer Elo statistics view
create or replace view public.player_elo_stats_multi as
select 
  p.id as player_id,
  p.display_name,
  p.elo_rating_multi as current_rating,
  count(em.id) as total_rated_matches,
  count(case when em.rank = 1 then 1 end) as wins,
  count(case when em.rank > 1 then 1 end) as losses,
  case 
    when count(em.id) > 0 then
      round((count(case when em.rank = 1 then 1 end)::float / count(em.id) * 100)::numeric, 1)
    else 0.0
  end as win_percentage,
  max(em.rating_after) as peak_rating,
  min(em.rating_after) as lowest_rating,
  coalesce(
    (select em2.rating_after 
     from public.elo_ratings_multi em2 
     where em2.player_id = p.id 
     order by em2.created_at desc 
     limit 1), 
    p.elo_rating_multi
  ) as latest_rating
from public.players p
left join public.elo_ratings_multi em on em.player_id = p.id
group by p.id, p.display_name, p.elo_rating_multi;

-- Multiplayer Elo leaderboard view
create or replace view public.elo_leaderboard_multi as
select 
  player_id,
  display_name,
  current_rating,
  total_rated_matches,
  wins,
  losses,
  win_percentage,
  peak_rating,
  row_number() over (order by current_rating desc, total_rated_matches desc) as rank
from public.player_elo_stats_multi
where total_rated_matches >= 3
order by current_rating desc, total_rated_matches desc;

-- Recent multiplayer Elo changes
create or replace view public.recent_elo_changes_multi as
select 
  em.id,
  em.player_id,
  p.display_name as player_name,
  em.rating_before,
  em.rating_after,
  em.rating_change,
  em.match_id,
  em.field_size,
  em.rank,
  em.expected_score,
  em.observed_score,
  em.created_at
from public.elo_ratings_multi em
join public.players p on p.id = em.player_id
order by em.created_at desc
limit 50;
