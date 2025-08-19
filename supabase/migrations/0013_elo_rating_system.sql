-- ELO Rating System for Dart Players
-- Tracks player skill ratings over time based on match results

-- Add ELO rating to players table
alter table public.players add column if not exists elo_rating int not null default 1200;

-- Add winner tracking to matches table if not exists
alter table public.matches add column if not exists winner_player_id uuid references public.players(id);
alter table public.matches add column if not exists completed_at timestamptz;

-- ELO rating history table
create table if not exists public.elo_ratings (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid not null references public.players(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  rating_before int not null,
  rating_after int not null,
  rating_change int not null,
  opponent_id uuid not null references public.players(id) on delete cascade,
  opponent_rating_before int not null,
  is_winner boolean not null,
  created_at timestamptz not null default now()
);

-- Player ELO statistics view
create or replace view public.player_elo_stats as
select 
  p.id as player_id,
  p.display_name,
  p.elo_rating as current_rating,
  count(er.id) as total_rated_matches,
  count(case when er.is_winner then 1 end) as wins,
  count(case when not er.is_winner then 1 end) as losses,
  case 
    when count(er.id) > 0 then
      round((count(case when er.is_winner then 1 end)::float / count(er.id) * 100)::numeric, 1)
    else 0.0
  end as win_percentage,
  max(er.rating_after) as peak_rating,
  min(er.rating_after) as lowest_rating,
  coalesce(
    (select er2.rating_after 
     from public.elo_ratings er2 
     where er2.player_id = p.id 
     order by er2.created_at desc 
     limit 1), 
    p.elo_rating
  ) as latest_rating
from public.players p
left join public.elo_ratings er on er.player_id = p.id
group by p.id, p.display_name, p.elo_rating;

-- ELO leaderboard view
create or replace view public.elo_leaderboard as
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
from public.player_elo_stats
where total_rated_matches >= 3 -- Only include players with at least 3 rated matches
order by current_rating desc, total_rated_matches desc;

-- Recent ELO changes view (last 50 rating changes)
create or replace view public.recent_elo_changes as
select 
  er.id,
  er.player_id,
  p.display_name as player_name,
  er.rating_before,
  er.rating_after,
  er.rating_change,
  er.opponent_id,
  op.display_name as opponent_name,
  er.opponent_rating_before,
  er.is_winner,
  er.match_id,
  er.created_at
from public.elo_ratings er
join public.players p on p.id = er.player_id
join public.players op on op.id = er.opponent_id
order by er.created_at desc
limit 50;

-- Enable RLS
alter table public.elo_ratings enable row level security;

-- RLS policies
create policy "public read" on public.elo_ratings for select using (true);
create policy "public write" on public.elo_ratings for insert with check (true);

-- Indexes for performance
create index if not exists idx_elo_ratings_player_id on public.elo_ratings(player_id);
create index if not exists idx_elo_ratings_match_id on public.elo_ratings(match_id);
create index if not exists idx_elo_ratings_created_at on public.elo_ratings(created_at);
create index if not exists idx_players_elo_rating on public.players(elo_rating desc);

-- Function to calculate expected score (used in ELO calculation)
create or replace function calculate_expected_score(rating_a int, rating_b int)
returns numeric as $$
begin
  return 1.0 / (1.0 + power(10.0, (rating_b - rating_a) / 400.0));
end;
$$ language plpgsql immutable;

-- Function to update ELO ratings after a match
create or replace function update_elo_ratings(
  p_match_id uuid,
  p_winner_id uuid,
  p_loser_id uuid,
  p_k_factor int default 32
)
returns void as $$
declare
  winner_rating int;
  loser_rating int;
  expected_winner numeric;
  expected_loser numeric;
  new_winner_rating int;
  new_loser_rating int;
begin
  -- Get current ratings
  select elo_rating into winner_rating from public.players where id = p_winner_id;
  select elo_rating into loser_rating from public.players where id = p_loser_id;
  
  -- Calculate expected scores
  expected_winner := calculate_expected_score(winner_rating, loser_rating);
  expected_loser := calculate_expected_score(loser_rating, winner_rating);
  
  -- Calculate new ratings
  new_winner_rating := winner_rating + round(p_k_factor * (1 - expected_winner));
  new_loser_rating := loser_rating + round(p_k_factor * (0 - expected_loser));
  
  -- Ensure ratings don't go below 100
  new_winner_rating := greatest(new_winner_rating, 100);
  new_loser_rating := greatest(new_loser_rating, 100);
  
  -- Update player ratings
  update public.players set elo_rating = new_winner_rating where id = p_winner_id;
  update public.players set elo_rating = new_loser_rating where id = p_loser_id;
  
  -- Record rating changes
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
$$ language plpgsql;