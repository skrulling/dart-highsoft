"use client";

export type PerfMetricKey =
  | 'clickToOptimisticPaintMs'
  | 'clickToServerAckMs'
  | 'matchLoadAllMs'
  | 'spectatorLoadAllMs';

type PerfAggregate = {
  lastMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  avgMs: number | null;
  samples: number;
  updatedAt: number | null;
};

export type PerfMetricsSnapshot = Record<PerfMetricKey, PerfAggregate>;

const EMPTY_AGGREGATE: PerfAggregate = {
  lastMs: null,
  minMs: null,
  maxMs: null,
  avgMs: null,
  samples: 0,
  updatedAt: null,
};

const EMPTY_SNAPSHOT: PerfMetricsSnapshot = {
  clickToOptimisticPaintMs: { ...EMPTY_AGGREGATE },
  clickToServerAckMs: { ...EMPTY_AGGREGATE },
  matchLoadAllMs: { ...EMPTY_AGGREGATE },
  spectatorLoadAllMs: { ...EMPTY_AGGREGATE },
};

const metricsByMatchId = new Map<string, PerfMetricsSnapshot>();

function getOrInitSnapshot(matchId: string): PerfMetricsSnapshot {
  const existing = metricsByMatchId.get(matchId);
  if (existing) return existing;
  const created: PerfMetricsSnapshot = {
    clickToOptimisticPaintMs: { ...EMPTY_AGGREGATE },
    clickToServerAckMs: { ...EMPTY_AGGREGATE },
    matchLoadAllMs: { ...EMPTY_AGGREGATE },
    spectatorLoadAllMs: { ...EMPTY_AGGREGATE },
  };
  metricsByMatchId.set(matchId, created);
  return created;
}

export function recordPerfMetric(matchId: string, key: PerfMetricKey, durationMs: number): void {
  if (!Number.isFinite(durationMs)) return;
  const value = Math.max(0, Math.round(durationMs));
  const snapshot = getOrInitSnapshot(matchId);
  const prev = snapshot[key];
  const nextSamples = prev.samples + 1;
  const nextAvg = prev.avgMs == null ? value : (prev.avgMs * prev.samples + value) / nextSamples;
  snapshot[key] = {
    lastMs: value,
    minMs: prev.minMs == null ? value : Math.min(prev.minMs, value),
    maxMs: prev.maxMs == null ? value : Math.max(prev.maxMs, value),
    avgMs: nextAvg,
    samples: nextSamples,
    updatedAt: Date.now(),
  };
}

export function getPerfMetricsSnapshot(matchId: string): PerfMetricsSnapshot {
  const snapshot = metricsByMatchId.get(matchId);
  if (!snapshot) return structuredClone(EMPTY_SNAPSHOT);
  return structuredClone(snapshot);
}

export function resetPerfMetrics(matchId: string): void {
  metricsByMatchId.delete(matchId);
}
