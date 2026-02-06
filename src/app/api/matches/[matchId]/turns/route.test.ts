import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

vi.mock('server-only', () => ({}));

const getSupabaseServerClientMock = vi.fn();
const loadMatchMock = vi.fn();
const isMatchActiveMock = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  getSupabaseServerClient: () => getSupabaseServerClientMock(),
}));

vi.mock('@/lib/server/matchGuards', () => ({
  loadMatch: (...args: unknown[]) => loadMatchMock(...args),
  isMatchActive: (...args: unknown[]) => isMatchActiveMock(...args),
}));

type TurnListRow = {
  id: string;
  player_id: string;
  turn_number: number;
  busted: boolean;
  throws: { dart_index: number }[];
};

function createSupabaseMock({
  latestTurns,
  insertImplementation,
}: {
  latestTurns: TurnListRow[];
  insertImplementation?: (payload: Record<string, unknown>) => { data: Record<string, unknown> | null; error: { code?: string; message?: string } | null };
}) {
  return {
    from(table: string) {
      if (table === 'legs') {
        return {
          select(query?: string) {
            expect(query).toBe('id');
            return this;
          },
          eq(column: string, value: string) {
            if (column === 'id') expect(value).toBe('leg-1');
            if (column === 'match_id') expect(value).toBe('match-1');
            return this;
          },
          async single() {
            return { data: { id: 'leg-1' }, error: null };
          },
        };
      }

      if (table === 'turns') {
        return {
          select() {
            return this;
          },
          eq(column: string, value: string) {
            if (column === 'leg_id') expect(value).toBe('leg-1');
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          async maybeSingle() {
            return { data: latestTurns.shift() ?? null, error: null };
          },
          insert(payload: Record<string, unknown>) {
            const result = insertImplementation
              ? insertImplementation(payload)
              : {
                  data: { id: 'turn-created', ...payload },
                  error: null,
                };
            return {
              select() {
                return this;
              },
              async single() {
                return result;
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe('POST /api/matches/[matchId]/turns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadMatchMock.mockResolvedValue({
      id: 'match-1',
      start_score: '501',
      finish: 'double_out',
      legs_to_win: 3,
    });
    isMatchActiveMock.mockReturnValue(true);
  });

  it('returns existing incomplete latest turn for same player (idempotent)', async () => {
    const supabase = createSupabaseMock({
      latestTurns: [
        {
          id: 'turn-existing',
          player_id: 'player-1',
          turn_number: 4,
          busted: false,
          throws: [{ dart_index: 1 }],
        },
      ],
    });
    getSupabaseServerClientMock.mockReturnValue(supabase);

    const request = new Request('http://localhost/api/matches/match-1/turns', {
      method: 'POST',
      body: JSON.stringify({ legId: 'leg-1', playerId: 'player-1' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.turn.id).toBe('turn-existing');
  });

  it('retries on unique conflict and returns concurrently created incomplete turn', async () => {
    const insertMock = vi
      .fn()
      .mockReturnValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      })
      .mockReturnValueOnce({
        data: { id: 'turn-created', leg_id: 'leg-1', player_id: 'player-1', turn_number: 6, total_scored: 0, busted: false },
        error: null,
      });

    const supabase = createSupabaseMock({
      latestTurns: [
        {
          id: 'turn-5',
          player_id: 'player-2',
          turn_number: 5,
          busted: false,
          throws: [{ dart_index: 1 }, { dart_index: 2 }, { dart_index: 3 }],
        },
        {
          id: 'turn-raced',
          player_id: 'player-1',
          turn_number: 6,
          busted: false,
          throws: [{ dart_index: 1 }],
        },
      ],
      insertImplementation: (payload) => insertMock(payload),
    });
    getSupabaseServerClientMock.mockReturnValue(supabase);

    const request = new Request('http://localhost/api/matches/match-1/turns', {
      method: 'POST',
      body: JSON.stringify({ legId: 'leg-1', playerId: 'player-1' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.turn.id).toBe('turn-raced');
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when match is not active', async () => {
    const supabase = {
      from() {
        throw new Error('Should not query tables for inactive match');
      },
    };

    getSupabaseServerClientMock.mockReturnValue(supabase);
    loadMatchMock.mockResolvedValue({ id: 'match-1' });
    isMatchActiveMock.mockReturnValue(false);

    const request = new Request('http://localhost/api/matches/match-1/turns', {
      method: 'POST',
      body: JSON.stringify({ legId: 'leg-1', playerId: 'player-1' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('Match is not active');
  });
});
