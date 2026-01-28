import type { ThrowRecord, TurnRecord, TurnWithThrows } from '@/lib/match/types';

type ChangeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export type ThrowChangePayload = {
  eventType?: ChangeEventType;
  new?: Partial<ThrowRecord>;
  old?: Partial<ThrowRecord>;
};

export type TurnChangePayload = {
  eventType?: ChangeEventType;
  new?: Partial<TurnRecord>;
  old?: Partial<TurnRecord>;
};

export type SpectatorReducerState = {
  currentLegId?: string;
  turns: TurnWithThrows[];
  turnThrowCounts: Record<string, number>;
};

export type SpectatorReducerEffects = {
  needsReconcile?: boolean;
  completedTurnId?: string;
};

export type SpectatorReducerResult = {
  turns: TurnWithThrows[];
  turnThrowCounts: Record<string, number>;
  effects: SpectatorReducerEffects;
};

function sortTurnsByNumber(turns: TurnWithThrows[]) {
  return turns.slice().sort((a, b) => a.turn_number - b.turn_number);
}

function cloneTurns(turns: TurnWithThrows[]) {
  return turns.map((turn) => ({
    ...turn,
    throws: turn.throws ? turn.throws.slice() : [],
  }));
}

function ensureThrowIdMatchIndex(throws: ThrowRecord[], incoming: Partial<ThrowRecord>) {
  if (incoming.id) {
    return throws.findIndex((t) => t.id === incoming.id);
  }
  if (typeof incoming.dart_index === 'number') {
    return throws.findIndex((t) => t.dart_index === incoming.dart_index);
  }
  return -1;
}

function normalizeThrows(throws: ThrowRecord[]) {
  throws.sort((a, b) => a.dart_index - b.dart_index);
}

function scoreFromSegment(segment: string | undefined): number | null {
  if (!segment) return null;
  if (segment === 'Miss') return 0;
  if (segment === 'SB') return 25;
  if (segment === 'DB') return 50;
  const match = segment.match(/^([SDT])(\d{1,2})$/);
  if (!match) return null;
  const mult = match[1] === 'S' ? 1 : match[1] === 'D' ? 2 : 3;
  const value = Number.parseInt(match[2] ?? '0', 10);
  return Number.isNaN(value) ? null : value * mult;
}

export function applyThrowChange(
  payload: ThrowChangePayload,
  state: SpectatorReducerState
): SpectatorReducerResult {
  const effects: SpectatorReducerEffects = {};
  const record = payload.new ?? payload.old;
  if (!record?.turn_id) {
    return { turns: state.turns, turnThrowCounts: state.turnThrowCounts, effects };
  }

  const turns = cloneTurns(state.turns);
  const turnIdx = turns.findIndex((turn) => turn.id === record.turn_id);
  if (turnIdx < 0) {
    effects.needsReconcile = true;
    return { turns: state.turns, turnThrowCounts: state.turnThrowCounts, effects };
  }

  const target = turns[turnIdx];
  if (state.currentLegId && target.leg_id !== state.currentLegId) {
    return { turns: state.turns, turnThrowCounts: state.turnThrowCounts, effects };
  }

  const throws = target.throws ?? [];
  const prevCount = throws.length;
  const existingIndex = ensureThrowIdMatchIndex(throws, record);
  const computedScore = record.scored ?? scoreFromSegment(record.segment);

  if (payload.eventType === 'DELETE') {
    if (existingIndex >= 0) {
      throws.splice(existingIndex, 1);
    }
  } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    const nextThrow: ThrowRecord = {
      id: record.id ?? throws[existingIndex]?.id ?? `temp-${record.turn_id}-${record.dart_index ?? throws.length + 1}`,
      turn_id: record.turn_id ?? target.id,
      dart_index: record.dart_index ?? throws[existingIndex]?.dart_index ?? throws.length + 1,
      segment: record.segment ?? throws[existingIndex]?.segment ?? 'Miss',
      scored: computedScore ?? throws[existingIndex]?.scored ?? 0,
    };
    if (existingIndex >= 0) {
      throws[existingIndex] = { ...throws[existingIndex], ...nextThrow };
    } else {
      throws.push(nextThrow);
    }
  }

  normalizeThrows(throws);
  target.throws = throws;

  const nextCounts = { ...state.turnThrowCounts, [target.id]: throws.length };
  if (prevCount < 3 && throws.length === 3) {
    effects.completedTurnId = target.id;
  }

  return {
    turns,
    turnThrowCounts: nextCounts,
    effects,
  };
}

export function applyTurnChange(
  payload: TurnChangePayload,
  state: SpectatorReducerState
): SpectatorReducerResult {
  const effects: SpectatorReducerEffects = {};
  const record = payload.new ?? payload.old;
  if (!record?.id) {
    return { turns: state.turns, turnThrowCounts: state.turnThrowCounts, effects };
  }

  if (state.currentLegId && record.leg_id && record.leg_id !== state.currentLegId) {
    return { turns: state.turns, turnThrowCounts: state.turnThrowCounts, effects };
  }

  const turns = cloneTurns(state.turns);
  const turnIdx = turns.findIndex((turn) => turn.id === record.id);
  const prev = turnIdx >= 0 ? turns[turnIdx] : null;

  if (payload.eventType === 'DELETE') {
    if (turnIdx >= 0) {
      turns.splice(turnIdx, 1);
    }
    const nextCounts = { ...state.turnThrowCounts };
    delete nextCounts[record.id];
    return { turns: sortTurnsByNumber(turns), turnThrowCounts: nextCounts, effects };
  }

  if (payload.eventType === 'INSERT') {
    if (turnIdx < 0) {
      turns.push({
        id: record.id,
        leg_id: record.leg_id ?? state.currentLegId ?? '',
        player_id: record.player_id ?? '',
        turn_number: record.turn_number ?? turns.length + 1,
        total_scored: record.total_scored ?? 0,
        busted: record.busted ?? false,
        throws: [],
      });
    }
    const nextCounts = { ...state.turnThrowCounts };
    if (!(record.id in nextCounts)) {
      nextCounts[record.id] = 0;
    }
    return { turns: sortTurnsByNumber(turns), turnThrowCounts: nextCounts, effects };
  }

  if (payload.eventType === 'UPDATE') {
    if (turnIdx < 0) {
      effects.needsReconcile = true;
      return { turns: state.turns, turnThrowCounts: state.turnThrowCounts, effects };
    }

    const merged = {
      ...turns[turnIdx],
      ...record,
      throws: turns[turnIdx].throws ?? [],
    };
    turns[turnIdx] = merged;

    const prevBusted = prev?.busted ?? false;
    const prevTotal = prev?.total_scored ?? 0;
    const nextBusted = merged.busted ?? false;
    const nextTotal = merged.total_scored ?? 0;
    if ((!prevBusted && nextBusted) || (nextTotal > 0 && nextTotal !== prevTotal)) {
      effects.completedTurnId = merged.id;
    }
  }

  return { turns: sortTurnsByNumber(turns), turnThrowCounts: state.turnThrowCounts, effects };
}
