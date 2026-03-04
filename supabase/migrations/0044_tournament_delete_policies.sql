-- Add missing DELETE RLS policies for tournament tables
-- (0043 only created select, insert, update policies)

create policy "public delete" on public.tournaments for delete using (true);
create policy "public delete" on public.tournament_players for delete using (true);
create policy "public delete" on public.tournament_matches for delete using (true);
