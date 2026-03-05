-- Tournament mode: double-elimination bracket management layer

create type public.tournament_status as enum ('pending', 'in_progress', 'completed');
create type public.bracket_type as enum ('winners', 'losers', 'grand_final');

-- Core tournament table (stores shared game settings)
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode game_mode not null default 'x01',
  start_score x01_start not null,
  finish finish_rule not null,
  legs_to_win int not null check (legs_to_win > 0),
  fair_ending boolean not null default false,
  status tournament_status not null default 'pending',
  winner_player_id uuid references public.players(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Players in a tournament with seed and final ranking
create table public.tournament_players (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id),
  seed int not null,
  final_rank int,
  primary key (tournament_id, player_id)
);

-- Each slot in the bracket (winners, losers, grand_final)
create table public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  bracket bracket_type not null,
  round int not null,
  position int not null,
  player1_id uuid references public.players(id),
  player2_id uuid references public.players(id),
  winner_id uuid references public.players(id),
  loser_id uuid references public.players(id),
  match_id uuid references public.matches(id) on delete set null,
  is_bye boolean not null default false,
  next_winner_tm_id uuid references public.tournament_matches(id),
  next_loser_tm_id uuid references public.tournament_matches(id),
  created_at timestamptz not null default now(),
  unique (tournament_id, bracket, round, position)
);

-- Link matches back to tournament
alter table public.matches
  add column tournament_match_id uuid references public.tournament_matches(id);

-- RLS (matching existing public pattern)
alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;
alter table public.tournament_matches enable row level security;

create policy "public read" on public.tournaments for select using (true);
create policy "public write" on public.tournaments for insert with check (true);
create policy "public update" on public.tournaments for update using (true) with check (true);

create policy "public read" on public.tournament_players for select using (true);
create policy "public write" on public.tournament_players for insert with check (true);
create policy "public update" on public.tournament_players for update using (true) with check (true);

create policy "public read" on public.tournament_matches for select using (true);
create policy "public write" on public.tournament_matches for insert with check (true);
create policy "public update" on public.tournament_matches for update using (true) with check (true);

-- Grants (PostgREST needs these to discover tables in its schema cache)
grant select, insert, update, delete on public.tournaments to anon, authenticated, service_role;
grant select, insert, update, delete on public.tournament_players to anon, authenticated, service_role;
grant select, insert, update, delete on public.tournament_matches to anon, authenticated, service_role;

-- Realtime for bracket live updates
alter publication supabase_realtime add table tournament_matches;
