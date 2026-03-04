import { describe, it, expect } from 'vitest';
import { advanceTournament } from './advance';

/**
 * Build a chainable mock that supports Supabase's fluent query builder.
 * Supports the atomic update pattern: .update(data).eq().is().select().single()
 */
function createMockSupabase(data: {
  tournamentMatches: Record<string, any>;
  tournament?: any;
  tournamentPlayers?: any[];
}) {
  const updates: { table: string; filters: Record<string, any>; data: any }[] = [];
  const inserts: { table: string; data: any }[] = [];

  function makeBuilder(table: string, mode: 'select' | 'update' | 'insert', payload?: any) {
    const filters: Record<string, any> = {};
    let isFilterMode = false; // tracks if .is() was used (for conditional updates)

    const builder: any = {
      eq(col: string, val: any) {
        filters[col] = val;
        return builder;
      },
      is(col: string, val: any) {
        filters[`_is_${col}`] = val;
        isFilterMode = true;
        return builder;
      },
      order() {
        return builder;
      },
      or(_filter: string) {
        return builder;
      },
      select(_cols?: string, _opts?: any) {
        if (mode === 'update') {
          // Chain: update().eq().is().select().single()/maybeSingle()
          function resolveUpdate() {
            const id = filters['id'];
            if (table === 'tournament_matches' && id && data.tournamentMatches[id]) {
              const tm = data.tournamentMatches[id];
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
        // mode === 'select' — return self for chaining
        return makeBuilder(table, 'select');
      },
      async single() {
        if (mode === 'select') {
          if (table === 'tournament_matches') {
            const id = filters['id'];
            if (id && data.tournamentMatches[id]) {
              return { data: { ...data.tournamentMatches[id] }, error: null };
            }
            // Try matching by multiple filters (for GF reset lookup)
            const matches = Object.values(data.tournamentMatches).filter((tm: any) => {
              return Object.entries(filters).every(([k, v]) => tm[k] === v);
            });
            return { data: matches[0] ?? null, error: null };
          }
          if (table === 'tournaments') {
            return { data: data.tournament ?? null, error: null };
          }
        }
        if (mode === 'update') {
          const id = filters['id'];
          updates.push({ table, filters: { ...filters }, data: payload });
          if (table === 'tournament_matches' && id && data.tournamentMatches[id]) {
            Object.assign(data.tournamentMatches[id], payload);
          }
          return { error: null };
        }
        return { data: null, error: null };
      },
    };

    // For update without single() — awaiting the builder directly
    builder.then = (resolve: any, reject?: any) => {
      if (mode === 'update') {
        updates.push({ table, filters: { ...filters }, data: payload });
        if (table === 'tournament_matches') {
          const id = filters['id'];
          if (id && data.tournamentMatches[id]) {
            Object.assign(data.tournamentMatches[id], payload);
          }
        }
      }
      // Return count: 1 for count queries (used by autoAdvanceIfBye) so it
      // thinks there are always pending feeders and never auto-advances.
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

  const deletes: { table: string; filters: Record<string, any> }[] = [];

  const mockClient = {
    from: (table: string) => ({
      select: (cols?: string) => makeBuilder(table, 'select'),
      update: (updateData: any) => makeBuilder(table, 'update', updateData),
      insert: (insertData: any) => {
        inserts.push({ table, data: insertData });
        return {
          select: () => ({
            single: async () => ({ data: { id: 'new-match-id', ...(Array.isArray(insertData) ? insertData[0] : insertData) }, error: null }),
          }),
          error: null,
        };
      },
      delete: () => {
        const deleteFilters: Record<string, any> = {};
        const deleteBuilder: any = {
          eq(col: string, val: any) {
            deleteFilters[col] = val;
            return deleteBuilder;
          },
          then(resolve: any) {
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

    const result = await advanceTournament(supabase as any, tmId, 'p1', 'p2');
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

    await advanceTournament(supabase as any, tmId, 'p1', 'p2');

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

    const result = await advanceTournament(supabase as any, tmId, 'p1', 'p2');
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

    await advanceTournament(supabase as any, tmId, 'p1', 'p2');

    // The conditional update should have set winner and loser
    const tmUpdate = supabase._updates.find(
      (u) => u.table === 'tournament_matches' && u.filters?.id === tmId
    );
    expect(tmUpdate).toBeDefined();
    expect(tmUpdate!.data.winner_id).toBe('p1');
    expect(tmUpdate!.data.loser_id).toBe('p2');
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

    const result = await advanceTournament(supabase as any, gf1Id, 'wb-champ', 'lb-champ');
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

    const result = await advanceTournament(supabase as any, gf1Id, 'lb-champ', 'wb-champ');
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

    const result = await advanceTournament(supabase as any, gfResetId, 'lb-champ', 'wb-champ');
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

    await advanceTournament(supabase as any, tmId, 'p1', 'p2');

    const matchInsert = supabase._inserts.find((i) => i.table === 'matches');
    expect(matchInsert).toBeDefined();
  });
});
