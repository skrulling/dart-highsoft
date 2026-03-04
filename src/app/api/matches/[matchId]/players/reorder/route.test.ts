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

describe('PATCH /api/matches/[matchId]/players/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for tournament matches', async () => {
    const supabase = {
      from() {
        throw new Error('Should not query player tables for tournament matches');
      },
    };

    getSupabaseServerClientMock.mockReturnValue(supabase);
    loadMatchMock.mockResolvedValue({ id: 'match-1', tournament_match_id: 'tm-1' });
    isMatchActiveMock.mockReturnValue(true);

    const request = new Request('http://localhost/api/matches/match-1/players/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedPlayerIds: ['p1', 'p2'] }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Cannot edit players in a tournament match');
  });
});
