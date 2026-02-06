type RealtimeMetricKey =
  | 'throwsEvents'
  | 'turnsEvents'
  | 'legsEvents'
  | 'matchesEvents'
  | 'matchPlayersEvents'
  | 'reconcileTurnCalls'
  | 'reconcileCurrentLegCalls'
  | 'fallbackPollTicks'
  | 'channelConnectedTransitions'
  | 'channelErrorTransitions'
  | 'channelClosedTransitions';

export type RealtimeMetricsSnapshot = {
  throwsEvents: number;
  turnsEvents: number;
  legsEvents: number;
  matchesEvents: number;
  matchPlayersEvents: number;
  reconcileTurnCalls: number;
  reconcileCurrentLegCalls: number;
  fallbackPollTicks: number;
  channelConnectedTransitions: number;
  channelErrorTransitions: number;
  channelClosedTransitions: number;
  lastEventAt: number | null;
  lastDeliveryDelayMs: number | null;
  avgDeliveryDelayMs: number | null;
  deliverySamples: number;
};

declare global {
  interface Window {
    __dartRealtimeMetrics?: Record<string, RealtimeMetricsSnapshot>;
  }
}

const initialSnapshot = (): RealtimeMetricsSnapshot => ({
  throwsEvents: 0,
  turnsEvents: 0,
  legsEvents: 0,
  matchesEvents: 0,
  matchPlayersEvents: 0,
  reconcileTurnCalls: 0,
  reconcileCurrentLegCalls: 0,
  fallbackPollTicks: 0,
  channelConnectedTransitions: 0,
  channelErrorTransitions: 0,
  channelClosedTransitions: 0,
  lastEventAt: null,
  lastDeliveryDelayMs: null,
  avgDeliveryDelayMs: null,
  deliverySamples: 0,
});

function getStore(matchId: string): RealtimeMetricsSnapshot | null {
  if (typeof window === 'undefined') return null;
  if (!window.__dartRealtimeMetrics) {
    window.__dartRealtimeMetrics = {};
  }
  if (!window.__dartRealtimeMetrics[matchId]) {
    window.__dartRealtimeMetrics[matchId] = initialSnapshot();
  }
  return window.__dartRealtimeMetrics[matchId] ?? null;
}

export function getRealtimeMetricsSnapshot(matchId: string): RealtimeMetricsSnapshot | null {
  const store = getStore(matchId);
  if (!store) return null;
  return { ...store };
}

export function incrementRealtimeMetric(matchId: string, key: RealtimeMetricKey, delta = 1): void {
  const store = getStore(matchId);
  if (!store) return;
  store[key] += delta;
  store.lastEventAt = Date.now();
}

export function recordRealtimeDeliveryDelay(matchId: string, payload: unknown): void {
  const store = getStore(matchId);
  if (!store || !payload || typeof payload !== 'object') return;

  const commitTimestamp =
    'commit_timestamp' in payload && typeof payload.commit_timestamp === 'string'
      ? payload.commit_timestamp
      : null;
  if (!commitTimestamp) return;

  const commitMs = Date.parse(commitTimestamp);
  if (Number.isNaN(commitMs)) return;

  const delay = Math.max(Date.now() - commitMs, 0);
  store.lastDeliveryDelayMs = delay;
  store.deliverySamples += 1;
  if (store.avgDeliveryDelayMs == null) {
    store.avgDeliveryDelayMs = delay;
  } else {
    const n = store.deliverySamples;
    store.avgDeliveryDelayMs = ((store.avgDeliveryDelayMs * (n - 1)) + delay) / n;
  }
  store.lastEventAt = Date.now();
}
