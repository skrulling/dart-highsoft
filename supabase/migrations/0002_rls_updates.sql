-- Allow updates and deletes needed by the app flows
-- Throws: update (edit), delete (undo)
create policy "public update throws" on public.throws for update using (true) with check (true);
create policy "public delete throws" on public.throws for delete using (true);

-- Turns: update (recompute totals), delete (remove empty turn)
create policy "public update turns" on public.turns for update using (true) with check (true);
create policy "public delete turns" on public.turns for delete using (true);
