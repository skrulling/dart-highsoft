-- Harden function execution context and remove lingering permissive RLS policies.

-- 1) Pin search_path for functions flagged as mutable by Supabase linter.
do $$
declare
  fn_signature text;
  fn_reg regprocedure;
  fn_def text;
begin
  foreach fn_signature in array array[
    'public.calculate_expected_score(int, int)',
    'public.update_elo_ratings(uuid, uuid, uuid, integer)',
    'public.update_elo_ratings_multiplayer(uuid, uuid[], integer[], integer)',
    'public.backfill_historical_elo_ratings()',
    'public.backfill_historical_elo_ratings_multiplayer()',
    'public.cascade_delete_player_matches()'
  ]
  loop
    fn_reg := to_regprocedure(fn_signature);
    if fn_reg is null then
      continue;
    end if;

    select pg_get_functiondef(fn_reg) into fn_def;
    if fn_def is null then
      continue;
    end if;

    -- Supabase migrations: prefer drop + recreate over ALTER FUNCTION.
    if fn_signature = 'public.cascade_delete_player_matches()' then
      execute 'drop trigger if exists trg_cascade_player_delete on public.players';
    end if;

    execute format('drop function if exists %s', fn_reg::text);

    if position('SET search_path' in fn_def) = 0 then
      fn_def := regexp_replace(
        fn_def,
        E'\\nAS\\s+',
        E'\nSET search_path = public, pg_temp\nAS ',
        ''
      );
    end if;

    execute fn_def;

    if fn_signature = 'public.cascade_delete_player_matches()' then
      execute '
        create trigger trg_cascade_player_delete
        after delete on public.players
        for each row execute function public.cascade_delete_player_matches()
      ';
    end if;
  end loop;
end;
$$;

-- 2) Remove permissive write policies that may still exist in production.
drop policy if exists "public update" on public.matches;
drop policy if exists "public update" on public.players;
drop policy if exists "public delete" on public.players;
