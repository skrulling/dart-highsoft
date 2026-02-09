import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LegRecord, MatchRecord, Player, TurnWithThrows } from '@/lib/match/types';
import type { SegmentResult } from '@/utils/dartboard';

import { useMatchActions } from './useMatchActions';

const apiRequestMock = vi.fn();

vi.mock('@/lib/apiClient', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useMatchActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequestMock.mockResolvedValue({ ok: true });
  });

  it('resumes an incomplete turn without duplicating local darts on next throw', async () => {
    const players: Player[] = [
      { id: 'player-1', display_name: 'Player One' },
      { id: 'player-2', display_name: 'Player Two' },
    ];

    const match: MatchRecord = {
      id: 'match-1',
      mode: 'x01',
      start_score: '301',
      finish: 'double_out',
      legs_to_win: 1,
    };

    const currentLeg: LegRecord = {
      id: 'leg-1',
      match_id: 'match-1',
      leg_number: 1,
      starting_player_id: 'player-1',
      winner_player_id: null,
    };

    const turns: TurnWithThrows[] = [
      {
        id: 'turn-1',
        leg_id: 'leg-1',
        player_id: 'player-1',
        turn_number: 1,
        total_scored: 20,
        busted: false,
        throws: [
          {
            id: 'throw-1',
            turn_id: 'turn-1',
            dart_index: 1,
            segment: 'S20',
            scored: 20,
          },
        ],
      },
    ];

    const throwResult: SegmentResult = { kind: 'Single', label: 'S5', scored: 5 };

    const { result } = renderHook(() => {
      const [localTurn, setLocalTurn] = useState<{
        playerId: string | null;
        darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
      }>({ playerId: null, darts: [] });

      const ongoingTurnRef = useRef<{
        turnId: string;
        playerId: string;
        darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
        startScore: number;
      } | null>(null);

      const actions = useMatchActions({
        matchId: 'match-1',
        match,
        players,
        legs: [currentLeg],
        turns,
        turnThrowCounts: { 'turn-1': 1 },
        currentLeg,
        currentPlayer: players[0],
        orderPlayers: players,
        finishRule: 'double_out',
        matchWinnerId: null,
        localTurn,
        ongoingTurnRef,
        setLocalTurn,
        loadAll: async () => {},
        loadTurnsForLeg: async () => [],
        routerPush: () => {},
        getScoreForPlayer: () => 281,
        canEditPlayers: false,
        canReorderPlayers: false,
        commentaryEnabled: false,
        personaId: 'chad',
        setCurrentCommentary: () => {},
        setCommentaryLoading: () => {},
        setCommentaryPlaying: () => {},
        ttsServiceRef: {
          current: {
            getSettings: () => ({ enabled: false }),
            queueCommentary: async () => {},
            getIsPlaying: () => false,
          },
        },
        broadcastRematch: async () => {},
      });

      return { actions, localTurn, ongoingTurnRef };
    });

    await act(async () => {
      await result.current.actions.handleBoardClick(0, 0, throwResult);
    });

    expect(result.current.localTurn.playerId).toBe('player-1');
    expect(result.current.localTurn.darts.map((dart) => dart.label)).toEqual(['S20', 'S5']);
    expect(result.current.localTurn.darts.map((dart) => dart.scored)).toEqual([20, 5]);

    expect(result.current.ongoingTurnRef.current?.darts.map((dart) => dart.label)).toEqual(['S20', 'S5']);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/matches/match-1/throws', {
      body: {
        turnId: 'turn-1',
        dartIndex: 2,
        segment: 'S5',
        scored: 5,
      },
    });
    expect(apiRequestMock.mock.calls.some(([url]) => String(url).endsWith('/api/matches/match-1/turns'))).toBe(false);
  });

  it('applies dart optimistically before throw request resolves', async () => {
    const players: Player[] = [
      { id: 'player-1', display_name: 'Player One' },
      { id: 'player-2', display_name: 'Player Two' },
    ];

    const match: MatchRecord = {
      id: 'match-1',
      mode: 'x01',
      start_score: '301',
      finish: 'double_out',
      legs_to_win: 1,
    };

    const currentLeg: LegRecord = {
      id: 'leg-1',
      match_id: 'match-1',
      leg_number: 1,
      starting_player_id: 'player-1',
      winner_player_id: null,
    };

    const turns: TurnWithThrows[] = [
      {
        id: 'turn-1',
        leg_id: 'leg-1',
        player_id: 'player-1',
        turn_number: 1,
        total_scored: 20,
        busted: false,
        throws: [
          {
            id: 'throw-1',
            turn_id: 'turn-1',
            dart_index: 1,
            segment: 'S20',
            scored: 20,
          },
        ],
      },
    ];

    const pendingThrowWrite = deferred<{ ok: true }>();
    apiRequestMock.mockImplementation((url: string) => {
      if (url.endsWith('/throws')) {
        return pendingThrowWrite.promise;
      }
      return Promise.resolve({ ok: true });
    });

    const throwResult: SegmentResult = { kind: 'Single', label: 'S5', scored: 5 };

    const { result } = renderHook(() => {
      const [localTurn, setLocalTurn] = useState<{
        playerId: string | null;
        darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
      }>({ playerId: null, darts: [] });

      const ongoingTurnRef = useRef<{
        turnId: string;
        playerId: string;
        darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
        startScore: number;
      } | null>(null);

      const actions = useMatchActions({
        matchId: 'match-1',
        match,
        players,
        legs: [currentLeg],
        turns,
        turnThrowCounts: { 'turn-1': 1 },
        currentLeg,
        currentPlayer: players[0],
        orderPlayers: players,
        finishRule: 'double_out',
        matchWinnerId: null,
        localTurn,
        ongoingTurnRef,
        setLocalTurn,
        loadAll: async () => {},
        loadTurnsForLeg: async () => [],
        routerPush: () => {},
        getScoreForPlayer: () => 281,
        canEditPlayers: false,
        canReorderPlayers: false,
        commentaryEnabled: false,
        personaId: 'chad',
        setCurrentCommentary: () => {},
        setCommentaryLoading: () => {},
        setCommentaryPlaying: () => {},
        ttsServiceRef: {
          current: {
            getSettings: () => ({ enabled: false }),
            queueCommentary: async () => {},
            getIsPlaying: () => false,
          },
        },
        broadcastRematch: async () => {},
      });

      return { actions, localTurn };
    });

    let actionPromise: Promise<void>;
    await act(async () => {
      actionPromise = result.current.actions.handleBoardClick(0, 0, throwResult);
      await Promise.resolve();
    });

    expect(result.current.localTurn.darts.map((dart) => dart.label)).toEqual(['S20', 'S5']);

    await act(async () => {
      pendingThrowWrite.resolve({ ok: true });
      await actionPromise;
    });
  });

  it('applies first dart optimistically before turn resolution completes', async () => {
    const players: Player[] = [
      { id: 'player-1', display_name: 'Player One' },
      { id: 'player-2', display_name: 'Player Two' },
    ];

    const match: MatchRecord = {
      id: 'match-1',
      mode: 'x01',
      start_score: '301',
      finish: 'double_out',
      legs_to_win: 1,
    };

    const currentLeg: LegRecord = {
      id: 'leg-1',
      match_id: 'match-1',
      leg_number: 1,
      starting_player_id: 'player-1',
      winner_player_id: null,
    };

    const pendingThrowWrite = deferred<{ turnId: string }>();
    apiRequestMock.mockImplementation((url: string) => {
      if (url.endsWith('/throws')) {
        return pendingThrowWrite.promise;
      }
      return Promise.resolve({ ok: true });
    });

    const throwResult: SegmentResult = { kind: 'Triple', label: 'T20', scored: 60 };

    const { result } = renderHook(() => {
      const [localTurn, setLocalTurn] = useState<{
        playerId: string | null;
        darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
      }>({ playerId: null, darts: [] });

      const ongoingTurnRef = useRef<{
        turnId: string;
        playerId: string;
        darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
        startScore: number;
      } | null>(null);

      const actions = useMatchActions({
        matchId: 'match-1',
        match,
        players,
        legs: [currentLeg],
        turns: [],
        turnThrowCounts: {},
        currentLeg,
        currentPlayer: players[0],
        orderPlayers: players,
        finishRule: 'double_out',
        matchWinnerId: null,
        localTurn,
        ongoingTurnRef,
        setLocalTurn,
        loadAll: async () => {},
        loadTurnsForLeg: async () => [],
        routerPush: () => {},
        getScoreForPlayer: () => 301,
        canEditPlayers: false,
        canReorderPlayers: false,
        commentaryEnabled: false,
        personaId: 'chad',
        setCurrentCommentary: () => {},
        setCommentaryLoading: () => {},
        setCommentaryPlaying: () => {},
        ttsServiceRef: {
          current: {
            getSettings: () => ({ enabled: false }),
            queueCommentary: async () => {},
            getIsPlaying: () => false,
          },
        },
        broadcastRematch: async () => {},
      });

      return { actions, localTurn };
    });

    let actionPromise: Promise<void>;
    await act(async () => {
      actionPromise = result.current.actions.handleBoardClick(0, 0, throwResult);
      await Promise.resolve();
    });

    expect(result.current.localTurn.playerId).toBe('player-1');
    expect(result.current.localTurn.darts.map((dart) => dart.label)).toEqual(['T20']);
    expect(apiRequestMock).toHaveBeenCalledWith('/api/matches/match-1/throws', {
      body: {
        legId: 'leg-1',
        playerId: 'player-1',
        dartIndex: 1,
        segment: 'T20',
        scored: 60,
      },
    });
    expect(apiRequestMock.mock.calls.some(([url]) => String(url).endsWith('/api/matches/match-1/turns'))).toBe(false);

    await act(async () => {
      pendingThrowWrite.resolve({ turnId: 'turn-created' });
      await actionPromise;
    });
  });

  it('rolls back optimistic dart when throw persistence fails', async () => {
    const players: Player[] = [
      { id: 'player-1', display_name: 'Player One' },
      { id: 'player-2', display_name: 'Player Two' },
    ];

    const match: MatchRecord = {
      id: 'match-1',
      mode: 'x01',
      start_score: '301',
      finish: 'double_out',
      legs_to_win: 1,
    };

    const currentLeg: LegRecord = {
      id: 'leg-1',
      match_id: 'match-1',
      leg_number: 1,
      starting_player_id: 'player-1',
      winner_player_id: null,
    };

    const turns: TurnWithThrows[] = [
      {
        id: 'turn-1',
        leg_id: 'leg-1',
        player_id: 'player-1',
        turn_number: 1,
        total_scored: 20,
        busted: false,
        throws: [
          {
            id: 'throw-1',
            turn_id: 'turn-1',
            dart_index: 1,
            segment: 'S20',
            scored: 20,
          },
        ],
      },
    ];

    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    apiRequestMock.mockImplementation((url: string) => {
      if (url.endsWith('/throws')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve({ ok: true });
    });

    const throwResult: SegmentResult = { kind: 'Single', label: 'S5', scored: 5 };

    const { result } = renderHook(() => {
      const [localTurn, setLocalTurn] = useState<{
        playerId: string | null;
        darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
      }>({ playerId: null, darts: [] });

      const ongoingTurnRef = useRef<{
        turnId: string;
        playerId: string;
        darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
        startScore: number;
      } | null>(null);

      const actions = useMatchActions({
        matchId: 'match-1',
        match,
        players,
        legs: [currentLeg],
        turns,
        turnThrowCounts: { 'turn-1': 1 },
        currentLeg,
        currentPlayer: players[0],
        orderPlayers: players,
        finishRule: 'double_out',
        matchWinnerId: null,
        localTurn,
        ongoingTurnRef,
        setLocalTurn,
        loadAll: async () => {},
        loadTurnsForLeg: async () => [],
        routerPush: () => {},
        getScoreForPlayer: () => 281,
        canEditPlayers: false,
        canReorderPlayers: false,
        commentaryEnabled: false,
        personaId: 'chad',
        setCurrentCommentary: () => {},
        setCommentaryLoading: () => {},
        setCommentaryPlaying: () => {},
        ttsServiceRef: {
          current: {
            getSettings: () => ({ enabled: false }),
            queueCommentary: async () => {},
            getIsPlaying: () => false,
          },
        },
        broadcastRematch: async () => {},
      });

      return { actions, localTurn };
    });

    await act(async () => {
      await result.current.actions.handleBoardClick(0, 0, throwResult);
    });

    expect(result.current.localTurn.darts.map((dart) => dart.label)).toEqual(['S20']);
    expect(alertSpy).toHaveBeenCalledWith('network down');
    vi.unstubAllGlobals();
  });

  it('clears local pending turn when first-dart persistence fails', async () => {
    const players: Player[] = [
      { id: 'player-1', display_name: 'Player One' },
      { id: 'player-2', display_name: 'Player Two' },
    ];

    const match: MatchRecord = {
      id: 'match-1',
      mode: 'x01',
      start_score: '301',
      finish: 'double_out',
      legs_to_win: 1,
    };

    const currentLeg: LegRecord = {
      id: 'leg-1',
      match_id: 'match-1',
      leg_number: 1,
      starting_player_id: 'player-1',
      winner_player_id: null,
    };

    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    apiRequestMock.mockImplementation((url: string) => {
      if (url.endsWith('/throws')) {
        return Promise.reject(new Error('turn create failed'));
      }
      return Promise.resolve({ ok: true });
    });

    const throwResult: SegmentResult = { kind: 'Single', label: 'S20', scored: 20 };

    const { result } = renderHook(() => {
      const [localTurn, setLocalTurn] = useState<{
        playerId: string | null;
        darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
      }>({ playerId: null, darts: [] });

      const ongoingTurnRef = useRef<{
        turnId: string;
        playerId: string;
        darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
        startScore: number;
      } | null>(null);

      const actions = useMatchActions({
        matchId: 'match-1',
        match,
        players,
        legs: [currentLeg],
        turns: [],
        turnThrowCounts: {},
        currentLeg,
        currentPlayer: players[0],
        orderPlayers: players,
        finishRule: 'double_out',
        matchWinnerId: null,
        localTurn,
        ongoingTurnRef,
        setLocalTurn,
        loadAll: async () => {},
        loadTurnsForLeg: async () => [],
        routerPush: () => {},
        getScoreForPlayer: () => 301,
        canEditPlayers: false,
        canReorderPlayers: false,
        commentaryEnabled: false,
        personaId: 'chad',
        setCurrentCommentary: () => {},
        setCommentaryLoading: () => {},
        setCommentaryPlaying: () => {},
        ttsServiceRef: {
          current: {
            getSettings: () => ({ enabled: false }),
            queueCommentary: async () => {},
            getIsPlaying: () => false,
          },
        },
        broadcastRematch: async () => {},
      });

      return { actions, localTurn };
    });

    await act(async () => {
      await result.current.actions.handleBoardClick(0, 0, throwResult);
    });

    expect(result.current.localTurn).toEqual({ playerId: null, darts: [] });
    expect(alertSpy).toHaveBeenCalledWith('turn create failed');
    vi.unstubAllGlobals();
  });
});
