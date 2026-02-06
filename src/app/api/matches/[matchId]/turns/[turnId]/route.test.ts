import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH } from './route';

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

describe('PATCH /api/matches/[matchId]/turns/[turnId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for malformed JSON body', async () => {
    const request = new Request('http://localhost/api/matches/match-1/turns/turn-1', {
      method: 'PATCH',
      body: '{',
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request, { params: Promise.resolve({ matchId: 'match-1', turnId: 'turn-1' }) });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid JSON body');
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it('updates turn when request body is valid', async () => {
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
              return { data: { id: 'turn-1' }, error: null };
            },
            update(payload: Record<string, unknown>) {
              expect(payload).toEqual({ total_scored: 45, busted: false });
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id');
                  expect(value).toBe('turn-1');
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    getSupabaseServerClientMock.mockReturnValue(supabase);
    loadMatchMock.mockResolvedValue({ id: 'match-1' });
    isMatchActiveMock.mockReturnValue(true);

    const request = new Request('http://localhost/api/matches/match-1/turns/turn-1', {
      method: 'PATCH',
      body: JSON.stringify({ totalScored: 45, busted: false }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request, { params: Promise.resolve({ matchId: 'match-1', turnId: 'turn-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
  });
});
