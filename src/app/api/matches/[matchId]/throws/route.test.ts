import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, POST } from './route';

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

type ThrowRow = {
  id: string;
  turn_id: string;
  dart_index: number;
  segment: string;
  scored: number;
};

function createThrowsTableMock({
  existingThrows = [],
  expectedTurnId,
  onInsert,
  onDeleteId,
}: {
  existingThrows?: ThrowRow[];
  expectedTurnId?: string;
  onInsert?: (payload: Record<string, unknown>) => void;
  onDeleteId?: (id: string) => void;
}) {
  return {
    select(query?: string) {
      expect(query).toBe('id, dart_index, segment, scored');
      let rows = existingThrows.slice();
      const builder = {
        eq(column: string, value: string) {
          if (column === 'turn_id' && expectedTurnId) expect(value).toBe(expectedTurnId);
          return this;
        },
        order(column: string, options?: { ascending?: boolean }) {
          expect(column).toBe('dart_index');
          const ascending = options?.ascending !== false;
          rows = rows.slice().sort((a, b) => ascending ? a.dart_index - b.dart_index : b.dart_index - a.dart_index);
          return this;
        },
        limit(limit: number) {
          return Promise.resolve({ data: rows.slice(0, limit), error: null });
        },
        then<TResult1 = { data: ThrowRow[]; error: null }, TResult2 = never>(
          onfulfilled?: ((value: { data: ThrowRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
    insert(payload: Record<string, unknown>) {
      onInsert?.(payload);
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
    delete(options?: { count?: string }) {
      expect(options).toEqual({ count: 'exact' });
      return {
        eq(column: string, value: string) {
          expect(column).toBe('id');
          onDeleteId?.(value);
          return Promise.resolve({ error: null, count: 1 });
        },
      };
    },
  };
}

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
          return createThrowsTableMock({
            expectedTurnId: 'turn-1',
            onInsert(payload) {
              insertedPayload = payload;
            },
          });
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
      body: JSON.stringify({ turnId: 'turn-1', dartIndex: 1, segment: 'S20', scored: 20 }),
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
        dart_index: 1,
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
          return createThrowsTableMock({
            expectedTurnId: 'turn-resolved',
            onInsert(payload) {
              insertedPayload = payload;
            },
          });
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

  it('allows the next contiguous dart in an existing turn', async () => {
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
          return createThrowsTableMock({
            expectedTurnId: 'turn-1',
            existingThrows: [{ id: 'throw-1', turn_id: 'turn-1', dart_index: 1, segment: 'S20', scored: 20 }],
            onInsert(payload) {
              insertedPayload = payload;
            },
          });
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
      body: JSON.stringify({ turnId: 'turn-1', dartIndex: 2, segment: 'T20', scored: 60 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.turnId).toBe('turn-1');
    expect(insertedPayload).toEqual(
      expect.objectContaining({
        turn_id: 'turn-1',
        dart_index: 2,
        segment: 'T20',
        scored: 60,
      })
    );
  });

  it('rejects scoring when the existing turn has a dart gap', async () => {
    let inserted = false;

    const supabase = {
      from(table: string) {
        if (table === 'turns') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async single() {
              return { data: { id: 'turn-1', legs: { match_id: 'match-1' } }, error: null };
            },
          };
        }

        if (table === 'throws') {
          return createThrowsTableMock({
            expectedTurnId: 'turn-1',
            existingThrows: [{ id: 'throw-2', turn_id: 'turn-1', dart_index: 2, segment: 'S20', scored: 20 }],
            onInsert() {
              inserted = true;
            },
          });
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
      body: JSON.stringify({ turnId: 'turn-1', dartIndex: 2, segment: 'S5', scored: 5 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toContain('inconsistent dart order');
    expect(inserted).toBe(false);
  });

  it('rejects stale or skipped dart indexes', async () => {
    let inserted = false;

    const supabase = {
      from(table: string) {
        if (table === 'turns') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async single() {
              return { data: { id: 'turn-1', legs: { match_id: 'match-1' } }, error: null };
            },
          };
        }

        if (table === 'throws') {
          return createThrowsTableMock({
            expectedTurnId: 'turn-1',
            existingThrows: [{ id: 'throw-1', turn_id: 'turn-1', dart_index: 1, segment: 'S20', scored: 20 }],
            onInsert() {
              inserted = true;
            },
          });
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
      body: JSON.stringify({ turnId: 'turn-1', dartIndex: 3, segment: 'S5', scored: 5 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('Expected dartIndex 2, got 3');
    expect(inserted).toBe(false);
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

describe('DELETE /api/matches/[matchId]/throws', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the highest persisted dart index for the turn, ignoring stale client dartIndex', async () => {
    let deletedId: string | null = null;

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
          return createThrowsTableMock({
            expectedTurnId: 'turn-1',
            existingThrows: [
              { id: 'throw-1', turn_id: 'turn-1', dart_index: 1, segment: 'S20', scored: 20 },
              { id: 'throw-3', turn_id: 'turn-1', dart_index: 3, segment: 'S5', scored: 5 },
            ],
            onDeleteId(id) {
              deletedId = id;
            },
          });
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
      method: 'DELETE',
      body: JSON.stringify({ turnId: 'turn-1', dartIndex: 2 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await DELETE(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(deletedId).toBe('throw-3');
    expect(json.deletedThrow).toEqual(
      expect.objectContaining({
        id: 'throw-3',
        dart_index: 3,
      })
    );
  });

  it('returns 404 when there are no throws to undo', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'turns') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async single() {
              return { data: { id: 'turn-1', legs: { match_id: 'match-1' } }, error: null };
            },
          };
        }

        if (table === 'throws') {
          return createThrowsTableMock({
            expectedTurnId: 'turn-1',
            existingThrows: [],
          });
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
      method: 'DELETE',
      body: JSON.stringify({ turnId: 'turn-1', dartIndex: 1 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await DELETE(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('No throws to undo');
  });
});
