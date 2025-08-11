-- RLS: ensure editing/undoing throws and recomputing turns is allowed

-- Throws: allow UPDATE (edit) and DELETE (undo)
drop policy if exists "public update" on public.throws;
drop policy if exists "public delete" on public.throws;
create policy "public update" on public.throws for update using (true) with check (true);
create policy "public delete" on public.throws for delete using (true);

-- Turns: allow UPDATE (recompute totals/bust) and DELETE (remove empty turn)
drop policy if exists "public update" on public.turns;
drop policy if exists "public delete" on public.turns;
create policy "public update" on public.turns for update using (true) with check (true);
create policy "public delete" on public.turns for delete using (true);
