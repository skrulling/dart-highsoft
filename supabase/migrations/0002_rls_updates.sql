-- Allow updates required by gameplay logic
-- Turns need updating of total_scored and busted
create policy if not exists "public update" on public.turns for update using (true) with check (true);

-- Legs need updating of winner_player_id
create policy if not exists "public update" on public.legs for update using (true) with check (true);

-- Optionally allow updates to players/matches if needed later
create policy if not exists "public update" on public.players for update using (true) with check (true);
create policy if not exists "public update" on public.matches for update using (true) with check (true);
create policy if not exists "public update" on public.match_players for update using (true) with check (true);

-- Note: In production, tighten these policies to restrict by auth user
