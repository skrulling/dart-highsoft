-- Add match_id to turns/throws to support efficient realtime filtering and
-- direct match ownership checks without extra joins.
-- This migration is backward-compatible during rollout:
-- - columns are added first
-- - data is backfilled
-- - triggers auto-populate match_id for older writers

alter table public.turns
  add column if not exists match_id uuid;

alter table public.throws
  add column if not exists match_id uuid;

-- Keep match_id in sync for clients that still write legacy payloads.
create or replace function public.set_turn_match_id_from_leg()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_match_id uuid;
begin
  select l.match_id into v_match_id
  from public.legs l
  where l.id = new.leg_id;

  if v_match_id is null then
    raise exception 'Invalid leg_id % for turn %', new.leg_id, new.id;
  end if;

  if new.match_id is null then
    new.match_id := v_match_id;
  elsif new.match_id <> v_match_id then
    raise exception 'turn.match_id (%) must match legs.match_id (%)', new.match_id, v_match_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_turn_match_id_from_leg on public.turns;
create trigger trg_set_turn_match_id_from_leg
before insert or update of leg_id, match_id on public.turns
for each row execute function public.set_turn_match_id_from_leg();

create or replace function public.set_throw_match_id_from_turn()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_match_id uuid;
begin
  select t.match_id into v_match_id
  from public.turns t
  where t.id = new.turn_id;

  if v_match_id is null then
    raise exception 'Invalid turn_id % for throw %', new.turn_id, new.id;
  end if;

  if new.match_id is null then
    new.match_id := v_match_id;
  elsif new.match_id <> v_match_id then
    raise exception 'throws.match_id (%) must match turns.match_id (%)', new.match_id, v_match_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_throw_match_id_from_turn on public.throws;
create trigger trg_set_throw_match_id_from_turn
before insert or update of turn_id, match_id on public.throws
for each row execute function public.set_throw_match_id_from_turn();

-- Backfill existing rows.
update public.turns t
set match_id = l.match_id
from public.legs l
where t.leg_id = l.id
  and t.match_id is null;

update public.throws th
set match_id = t.match_id
from public.turns t
where th.turn_id = t.id
  and th.match_id is null;

-- Ensure delete payloads include match_id so realtime filters keep working.
alter table public.turns replica identity full;
alter table public.throws replica identity full;

create index if not exists idx_turns_match_id on public.turns (match_id);
create index if not exists idx_throws_match_id on public.throws (match_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'turns_match_id_fkey'
      and conrelid = 'public.turns'::regclass
  ) then
    alter table public.turns
      add constraint turns_match_id_fkey
      foreign key (match_id) references public.matches(id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'throws_match_id_fkey'
      and conrelid = 'public.throws'::regclass
  ) then
    alter table public.throws
      add constraint throws_match_id_fkey
      foreign key (match_id) references public.matches(id) on delete cascade;
  end if;
end;
$$;

alter table public.turns
  alter column match_id set not null;

alter table public.throws
  alter column match_id set not null;

-- Ensure PostgREST sees new columns immediately after migration.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when undefined_function then
    -- pg_notify is always available; guard left intentionally for safety.
    null;
end;
$$;
