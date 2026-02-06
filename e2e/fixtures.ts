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
} as const;

const TEST_PLAYER_NAMES: Record<string, string> = {
  [TEST_PLAYERS.ONE]: 'E2E Player One',
  [TEST_PLAYERS.TWO]: 'E2E Player Two',
  [TEST_PLAYERS.THREE]: 'E2E Player Three',
};

type TestFixtures = {
  supabase: SupabaseClient;
  createMatch: (options?: {
    startScore?: number;
    finish?: 'single_out' | 'double_out';
    legsToWin?: number;
    playerIds?: string[];
    legWinnerId?: string | null;
  }) => Promise<{ matchId: string; legId: string }>;
  cleanupMatch: (matchId: string) => Promise<void>;
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
    }) => {
      const startScore = options?.startScore ?? 501;
      const finish = options?.finish ?? 'double_out';
      const legsToWin = options?.legsToWin ?? 1;
      const playerIds = options?.playerIds ?? [TEST_PLAYERS.ONE, TEST_PLAYERS.TWO];
      const legWinnerId = options?.legWinnerId ?? null;

      await ensurePlayersExist(supabase, playerIds);

      // Create match
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
          mode: 'x01',
          start_score: startScore.toString(),
          finish,
          legs_to_win: legsToWin,
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

export { expect };
