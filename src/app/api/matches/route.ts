import { getSupabaseClient } from '@/lib/supabaseClient';
import { NextRequest, NextResponse } from 'next/server';

type CreateMatchRequest = {
  type: 201 | 301 | 501;
  legs: number;
  checkout: 'single' | 'double';
  participants: string[];
};

type CreateMatchResponse = {
  scoringMode: string;
  spectatorMode: string;
};

export async function POST(request: NextRequest) {
  try {
    const body: CreateMatchRequest = await request.json();
    
    // Validate request body
    if (!body.type || ![201, 301, 501].includes(body.type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be 201, 301, or 501' },
        { status: 400 }
      );
    }
    
    if (!body.checkout || !['single', 'double'].includes(body.checkout)) {
      return NextResponse.json(
        { error: 'Invalid checkout. Must be "single" or "double"' },
        { status: 400 }
      );
    }
    
    if (!body.legs || body.legs < 1) {
      return NextResponse.json(
        { error: 'Invalid legs. Must be a positive number' },
        { status: 400 }
      );
    }
    
    if (!body.participants || !Array.isArray(body.participants) || body.participants.length < 2) {
      return NextResponse.json(
        { error: 'Invalid participants. Must be an array with at least 2 player names' },
        { status: 400 }
      );
    }
    
    const supabase = await getSupabaseClient();
    
    // Convert API format to database format
    const startScore = String(body.type) as '201' | '301' | '501';
    const finish = body.checkout === 'single' ? 'single_out' : 'double_out';
    const legsToWin = body.legs;
    
    // Find or create players
    const playerIds: string[] = [];
    
    for (const participantName of body.participants) {
      const trimmedName = participantName.trim();
      if (!trimmedName) {
        return NextResponse.json(
          { error: 'Player names cannot be empty' },
          { status: 400 }
        );
      }
      
      // Try to find existing player
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('*')
        .eq('display_name', trimmedName)
        .single();
      
      if (existingPlayer) {
        playerIds.push(existingPlayer.id);
      } else {
        // Create new player
        const { data: newPlayer, error: playerError } = await supabase
          .from('players')
          .insert({ display_name: trimmedName })
          .select('*')
          .single();
          
        if (playerError || !newPlayer) {
          return NextResponse.json(
            { error: `Failed to create player: ${participantName}` },
            { status: 500 }
          );
        }
        
        playerIds.push(newPlayer.id);
      }
    }
    
    // Create match
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .insert({ 
        mode: 'x01', 
        start_score: startScore, 
        finish, 
        legs_to_win: legsToWin 
      })
      .select('*')
      .single();
      
    if (matchError || !match) {
      return NextResponse.json(
        { error: 'Failed to create match' },
        { status: 500 }
      );
    }
    
    const matchId = match.id;
    
    // Randomize player order (like the UI does)
    const order = [...playerIds].sort(() => Math.random() - 0.5);
    
    // Create match_players entries
    const matchPlayers = order.map((playerId, index) => ({
      match_id: matchId,
      player_id: playerId,
      play_order: index
    }));
    
    const { error: matchPlayersError } = await supabase
      .from('match_players')
      .insert(matchPlayers);
      
    if (matchPlayersError) {
      return NextResponse.json(
        { error: 'Failed to add players to match' },
        { status: 500 }
      );
    }
    
    // Create first leg
    const { error: legError } = await supabase
      .from('legs')
      .insert({ 
        match_id: matchId, 
        leg_number: 1, 
        starting_player_id: order[0] 
      });
      
    if (legError) {
      return NextResponse.json(
        { error: 'Failed to create first leg' },
        { status: 500 }
      );
    }
    
    // Generate URLs
    const baseUrl = request.nextUrl.origin;
    const scoringMode = `${baseUrl}/match/${matchId}`;
    const spectatorMode = `${baseUrl}/match/${matchId}?spectator=true`;
    
    const response: CreateMatchResponse = {
      scoringMode,
      spectatorMode
    };
    
    return NextResponse.json(response, { status: 201 });
    
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}