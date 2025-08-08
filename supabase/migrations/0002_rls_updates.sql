DROP POLICY IF EXISTS "public update" ON public.turns;
DROP POLICY IF EXISTS "public update" ON public.legs;
DROP POLICY IF EXISTS "public update" ON public.players;
DROP POLICY IF EXISTS "public update" ON public.matches;
DROP POLICY IF EXISTS "public update" ON public.match_players;

CREATE POLICY "public update" ON public.turns 
FOR UPDATE 
USING (true) 
WITH CHECK (true);

-- Legs need updating of winner_player_id
create policy "public update" on public.legs for update using (true) with check (true);

-- Optionally allow updates to players/matches if needed later
create policy "public update" on public.players for update using (true) with check (true);
create policy "public update" on public.matches for update using (true) with check (true);
create policy "public update" on public.match_players for update using (true) with check (true);

-- Note: In production, tighten these policies to restrict by auth user
