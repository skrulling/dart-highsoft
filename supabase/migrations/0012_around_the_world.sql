-- Around the World practice game schema
-- Separate table structure for timer-based games like Around the World

create type around_world_variant as enum ('single', 'double');

-- Around the World sessions
create table if not exists public.around_world_sessions (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid not null references public.players(id) on delete cascade,
  variant around_world_variant not null, -- 'single' or 'double'
  started_at timestamptz not null default now(),
  completed_at timestamptz, -- When user clicked "Done"
  duration_seconds int, -- Calculated duration in seconds
  is_completed boolean not null default false
);

-- Around the World session stats view
create or replace view public.around_world_stats as
select 
  aws.id as session_id,
  aws.player_id,
  aws.variant,
  aws.started_at,
  aws.completed_at,
  aws.duration_seconds,
  aws.is_completed,
  -- Personal best for this variant
  case 
    when aws.is_completed then 
      row_number() over (
        partition by aws.player_id, aws.variant 
        order by aws.duration_seconds asc
      )
    else null
  end as rank_in_variant,
  -- Average time for this player/variant
  case 
    when aws.is_completed then 
      round(avg(aws2.duration_seconds) over (
        partition by aws.player_id, aws.variant 
        rows between unbounded preceding and 1 preceding
      ), 1)
    else null
  end as previous_avg_seconds
from public.around_world_sessions aws
left join public.around_world_sessions aws2 on 
  aws2.player_id = aws.player_id 
  and aws2.variant = aws.variant 
  and aws2.is_completed = true
  and aws2.completed_at < aws.completed_at;

-- Player Around the World overall stats
create or replace view public.player_around_world_stats as
select 
  p.id as player_id,
  p.display_name,
  -- Single variant stats
  count(case when aws.variant = 'single' and aws.is_completed then 1 end) as single_sessions_completed,
  min(case when aws.variant = 'single' and aws.is_completed then aws.duration_seconds end) as single_best_time,
  round(avg(case when aws.variant = 'single' and aws.is_completed then aws.duration_seconds end), 1) as single_avg_time,
  -- Double variant stats  
  count(case when aws.variant = 'double' and aws.is_completed then 1 end) as double_sessions_completed,
  min(case when aws.variant = 'double' and aws.is_completed then aws.duration_seconds end) as double_best_time,
  round(avg(case when aws.variant = 'double' and aws.is_completed then aws.duration_seconds end), 1) as double_avg_time,
  -- Overall stats
  count(case when aws.is_completed then 1 end) as total_completed_sessions,
  count(aws.id) as total_sessions
from public.players p
left join public.around_world_sessions aws on aws.player_id = p.id
group by p.id, p.display_name;

-- Enable RLS
alter table public.around_world_sessions enable row level security;

-- RLS policies (same as practice sessions for simplicity)
create policy "public read" on public.around_world_sessions for select using (true);
create policy "public write" on public.around_world_sessions for insert with check (true);
create policy "public update" on public.around_world_sessions for update using (true) with check (true);

-- Index for performance
create index if not exists idx_around_world_player_variant on public.around_world_sessions(player_id, variant);
create index if not exists idx_around_world_completed on public.around_world_sessions(is_completed, completed_at);