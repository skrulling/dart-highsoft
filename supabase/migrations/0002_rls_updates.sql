-- Allow updates and deletes needed by the app flows
-- Throws: update (edit), delete (undo)
drop policy if exists "public update" on public.throws;
create policy "public update" on public.throws for update using (true) with check (true);
drop policy if exists "public delete" on public.throws;
create policy "public delete" on public.throws for delete using (true);

-- Turns: update (recompute totals), delete (remove empty turn)
drop policy if exists "public update" on public.turns;
create policy "public update" on public.turns for update using (true) with check (true);
drop policy if exists "public delete" on public.turns;
create policy "public delete" on public.turns for delete using (true);
