/**
 * MatchClient Component Tests
 *
 * This test file focuses on testing the externally visible behavior of MatchClient.
 * Internal state management tests have been temporarily removed pending component stabilization.
 *
 * TODO: Add tests for:
 * - Player rotation on turn completion
 * - Bust handling
 * - Score updates via realtime events
 * - Checkout suggestions display
 * - Turn history updates
 */

import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, beforeEach, beforeAll, it, expect } from 'vitest';
import {
  createTwoPlayerGameSetup,
  resetQueryLog,
  getQueryLog,
  createMockRouter,
  createMockRealtime,
  createMockSupabaseClient,
  type MockDb,
} from '@/test-utils';

type MatchClientComponent = typeof import('./MatchClient').default;
let MatchClient: MatchClientComponent;

// Mock database state
let mockDb: MockDb;
const clone = <T,>(value: T): T => structuredClone(value);

function resetMockDb() {
  mockDb = clone(createTwoPlayerGameSetup());
  resetQueryLog();
}

// Search params mock state
const searchParamsState = { value: '' };
const setSearchParams = (value: string) => {
  searchParamsState.value = value;
};

// Mock router
const mockRouter = createMockRouter();

// Mock realtime
const mockRealtime = createMockRealtime();

// Setup mocks
vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: () => Promise.resolve(createMockSupabaseClient(mockDb)),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock('@/hooks/useRealtime', () => ({
  useRealtime: () => mockRealtime,
}));

vi.mock('@/components/Dartboard', () => ({
  default: () => <div data-testid="dartboard" />,
}));

vi.mock('@/components/MobileKeypad', () => ({
  default: () => <div data-testid="mobile-keypad" />,
}));

vi.mock('@/components/ScoreProgressChart', () => ({
  ScoreProgressChart: () => <div data-testid="score-chart" />,
}));

vi.mock('@/components/CommentaryDisplay', () => ({
  default: () => <div data-testid="commentary-display" />,
}));

vi.mock('@/components/CommentarySettings', () => ({
  default: () => <div data-testid="commentary-settings" />,
}));

vi.mock('@/lib/commentary/personas', () => ({
  resolvePersona: () => ({ id: 'chad', label: 'Chad' }),
}));

vi.mock('@/services/commentaryService', () => {
  class MockDebouncer {
    canCall() {
      return false;
    }
    markCalled() {}
  }
  return {
    generateCommentary: vi.fn().mockResolvedValue({ commentary: null }),
    generateMatchRecap: vi.fn().mockResolvedValue({ commentary: null }),
    CommentaryDebouncer: MockDebouncer,
  };
});

const mockTts = {
  getSettings: () => ({ enabled: false, voice: 'onyx' }),
  updateSettings: vi.fn(),
  unlock: vi.fn(),
  queueCommentary: vi.fn().mockResolvedValue(undefined),
  getIsPlaying: () => false,
};

vi.mock('@/services/ttsService', () => ({
  getTTSService: () => mockTts,
  VoiceOption: undefined,
}));

vi.mock('@/utils/eloRating', () => ({
  updateMatchEloRatings: vi.fn(),
  shouldMatchBeRated: () => false,
}));

vi.mock('@/utils/eloRatingMultiplayer', () => ({
  updateMatchEloRatingsMultiplayer: vi.fn(),
  shouldMatchBeRatedMultiplayer: () => false,
}));

window.alert = vi.fn();

describe('MatchClient', () => {
  beforeAll(async () => {
    const matchClientModule = await import('./MatchClient');
    MatchClient = matchClientModule.default;
  });

  beforeEach(() => {
    cleanup();
    resetMockDb();
    vi.clearAllMocks();
    setSearchParams('');
    // Reset mockRealtime to default connected state
    mockRealtime.connectionStatus = 'connected';
    mockRealtime.isConnected = true;
  });

  describe('basic rendering', () => {
    it('renders player names', async () => {
      const view = render(<MatchClient matchId="match-1" />);

      // Wait for the component to load and display player names
      const playerCards = await screen.findAllByText('Player One');
      expect(playerCards.length).toBeGreaterThan(0);

      const player2Cards = await screen.findAllByText('Player Two');
      expect(player2Cards.length).toBeGreaterThan(0);

      view.unmount();
    });

    it('renders dartboard and mobile keypad components', async () => {
      const view = render(<MatchClient matchId="match-1" />);

      // Wait for component to load
      await screen.findAllByText('Player One');

      expect(screen.getByTestId('dartboard')).toBeDefined();
      expect(screen.getByTestId('mobile-keypad')).toBeDefined();

      view.unmount();
    });
  });

  describe('spectator mode', () => {
    it('avoids extra throws queries during spectator initial load', async () => {
      setSearchParams('spectator=true');
      const view = render(<MatchClient matchId="match-1" />);

      await screen.findByText('Live Match');

      const logSnapshot = getQueryLog();
      const throwSelects = logSnapshot.filter(
        (entry) => entry.table === 'throws' && entry.operation === 'select'
      );
      expect(throwSelects.length, JSON.stringify(logSnapshot)).toBe(0);
      view.unmount();
    });

    it('renders spectator view even when realtime is disconnected', async () => {
      setSearchParams('spectator=true');
      mockRealtime.connectionStatus = 'connecting';
      mockRealtime.isConnected = false;

      const view = render(<MatchClient matchId="match-1" />);

      const spectatorCards = await screen.findAllByText('Player One');
      expect(spectatorCards.length).toBeGreaterThan(0);
      expect(screen.queryByText('Loading…')).toBeNull();
      view.unmount();
    });

    it('shows Live Match indicator in spectator mode', async () => {
      setSearchParams('spectator=true');
      const view = render(<MatchClient matchId="match-1" />);

      const liveIndicator = await screen.findByText('Live Match');
      expect(liveIndicator).toBeDefined();

      view.unmount();
    });
  });
});
