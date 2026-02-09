"use client";

import { useEffect, useState } from 'react';
import {
  getPerfMetricsSnapshot,
  resetPerfMetrics,
  type PerfMetricKey,
  type PerfMetricsSnapshot,
} from '@/lib/match/perfMetrics';

type PerfDebugPanelProps = {
  matchId: string;
  enabled: boolean;
};

const METRIC_CONFIG: { key: PerfMetricKey; label: string }[] = [
  { key: 'clickToOptimisticPaintMs', label: 'click->optimistic' },
  { key: 'clickToServerAckMs', label: 'click->server ack' },
  { key: 'matchLoadAllMs', label: 'match loadAll' },
  { key: 'spectatorLoadAllMs', label: 'spectator loadAll' },
];

const EMPTY_METRICS: PerfMetricsSnapshot = getPerfMetricsSnapshot('__empty__');

function formatMetricValue(value: number | null): string {
  return value == null ? '-' : `${Math.round(value)}ms`;
}

export function PerfDebugPanel({ matchId, enabled }: PerfDebugPanelProps) {
  const [metrics, setMetrics] = useState<PerfMetricsSnapshot>(EMPTY_METRICS);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => setMetrics(getPerfMetricsSnapshot(matchId));
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [enabled, matchId]);

  if (!enabled) return null;

  return (
    <div className="fixed right-4 bottom-4 z-[70] w-[360px] rounded-md border border-cyan-300 bg-black/85 p-3 text-xs text-cyan-100 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold tracking-wide">Perf Debug</div>
        <button
          type="button"
          className="rounded border border-cyan-400 px-2 py-0.5 text-[11px] hover:bg-cyan-500/15"
          onClick={() => {
            resetPerfMetrics(matchId);
            setMetrics(getPerfMetricsSnapshot(matchId));
          }}
        >
          reset
        </button>
      </div>
      <div className="space-y-2 font-mono">
        {METRIC_CONFIG.map(({ key, label }) => {
          const metric = metrics[key];
          return (
            <div key={key} className="rounded border border-cyan-900/80 bg-cyan-950/30 px-2 py-1.5">
              <div className="mb-1 text-[11px] font-semibold">{label}</div>
              <div className="grid grid-cols-4 gap-x-2">
                <div>last: {formatMetricValue(metric.lastMs)}</div>
                <div>avg: {formatMetricValue(metric.avgMs)}</div>
                <div>min: {formatMetricValue(metric.minMs)}</div>
                <div>max: {formatMetricValue(metric.maxMs)}</div>
              </div>
              <div className="mt-1 text-[11px] opacity-80">samples: {metric.samples}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
