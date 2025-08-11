-- RLS updates: normalize policy names and ensure update/delete allowed

-- Throws: drop custom-named policies if present, then create normalized ones
drop policy if exists "public update throws" on public.throws;
drop policy if exists "public delete throws" on public.throws;
create policy "public update" on public.throws for update using (true) with check (true);
create policy "public delete" on public.throws for delete using (true);

-- Turns: drop custom-named policies if present, then create normalized ones
drop policy if exists "public update turns" on public.turns;
drop policy if exists "public delete turns" on public.turns;
create policy "public update" on public.turns for update using (true) with check (true);
create policy "public delete" on public.turns for delete using (true);
