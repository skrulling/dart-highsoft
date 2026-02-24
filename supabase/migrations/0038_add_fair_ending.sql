-- Fair ending flag on matches (only relevant for 1-leg games)
alter table public.matches
  add column if not exists fair_ending boolean not null default false;

-- Tiebreak round marker on turns (null = normal turn, 1+ = tiebreak round number)
alter table public.turns
  add column if not exists tiebreak_round int check (tiebreak_round is null or tiebreak_round > 0);
