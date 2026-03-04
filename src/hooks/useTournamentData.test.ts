import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTournamentData } from './useTournamentData';

const getSupabaseClientMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: () => getSupabaseClientMock(),
}));

type QueryResult = { data: unknown; error: { message: string } | null };

function createThenableQuery(resultFactory: () => QueryResult) {
  const query: {
    eq: (col: string, value: unknown) => typeof query;
    order: (col: string) => typeof query;
    single: () => Promise<QueryResult>;
    then: (resolve: (value: QueryResult) => void) => void;
  } = {
    eq() {
      return query;
    },
    order() {
      return query;
    },
    async single() {
      return resultFactory();
    },
    then(resolve) {
      resolve(resultFactory());
    },
  };
  return query;
}

describe('useTournamentData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears stale error once a subsequent reload succeeds', async () => {
    let tournamentSelectCalls = 0;

    const channel = {
      on: vi.fn(),
      subscribe: vi.fn(),
    };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'tournaments') {
          const query = createThenableQuery(() => {
            tournamentSelectCalls += 1;
            if (tournamentSelectCalls === 1) {
              return { data: null, error: { message: 'temporary failure' } };
            }
            return {
              data: {
                id: 'tour-1',
                name: 'Test Tournament',
                mode: 'x01',
                start_score: '501',
                finish: 'double_out',
                legs_to_win: 1,
                fair_ending: false,
                status: 'in_progress',
                winner_player_id: null,
                created_at: '2026-03-04T00:00:00.000Z',
                completed_at: null,
              },
              error: null,
            };
          });
          return { select: vi.fn(() => query) };
        }

        if (table === 'tournament_matches') {
          const query = createThenableQuery(() => ({ data: [], error: null }));
          return { select: vi.fn(() => query) };
        }

        if (table === 'tournament_players') {
          const query = createThenableQuery(() => ({ data: [], error: null }));
          return { select: vi.fn(() => query) };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };

    getSupabaseClientMock.mockResolvedValue(supabase);

    const { result } = renderHook(() => useTournamentData('tour-1'));

    await waitFor(() => {
      expect(result.current.error).toBe('temporary failure');
    });

    await act(async () => {
      await result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.tournament?.id).toBe('tour-1');
    });
  });
});
