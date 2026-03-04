import { describe, it, expect } from 'vitest';
import { advanceTournament } from './advance';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TournamentMatchRecord } from './types';

type JsonMap = Record<string, unknown>;
type TournamentRow = {
  id: string;
  status: string;
  start_score?: string;
  finish?: string;
  legs_to_win?: number;
  fair_ending?: boolean;
};
type TournamentPlayerRow = { player_id: string; seed: number; final_rank: number | null };

/**
 * Build a chainable mock that supports Supabase's fluent query builder.
 * Supports the atomic update pattern: .update(data).eq().is().select().single()
 */
function createMockSupabase(data: {
  tournamentMatches: Record<string, TournamentMatchRecord>;
  tournament?: TournamentRow;
  tournamentPlayers?: TournamentPlayerRow[];
}) {
  const updates: { table: string; filters: JsonMap; data: unknown }[] = [];
  const inserts: { table: string; data: unknown }[] = [];

  function makeBuilder(table: string, mode: 'select' | 'update' | 'insert', payload?: unknown) {
    const filters: JsonMap = {};
    let orFilter: string | null = null;

    function rowMatches(row: JsonMap) {
      for (const [key, value] of Object.entries(filters)) {
        if (key.startsWith('_is_')) {
          const col = key.slice(4);
          if (value === null) {
            if (row[col] !== null && row[col] !== undefined) return false;
          } else if (row[col] !== value) {
            return false;
          }
          continue;
        }
        if (row[key] !== value) return false;
      }

      if (!orFilter) return true;

      const clauses = orFilter
        .split(',')
        .map((clause) => clause.trim())
        .filter(Boolean);

      return clauses.some((clause) => {
        const [col, op, ...rest] = clause.split('.');
        if (!col || op !== 'eq' || rest.length === 0) return false;
        const expected = rest.join('.');
        return String(row[col] ?? '') === expected;
      });
    }

    function selectRows() {
      if (table === 'tournament_matches') {
        return Object.values(data.tournamentMatches)
          .map((row) => ({ ...row }) as JsonMap)
          .filter((row) => rowMatches(row));
      }
      if (table === 'tournaments') {
        const row = data.tournament ? ({ ...data.tournament } as JsonMap) : null;
        return row && rowMatches(row) ? [row] : [];
      }
      if (table === 'tournament_players') {
        return (data.tournamentPlayers ?? [])
          .map((row) => ({ ...row }) as JsonMap)
          .filter((row) => rowMatches(row));
      }
      return [];
    }

    const builder: {
      eq: (col: string, val: unknown) => typeof builder;
      is: (col: string, val: unknown) => typeof builder;
      order: () => typeof builder;
      or: (filter: string) => typeof builder;
      select: (_cols?: string, _opts?: unknown) => unknown;
      single: () => Promise<{ data?: unknown; error: unknown }>;
      then?: (resolve: (value: unknown) => void) => void;
      data?: unknown;
    } = {
      eq(col: string, val: unknown) {
        filters[col] = val;
        return builder;
      },
      is(col: string, val: unknown) {
        filters[`_is_${col}`] = val;
        return builder;
      },
      order() {
        return builder;
      },
      or(filter: string) {
        orFilter = filter;
        return builder;
      },
      select(_cols?: string, _opts?: unknown) {
        if (mode === 'update') {
          // Chain: update().eq().is().select().single()/maybeSingle()
          function resolveUpdate() {
            const id = filters['id'];
            if (table === 'tournament_matches' && typeof id === 'string' && data.tournamentMatches[id]) {
              const tm = data.tournamentMatches[id] as unknown as JsonMap;
              // Check all .is() filters
              for (const [key, val] of Object.entries(filters)) {
                if (!key.startsWith('_is_')) continue;
                const col = key.slice(4); // e.g. '_is_winner_id' -> 'winner_id'
                if (val === null && tm[col] !== null && tm[col] !== undefined) {
                  return { data: null, matched: false };
                }
              }
              // Apply the update
              Object.assign(tm, payload);
              updates.push({ table, filters: { ...filters }, data: payload });
              return { data: { ...tm }, matched: true };
            }
            return { data: null, matched: false };
          }
          return {
            async single() {
              const result = resolveUpdate();
              if (!result.matched) {
                return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
              }
              return { data: result.data, error: null };
            },
            async maybeSingle() {
              const result = resolveUpdate();
              return { data: result.data, error: null };
            },
          };
        }
        return builder;
      },
      async single() {
        if (mode === 'select') {
          const rows = selectRows();
          return { data: rows[0] ?? null, error: null };
        }
        if (mode === 'update') {
          const id = filters['id'];
          updates.push({ table, filters: { ...filters }, data: payload });
          if (table === 'tournament_matches' && typeof id === 'string' && data.tournamentMatches[id]) {
            Object.assign(data.tournamentMatches[id], payload as object);
          }
          return { error: null };
        }
        return { data: null, error: null };
      },
    };

    // For update without single() — awaiting the builder directly
    builder.then = (resolve: (value: unknown) => void) => {
      if (mode === 'select') {
        resolve({ data: selectRows(), error: null });
        return;
      }

      if (mode === 'update') {
        updates.push({ table, filters: { ...filters }, data: payload });
        if (table === 'tournament_matches') {
          const id = filters['id'];
          if (typeof id === 'string' && data.tournamentMatches[id]) {
            Object.assign(data.tournamentMatches[id], payload as object);
          }
        }
      }
      resolve({ count: 1, error: null, data: null });
    };

    Object.defineProperty(builder, 'data', {
      get() {
        if (mode === 'select' && table === 'tournament_players') {
          return data.tournamentPlayers ?? [];
        }
        return null;
      },
    });

    return builder;
  }

  const deletes: { table: string; filters: JsonMap }[] = [];
  const rpcs: { fn: string; params: unknown }[] = [];

  const mockClient = {
    rpc: async (fn: string, params: unknown) => {
      rpcs.push({ fn, params });
      return { error: null };
    },
    from: (table: string) => ({
      select: (cols?: string) => makeBuilder(table, 'select'),
      update: (updateData: unknown) => makeBuilder(table, 'update', updateData),
      insert: (insertData: unknown) => {
        inserts.push({ table, data: insertData });
        const insertRow = Array.isArray(insertData) ? insertData[0] : insertData;
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'new-match-id', ...((insertRow as object | null) ?? {}) },
              error: null,
            }),
          }),
          error: null,
        };
      },
      delete: () => {
        const deleteFilters: JsonMap = {};
        const deleteBuilder: {
          eq: (col: string, val: unknown) => typeof deleteBuilder;
          then: (resolve: (value: { error: null }) => void) => void;
        } = {
          eq(col: string, val: unknown) {
            deleteFilters[col] = val;
            return deleteBuilder;
          },
          then(resolve: (value: { error: null }) => void) {
            deletes.push({ table, filters: { ...deleteFilters } });
            resolve({ error: null });
          },
        };
        return deleteBuilder;
      },
    }),
    _updates: updates,
    _inserts: inserts,
    _deletes: deletes,
    _rpcs: rpcs,
  };

  return mockClient;
}

describe('advanceTournament', () => {
  it('places winner in the next_winner destination slot', async () => {
    const destTmId = 'dest-1';
    const tmId = 'tm-1';
    const supabase = createMockSupabase({
      tournamentMatches: {
        [tmId]: {
          id: tmId,
          tournament_id: 'tour-1',
          bracket: 'winners',
          round: 1,
          position: 0,
          player1_id: 'p1',
          player2_id: 'p2',
          winner_id: null,
          loser_id: null,
          match_id: 'match-1',
          is_bye: false,
          next_winner_tm_id: destTmId,
          next_loser_tm_id: 'lb-dest-1',
        },
        [destTmId]: {
          id: destTmId,
          tournament_id: 'tour-1',
          bracket: 'winners',
          round: 2,
          position: 0,
          player1_id: null,
          player2_id: null,
          winner_id: null,
          loser_id: null,
          match_id: null,
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
        'lb-dest-1': {
          id: 'lb-dest-1',
          tournament_id: 'tour-1',
          bracket: 'losers',
          round: 1,
          position: 0,
          player1_id: null,
          player2_id: null,
          winner_id: null,
          loser_id: null,
          match_id: null,
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
      },
      tournament: { id: 'tour-1', status: 'in_progress' },
    });

    const result = await advanceTournament(supabase as unknown as SupabaseClient, tmId, 'p1', 'p2');
    expect(result.tournamentCompleted).toBe(false);

    // Winner placed in next_winner dest
    const winnerUpdate = supabase._updates.find(
      (u) => u.table === 'tournament_matches' && u.filters?.id === destTmId
    );
    expect(winnerUpdate).toBeDefined();
    expect(winnerUpdate!.data.player1_id === 'p1' || winnerUpdate!.data.player2_id === 'p1').toBe(true);
  });

  it('places loser in the next_loser destination slot (LB)', async () => {
    const tmId = 'tm-1';
    const lbDestId = 'lb-dest-1';
    const supabase = createMockSupabase({
      tournamentMatches: {
        [tmId]: {
          id: tmId,
          tournament_id: 'tour-1',
          bracket: 'winners',
          round: 1,
          position: 0,
          player1_id: 'p1',
          player2_id: 'p2',
          winner_id: null,
          loser_id: null,
          match_id: 'match-1',
          is_bye: false,
          next_winner_tm_id: 'wb-dest',
          next_loser_tm_id: lbDestId,
        },
        'wb-dest': {
          id: 'wb-dest',
          tournament_id: 'tour-1',
          bracket: 'winners',
          round: 2,
          position: 0,
          player1_id: null,
          player2_id: null,
          winner_id: null,
          loser_id: null,
          match_id: null,
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
        [lbDestId]: {
          id: lbDestId,
          tournament_id: 'tour-1',
          bracket: 'losers',
          round: 1,
          position: 0,
          player1_id: null,
          player2_id: null,
          winner_id: null,
          loser_id: null,
          match_id: null,
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
      },
      tournament: { id: 'tour-1', status: 'in_progress' },
    });

    await advanceTournament(supabase as unknown as SupabaseClient, tmId, 'p1', 'p2');

    const loserUpdate = supabase._updates.find(
      (u) => u.table === 'tournament_matches' && u.filters?.id === lbDestId
    );
    expect(loserUpdate).toBeDefined();
    expect(loserUpdate!.data.player1_id === 'p2' || loserUpdate!.data.player2_id === 'p2').toBe(true);
  });

  it('idempotency — already has a winner, returns early without updates', async () => {
    const tmId = 'tm-1';
    const supabase = createMockSupabase({
      tournamentMatches: {
        [tmId]: {
          id: tmId,
          tournament_id: 'tour-1',
          bracket: 'winners',
          round: 1,
          position: 0,
          player1_id: 'p1',
          player2_id: 'p2',
          winner_id: 'p1', // already set
          loser_id: 'p2',
          match_id: 'match-1',
          is_bye: false,
          next_winner_tm_id: 'dest',
          next_loser_tm_id: 'lb-dest',
        },
      },
      tournament: { id: 'tour-1', status: 'in_progress' },
    });

    const result = await advanceTournament(supabase as unknown as SupabaseClient, tmId, 'p1', 'p2');
    expect(result.tournamentCompleted).toBe(false);
    // The conditional update (is winner_id null) should not match,
    // so no updates at all
    expect(supabase._updates).toHaveLength(0);
  });

  it('LB elimination — loser with no next_loser_tm_id gets ranked', async () => {
    const tmId = 'lb-tm-1';
    const supabase = createMockSupabase({
      tournamentMatches: {
        [tmId]: {
          id: tmId,
          tournament_id: 'tour-1',
          bracket: 'losers',
          round: 1,
          position: 0,
          player1_id: 'p1',
          player2_id: 'p2',
          winner_id: null,
          loser_id: null,
          match_id: 'match-1',
          is_bye: false,
          next_winner_tm_id: 'lb-dest',
          next_loser_tm_id: null,
        },
        'lb-dest': {
          id: 'lb-dest',
          tournament_id: 'tour-1',
          bracket: 'losers',
          round: 2,
          position: 0,
          player1_id: null,
          player2_id: null,
          winner_id: null,
          loser_id: null,
          match_id: null,
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
      },
      tournament: { id: 'tour-1', status: 'in_progress' },
      tournamentPlayers: [
        { player_id: 'p1', seed: 1, final_rank: null },
        { player_id: 'p2', seed: 2, final_rank: null },
        { player_id: 'p3', seed: 3, final_rank: null },
        { player_id: 'p4', seed: 4, final_rank: null },
      ],
    });

    await advanceTournament(supabase as unknown as SupabaseClient, tmId, 'p1', 'p2');

    // The conditional update should have set winner and loser
    const tmUpdate = supabase._updates.find(
      (u) => u.table === 'tournament_matches' && u.filters?.id === tmId
    );
    expect(tmUpdate).toBeDefined();
    expect(tmUpdate!.data.winner_id).toBe('p1');
    expect(tmUpdate!.data.loser_id).toBe('p2');

    // Eliminated player should be ranked via RPC
    const rpcCall = supabase._rpcs.find((r) => r.fn === 'assign_elimination_rank');
    expect(rpcCall).toBeDefined();
    expect(rpcCall!.params.p_tournament_id).toBe('tour-1');
    expect(rpcCall!.params.p_player_id).toBe('p2');
  });

  it('GF match 1: WB champ wins → tournament complete', async () => {
    const gf1Id = 'gf-1';
    const supabase = createMockSupabase({
      tournamentMatches: {
        [gf1Id]: {
          id: gf1Id,
          tournament_id: 'tour-1',
          bracket: 'grand_final',
          round: 1,
          position: 0,
          player1_id: 'wb-champ',
          player2_id: 'lb-champ',
          winner_id: null,
          loser_id: null,
          match_id: 'gf-match-1',
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
      },
      tournament: {
        id: 'tour-1',
        status: 'in_progress',
        start_score: '501',
        finish: 'double_out',
        legs_to_win: 1,
        fair_ending: false,
      },
    });

    const result = await advanceTournament(supabase as unknown as SupabaseClient, gf1Id, 'wb-champ', 'lb-champ');
    expect(result.tournamentCompleted).toBe(true);

    const tournamentUpdate = supabase._updates.find(
      (u) => u.table === 'tournaments'
    );
    expect(tournamentUpdate).toBeDefined();
    expect(tournamentUpdate!.data.status).toBe('completed');
    expect(tournamentUpdate!.data.winner_player_id).toBe('wb-champ');
  });

  it('GF match 1: LB champ wins → reset match populated', async () => {
    const gf1Id = 'gf-1';
    const gfResetId = 'gf-reset';
    const supabase = createMockSupabase({
      tournamentMatches: {
        [gf1Id]: {
          id: gf1Id,
          tournament_id: 'tour-1',
          bracket: 'grand_final',
          round: 1,
          position: 0,
          player1_id: 'wb-champ',
          player2_id: 'lb-champ',
          winner_id: null,
          loser_id: null,
          match_id: 'gf-match-1',
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
        [gfResetId]: {
          id: gfResetId,
          tournament_id: 'tour-1',
          bracket: 'grand_final',
          round: 2,
          position: 0,
          player1_id: null,
          player2_id: null,
          winner_id: null,
          loser_id: null,
          match_id: null,
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
      },
      tournament: {
        id: 'tour-1',
        status: 'in_progress',
        start_score: '501',
        finish: 'double_out',
        legs_to_win: 1,
        fair_ending: false,
      },
    });

    const result = await advanceTournament(supabase as unknown as SupabaseClient, gf1Id, 'lb-champ', 'wb-champ');
    expect(result.tournamentCompleted).toBe(false);

    // GF reset should have both players set
    const resetUpdate = supabase._updates.find(
      (u) => u.table === 'tournament_matches' && u.filters?.id === gfResetId
    );
    expect(resetUpdate).toBeDefined();
    expect(resetUpdate!.data.player1_id).toBe('wb-champ');
    expect(resetUpdate!.data.player2_id).toBe('lb-champ');

    // A match should have been created for the reset
    const matchInsert = supabase._inserts.find((i) => i.table === 'matches');
    expect(matchInsert).toBeDefined();
  });

  it('GF reset match → tournament complete regardless of winner', async () => {
    const gfResetId = 'gf-reset';
    const supabase = createMockSupabase({
      tournamentMatches: {
        [gfResetId]: {
          id: gfResetId,
          tournament_id: 'tour-1',
          bracket: 'grand_final',
          round: 2,
          position: 0,
          player1_id: 'wb-champ',
          player2_id: 'lb-champ',
          winner_id: null,
          loser_id: null,
          match_id: 'gf-reset-match',
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
      },
      tournament: {
        id: 'tour-1',
        status: 'in_progress',
        start_score: '501',
        finish: 'double_out',
        legs_to_win: 1,
        fair_ending: false,
      },
    });

    const result = await advanceTournament(supabase as unknown as SupabaseClient, gfResetId, 'lb-champ', 'wb-champ');
    expect(result.tournamentCompleted).toBe(true);

    const tournamentUpdate = supabase._updates.find(
      (u) => u.table === 'tournaments'
    );
    expect(tournamentUpdate).toBeDefined();
    expect(tournamentUpdate!.data.winner_player_id).toBe('lb-champ');
  });

  it('creates a match when both players arrive in a destination slot', async () => {
    const tmId = 'tm-1';
    const destId = 'dest-1';
    const supabase = createMockSupabase({
      tournamentMatches: {
        [tmId]: {
          id: tmId,
          tournament_id: 'tour-1',
          bracket: 'winners',
          round: 1,
          position: 0,
          player1_id: 'p1',
          player2_id: 'p2',
          winner_id: null,
          loser_id: null,
          match_id: 'match-1',
          is_bye: false,
          next_winner_tm_id: destId,
          next_loser_tm_id: 'lb-dest',
        },
        [destId]: {
          id: destId,
          tournament_id: 'tour-1',
          bracket: 'winners',
          round: 2,
          position: 0,
          player1_id: 'p3',
          player2_id: null,
          winner_id: null,
          loser_id: null,
          match_id: null,
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
        'lb-dest': {
          id: 'lb-dest',
          tournament_id: 'tour-1',
          bracket: 'losers',
          round: 1,
          position: 0,
          player1_id: null,
          player2_id: null,
          winner_id: null,
          loser_id: null,
          match_id: null,
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
      },
      tournament: {
        id: 'tour-1',
        status: 'in_progress',
        start_score: '501',
        finish: 'double_out',
        legs_to_win: 1,
        fair_ending: false,
      },
    });

    await advanceTournament(supabase as unknown as SupabaseClient, tmId, 'p1', 'p2');

    const matchInsert = supabase._inserts.find((i) => i.table === 'matches');
    expect(matchInsert).toBeDefined();
  });

  it('auto-advances when the only remaining feeder is an empty bye', async () => {
    const sourceId = 'wb-source';
    const byeFeederId = 'lb-empty-bye';
    const destId = 'lb-dest';

    const supabase = createMockSupabase({
      tournamentMatches: {
        [sourceId]: {
          id: sourceId,
          tournament_id: 'tour-1',
          bracket: 'winners',
          round: 2,
          position: 0,
          player1_id: 'winner',
          player2_id: 'loser',
          winner_id: null,
          loser_id: null,
          match_id: 'match-1',
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: destId,
        },
        [byeFeederId]: {
          id: byeFeederId,
          tournament_id: 'tour-1',
          bracket: 'losers',
          round: 1,
          position: 0,
          player1_id: null,
          player2_id: null,
          winner_id: null,
          loser_id: null,
          match_id: null,
          is_bye: true,
          next_winner_tm_id: destId,
          next_loser_tm_id: null,
        },
        [destId]: {
          id: destId,
          tournament_id: 'tour-1',
          bracket: 'losers',
          round: 2,
          position: 0,
          player1_id: null,
          player2_id: null,
          winner_id: null,
          loser_id: null,
          match_id: null,
          is_bye: false,
          next_winner_tm_id: null,
          next_loser_tm_id: null,
        },
      },
      tournament: {
        id: 'tour-1',
        status: 'in_progress',
        start_score: '501',
        finish: 'double_out',
        legs_to_win: 1,
        fair_ending: false,
      },
    });

    await advanceTournament(supabase as unknown as SupabaseClient, sourceId, 'winner', 'loser');

    const autoAdvanceUpdate = supabase._updates.find(
      (u) =>
        u.table === 'tournament_matches' &&
        u.filters?.id === destId &&
        u.data &&
        typeof u.data === 'object' &&
        (u.data as { winner_id?: string }).winner_id === 'loser'
    );

    expect(autoAdvanceUpdate).toBeDefined();
  });
});
