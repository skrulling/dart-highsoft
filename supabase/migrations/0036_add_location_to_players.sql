-- Add location column to players (nullable so existing players keep null)
alter table public.players add column location text;

-- Index for filtering by location
create index idx_players_location on public.players (location);
