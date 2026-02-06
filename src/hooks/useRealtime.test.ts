import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRealtime } from './useRealtime';

const onMock = vi.fn();
const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();
const channelMock = vi.fn();
const getSupabaseClientMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: () => getSupabaseClientMock(),
}));

describe('useRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    onMock.mockImplementation(() => mockChannel);
    subscribeMock.mockImplementation((callback?: (status: string) => void) => {
      callback?.('SUBSCRIBED');
      return mockChannel;
    });
    unsubscribeMock.mockImplementation(() => mockChannel);
    channelMock.mockImplementation(() => mockChannel);

    getSupabaseClientMock.mockResolvedValue({
      channel: channelMock,
    });
  });

  const mockChannel = {
    on: onMock,
    subscribe: subscribeMock,
    unsubscribe: unsubscribeMock,
    track: vi.fn(),
    send: vi.fn(),
  };

  it('subscribes to turns and throws with match_id filters', async () => {
    renderHook(() => useRealtime('match-123'));

    await waitFor(() => {
      expect(channelMock).toHaveBeenCalledWith(
        'dart_match_match-123',
        expect.objectContaining({
          config: expect.objectContaining({
            presence: expect.any(Object),
          }),
        })
      );
    });

    const postgresCalls = onMock.mock.calls.filter(
      ([eventName]) => eventName === 'postgres_changes'
    );

    const throwsCall = postgresCalls.find(
      ([, payload]) => payload && typeof payload === 'object' && (payload as { table?: string }).table === 'throws'
    );
    const turnsCall = postgresCalls.find(
      ([, payload]) => payload && typeof payload === 'object' && (payload as { table?: string }).table === 'turns'
    );

    expect(throwsCall?.[1]).toEqual(
      expect.objectContaining({
        filter: 'match_id=eq.match-123',
      })
    );
    expect(turnsCall?.[1]).toEqual(
      expect.objectContaining({
        filter: 'match_id=eq.match-123',
      })
    );
  });

  it('keeps connection when postgres_changes system warning is emitted', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useRealtime('match-123'));

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    const systemCall = onMock.mock.calls.find(([eventName]) => eventName === 'system');
    expect(systemCall).toBeDefined();

    const systemHandler = systemCall?.[2] as ((payload: unknown) => void) | undefined;
    expect(systemHandler).toBeDefined();

    systemHandler?.({
      extension: 'postgres_changes',
      status: 'error',
      message: 'Unable to subscribe to changes with given parameters',
    });

    expect(warnSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });
    warnSpy.mockRestore();
  });

  it('ignores empty prototype-only postgres_changes system payload noise', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useRealtime('match-123'));

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    const systemCall = onMock.mock.calls.find(([eventName]) => eventName === 'system');
    expect(systemCall).toBeDefined();

    const systemHandler = systemCall?.[2] as ((payload: unknown) => void) | undefined;
    expect(systemHandler).toBeDefined();

    // Simulates payloads where properties live on prototype (keys() is empty).
    const prototypeOnlyPayload = Object.create({
      extension: 'postgres_changes',
      status: 'error',
      message: 'Unable to subscribe to changes with given parameters',
    });

    systemHandler?.(prototypeOnlyPayload);

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    expect(warnSpy).toHaveBeenCalledWith('Realtime postgres_changes warning ignored:', prototypeOnlyPayload);
    warnSpy.mockRestore();
  });

  it('sets error status on explicit channel error lifecycle status', async () => {
    subscribeMock.mockImplementation((callback?: (status: string) => void) => {
      callback?.('CHANNEL_ERROR');
      return mockChannel;
    });

    const { result } = renderHook(() => useRealtime('match-123'));

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('error');
    });
  });
});
