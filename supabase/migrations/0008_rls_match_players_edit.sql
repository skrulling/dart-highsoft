-- RLS: allow UPDATE and DELETE on match_players for editing players during matches

-- Match players: allow UPDATE (reorder players) and DELETE (remove players)
drop policy if exists "public update" on public.match_players;
drop policy if exists "public delete" on public.match_players;
create policy "public update" on public.match_players for update using (true) with check (true);
create policy "public delete" on public.match_players for delete using (true);