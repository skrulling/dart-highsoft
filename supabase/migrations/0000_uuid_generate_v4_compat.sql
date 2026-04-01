-- Compatibility shim for fresh Supabase projects where uuid-ossp is installed
-- under the `extensions` schema rather than `public`.
--
-- Older migrations in this repo call `uuid_generate_v4()` unqualified. On a new
-- Supabase project that can fail with:
--   function uuid_generate_v4() does not exist

create extension if not exists "uuid-ossp" with schema extensions;

do $$
begin
  if to_regprocedure('public.uuid_generate_v4()') is null then
    if to_regprocedure('extensions.uuid_generate_v4()') is not null then
      execute $fn$
        create function public.uuid_generate_v4()
        returns uuid
        language sql
        stable
        as 'select extensions.uuid_generate_v4();'
      $fn$;
    elsif to_regprocedure('uuid_generate_v4()') is null then
      raise exception 'uuid_generate_v4() is unavailable after enabling uuid-ossp';
    end if;
  end if;
end;
$$;
