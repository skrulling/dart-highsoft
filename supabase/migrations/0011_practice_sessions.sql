-- Practice sessions schema
-- Separate practice data from match data for clean analytics

create table if not exists public.practice_sessions (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid not null references public.players(id) on delete cascade,
  start_score int not null default 501, -- Usually 501 for practice
  finish_rule finish_rule not null default 'double_out',
  session_goal text, -- Optional goal like "Average 60+" or "Hit 5 bulls"
  notes text, -- User notes about the session
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  is_active boolean not null default true
);

-- Practice turns - similar to regular turns but in practice context
create table if not exists public.practice_turns (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  turn_number int not null,
  score_before int not null, -- Score before this turn
  total_scored int not null check (total_scored >= 0 and total_scored <= 180),
  score_after int not null, -- Score after this turn
  busted boolean not null default false,
  finished boolean not null default false, -- Did this turn finish the game
  created_at timestamptz not null default now(),
  unique(session_id, turn_number)
);

-- Practice throws - individual dart throws in practice
create table if not exists public.practice_throws (
  id uuid primary key default uuid_generate_v4(),
  turn_id uuid not null references public.practice_turns(id) on delete cascade,
  dart_index int not null check (dart_index between 1 and 3),
  segment text not null, -- like 'S20', 'D10', 'T19', 'OuterBull', 'InnerBull', 'Miss'
  scored int not null check (scored >= 0 and scored <= 60)
);

-- Practice stats view for analytics
create or replace view public.practice_session_stats as
select 
  ps.id as session_id,
  ps.player_id,
  ps.started_at,
  ps.ended_at,
  ps.is_active,
  count(pt.id) as total_turns,
  round(avg(pt.total_scored), 2) as avg_turn_score,
  max(pt.total_scored) as max_turn_score,
  sum(case when pt.total_scored >= 100 then 1 else 0 end) as tons,
  sum(case when pt.total_scored >= 140 then 1 else 0 end) as high_finishes,
  sum(case when pt.busted then 1 else 0 end) as busts,
  count(case when pt.finished then 1 end) as games_finished
from public.practice_sessions ps
left join public.practice_turns pt on pt.session_id = ps.id
group by ps.id, ps.player_id, ps.started_at, ps.ended_at, ps.is_active;

-- Overall practice stats per player
create or replace view public.player_practice_stats as
select 
  p.id as player_id,
  p.display_name,
  count(ps.id) as total_sessions,
  round(avg(pss.avg_turn_score), 2) as overall_avg_score,
  sum(pss.total_turns) as total_practice_turns,
  sum(pss.tons) as total_tons,
  sum(pss.high_finishes) as total_high_finishes,
  sum(pss.busts) as total_busts,
  sum(pss.games_finished) as total_games_finished
from public.players p
left join public.practice_sessions ps on ps.player_id = p.id and ps.ended_at is not null
left join public.practice_session_stats pss on pss.session_id = ps.id
group by p.id, p.display_name;

-- Enable RLS for practice tables
alter table public.practice_sessions enable row level security;
alter table public.practice_turns enable row level security;
alter table public.practice_throws enable row level security;

-- RLS policies
create policy "public read" on public.practice_sessions for select using (true);
create policy "public write" on public.practice_sessions for insert with check (true);
create policy "public update" on public.practice_sessions for update using (true) with check (true);

create policy "public read" on public.practice_turns for select using (true);
create policy "public write" on public.practice_turns for insert with check (true);
create policy "public update" on public.practice_turns for update using (true) with check (true);
create policy "public delete" on public.practice_turns for delete using (true);

create policy "public read" on public.practice_throws for select using (true);
create policy "public write" on public.practice_throws for insert with check (true);
create policy "public update" on public.practice_throws for update using (true) with check (true);
create policy "public delete" on public.practice_throws for delete using (true);

-- Index for performance
create index if not exists idx_practice_sessions_player_active on public.practice_sessions(player_id, is_active);
create index if not exists idx_practice_turns_session on public.practice_turns(session_id, turn_number);
create index if not exists idx_practice_throws_turn on public.practice_throws(turn_id, dart_index);