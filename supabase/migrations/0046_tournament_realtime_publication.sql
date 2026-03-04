do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournaments'
  ) then
    alter publication supabase_realtime add table public.tournaments;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournament_players'
  ) then
    alter publication supabase_realtime add table public.tournament_players;
  end if;
end;
$$;
