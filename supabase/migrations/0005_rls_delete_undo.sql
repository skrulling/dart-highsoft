DROP POLICY IF EXISTS "public delete" ON public.throws;
DROP POLICY IF EXISTS "public delete" ON public.turns;

-- Allow deleting throws and turns to support undo
create policy "public delete" on public.throws for delete using (true);
create policy "public delete" on public.turns for delete using (true);

-- (Optional) allow clearing leg winner when undoing a checkout in the future
-- create policy if not exists "public update_winner" on public.legs for update using (true) with check (true);
