-- Enable real-time support for dart scoreboard tables
-- This allows clients to subscribe to real-time updates via WebSocket

-- Enable real-time for matches table
alter publication supabase_realtime add table matches;

-- Enable real-time for legs table  
alter publication supabase_realtime add table legs;

-- Enable real-time for turns table
alter publication supabase_realtime add table turns;

-- Enable real-time for throws table
alter publication supabase_realtime add table throws;

-- Enable real-time for match_players table (for player changes)
alter publication supabase_realtime add table match_players;