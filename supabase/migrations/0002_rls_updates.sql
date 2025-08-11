-- Allow updates and deletes needed by the app flows
-- Throws: update (edit), delete (undo)
create policy if not exists "public update" on public.throws for update using (true) with check (true);
create policy if not exists "public delete" on public.throws for delete using (true);

-- Turns: update (recompute totals), delete (remove empty turn)
create policy if not exists "public update" on public.turns for update using (true) with check (true);
create policy if not exists "public delete" on public.turns for delete using (true);
