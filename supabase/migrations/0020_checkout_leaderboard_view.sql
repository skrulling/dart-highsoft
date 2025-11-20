-- Create a view for efficient checkout leaderboard querying
CREATE OR REPLACE VIEW public.checkout_leaderboard AS
SELECT 
    t.id AS turn_id,
    t.player_id,
    p.display_name,
    t.total_scored AS score,
    (
        SELECT COUNT(*)
        FROM public.throws th 
        WHERE th.turn_id = t.id 
          AND th.segment IS NOT NULL 
          AND th.segment <> ''
    ) AS darts_used,
    l.created_at AS date
FROM public.turns t
JOIN public.legs l ON t.leg_id = l.id
JOIN public.matches m ON l.match_id = m.id
JOIN public.players p ON t.player_id = p.id
WHERE 
    l.winner_player_id = t.player_id -- Winner's turn
    AND (m.ended_early = false OR m.ended_early IS NULL) -- Valid match
    AND p.display_name NOT ILIKE '%test%' -- Not a test player
    AND t.total_scored > 0 -- Sanity check
    -- Ensure it is the winner's last turn of this leg
    AND t.turn_number = (
        SELECT MAX(t2.turn_number) 
        FROM public.turns t2 
        WHERE t2.leg_id = t.leg_id
          AND t2.player_id = t.player_id
    );

-- Grant access to the view
GRANT SELECT ON public.checkout_leaderboard TO anon, authenticated, service_role;
