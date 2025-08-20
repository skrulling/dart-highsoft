-- Performance optimization for throws table and queries
-- This migration adds indexes and views to dramatically improve query performance

-- Add missing indexes for throws table
CREATE INDEX IF NOT EXISTS idx_throws_turn_id ON public.throws (turn_id);
CREATE INDEX IF NOT EXISTS idx_throws_segment ON public.throws (segment);
CREATE INDEX IF NOT EXISTS idx_throws_scored ON public.throws (scored);

-- Add composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_throws_turn_segment ON public.throws (turn_id, segment);

-- Add indexes for turns table (frequently joined)
CREATE INDEX IF NOT EXISTS idx_turns_leg_id ON public.turns (leg_id);
CREATE INDEX IF NOT EXISTS idx_turns_player_id ON public.turns (player_id);
CREATE INDEX IF NOT EXISTS idx_turns_created_at ON public.turns (created_at);

-- Add composite index for player-specific turn queries
CREATE INDEX IF NOT EXISTS idx_turns_player_leg ON public.turns (player_id, leg_id);

-- Add indexes for legs table
CREATE INDEX IF NOT EXISTS idx_legs_match_id ON public.legs (match_id);
CREATE INDEX IF NOT EXISTS idx_legs_winner_player_id ON public.legs (winner_player_id);
CREATE INDEX IF NOT EXISTS idx_legs_created_at ON public.legs (created_at);

-- Create optimized view for player throw statistics
CREATE OR REPLACE VIEW public.player_throw_stats AS
SELECT 
    p.id as player_id,
    p.display_name,
    t.segment,
    COUNT(*) as hit_count,
    t.scored,
    AVG(t.scored) as avg_score_per_dart
FROM public.players p
JOIN public.turns tu ON tu.player_id = p.id
JOIN public.throws t ON t.turn_id = tu.id
JOIN public.legs l ON l.id = tu.leg_id
JOIN public.matches m ON m.id = l.match_id
WHERE m.ended_early = false OR m.ended_early IS NULL
GROUP BY p.id, p.display_name, t.segment, t.scored;

-- Create optimized view for player segment summary (for hit distribution charts)  
CREATE OR REPLACE VIEW public.player_segment_summary AS
SELECT 
    p.id as player_id,
    p.display_name,
    t.segment,
    COUNT(*) as total_hits,
    SUM(t.scored) as total_score,
    AVG(t.scored) as avg_score,
    -- Extract numeric value from segment for analysis
    CASE 
        WHEN t.segment ~ '^[0-9]+$' THEN t.segment::int  -- Single numbers like '20', '1'
        WHEN t.segment ~ '^S[0-9]+$' THEN SUBSTRING(t.segment FROM 2)::int  -- Single like 'S20'
        WHEN t.segment ~ '^D[0-9]+$' THEN SUBSTRING(t.segment FROM 2)::int  -- Double like 'D20'  
        WHEN t.segment ~ '^T[0-9]+$' THEN SUBSTRING(t.segment FROM 2)::int  -- Treble like 'T20'
        WHEN t.segment = 'InnerBull' THEN 25
        WHEN t.segment = 'OuterBull' THEN 25
        ELSE 0
    END as segment_number
FROM public.players p
JOIN public.turns tu ON tu.player_id = p.id
JOIN public.throws t ON t.turn_id = tu.id
JOIN public.legs l ON l.id = tu.leg_id  
JOIN public.matches m ON m.id = l.match_id
WHERE (m.ended_early = false OR m.ended_early IS NULL)
  AND p.display_name NOT ILIKE '%test%'
GROUP BY p.id, p.display_name, t.segment;

-- Create view for dartboard adjacency analysis (20 and neighbors: 1, 5)
CREATE OR REPLACE VIEW public.player_adjacency_stats AS
SELECT 
    p.id as player_id,
    p.display_name,
    -- Count hits on 20 and its neighbors
    SUM(CASE WHEN pss.segment_number = 20 THEN pss.total_hits ELSE 0 END) as hits_20,
    SUM(CASE WHEN pss.segment_number = 1 THEN pss.total_hits ELSE 0 END) as hits_1,
    SUM(CASE WHEN pss.segment_number = 5 THEN pss.total_hits ELSE 0 END) as hits_5,
    SUM(CASE WHEN pss.segment_number IN (1, 5, 20) THEN pss.total_hits ELSE 0 END) as hits_20_area,
    
    -- Count hits on 19 and its neighbors  
    SUM(CASE WHEN pss.segment_number = 19 THEN pss.total_hits ELSE 0 END) as hits_19,
    SUM(CASE WHEN pss.segment_number = 3 THEN pss.total_hits ELSE 0 END) as hits_3,
    SUM(CASE WHEN pss.segment_number = 7 THEN pss.total_hits ELSE 0 END) as hits_7,
    SUM(CASE WHEN pss.segment_number IN (3, 7, 19) THEN pss.total_hits ELSE 0 END) as hits_19_area,
    
    -- Total throws for percentage calculations
    SUM(pss.total_hits) as total_throws,
    
    -- Calculate accuracy percentages
    ROUND(
        (SUM(CASE WHEN pss.segment_number = 20 THEN pss.total_hits ELSE 0 END)::decimal / 
         NULLIF(SUM(CASE WHEN pss.segment_number IN (1, 5, 20) THEN pss.total_hits ELSE 0 END), 0)) * 100, 
        2
    ) as accuracy_20_in_area,
    
    ROUND(
        (SUM(CASE WHEN pss.segment_number = 19 THEN pss.total_hits ELSE 0 END)::decimal / 
         NULLIF(SUM(CASE WHEN pss.segment_number IN (3, 7, 19) THEN pss.total_hits ELSE 0 END), 0)) * 100, 
        2
    ) as accuracy_19_in_area
FROM public.players p
LEFT JOIN public.player_segment_summary pss ON pss.player_id = p.id
WHERE p.display_name NOT ILIKE '%test%'
GROUP BY p.id, p.display_name
HAVING SUM(pss.total_hits) > 10; -- Only include players with significant throw data

-- Create optimized view for doubles/trebles accuracy
CREATE OR REPLACE VIEW public.player_accuracy_stats AS
SELECT 
    p.id as player_id,
    p.display_name,
    -- Doubles accuracy
    SUM(CASE WHEN t.segment ~ '^D[0-9]+$' THEN 1 ELSE 0 END) as doubles_attempted,
    SUM(CASE WHEN t.segment ~ '^D[0-9]+$' AND t.scored > 0 THEN 1 ELSE 0 END) as doubles_hit,
    ROUND(
        (SUM(CASE WHEN t.segment ~ '^D[0-9]+$' AND t.scored > 0 THEN 1 ELSE 0 END)::decimal / 
         NULLIF(SUM(CASE WHEN t.segment ~ '^D[0-9]+$' THEN 1 ELSE 0 END), 0)) * 100, 
        1
    ) as doubles_accuracy,
    
    -- Trebles accuracy  
    SUM(CASE WHEN t.segment ~ '^T[0-9]+$' THEN 1 ELSE 0 END) as trebles_attempted,
    SUM(CASE WHEN t.segment ~ '^T[0-9]+$' AND t.scored > 0 THEN 1 ELSE 0 END) as trebles_hit,
    ROUND(
        (SUM(CASE WHEN t.segment ~ '^T[0-9]+$' AND t.scored > 0 THEN 1 ELSE 0 END)::decimal / 
         NULLIF(SUM(CASE WHEN t.segment ~ '^T[0-9]+$' THEN 1 ELSE 0 END), 0)) * 100, 
        1
    ) as trebles_accuracy,
    
    -- Total throws
    COUNT(*) as total_throws
FROM public.players p
JOIN public.turns tu ON tu.player_id = p.id
JOIN public.throws t ON t.turn_id = tu.id
JOIN public.legs l ON l.id = tu.leg_id
JOIN public.matches m ON m.id = l.match_id
WHERE (m.ended_early = false OR m.ended_early IS NULL)
  AND p.display_name NOT ILIKE '%test%'
GROUP BY p.id, p.display_name
HAVING COUNT(*) > 10; -- Only include players with significant throw data

-- Add unique constraint to prevent duplicate throws (data integrity)
CREATE UNIQUE INDEX IF NOT EXISTS idx_throws_unique_turn_dart 
ON public.throws (turn_id, dart_index);

-- Create partial index for non-miss throws (for better performance on hit analysis)
CREATE INDEX IF NOT EXISTS idx_throws_hits_only 
ON public.throws (turn_id, segment) 
WHERE segment != 'Miss' AND segment != 'MISS';

-- Update table statistics for query planner
ANALYZE public.throws;
ANALYZE public.turns;
ANALYZE public.legs;
ANALYZE public.matches;