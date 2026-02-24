import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

vi.mock('server-only', () => ({}));

const getSupabaseServerClientMock = vi.fn();
const loadMatchMock = vi.fn();
const isMatchActiveMock = vi.fn();
const resolveOrCreateTurnForPlayerMock = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  getSupabaseServerClient: () => getSupabaseServerClientMock(),
}));

vi.mock('@/lib/server/matchGuards', () => ({
  loadMatch: (...args: unknown[]) => loadMatchMock(...args),
  isMatchActive: (...args: unknown[]) => isMatchActiveMock(...args),
}));

vi.mock('@/lib/server/turnLifecycle', () => ({
  resolveOrCreateTurnForPlayer: (...args: unknown[]) => resolveOrCreateTurnForPlayerMock(...args),
}));

describe('POST /api/matches/[matchId]/throws', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a throw without explicitly writing match_id (trigger fills it)', async () => {
    let insertedPayload: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        if (table === 'turns') {
          return {
            select(query?: string) {
              expect(query).toBe('id, legs!inner(match_id)');
              return this;
            },
            eq(column: string, value: string) {
              if (column === 'id') expect(value).toBe('turn-1');
              if (column === 'legs.match_id') expect(value).toBe('match-1');
              return this;
            },
            async single() {
              return { data: { id: 'turn-1', legs: { match_id: 'match-1' } }, error: null };
            },
          };
        }

        if (table === 'throws') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedPayload = payload;
              return {
                select() {
                  return this;
                },
                async single() {
                  return {
                    data: { id: 'throw-1', ...payload },
                    error: null,
                  };
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    getSupabaseServerClientMock.mockReturnValue(supabase);
    loadMatchMock.mockResolvedValue({
      id: 'match-1',
      start_score: '501',
      finish: 'double_out',
      legs_to_win: 3,
    });
    isMatchActiveMock.mockReturnValue(true);

    const request = new Request('http://localhost/api/matches/match-1/throws', {
      method: 'POST',
      body: JSON.stringify({ turnId: 'turn-1', dartIndex: 2, segment: 'S20', scored: 20 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.turnId).toBe('turn-1');
    expect(json.throw.id).toBe('throw-1');
    expect(insertedPayload).toEqual(
      expect.objectContaining({
        turn_id: 'turn-1',
        dart_index: 2,
        segment: 'S20',
        scored: 20,
      })
    );
    expect(insertedPayload).not.toHaveProperty('match_id');
  });

  it('creates first-dart throw by resolving or creating turn from legId + playerId', async () => {
    let insertedPayload: Record<string, unknown> | null = null;

    const supabase = {
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
        if (table === 'match_players') {
          return {
            select(query?: string) {
              expect(query).toBe('player_id');
              return this;
            },
            eq(column: string, value: string) {
              if (column === 'match_id') expect(value).toBe('match-1');
              if (column === 'player_id') expect(value).toBe('player-1');
              return this;
            },
            async maybeSingle() {
              return { data: { player_id: 'player-1' }, error: null };
            },
          };
        }
        if (table === 'throws') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedPayload = payload;
              return {
                select() {
                  return this;
                },
                async single() {
                  return { data: { id: 'throw-1', ...payload }, error: null };
                },
              };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    resolveOrCreateTurnForPlayerMock.mockResolvedValue({
      turn: {
        id: 'turn-resolved',
        leg_id: 'leg-1',
        player_id: 'player-1',
        turn_number: 7,
        total_scored: 0,
        busted: false,
      },
    });
    getSupabaseServerClientMock.mockReturnValue(supabase);
    loadMatchMock.mockResolvedValue({
      id: 'match-1',
      start_score: '501',
      finish: 'double_out',
      legs_to_win: 3,
    });
    isMatchActiveMock.mockReturnValue(true);

    const request = new Request('http://localhost/api/matches/match-1/throws', {
      method: 'POST',
      body: JSON.stringify({ legId: 'leg-1', playerId: 'player-1', dartIndex: 1, segment: 'T20', scored: 60 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.turnId).toBe('turn-resolved');
    expect(json.throw.id).toBe('throw-1');
    expect(insertedPayload).toEqual(
      expect.objectContaining({
        turn_id: 'turn-resolved',
        dart_index: 1,
        segment: 'T20',
        scored: 60,
      })
    );
    expect(resolveOrCreateTurnForPlayerMock).toHaveBeenCalledWith(supabase, 'leg-1', 'player-1', undefined);
  });

  it('rejects legId + playerId payload when player is not in the match', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'legs') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async single() {
              return { data: { id: 'leg-1' }, error: null };
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
            async maybeSingle() {
              return { data: null, error: null };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    getSupabaseServerClientMock.mockReturnValue(supabase);
    loadMatchMock.mockResolvedValue({
      id: 'match-1',
      start_score: '501',
      finish: 'double_out',
      legs_to_win: 3,
    });
    isMatchActiveMock.mockReturnValue(true);

    const request = new Request('http://localhost/api/matches/match-1/throws', {
      method: 'POST',
      body: JSON.stringify({ legId: 'leg-1', playerId: 'player-404', dartIndex: 1, segment: 'S20', scored: 20 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('Player not found for match');
    expect(resolveOrCreateTurnForPlayerMock).not.toHaveBeenCalled();
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

    const request = new Request('http://localhost/api/matches/match-1/throws', {
      method: 'POST',
      body: JSON.stringify({ turnId: 'turn-1', dartIndex: 1, segment: 'S20', scored: 20 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('Match is not active');
  });
});
