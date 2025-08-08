-- Dart Scoreboard schema
-- Enable UUID extension if using Postgres
create extension if not exists "uuid-ossp";

-- Players
create table if not exists public.players (
  id uuid primary key default uuid_generate_v4(),
  display_name text not null unique,
  created_at timestamptz not null default now()
);

-- Matches (a match has multiple legs)
create type public.game_mode as enum ('x01');
create type public.x01_start as enum ('201','301','501');
create type public.finish_rule as enum ('single_out','double_out');

create table if not exists public.matches (
  id uuid primary key default uuid_generate_v4(),
  mode game_mode not null default 'x01',
  start_score x01_start not null,
  finish finish_rule not null,
  legs_to_win int not null check (legs_to_win > 0),
  created_at timestamptz not null default now()
);

-- Legs within a match
create table if not exists public.legs (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  leg_number int not null,
  starting_player_id uuid not null references public.players(id),
  winner_player_id uuid references public.players(id),
  created_at timestamptz not null default now(),
  unique(match_id, leg_number)
);

-- Link players to a match with order
create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  play_order int not null,
  primary key (match_id, player_id),
  unique (match_id, play_order)
);

-- Turns and throws per leg
create table if not exists public.turns (
  id uuid primary key default uuid_generate_v4(),
  leg_id uuid not null references public.legs(id) on delete cascade,
  player_id uuid not null references public.players(id),
  turn_number int not null,
  total_scored int not null check (total_scored >= 0 and total_scored <= 180),
  busted boolean not null default false,
  created_at timestamptz not null default now(),
  unique(leg_id, turn_number)
);

create table if not exists public.throws (
  id uuid primary key default uuid_generate_v4(),
  turn_id uuid not null references public.turns(id) on delete cascade,
  dart_index int not null check (dart_index between 1 and 3),
  segment text not null, -- like 'S20', 'D10', 'T19', 'OuterBull', 'InnerBull', 'Miss'
  scored int not null check (scored >= 0 and scored <= 60)
);

-- Aggregates for stats
create or replace view public.player_match_stats as
select
  mp.match_id,
  mp.player_id,
  sum(case when l.winner_player_id = mp.player_id then 1 else 0 end) as legs_won
from match_players mp
join legs l on l.match_id = mp.match_id
group by mp.match_id, mp.player_id;

-- RLS: enable and allow anon read/write for now (tighten later)
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.legs enable row level security;
alter table public.match_players enable row level security;
alter table public.turns enable row level security;
alter table public.throws enable row level security;

create policy "public read" on public.players for select using (true);
create policy "public write" on public.players for insert with check (true);
create policy "public read" on public.matches for select using (true);
create policy "public write" on public.matches for insert with check (true);
create policy "public read" on public.legs for select using (true);
create policy "public write" on public.legs for insert with check (true);
create policy "public read" on public.match_players for select using (true);
create policy "public write" on public.match_players for insert with check (true);
create policy "public read" on public.turns for select using (true);
create policy "public write" on public.turns for insert with check (true);
create policy "public read" on public.throws for select using (true);
create policy "public write" on public.throws for insert with check (true);
