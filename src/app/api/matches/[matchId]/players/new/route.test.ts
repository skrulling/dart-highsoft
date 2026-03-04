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

describe('POST /api/matches/[matchId]/players/new', () => {
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

    const request = new Request('http://localhost/api/matches/match-1/players/new', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'New Player' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ matchId: 'match-1' }) });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Cannot edit players in a tournament match');
  });
});
