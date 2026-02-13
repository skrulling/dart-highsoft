-- Local development seed data
-- Populates realistic-looking players and historical x01 matches so UI screens
-- (games list, leaderboards, stats) are useful immediately after `supabase db reset`.

-- 8 local players
insert into public.players (id, display_name, elo_rating, elo_rating_multi, created_at)
values
  ('70000000-0000-0000-0000-000000000001', 'Alex Storm', 1200, 1200, now() - interval '120 days'),
  ('70000000-0000-0000-0000-000000000002', 'Mia Larsen', 1200, 1200, now() - interval '112 days'),
  ('70000000-0000-0000-0000-000000000003', 'Jonas Pike', 1200, 1200, now() - interval '104 days'),
  ('70000000-0000-0000-0000-000000000004', 'Nora Vale', 1200, 1200, now() - interval '96 days'),
  ('70000000-0000-0000-0000-000000000005', 'Viktor Rune', 1200, 1200, now() - interval '88 days'),
  ('70000000-0000-0000-0000-000000000006', 'Freya Hale', 1200, 1200, now() - interval '80 days'),
  ('70000000-0000-0000-0000-000000000007', 'Liam Frost', 1200, 1200, now() - interval '72 days'),
  ('70000000-0000-0000-0000-000000000008', 'Zoe Mercer', 1200, 1200, now() - interval '64 days')
on conflict (id) do update
set
  display_name = excluded.display_name,
  elo_rating = excluded.elo_rating,
  elo_rating_multi = excluded.elo_rating_multi;

-- Historical + active matches
insert into public.matches (
  id, mode, start_score, finish, legs_to_win,
  winner_player_id, completed_at, ended_early, created_at
)
values
  ('91000000-0000-0000-0000-000000000001', 'x01', '501', 'double_out', 2, '70000000-0000-0000-0000-000000000001', now() - interval '42 days', false, now() - interval '42 days 3 hours'),
  ('91000000-0000-0000-0000-000000000002', 'x01', '301', 'single_out', 3, '70000000-0000-0000-0000-000000000004', now() - interval '34 days', false, now() - interval '34 days 2 hours'),
  ('91000000-0000-0000-0000-000000000003', 'x01', '501', 'double_out', 2, '70000000-0000-0000-0000-000000000006', now() - interval '26 days', false, now() - interval '26 days 1 hours'),
  ('91000000-0000-0000-0000-000000000004', 'x01', '301', 'double_out', 2, '70000000-0000-0000-0000-000000000007', now() - interval '19 days', false, now() - interval '19 days 4 hours'),
  ('91000000-0000-0000-0000-000000000005', 'x01', '501', 'double_out', 1, '70000000-0000-0000-0000-000000000003', now() - interval '12 days', false, now() - interval '12 days 30 minutes'),
  ('91000000-0000-0000-0000-000000000006', 'x01', '301', 'single_out', 1, '70000000-0000-0000-0000-000000000002', now() - interval '8 days', true,  now() - interval '8 days 2 hours'),
  ('91000000-0000-0000-0000-000000000007', 'x01', '301', 'double_out', 2, null, null, false, now() - interval '35 minutes')
on conflict (id) do nothing;

insert into public.match_players (match_id, player_id, play_order)
values
  ('91000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 0),
  ('91000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 1),

  ('91000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003', 0),
  ('91000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000004', 1),

  ('91000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000005', 0),
  ('91000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000006', 1),

  ('91000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000007', 0),
  ('91000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000008', 1),

  ('91000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000001', 0),
  ('91000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000003', 1),

  ('91000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000002', 0),
  ('91000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000005', 1),

  ('91000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000004', 0),
  ('91000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000006', 1)
on conflict (match_id, player_id) do nothing;

insert into public.legs (id, match_id, leg_number, starting_player_id, winner_player_id, created_at)
values
  ('92000000-0000-0000-0000-000000000011', '91000000-0000-0000-0000-000000000001', 1, '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', now() - interval '42 days 2 hours'),
  ('92000000-0000-0000-0000-000000000012', '91000000-0000-0000-0000-000000000001', 2, '70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', now() - interval '42 days 90 minutes'),
  ('92000000-0000-0000-0000-000000000013', '91000000-0000-0000-0000-000000000001', 3, '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', now() - interval '42 days 1 hour'),

  ('92000000-0000-0000-0000-000000000021', '91000000-0000-0000-0000-000000000002', 1, '70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000004', now() - interval '34 days 2 hours'),
  ('92000000-0000-0000-0000-000000000022', '91000000-0000-0000-0000-000000000002', 2, '70000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000003', now() - interval '34 days 80 minutes'),
  ('92000000-0000-0000-0000-000000000023', '91000000-0000-0000-0000-000000000002', 3, '70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000004', now() - interval '34 days 45 minutes'),
  ('92000000-0000-0000-0000-000000000024', '91000000-0000-0000-0000-000000000002', 4, '70000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000004', now() - interval '34 days 20 minutes'),

  ('92000000-0000-0000-0000-000000000031', '91000000-0000-0000-0000-000000000003', 1, '70000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000006', now() - interval '26 days 55 minutes'),
  ('92000000-0000-0000-0000-000000000032', '91000000-0000-0000-0000-000000000003', 2, '70000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000005', now() - interval '26 days 30 minutes'),
  ('92000000-0000-0000-0000-000000000033', '91000000-0000-0000-0000-000000000003', 3, '70000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000006', now() - interval '26 days 10 minutes'),

  ('92000000-0000-0000-0000-000000000041', '91000000-0000-0000-0000-000000000004', 1, '70000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000007', now() - interval '19 days 3 hours'),
  ('92000000-0000-0000-0000-000000000042', '91000000-0000-0000-0000-000000000004', 2, '70000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-000000000008', now() - interval '19 days 2 hours'),
  ('92000000-0000-0000-0000-000000000043', '91000000-0000-0000-0000-000000000004', 3, '70000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000007', now() - interval '19 days 80 minutes'),

  ('92000000-0000-0000-0000-000000000051', '91000000-0000-0000-0000-000000000005', 1, '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', now() - interval '12 days 25 minutes'),

  ('92000000-0000-0000-0000-000000000061', '91000000-0000-0000-0000-000000000006', 1, '70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', now() - interval '8 days 70 minutes'),

  ('92000000-0000-0000-0000-000000000071', '91000000-0000-0000-0000-000000000007', 1, '70000000-0000-0000-0000-000000000004', null, now() - interval '35 minutes')
on conflict (id) do nothing;

do $$
declare
  cfg record;
  i int;
  v_player uuid;
  v_turn_id uuid;
  v_seg1 text;
  v_seg2 text;
  v_seg3 text;
  v_score1 int;
  v_score2 int;
  v_score3 int;
  v_total int;
  v_is_incomplete boolean;
begin
  for cfg in
    select *
    from (
      values
        -- match_id, leg_id, starter_id, other_id, winner_id, turns_count, incomplete_last
        ('91000000-0000-0000-0000-000000000001'::uuid, '92000000-0000-0000-0000-000000000011'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000002'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, 8, false),
        ('91000000-0000-0000-0000-000000000001'::uuid, '92000000-0000-0000-0000-000000000012'::uuid, '70000000-0000-0000-0000-000000000002'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000002'::uuid, 9, false),
        ('91000000-0000-0000-0000-000000000001'::uuid, '92000000-0000-0000-0000-000000000013'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000002'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, 7, false),

        ('91000000-0000-0000-0000-000000000002'::uuid, '92000000-0000-0000-0000-000000000021'::uuid, '70000000-0000-0000-0000-000000000003'::uuid, '70000000-0000-0000-0000-000000000004'::uuid, '70000000-0000-0000-0000-000000000004'::uuid, 7, false),
        ('91000000-0000-0000-0000-000000000002'::uuid, '92000000-0000-0000-0000-000000000022'::uuid, '70000000-0000-0000-0000-000000000004'::uuid, '70000000-0000-0000-0000-000000000003'::uuid, '70000000-0000-0000-0000-000000000003'::uuid, 8, false),
        ('91000000-0000-0000-0000-000000000002'::uuid, '92000000-0000-0000-0000-000000000023'::uuid, '70000000-0000-0000-0000-000000000003'::uuid, '70000000-0000-0000-0000-000000000004'::uuid, '70000000-0000-0000-0000-000000000004'::uuid, 8, false),
        ('91000000-0000-0000-0000-000000000002'::uuid, '92000000-0000-0000-0000-000000000024'::uuid, '70000000-0000-0000-0000-000000000004'::uuid, '70000000-0000-0000-0000-000000000003'::uuid, '70000000-0000-0000-0000-000000000004'::uuid, 7, false),

        ('91000000-0000-0000-0000-000000000003'::uuid, '92000000-0000-0000-0000-000000000031'::uuid, '70000000-0000-0000-0000-000000000005'::uuid, '70000000-0000-0000-0000-000000000006'::uuid, '70000000-0000-0000-0000-000000000006'::uuid, 8, false),
        ('91000000-0000-0000-0000-000000000003'::uuid, '92000000-0000-0000-0000-000000000032'::uuid, '70000000-0000-0000-0000-000000000006'::uuid, '70000000-0000-0000-0000-000000000005'::uuid, '70000000-0000-0000-0000-000000000005'::uuid, 7, false),
        ('91000000-0000-0000-0000-000000000003'::uuid, '92000000-0000-0000-0000-000000000033'::uuid, '70000000-0000-0000-0000-000000000005'::uuid, '70000000-0000-0000-0000-000000000006'::uuid, '70000000-0000-0000-0000-000000000006'::uuid, 9, false),

        ('91000000-0000-0000-0000-000000000004'::uuid, '92000000-0000-0000-0000-000000000041'::uuid, '70000000-0000-0000-0000-000000000007'::uuid, '70000000-0000-0000-0000-000000000008'::uuid, '70000000-0000-0000-0000-000000000007'::uuid, 7, false),
        ('91000000-0000-0000-0000-000000000004'::uuid, '92000000-0000-0000-0000-000000000042'::uuid, '70000000-0000-0000-0000-000000000008'::uuid, '70000000-0000-0000-0000-000000000007'::uuid, '70000000-0000-0000-0000-000000000008'::uuid, 8, false),
        ('91000000-0000-0000-0000-000000000004'::uuid, '92000000-0000-0000-0000-000000000043'::uuid, '70000000-0000-0000-0000-000000000007'::uuid, '70000000-0000-0000-0000-000000000008'::uuid, '70000000-0000-0000-0000-000000000007'::uuid, 7, false),

        ('91000000-0000-0000-0000-000000000005'::uuid, '92000000-0000-0000-0000-000000000051'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000003'::uuid, '70000000-0000-0000-0000-000000000003'::uuid, 7, false),
        ('91000000-0000-0000-0000-000000000006'::uuid, '92000000-0000-0000-0000-000000000061'::uuid, '70000000-0000-0000-0000-000000000002'::uuid, '70000000-0000-0000-0000-000000000005'::uuid, '70000000-0000-0000-0000-000000000002'::uuid, 6, false),

        ('91000000-0000-0000-0000-000000000007'::uuid, '92000000-0000-0000-0000-000000000071'::uuid, '70000000-0000-0000-0000-000000000004'::uuid, '70000000-0000-0000-0000-000000000006'::uuid, null::uuid, 5, true)
    ) as t(match_id, leg_id, starter_id, other_id, winner_id, turns_count, incomplete_last)
  loop
    for i in 1..cfg.turns_count loop
      v_is_incomplete := cfg.incomplete_last and i = cfg.turns_count;

      if v_is_incomplete then
        v_player := case when mod(i, 2) = 1 then cfg.starter_id else cfg.other_id end;
        v_seg1 := 'S20'; v_score1 := 20;
        v_seg2 := 'S5'; v_score2 := 5;
        v_seg3 := 'S1'; v_score3 := 1;
        v_total := v_score1;
      else
        if cfg.winner_id is not null and i = cfg.turns_count then
          v_player := cfg.winner_id;
        else
          v_player := case when mod(i, 2) = 1 then cfg.starter_id else cfg.other_id end;
        end if;

        case ((i - 1) % 6) + 1
          when 1 then
            v_seg1 := 'S20'; v_score1 := 20;
            v_seg2 := 'S20'; v_score2 := 20;
            v_seg3 := 'S20'; v_score3 := 20;
          when 2 then
            v_seg1 := 'T20'; v_score1 := 60;
            v_seg2 := 'S19'; v_score2 := 19;
            v_seg3 := 'S2'; v_score3 := 2;
          when 3 then
            v_seg1 := 'S5'; v_score1 := 5;
            v_seg2 := 'S20'; v_score2 := 20;
            v_seg3 := 'S1'; v_score3 := 1;
          when 4 then
            v_seg1 := 'T19'; v_score1 := 57;
            v_seg2 := 'S20'; v_score2 := 20;
            v_seg3 := 'S7'; v_score3 := 7;
          when 5 then
            v_seg1 := 'S1'; v_score1 := 1;
            v_seg2 := 'T20'; v_score2 := 60;
            v_seg3 := 'S1'; v_score3 := 1;
          else
            v_seg1 := 'S20'; v_score1 := 20;
            v_seg2 := 'S5'; v_score2 := 5;
            v_seg3 := 'S5'; v_score3 := 5;
        end case;

        v_total := v_score1 + v_score2 + v_score3;
      end if;

      insert into public.turns (leg_id, player_id, turn_number, total_scored, busted, match_id)
      values (cfg.leg_id, v_player, i, v_total, false, cfg.match_id)
      on conflict (leg_id, turn_number) do update
      set
        player_id = excluded.player_id,
        total_scored = excluded.total_scored,
        busted = excluded.busted,
        match_id = excluded.match_id
      returning id into v_turn_id;

      delete from public.throws where turn_id = v_turn_id;

      insert into public.throws (turn_id, dart_index, segment, scored, match_id)
      values (v_turn_id, 1, v_seg1, v_score1, cfg.match_id);

      if not v_is_incomplete then
        insert into public.throws (turn_id, dart_index, segment, scored, match_id)
        values
          (v_turn_id, 2, v_seg2, v_score2, cfg.match_id),
          (v_turn_id, 3, v_seg3, v_score3, cfg.match_id);
      end if;
    end loop;
  end loop;
end;
$$;

-- Extra deterministic history so leaderboards and "last 10" form sparklines
-- look realistic during local development.
do $$
declare
  players uuid[] := array[
    '70000000-0000-0000-0000-000000000001'::uuid,
    '70000000-0000-0000-0000-000000000002'::uuid,
    '70000000-0000-0000-0000-000000000003'::uuid,
    '70000000-0000-0000-0000-000000000004'::uuid,
    '70000000-0000-0000-0000-000000000005'::uuid,
    '70000000-0000-0000-0000-000000000006'::uuid,
    '70000000-0000-0000-0000-000000000007'::uuid,
    '70000000-0000-0000-0000-000000000008'::uuid
  ];
  match_idx int;
  leg_no int;
  turn_no int;
  p1 uuid;
  p2 uuid;
  winner_id uuid;
  starter_id uuid;
  leg_winner_id uuid;
  v_match_id uuid;
  v_leg_id uuid;
  v_turn_id uuid;
  turn_player_id uuid;
  v_seed text;
  v_md5 text;
  created_at_ts timestamptz;
  completed_at_ts timestamptz;
  straight_sets boolean;
  legs_count int;
  turns_count int;
  v_seg1 text;
  v_seg2 text;
  v_seg3 text;
  v_score1 int;
  v_score2 int;
  v_score3 int;
begin
  -- Generate 40 completed 1v1 matches across the full roster.
  for match_idx in 1..40 loop
    p1 := players[((match_idx - 1) % array_length(players, 1)) + 1];
    p2 := players[((match_idx + 2 + ((match_idx - 1) / array_length(players, 1))::int) % array_length(players, 1)) + 1];

    if p1 = p2 then
      p2 := players[((match_idx + 4) % array_length(players, 1)) + 1];
    end if;

    winner_id := case when mod(match_idx, 4) in (0, 1) then p1 else p2 end;
    starter_id := case when mod(match_idx, 2) = 0 then p2 else p1 end;
    straight_sets := mod(match_idx, 3) = 0;
    legs_count := case when straight_sets then 2 else 3 end;

    created_at_ts := now() - interval '60 days' + (match_idx * interval '33 hours');
    completed_at_ts := created_at_ts + interval '55 minutes';

    v_seed := 'seed-extra-match-' || match_idx::text;
    v_md5 := md5(v_seed);
    v_match_id := (
      substr(v_md5, 1, 8) || '-' ||
      substr(v_md5, 9, 4) || '-' ||
      substr(v_md5, 13, 4) || '-' ||
      substr(v_md5, 17, 4) || '-' ||
      substr(v_md5, 21, 12)
    )::uuid;

    insert into public.matches (
      id, mode, start_score, finish, legs_to_win,
      winner_player_id, completed_at, ended_early, created_at
    )
    values (
      v_match_id,
      'x01'::public.game_mode,
      (
        case when mod(match_idx, 5) in (0, 1, 2) then '501' else '301' end
      )::public.x01_start,
      (
        case when mod(match_idx, 4) in (0, 2) then 'double_out' else 'single_out' end
      )::public.finish_rule,
      2,
      winner_id,
      completed_at_ts,
      false,
      created_at_ts
    )
    on conflict (id) do update
    set
      winner_player_id = excluded.winner_player_id,
      completed_at = excluded.completed_at,
      ended_early = excluded.ended_early,
      created_at = excluded.created_at;

    insert into public.match_players (match_id, player_id, play_order)
    values
      (v_match_id, p1, 0),
      (v_match_id, p2, 1)
    on conflict (match_id, player_id) do update
    set play_order = excluded.play_order;

    for leg_no in 1..legs_count loop
      if straight_sets then
        leg_winner_id := winner_id;
      elsif leg_no = 2 then
        leg_winner_id := case when winner_id = p1 then p2 else p1 end;
      else
        leg_winner_id := winner_id;
      end if;

      v_seed := 'seed-extra-leg-' || match_idx::text || '-' || leg_no::text;
      v_md5 := md5(v_seed);
      v_leg_id := (
        substr(v_md5, 1, 8) || '-' ||
        substr(v_md5, 9, 4) || '-' ||
        substr(v_md5, 13, 4) || '-' ||
        substr(v_md5, 17, 4) || '-' ||
        substr(v_md5, 21, 12)
      )::uuid;

      insert into public.legs (id, match_id, leg_number, starting_player_id, winner_player_id, created_at)
      values (
        v_leg_id,
        v_match_id,
        leg_no,
        case when mod(leg_no, 2) = 1 then starter_id else case when starter_id = p1 then p2 else p1 end end,
        leg_winner_id,
        created_at_ts + (leg_no * interval '14 minutes')
      )
      on conflict (id) do update
      set
        match_id = excluded.match_id,
        leg_number = excluded.leg_number,
        starting_player_id = excluded.starting_player_id,
        winner_player_id = excluded.winner_player_id,
        created_at = excluded.created_at;

      turns_count := 6 + mod(match_idx + leg_no, 4);
      for turn_no in 1..turns_count loop
        if turn_no = turns_count then
          -- Force leg closer by the leg winner for realistic win/loss ownership.
          turn_player_id := leg_winner_id;
        else
          turn_player_id := case when mod(turn_no + leg_no, 2) = 0 then p1 else p2 end;
        end if;

        case ((turn_no - 1) % 6) + 1
          when 1 then
            v_seg1 := 'S20'; v_score1 := 20;
            v_seg2 := 'S20'; v_score2 := 20;
            v_seg3 := 'S20'; v_score3 := 20;
          when 2 then
            v_seg1 := 'T20'; v_score1 := 60;
            v_seg2 := 'S19'; v_score2 := 19;
            v_seg3 := 'S2'; v_score3 := 2;
          when 3 then
            v_seg1 := 'S5'; v_score1 := 5;
            v_seg2 := 'S20'; v_score2 := 20;
            v_seg3 := 'S1'; v_score3 := 1;
          when 4 then
            v_seg1 := 'T19'; v_score1 := 57;
            v_seg2 := 'S20'; v_score2 := 20;
            v_seg3 := 'S7'; v_score3 := 7;
          when 5 then
            v_seg1 := 'S1'; v_score1 := 1;
            v_seg2 := 'T20'; v_score2 := 60;
            v_seg3 := 'S1'; v_score3 := 1;
          else
            v_seg1 := 'S20'; v_score1 := 20;
            v_seg2 := 'S5'; v_score2 := 5;
            v_seg3 := 'S5'; v_score3 := 5;
        end case;

        insert into public.turns (leg_id, player_id, turn_number, total_scored, busted, match_id)
        values (v_leg_id, turn_player_id, turn_no, v_score1 + v_score2 + v_score3, false, v_match_id)
        on conflict (leg_id, turn_number) do update
        set
          player_id = excluded.player_id,
          total_scored = excluded.total_scored,
          busted = excluded.busted,
          match_id = excluded.match_id
        returning id into v_turn_id;

        delete from public.throws where public.throws.turn_id = v_turn_id;

        insert into public.throws (turn_id, dart_index, segment, scored, match_id)
        values
          (v_turn_id, 1, v_seg1, v_score1, v_match_id),
          (v_turn_id, 2, v_seg2, v_score2, v_match_id),
          (v_turn_id, 3, v_seg3, v_score3, v_match_id);
      end loop;
    end loop;
  end loop;
end;
$$;

-- Populate ELO rating history by calling update_elo_ratings() for every
-- completed 1v1 match in chronological order.  This fills the elo_ratings
-- table so leaderboards, stats views, and trend sparklines have data.
do $$
declare
  m record;
  loser_id uuid;
begin
  -- Reset ELO to starting value so the history builds up realistically
  -- from 1200 (the values on the players table will be overwritten by
  -- the update_elo_ratings calls below).
  update public.players
  set elo_rating = 1200
  where id in (
    '70000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000004',
    '70000000-0000-0000-0000-000000000005',
    '70000000-0000-0000-0000-000000000006',
    '70000000-0000-0000-0000-000000000007',
    '70000000-0000-0000-0000-000000000008'
  );

  -- Clear any existing elo_ratings for idempotency
  delete from public.elo_ratings
  where player_id in (
    '70000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000004',
    '70000000-0000-0000-0000-000000000005',
    '70000000-0000-0000-0000-000000000006',
    '70000000-0000-0000-0000-000000000007',
    '70000000-0000-0000-0000-000000000008'
  );

  -- Process every completed 1v1 match in chronological order
  for m in
    select
      ma.id as match_id,
      ma.winner_player_id
    from public.matches ma
    where ma.winner_player_id is not null
      and ma.completed_at is not null
      and (select count(*) from public.match_players mp where mp.match_id = ma.id) = 2
    order by ma.created_at asc
  loop
    select mp.player_id into loser_id
    from public.match_players mp
    where mp.match_id = m.match_id
      and mp.player_id != m.winner_player_id
    limit 1;

    perform update_elo_ratings(m.match_id, m.winner_player_id, loser_id);
  end loop;
end;
$$;
