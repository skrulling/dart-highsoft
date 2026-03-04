import { test as base, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Test Supabase instance configuration (port 56XXX)
const TEST_SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:56421';
const TEST_SUPABASE_SERVICE_ROLE_KEY =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

// Test player IDs (from seed.sql) - must be valid UUIDs
export const TEST_PLAYERS = {
  ONE: '11111111-1111-1111-1111-111111111111',
  TWO: '22222222-2222-2222-2222-222222222222',
  THREE: '33333333-3333-3333-3333-333333333333',
  FOUR: '44444444-4444-4444-4444-444444444444',
} as const;

export const TEST_PLAYER_NAMES: Record<string, string> = {
  [TEST_PLAYERS.ONE]: 'E2E Player One',
  [TEST_PLAYERS.TWO]: 'E2E Player Two',
  [TEST_PLAYERS.THREE]: 'E2E Player Three',
  [TEST_PLAYERS.FOUR]: 'E2E Player Four',
};

export const TEST_BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3001';

type TestFixtures = {
  supabase: SupabaseClient;
  createMatch: (options?: {
    startScore?: number;
    finish?: 'single_out' | 'double_out';
    legsToWin?: number;
    playerIds?: string[];
    legWinnerId?: string | null;
    fairEnding?: boolean;
  }) => Promise<{ matchId: string; legId: string }>;
  cleanupMatch: (matchId: string) => Promise<void>;
  createTournament: (options?: {
    playerIds?: string[];
    name?: string;
    startScore?: number;
    finishRule?: 'single_out' | 'double_out';
    legsToWin?: number;
    fairEnding?: boolean;
  }) => Promise<{ tournamentId: string }>;
};

/**
 * Extended Playwright test with Supabase fixtures
 */
export const test = base.extend<TestFixtures>({
  supabase: async ({}, use) => {
    if (!TEST_SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for e2e fixtures');
    }
    const client = createClient(TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await use(client);
  },

  createMatch: async ({ supabase }, use) => {
    const createdMatchIds: string[] = [];

    const createMatch = async (options?: {
      startScore?: number;
      finish?: 'single_out' | 'double_out';
      legsToWin?: number;
      playerIds?: string[];
      legWinnerId?: string | null;
      fairEnding?: boolean;
    }) => {
      const startScore = options?.startScore ?? 501;
      const finish = options?.finish ?? 'double_out';
      const legsToWin = options?.legsToWin ?? 1;
      const playerIds = options?.playerIds ?? [TEST_PLAYERS.ONE, TEST_PLAYERS.TWO];
      const legWinnerId = options?.legWinnerId ?? null;
      const fairEnding = options?.fairEnding ?? false;

      await ensurePlayersExist(supabase, playerIds);

      // Create match
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
          mode: 'x01',
          start_score: startScore.toString(),
          finish,
          legs_to_win: legsToWin,
          fair_ending: fairEnding,
        })
        .select()
        .single();

      if (matchError || !match) {
        throw new Error(`Failed to create match: ${matchError?.message}`);
      }

      createdMatchIds.push(match.id);

      // Add players to match
      const matchPlayers = playerIds.map((playerId, index) => ({
        match_id: match.id,
        player_id: playerId,
        play_order: index,
      }));

      const { error: playersError } = await supabase.from('match_players').insert(matchPlayers);

      if (playersError) {
        throw new Error(`Failed to add players: ${playersError.message}`);
      }

      // Create first leg
      const { data: leg, error: legError } = await supabase
        .from('legs')
        .insert({
          match_id: match.id,
          leg_number: 1,
          starting_player_id: playerIds[0],
          winner_player_id: legWinnerId,
        })
        .select()
        .single();

      if (legError || !leg) {
        throw new Error(`Failed to create leg: ${legError?.message}`);
      }

      return { matchId: match.id, legId: leg.id };
    };

    await use(createMatch);

    // Cleanup all created matches after test
    for (const matchId of createdMatchIds) {
      await cleanupMatchData(supabase, matchId);
    }
  },

  cleanupMatch: async ({ supabase }, use) => {
    await use(async (matchId: string) => {
      await cleanupMatchData(supabase, matchId);
    });
  },

  createTournament: async ({ supabase }, use) => {
    const createdTournamentIds: string[] = [];

    const createTournament = async (options?: {
      playerIds?: string[];
      name?: string;
      startScore?: number;
      finishRule?: 'single_out' | 'double_out';
      legsToWin?: number;
      fairEnding?: boolean;
    }) => {
      const playerIds = options?.playerIds ?? [
        TEST_PLAYERS.ONE,
        TEST_PLAYERS.TWO,
        TEST_PLAYERS.THREE,
        TEST_PLAYERS.FOUR,
      ];
      await ensurePlayersExist(supabase, playerIds);

      const resp = await fetch(`${TEST_BASE_URL}/api/tournaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: options?.name ?? 'E2E Test Tournament',
          startScore: options?.startScore ?? 201,
          finishRule: options?.finishRule ?? 'single_out',
          legsToWin: options?.legsToWin ?? 1,
          fairEnding: options?.fairEnding ?? false,
          playerIds,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Failed to create tournament: ${resp.status} ${text}`);
      }

      const { tournamentId } = await resp.json();
      createdTournamentIds.push(tournamentId);
      return { tournamentId };
    };

    await use(createTournament);

    // Cleanup all created tournaments after test
    for (const tournamentId of createdTournamentIds) {
      await cleanupTournamentData(supabase, tournamentId);
    }
  },
});

/**
 * Helper to clean up match data (cascades to legs, turns, throws)
 */
async function cleanupMatchData(supabase: SupabaseClient, matchId: string) {
  // Delete in order due to foreign key constraints
  // First get all legs for this match
  const { data: legs } = await supabase.from('legs').select('id').eq('match_id', matchId);

  if (legs) {
    for (const leg of legs) {
      // Get all turns for this leg
      const { data: turns } = await supabase.from('turns').select('id').eq('leg_id', leg.id);

      if (turns) {
        for (const turn of turns) {
          // Delete throws for this turn
          await supabase.from('throws').delete().eq('turn_id', turn.id);
        }
        // Delete turns for this leg
        await supabase.from('turns').delete().eq('leg_id', leg.id);
      }
    }
    // Delete legs for this match
    await supabase.from('legs').delete().eq('match_id', matchId);
  }

  // Delete match_players
  await supabase.from('match_players').delete().eq('match_id', matchId);

  // Delete match
  await supabase.from('matches').delete().eq('id', matchId);
}

async function ensurePlayersExist(supabase: SupabaseClient, playerIds: string[]) {
  const rows = playerIds.map((playerId, index) => ({
    id: playerId,
    display_name: TEST_PLAYER_NAMES[playerId] ?? `E2E Player ${index + 1}`,
  }));

  // Guard against stale local data where these canonical E2E names exist on different UUIDs.
  // We need deterministic UUIDs for tests, so remove conflicting rows first.
  const desiredByName = new Map(rows.map((row) => [row.display_name, row.id]));
  const { data: existingByName, error: existingError } = await supabase
    .from('players')
    .select('id, display_name')
    .in('display_name', rows.map((row) => row.display_name));
  if (existingError) {
    throw new Error(`Failed to query existing test players: ${existingError.message}`);
  }
  for (const existing of existingByName ?? []) {
    const desiredId = desiredByName.get(existing.display_name);
    if (desiredId && existing.id !== desiredId) {
      const { error: deleteError } = await supabase.from('players').delete().eq('id', existing.id);
      if (deleteError) {
        throw new Error(`Failed to remove conflicting player ${existing.display_name}: ${deleteError.message}`);
      }
    }
  }

  const { error } = await supabase.from('players').upsert(rows, { onConflict: 'id' });
  if (error) {
    throw new Error(`Failed to ensure test players: ${error.message}`);
  }
}

/**
 * Helper to add throws to a turn
 */
export async function addThrowsToTurn(
  supabase: SupabaseClient,
  turnId: string,
  matchId: string,
  throws: Array<{ segment: string; scored: number; dart_index: number }>
) {
  void matchId;
  const throwRecords = throws.map((t) => ({
    turn_id: turnId,
    segment: t.segment,
    scored: t.scored,
    dart_index: t.dart_index,
  }));

  const { error } = await supabase.from('throws').insert(throwRecords);

  if (error) {
    throw new Error(`Failed to add throws: ${error.message}`);
  }
}

/**
 * Helper to create a turn
 */
export async function createTurn(
  supabase: SupabaseClient,
  legId: string,
  playerId: string,
  turnNumber: number
) {
  const { data, error } = await supabase
    .from('turns')
    .insert({
      leg_id: legId,
      player_id: playerId,
      turn_number: turnNumber,
      total_scored: 0,
      busted: false,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create turn: ${error?.message}`);
  }

  return data;
}

/**
 * Helper to clean up tournament data and all associated matches
 */
export async function cleanupTournamentData(supabase: SupabaseClient, tournamentId: string) {
  // Get all tournament_matches
  const { data: tms } = await supabase
    .from('tournament_matches')
    .select('id, match_id')
    .eq('tournament_id', tournamentId);

  // Clean up associated matches first (matches have FK to tournament_matches)
  if (tms) {
    for (const tm of tms) {
      if (tm.match_id) {
        await cleanupMatchData(supabase, tm.match_id);
      }
    }
  }

  // Null out self-referential FKs before deleting tournament_matches
  await supabase
    .from('tournament_matches')
    .update({ next_winner_tm_id: null, next_loser_tm_id: null })
    .eq('tournament_id', tournamentId);

  // Delete tournament_matches
  await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);

  // Delete tournament_players
  await supabase.from('tournament_players').delete().eq('tournament_id', tournamentId);

  // Delete tournament
  await supabase.from('tournaments').delete().eq('id', tournamentId);
}

/**
 * Seed a 201 single_out match so both players are at 20 remaining.
 * Player order must match the match_players play_order.
 */
export async function seedMatchToNearCompletion(
  supabase: SupabaseClient,
  matchId: string,
  legId: string,
  player1Id: string,
  player2Id: string
) {
  // Turn 1 (P1): T20+T20+T20 = 180 → score 21
  const turn1 = await createTurn(supabase, legId, player1Id, 1);
  await addThrowsToTurn(supabase, turn1.id, matchId, [
    { segment: 'T20', scored: 60, dart_index: 1 },
    { segment: 'T20', scored: 60, dart_index: 2 },
    { segment: 'T20', scored: 60, dart_index: 3 },
  ]);
  await supabase.from('turns').update({ total_scored: 180, busted: false }).eq('id', turn1.id);

  // Turn 2 (P2): T20+T20+T20 = 180 → score 21
  const turn2 = await createTurn(supabase, legId, player2Id, 2);
  await addThrowsToTurn(supabase, turn2.id, matchId, [
    { segment: 'T20', scored: 60, dart_index: 1 },
    { segment: 'T20', scored: 60, dart_index: 2 },
    { segment: 'T20', scored: 60, dart_index: 3 },
  ]);
  await supabase.from('turns').update({ total_scored: 180, busted: false }).eq('id', turn2.id);

  // Turn 3 (P1): S1 = 1 → score 20
  const turn3 = await createTurn(supabase, legId, player1Id, 3);
  await addThrowsToTurn(supabase, turn3.id, matchId, [
    { segment: 'S1', scored: 1, dart_index: 1 },
    { segment: 'Miss', scored: 0, dart_index: 2 },
    { segment: 'Miss', scored: 0, dart_index: 3 },
  ]);
  await supabase.from('turns').update({ total_scored: 1, busted: false }).eq('id', turn3.id);

  // Turn 4 (P2): S1 = 1 → score 20
  const turn4 = await createTurn(supabase, legId, player2Id, 4);
  await addThrowsToTurn(supabase, turn4.id, matchId, [
    { segment: 'S1', scored: 1, dart_index: 1 },
    { segment: 'Miss', scored: 0, dart_index: 2 },
    { segment: 'Miss', scored: 0, dart_index: 3 },
  ]);
  await supabase.from('turns').update({ total_scored: 1, busted: false }).eq('id', turn4.id);
}

/**
 * Complete a tournament match via API. Seeds the match to near-completion,
 * then calls the leg completion endpoint to trigger tournament advancement.
 */
export async function completeTournamentMatchViaApi(
  supabase: SupabaseClient,
  tournamentMatchId: string,
  winnerId: string
): Promise<void> {
  // 1. Get tournament_match → match_id
  const { data: tm, error: tmErr } = await supabase
    .from('tournament_matches')
    .select('match_id, player1_id, player2_id')
    .eq('id', tournamentMatchId)
    .single();

  if (tmErr || !tm?.match_id) {
    throw new Error(`Tournament match has no associated match: ${tmErr?.message ?? 'missing match_id'}`);
  }

  // 2. Get the first leg
  const { data: leg, error: legErr } = await supabase
    .from('legs')
    .select('id')
    .eq('match_id', tm.match_id)
    .order('leg_number', { ascending: true })
    .limit(1)
    .single();

  if (legErr || !leg) {
    throw new Error(`No leg found for match: ${legErr?.message}`);
  }

  // 3. Get match players in play order
  const { data: matchPlayers } = await supabase
    .from('match_players')
    .select('player_id')
    .eq('match_id', tm.match_id)
    .order('play_order', { ascending: true });

  if (!matchPlayers || matchPlayers.length < 2) {
    throw new Error('Not enough match players');
  }

  // 4. Seed match to near-completion (both players at 20)
  await seedMatchToNearCompletion(
    supabase,
    tm.match_id,
    leg.id,
    matchPlayers[0].player_id,
    matchPlayers[1].player_id
  );

  // 5. Call completion API
  const resp = await fetch(
    `${TEST_BASE_URL}/api/matches/${tm.match_id}/legs/${leg.id}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerPlayerId: winnerId }),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to complete match: ${resp.status} ${text}`);
  }
}

/**
 * Get all tournament_matches for a tournament, ordered by bracket/round/position.
 */
export async function getTournamentState(supabase: SupabaseClient, tournamentId: string) {
  const { data, error } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('bracket')
    .order('round')
    .order('position');

  if (error) throw new Error(`Failed to get tournament state: ${error.message}`);
  return data ?? [];
}

export { expect };
