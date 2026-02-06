"use client";

import { useEffect, useState } from 'react';
import { getRealtimeMetricsSnapshot, type RealtimeMetricsSnapshot } from '@/lib/match/realtimeMetrics';

type RealtimeDebugPanelProps = {
  matchId: string;
  connectionStatus: string;
  isSpectatorMode: boolean;
  enabled: boolean;
};

const EMPTY_METRICS: RealtimeMetricsSnapshot = {
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
};

export function RealtimeDebugPanel({ matchId, connectionStatus, isSpectatorMode, enabled }: RealtimeDebugPanelProps) {
  const [metrics, setMetrics] = useState<RealtimeMetricsSnapshot>(EMPTY_METRICS);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const next = getRealtimeMetricsSnapshot(matchId);
      if (next) setMetrics(next);
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [enabled, matchId]);

  if (!enabled) return null;

  return (
    <div className="fixed left-4 bottom-4 z-[70] w-[360px] rounded-md border border-amber-300 bg-black/85 p-3 text-xs text-amber-100 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold tracking-wide">Realtime Debug</div>
        <div className="text-[11px] opacity-80">{isSpectatorMode ? 'spectator' : 'scorer'}</div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
        <div>status: {connectionStatus}</div>
        <div>pollTicks: {metrics.fallbackPollTicks}</div>
        <div>throws: {metrics.throwsEvents}</div>
        <div>turns: {metrics.turnsEvents}</div>
        <div>legs: {metrics.legsEvents}</div>
        <div>matches: {metrics.matchesEvents}</div>
        <div>players: {metrics.matchPlayersEvents}</div>
        <div>reconcileTurn: {metrics.reconcileTurnCalls}</div>
        <div>reconcileLeg: {metrics.reconcileCurrentLegCalls}</div>
        <div>connected: {metrics.channelConnectedTransitions}</div>
        <div>errors: {metrics.channelErrorTransitions}</div>
        <div>closed: {metrics.channelClosedTransitions}</div>
        <div>lastDelayMs: {metrics.lastDeliveryDelayMs ?? '-'}</div>
        <div>avgDelayMs: {metrics.avgDeliveryDelayMs != null ? Math.round(metrics.avgDeliveryDelayMs) : '-'}</div>
      </div>
    </div>
  );
}

