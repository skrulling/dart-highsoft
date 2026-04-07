import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH } from './route';

vi.mock('server-only', () => ({}));

const getSupabaseServerClientMock = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  getSupabaseServerClient: () => getSupabaseServerClientMock(),
}));

type ThenableResult<T> = {
  data: T;
  error: { message: string } | null;
};

function createResolvedBuilder<T>(result: ThenableResult<T>) {
  const builder = {
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    single: vi.fn(async () => result),
    then: (resolve: (value: ThenableResult<T>) => void) => {
      resolve(result);
    },
  };

  return builder;
}

describe('PATCH /api/tournaments/[id]/end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels the tournament and ends unresolved linked matches', async () => {
    const tournamentUpdateBuilder = createResolvedBuilder({ data: null, error: null });
    const matchUpdateBuilder = createResolvedBuilder({ data: null, error: null });

    const tournamentsUpdate = vi.fn(() => tournamentUpdateBuilder);
    const matchesUpdate = vi.fn(() => matchUpdateBuilder);

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'tournaments') {
          return {
            select: vi.fn(() =>
              createResolvedBuilder({
                data: {
                  id: 'tour-1',
                  status: 'in_progress',
                  winner_player_id: null,
                  completed_at: null,
                },
                error: null,
              })
            ),
            update: tournamentsUpdate,
          };
        }

        if (table === 'tournament_matches') {
          return {
            select: vi.fn(() =>
              createResolvedBuilder({
                data: [
                  { match_id: 'match-live', winner_id: null },
                  { match_id: 'match-complete', winner_id: 'player-1' },
                  { match_id: null, winner_id: null },
                ],
                error: null,
              })
            ),
          };
        }

        if (table === 'matches') {
          return {
            update: matchesUpdate,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    getSupabaseServerClientMock.mockReturnValue(supabase);

    const response = await PATCH(new Request('http://localhost/api/tournaments/tour-1/end', { method: 'PATCH' }), {
      params: Promise.resolve({ id: 'tour-1' }),
    });

    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);

    expect(tournamentsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelled',
        completed_at: expect.any(String),
      })
    );
    expect(tournamentUpdateBuilder.eq).toHaveBeenCalledWith('id', 'tour-1');
    expect(tournamentUpdateBuilder.eq).toHaveBeenCalledWith('status', 'in_progress');

    expect(matchesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        ended_early: true,
        completed_at: expect.any(String),
      })
    );
    expect(matchUpdateBuilder.in).toHaveBeenCalledWith('id', ['match-live']);
    expect(matchUpdateBuilder.eq).toHaveBeenCalledWith('ended_early', false);
    expect(matchUpdateBuilder.is).toHaveBeenCalledWith('winner_player_id', null);
    expect(matchUpdateBuilder.is).toHaveBeenCalledWith('completed_at', null);
  });

  it('returns 409 when the tournament is already terminal', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== 'tournaments') throw new Error(`Unexpected table ${table}`);
        return {
          select: vi.fn(() =>
            createResolvedBuilder({
              data: {
                id: 'tour-1',
                status: 'completed',
                winner_player_id: 'player-1',
                completed_at: '2026-04-07T10:00:00.000Z',
              },
              error: null,
            })
          ),
          update: vi.fn(() => {
            throw new Error('Should not update a completed tournament');
          }),
        };
      }),
    };

    getSupabaseServerClientMock.mockReturnValue(supabase);

    const response = await PATCH(new Request('http://localhost/api/tournaments/tour-1/end', { method: 'PATCH' }), {
      params: Promise.resolve({ id: 'tour-1' }),
    });

    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('Tournament is already completed');
  });
});
