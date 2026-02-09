import { describe, expect, it } from 'vitest';

import { loadMatchData } from './loadMatchData';

type QueryResult = { data: unknown; error: unknown };

function createSupabaseMock(log: string[]) {
  const buildTurnsQuery = () => {
    const state: { legId?: string; inLegIds?: string[] } = {};
    return {
      select() {
        return this;
      },
      eq(column: string, value: string) {
        if (column === 'leg_id') state.legId = value;
        return this;
      },
      in(column: string, values: string[]) {
        if (column === 'leg_id') state.inLegIds = values;
        return this;
      },
      order() {
        return Promise.resolve<QueryResult>({
          data: state.legId
            ? [{ id: 'turn-current', leg_id: state.legId, player_id: 'player-1', turn_number: 1, total_scored: 20, busted: false, throws: [] }]
            : [{ id: 'turn-any', leg_id: state.inLegIds?.[0] ?? 'leg-1', player_id: 'player-1', turn_number: 1, total_scored: 20, busted: false }],
          error: null,
        });
      },
    };
  };

  return {
    from(table: string) {
      log.push(table);
      if (table === 'matches') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          single() {
            return Promise.resolve<QueryResult>({
              data: { id: 'match-1', start_score: '501', finish: 'double_out', legs_to_win: 3 },
              error: null,
            });
          },
        };
      }
      if (table === 'match_players') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return Promise.resolve<QueryResult>({
              data: [{ players: { id: 'player-1', display_name: 'Player One' } }],
              error: null,
            });
          },
        };
      }
      if (table === 'legs') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return Promise.resolve<QueryResult>({
              data: [{ id: 'leg-1', match_id: 'match-1', leg_number: 1, starting_player_id: 'player-1', winner_player_id: null }],
              error: null,
            });
          },
        };
      }
      if (table === 'turns') {
        return buildTurnsQuery();
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe('loadMatchData', () => {
  it('skips all-legs turns summary query when includeTurnsByLegSummary=false', async () => {
    const log: string[] = [];
    const supabase = createSupabaseMock(log);

    const result = await loadMatchData(supabase as never, 'match-1', { includeTurnsByLegSummary: false });

    expect(result.turns.length).toBe(1);
    expect(result.turnsByLeg).toEqual({});
    const turnsCalls = log.filter((entry) => entry === 'turns');
    expect(turnsCalls.length).toBe(1);
  });

  it('loads all-legs turns summary by default', async () => {
    const log: string[] = [];
    const supabase = createSupabaseMock(log);

    const result = await loadMatchData(supabase as never, 'match-1');

    expect(result.turns.length).toBe(1);
    expect(Object.keys(result.turnsByLeg)).toContain('leg-1');
    const turnsCalls = log.filter((entry) => entry === 'turns');
    expect(turnsCalls.length).toBe(2);
  });
});
