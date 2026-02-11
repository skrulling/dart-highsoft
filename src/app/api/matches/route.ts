import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

type CreateMatchRequest = {
  type: 201 | 301 | 501;
  legs: number;
  checkout: 'single' | 'double';
  participants: string[];
};

type CreateMatchResponse = {
  matchId: string;
  scoringMode: string;
  spectatorMode: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as
      | CreateMatchRequest
      | {
          startScore: 201 | 301 | 501;
          legsToWin: number;
          finishRule: 'single_out' | 'double_out';
          playerIds: string[];
        };
    
    const supabase = getSupabaseServerClient();
    
    let startScore: '201' | '301' | '501';
    let finish: 'single_out' | 'double_out';
    let legsToWin: number;
    let playerIds: string[] = [];

    if ('playerIds' in body) {
      if (!body.startScore || ![201, 301, 501].includes(body.startScore)) {
        return NextResponse.json({ error: 'Invalid startScore. Must be 201, 301, or 501' }, { status: 400 });
      }
      if (!body.finishRule || !['single_out', 'double_out'].includes(body.finishRule)) {
        return NextResponse.json({ error: 'Invalid finishRule' }, { status: 400 });
      }
      if (!body.legsToWin || body.legsToWin < 1) {
        return NextResponse.json({ error: 'Invalid legsToWin' }, { status: 400 });
      }
      if (!body.playerIds || !Array.isArray(body.playerIds) || body.playerIds.length < 2) {
        return NextResponse.json({ error: 'Invalid playerIds' }, { status: 400 });
      }
      startScore = String(body.startScore) as '201' | '301' | '501';
      finish = body.finishRule;
      legsToWin = body.legsToWin;
      playerIds = body.playerIds;
    } else {
      if (!body.type || ![201, 301, 501].includes(body.type)) {
        return NextResponse.json({ error: 'Invalid type. Must be 201, 301, or 501' }, { status: 400 });
      }
      if (!body.checkout || !['single', 'double'].includes(body.checkout)) {
        return NextResponse.json({ error: 'Invalid checkout. Must be "single" or "double"' }, { status: 400 });
      }
      if (!body.legs || body.legs < 1) {
        return NextResponse.json({ error: 'Invalid legs. Must be a positive number' }, { status: 400 });
      }
      if (!body.participants || !Array.isArray(body.participants) || body.participants.length < 2) {
        return NextResponse.json({ error: 'Invalid participants. Must be an array with at least 2 player names' }, { status: 400 });
      }
      startScore = String(body.type) as '201' | '301' | '501';
      finish = body.checkout === 'single' ? 'single_out' : 'double_out';
      legsToWin = body.legs;

      const trimmedNames = body.participants.map((n) => n.trim());
      const emptyName = trimmedNames.find((n) => !n);
      if (emptyName !== undefined) {
        return NextResponse.json({ error: 'Player names cannot be empty' }, { status: 400 });
      }

      // Deduplicate names so parallel lookups don't race on the same player
      const uniqueNames = [...new Set(trimmedNames)];
      const resolvedByName = new Map<string, { id: string }>();

      const resolvedPlayers = await Promise.all(
        uniqueNames.map(async (trimmedName) => {
          const { data: existingPlayer } = await supabase
            .from('players')
            .select('*')
            .eq('display_name', trimmedName)
            .single();
          if (existingPlayer) return existingPlayer;
          const { data: newPlayer, error: playerError } = await supabase
            .from('players')
            .insert({ display_name: trimmedName })
            .select('*')
            .single();
          if (playerError || !newPlayer) {
            if (playerError?.code === '23505') {
              throw new Error(`A player named "${trimmedName}" already exists`);
            }
            throw new Error(`Failed to create player: ${trimmedName}`);
          }
          return newPlayer;
        })
      );
      for (let i = 0; i < uniqueNames.length; i++) {
        resolvedByName.set(uniqueNames[i], resolvedPlayers[i]);
      }
      playerIds = trimmedNames.map((n) => resolvedByName.get(n)!.id);
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
      matchId,
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
