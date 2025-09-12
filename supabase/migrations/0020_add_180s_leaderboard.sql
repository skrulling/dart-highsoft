-- Add function to get 180s leaderboard
-- 180 is the maximum possible score in darts (triple-20 x3)

create or replace function public.get_180s_leaderboard(limit_count int default 10)
returns table (
  player_id uuid,
  display_name text,
  count_180s bigint,
  max_score int
) language sql as $$
  select 
    p.id as player_id,
    p.display_name,
    count(case when t.total_scored = 180 then 1 end) as count_180s,
    max(t.total_scored) as max_score
  from public.players p
  left join public.turns t on t.player_id = p.id
  left join public.legs l on t.leg_id = l.id
  left join public.matches m on l.match_id = m.id
  where p.display_name not ilike '%test%' 
    and (m.ended_early is null or m.ended_early = false)
  group by p.id, p.display_name
  having count(case when t.total_scored = 180 then 1 end) > 0
  order by count_180s desc, max_score desc, p.display_name asc
  limit limit_count;
$$;