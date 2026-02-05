import type { LegRecord, MatchRecord, Player, ThrowRecord, TurnRecord, TurnWithThrows } from '@/lib/match/types';
import type { SegmentResult } from '@/utils/dartboard';

type LocalTurn = {
  playerId: string | null;
  darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
};

type PlayerStatsSnapshot = {
  baseScores: Record<string, number>;
  averages: Record<string, number>;
  lastTurns: Record<string, TurnRecord | null>;
};

export function selectCurrentLeg(legs: LegRecord[]): LegRecord | undefined {
  if (!legs || legs.length === 0) return undefined;
  return legs.find((l) => !l.winner_player_id) ?? legs[legs.length - 1];
}

export function selectOrderPlayers(match: MatchRecord | null, players: Player[], currentLeg?: LegRecord): Player[] {
  if (!match || players.length === 0 || !currentLeg) return [];
  const startIdx = players.findIndex((p) => p.id === currentLeg.starting_player_id);
  if (startIdx < 0) return players;
  return [...players.slice(startIdx), ...players.slice(0, startIdx)];
}

export function selectMatchWinnerId(match: MatchRecord | null, legs: LegRecord[]): string | null {
  if (!match) return null;
  const counts = legs.reduce<Record<string, number>>((acc, l) => {
    if (l.winner_player_id) acc[l.winner_player_id] = (acc[l.winner_player_id] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).find(([, c]) => c >= match.legs_to_win)?.[0] ?? null;
}

export function selectPlayerStats(
  players: Player[],
  turns: TurnRecord[],
  currentLegId: string | undefined,
  startScore: number
): PlayerStatsSnapshot {
  const baseScores: Record<string, number> = {};
  const avgData: Record<string, { sum: number; count: number }> = {};
  const lastTurns: Record<string, TurnRecord | null> = {};
  const playerIdSet = new Set<string>();

  for (const player of players) {
    playerIdSet.add(player.id);
    baseScores[player.id] = startScore;
    avgData[player.id] = { sum: 0, count: 0 };
    lastTurns[player.id] = null;
  }

  for (const turn of turns) {
    const playerId = turn.player_id;
    if (!playerIdSet.has(playerId)) continue;

    const prev = lastTurns[playerId];
    if (!prev || turn.turn_number >= prev.turn_number) {
      lastTurns[playerId] = turn;
    }

    if (turn.leg_id === currentLegId && !turn.busted) {
      const scored = turn.total_scored || 0;
      baseScores[playerId] -= scored;
      avgData[playerId].sum += scored;
      avgData[playerId].count += 1;
    }
  }

  const averages: Record<string, number> = {};
  for (const player of players) {
    const data = avgData[player.id];
    averages[player.id] = data.count > 0 ? data.sum / data.count : 0;
  }

  return { baseScores, averages, lastTurns };
}

export function getScoreForPlayer(params: {
  playerId: string;
  startScore: number;
  playerStats: PlayerStatsSnapshot;
  localTurn: LocalTurn;
  turnThrowCounts: Record<string, number>;
  ongoingTurnId: string | null;
}): number {
  const { playerId, startScore, playerStats, localTurn, turnThrowCounts, ongoingTurnId } = params;
  let current = playerStats.baseScores[playerId] ?? startScore;

  // Check for local turn first (our client's active turn)
  if (localTurn.playerId === playerId) {
    const sub = localTurn.darts.reduce((s, d) => s + d.scored, 0);
    const lastTurn = playerStats.lastTurns[playerId];
    const throwCount = lastTurn ? turnThrowCounts[lastTurn.id] || 0 : 0;
    const isCurrentTurn = lastTurn && lastTurn.id === ongoingTurnId;
    const hasSubtotalInTurn =
      isCurrentTurn && throwCount > 0 && throwCount < 3 && typeof lastTurn.total_scored === 'number' && lastTurn.total_scored > 0;
    return Math.max(0, current - (hasSubtotalInTurn ? 0 : sub));
  }

  // Check for incomplete turns from other clients
  const lastTurn = playerStats.lastTurns[playerId];
  if (lastTurn && !lastTurn.busted) {
    const throwCount = turnThrowCounts[lastTurn.id] || 0;
    if (throwCount > 0 && throwCount < 3) {
      // This player has an incomplete turn with throws from another client
      const currentThrows = (lastTurn as TurnWithThrows).throws || [];
      const incompleteTotal = currentThrows.reduce((sum: number, thr: ThrowRecord) => sum + thr.scored, 0);
      // `playerStats.baseScores` already subtracts `turn.total_scored`. During undo/edit flows, we may
      // persist the partial subtotal on the turn row, so only subtract the delta to reach `sum(throws)`.
      const persistedSubtotal = typeof lastTurn.total_scored === 'number' ? lastTurn.total_scored : 0;
      current -= incompleteTotal - persistedSubtotal;
    }
  }

  return Math.max(0, current);
}

export function getAvgForPlayer(playerId: string, playerStats: PlayerStatsSnapshot): number {
  return playerStats.averages[playerId] ?? 0;
}

export function selectCurrentPlayer(params: {
  orderPlayers: Player[];
  currentLeg?: LegRecord;
  localTurn: LocalTurn;
  turns: TurnRecord[];
  turnThrowCounts: Record<string, number>;
}): Player | null {
  const { orderPlayers, currentLeg, localTurn, turns, turnThrowCounts } = params;
  if (!orderPlayers.length || !currentLeg) return null;

  // If we have a local turn active, that player is current
  if (localTurn.playerId) {
    return orderPlayers.find((p) => p.id === localTurn.playerId) ?? orderPlayers[0];
  }

  // Check if the last turn is incomplete (has fewer than 3 throws and not busted)
  if (turns.length > 0) {
    const lastTurn = turns[turns.length - 1];
    const throwCount = turnThrowCounts[lastTurn.id] || 0;

    // If the last turn has fewer than 3 throws (and wasn't busted), that player is still playing
    if (throwCount < 3 && !lastTurn.busted) {
      return orderPlayers.find((p) => p.id === lastTurn.player_id) || orderPlayers[0];
    }
  }

  // Otherwise, it's the next player's turn
  const idx = turns.length % orderPlayers.length;
  return orderPlayers[idx];
}

export function selectSpectatorCurrentPlayer(params: {
  orderPlayers: Player[];
  currentLeg?: LegRecord;
  turns: TurnRecord[];
  turnThrowCounts: Record<string, number>;
}): Player | null {
  const { orderPlayers, currentLeg, turns, turnThrowCounts } = params;
  if (!orderPlayers.length || !currentLeg) return null;

  // Check if the last turn is incomplete (has fewer than 3 throws)
  if (turns.length > 0) {
    const lastTurn = turns[turns.length - 1];
    const throwCount = turnThrowCounts[lastTurn.id] || 0;

    // If the last turn has fewer than 3 throws (and wasn't busted), that player is still playing
    if (throwCount < 3 && !lastTurn.busted) {
      return orderPlayers.find((p) => p.id === lastTurn.player_id) || orderPlayers[0];
    }
  }

  // Otherwise, it's the next player's turn
  const idx = turns.length % orderPlayers.length;
  return orderPlayers[idx];
}

export function canEditPlayers(params: {
  currentLeg?: LegRecord;
  players: Player[];
  turns: TurnRecord[];
  matchWinnerId: string | null;
}): boolean {
  const { currentLeg, players, turns, matchWinnerId } = params;
  if (!currentLeg || !players.length || matchWinnerId) return false;

  // If no turns yet, players can be edited
  if (turns.length === 0) return true;

  // Check if first round is completed (all players have had at least one turn)
  const playerTurnCounts = new Map<string, number>();
  for (const turn of turns) {
    playerTurnCounts.set(turn.player_id, (playerTurnCounts.get(turn.player_id) || 0) + 1);
  }

  // First round is completed if all players have at least 1 turn
  const firstRoundComplete = players.every((p) => (playerTurnCounts.get(p.id) || 0) >= 1);
  return !firstRoundComplete;
}

export function canReorderPlayers(turns: TurnRecord[], matchWinnerId: string | null): boolean {
  return turns.length === 0 && !matchWinnerId;
}
