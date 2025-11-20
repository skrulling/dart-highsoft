-- Update view for quickest leg leaderboard to include start_score
DROP VIEW IF EXISTS public.quickest_legs_leaderboard;

CREATE OR REPLACE VIEW public.quickest_legs_leaderboard AS
SELECT 
    l.id as leg_id,
    l.winner_player_id as player_id,
    p.display_name,
    l.created_at as date,
    m.finish as finish_rule,
    m.start_score,
    (
        SELECT COUNT(*) 
        FROM public.throws t 
        JOIN public.turns tu ON t.turn_id = tu.id 
        WHERE tu.leg_id = l.id AND tu.player_id = l.winner_player_id
    ) as dart_count
FROM public.legs l
JOIN public.matches m ON l.match_id = m.id
JOIN public.players p ON l.winner_player_id = p.id
WHERE 
    l.winner_player_id IS NOT NULL
    AND (m.ended_early = false OR m.ended_early IS NULL)
    AND p.display_name NOT ILIKE '%test%';

-- Grant access to the view
GRANT SELECT ON public.quickest_legs_leaderboard TO anon, authenticated, service_role;
