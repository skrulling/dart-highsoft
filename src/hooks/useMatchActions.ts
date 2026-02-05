"use client";

import { useCallback, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { applyThrow, type FinishRule } from '@/utils/x01';
import type { SegmentResult } from '@/utils/dartboard';
import type { LegRecord, MatchPlayersRow, MatchRecord, Player, TurnRecord, TurnWithThrows } from '@/lib/match/types';
import type { EditableThrow } from '@/components/match/EditThrowsModal';
import { updateMatchEloRatings, shouldMatchBeRated } from '@/utils/eloRating';
import { updateMatchEloRatingsMultiplayer, shouldMatchBeRatedMultiplayer, type MultiplayerResult } from '@/utils/eloRatingMultiplayer';
import { generateMatchRecap } from '@/services/commentaryService';
import type { CommentaryPersonaId, PlayerStats } from '@/lib/commentary/types';

type LocalTurn = {
  playerId: string | null;
  darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
};

type UseMatchActionsArgs = {
  matchId: string;
  match: MatchRecord | null;
  players: Player[];
  legs: LegRecord[];
  turns: TurnRecord[];
  currentLeg: LegRecord | undefined;
  currentPlayer: Player | null;
  orderPlayers: Player[];
  finishRule: FinishRule;
  matchWinnerId: string | null;
  localTurn: LocalTurn;
  ongoingTurnRef: React.MutableRefObject<{
    turnId: string;
    playerId: string;
    darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
    startScore: number;
  } | null>;
  setLocalTurn: React.Dispatch<React.SetStateAction<LocalTurn>>;
  loadAll: () => Promise<void>;
  routerPush: (href: string) => void;
  getScoreForPlayer: (playerId: string) => number;
  canEditPlayers: boolean;
  canReorderPlayers: boolean;
  commentaryEnabled: boolean;
  personaId: CommentaryPersonaId;
  setCurrentCommentary: (value: string | null) => void;
  setCommentaryLoading: (value: boolean) => void;
  setCommentaryPlaying: (value: boolean) => void;
  ttsServiceRef: React.MutableRefObject<{
    getSettings: () => { enabled: boolean };
    queueCommentary: (input: { text: string; personaId: CommentaryPersonaId; excitement: 'high' }) => Promise<void>;
    getIsPlaying: () => boolean;
  }>;
  broadcastRematch?: (newMatchId: string) => Promise<void>;
};

type UseMatchActionsResult = {
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  editingThrows: EditableThrow[];
  selectedThrowId: string | null;
  setSelectedThrowId: (id: string | null) => void;
  editPlayersOpen: boolean;
  setEditPlayersOpen: (open: boolean) => void;
  availablePlayers: Player[];
  newPlayerName: string;
  setNewPlayerName: (value: string) => void;
  endGameDialogOpen: boolean;
  setEndGameDialogOpen: (open: boolean) => void;
  endGameLoading: boolean;
  rematchLoading: boolean;
  handleBoardClick: (_x: number, _y: number, result: SegmentResult) => Promise<void>;
  undoLastThrow: () => Promise<void>;
  openEditModal: () => Promise<void>;
  updateSelectedThrow: (seg: SegmentResult) => Promise<void>;
  openEditPlayersModal: () => Promise<void>;
  addNewPlayer: () => Promise<void>;
  addPlayerToMatch: (playerId: string) => Promise<void>;
  removePlayerFromMatch: (playerId: string) => Promise<void>;
  movePlayerUp: (index: number) => Promise<void>;
  movePlayerDown: (index: number) => Promise<void>;
  startRematch: () => Promise<void>;
  endGameEarly: () => Promise<void>;
};

export function useMatchActions(args: UseMatchActionsArgs): UseMatchActionsResult {
  const {
    matchId,
    match,
    players,
    legs,
    turns,
    currentLeg,
    currentPlayer,
    orderPlayers,
    finishRule,
    matchWinnerId,
    localTurn,
    ongoingTurnRef,
    setLocalTurn,
    loadAll,
    routerPush,
    getScoreForPlayer,
    canEditPlayers,
    canReorderPlayers,
    commentaryEnabled,
    personaId,
    setCurrentCommentary,
    setCommentaryLoading,
    setCommentaryPlaying,
    ttsServiceRef,
    broadcastRematch,
  } = args;

  const [editOpen, setEditOpen] = useState(false);
  const [editingThrows, setEditingThrows] = useState<EditableThrow[]>([]);
  const [selectedThrowId, setSelectedThrowId] = useState<string | null>(null);
  const [editPlayersOpen, setEditPlayersOpen] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [endGameDialogOpen, setEndGameDialogOpen] = useState(false);
  const [endGameLoading, setEndGameLoading] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);

  const startTurnIfNeeded = useCallback(async () => {
    if (!currentLeg || !currentPlayer) return null as string | null;
    if (ongoingTurnRef.current) return ongoingTurnRef.current.turnId;
    const nextTurnNumber = turns.length + 1;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('turns')
      .insert({
        leg_id: currentLeg.id,
        player_id: currentPlayer.id,
        turn_number: nextTurnNumber,
        total_scored: 0,
        busted: false,
      })
      .select('*')
      .single();
    if (error || !data) {
      alert(error?.message ?? 'Failed to start turn');
      return null;
    }
    ongoingTurnRef.current = {
      turnId: (data as TurnRecord).id,
      playerId: currentPlayer.id,
      darts: [],
      startScore: getScoreForPlayer(currentPlayer.id),
    };
    setLocalTurn({ playerId: currentPlayer.id, darts: [] });
    return (data as TurnRecord).id;
  }, [currentLeg, currentPlayer, ongoingTurnRef, turns.length, getScoreForPlayer, setLocalTurn]);

  const finishTurn = useCallback(
    async (busted: boolean, opts?: { skipReload?: boolean }) => {
      const ongoing = ongoingTurnRef.current;
      if (!ongoing) return;
      const total = ongoing.darts.reduce((s, d) => s + d.scored, 0);
      const supabase = await getSupabaseClient();
      const { error: updErr } = await supabase
        .from('turns')
        .update({ total_scored: total, busted })
        .eq('id', ongoing.turnId);
      if (updErr) {
        alert(`Failed to update turn: ${updErr.message}`);
      }
      ongoingTurnRef.current = null;
      setLocalTurn({ playerId: null, darts: [] });
      if (!opts?.skipReload) {
        await loadAll();
      }
    },
    [ongoingTurnRef, setLocalTurn, loadAll]
  );

  const triggerMatchRecap = useCallback(
    async (winnerId: string, allLegs: LegRecord[], allPlayers: Player[], allTurns: TurnWithThrows[]) => {
      try {
        setCommentaryLoading(true);

        const winner = allPlayers.find((p) => p.id === winnerId);
        if (!winner) return;

        // Compute legs won by each player
        const legsWonByPlayer = allLegs.reduce<Record<string, number>>((acc, leg) => {
          if (leg.winner_player_id) {
            acc[leg.winner_player_id] = (acc[leg.winner_player_id] || 0) + 1;
          }
          return acc;
        }, {});

        const winnerLegsWon = legsWonByPlayer[winnerId] || 0;

        // Compute player stats - optimized single-pass algorithm
        const startScoreValue = match?.start_score ? parseInt(match.start_score, 10) : 501;

        // Single pass through all turns to compute stats for all players
        const playerStatsMap = new Map<string, { totalScore: number; completedTurns: number; totalScored: number }>();

        // Initialize map for all players
        allPlayers.forEach((p) => {
          playerStatsMap.set(p.id, { totalScore: 0, completedTurns: 0, totalScored: 0 });
        });

        // Single iteration through all turns
        for (const turn of allTurns) {
          const stats = playerStatsMap.get(turn.player_id);
          if (!stats) continue;

          if (!turn.busted) {
            const scored =
              typeof turn.total_scored === 'number'
                ? turn.total_scored
                : (turn.throws?.reduce((sum, thr) => sum + thr.scored, 0) ?? 0);

            stats.totalScored += scored;

            // Only count for average if it's a valid completed turn with a score
            if (typeof turn.total_scored === 'number') {
              stats.totalScore += turn.total_scored;
              stats.completedTurns++;
            }
          }
        }

        const allPlayersStats: PlayerStats[] = allPlayers.map((p) => {
          const stats = playerStatsMap.get(p.id) ?? { totalScore: 0, completedTurns: 0, totalScored: 0 };
          return {
            name: p.display_name,
            id: p.id,
            remainingScore: Math.max(startScoreValue - stats.totalScored, 0),
            average: stats.completedTurns > 0 ? stats.totalScore / stats.completedTurns : 0,
            legsWon: legsWonByPlayer[p.id] || 0,
            isCurrentPlayer: false,
          };
        });

        // Get winning leg details
        const winningLeg = allLegs.find(
          (leg) => leg.winner_player_id === winnerId && leg.leg_number === allLegs.length
        );
        const winningLegTurns = winningLeg
          ? allTurns.filter((t) => t.leg_id === winningLeg.id).sort((a, b) => a.turn_number - b.turn_number)
          : [];
        const finalTurn = winningLegTurns[winningLegTurns.length - 1];
        const finalThrows =
          finalTurn?.throws?.map((t) => ({
            segment: t.segment,
            scored: t.scored,
            dart_index: t.dart_index,
          })) || [];
        const checkoutScore = finalTurn?.total_scored;

        const payload = {
          type: 'match_end' as const,
          context: {
            winnerName: winner.display_name,
            winnerId: winner.id,
            winnerLegsWon,
            totalLegs: allLegs.length,
            allPlayers: allPlayersStats,
            startScore: startScoreValue,
            legsToWin: match?.legs_to_win ?? 3,
            winningLeg: {
              finalThrows,
              checkoutScore,
            },
          },
        };

        const response = await generateMatchRecap(payload, personaId);

        if (response.commentary) {
          setCurrentCommentary(response.commentary);

          const tts = ttsServiceRef.current;
          if (tts.getSettings().enabled) {
            setCommentaryPlaying(true);
            await tts.queueCommentary({
              text: response.commentary,
              personaId: personaId,
              excitement: 'high', // Match end is always exciting
            });

            const checkPlaying = setInterval(() => {
              if (!tts.getIsPlaying()) {
                setCommentaryPlaying(false);
                clearInterval(checkPlaying);
              }
            }, 500);
          }
        }
      } catch (error) {
        console.error('Failed to generate match recap:', error);
      } finally {
        setCommentaryLoading(false);
      }
    },
    [match?.start_score, match?.legs_to_win, personaId, setCommentaryLoading, setCommentaryPlaying, setCurrentCommentary, ttsServiceRef]
  );

  const endLegAndMaybeMatch = useCallback(
    async (winnerPlayerId: string) => {
      if (!currentLeg || !match) return;
      const supabase = await getSupabaseClient();
      // Set leg winner if not already set
      const { error: legErr } = await supabase
        .from('legs')
        .update({ winner_player_id: winnerPlayerId })
        .eq('id', currentLeg.id)
        .is('winner_player_id', null);
      if (legErr) {
        alert(`Failed to set leg winner: ${legErr.message}`);
        await loadAll();
        return;
      }
      // Compute match winner
      const { data: allLegs, error: listErr } = await supabase.from('legs').select('*').eq('match_id', matchId);
      if (listErr) {
        alert(`Failed to load legs: ${listErr.message}`);
        await loadAll();
        return;
      }
      const wonCounts = ((allLegs as LegRecord[] | null) ?? []).reduce<Record<string, number>>((acc, l) => {
        if (l.winner_player_id) acc[l.winner_player_id] = (acc[l.winner_player_id] || 0) + 1;
        return acc;
      }, {});
      const target = match.legs_to_win;
      const someoneWonMatch = Object.entries(wonCounts).find(([, c]) => c >= target);
      if (!someoneWonMatch) {
        const nextLegNum = (allLegs ?? []).length + 1;
        // Determine next starter by rotating the initial player order, not by winner
        const nextStarterId = (() => {
          if (!currentLeg || players.length === 0) return winnerPlayerId; // fallback
          const currentIdx = players.findIndex((p) => p.id === currentLeg.starting_player_id);
          const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % players.length : 0;
          return players[nextIdx]?.id ?? winnerPlayerId;
        })();
        const { error: insErr } = await supabase
          .from('legs')
          .insert({ match_id: matchId, leg_number: nextLegNum, starting_player_id: nextStarterId });
        if (insErr) {
          alert(`Failed to create next leg: ${insErr.message}`);
        }
      } else {
        const [winnerPid] = someoneWonMatch;
        const { error: setWinnerErr } = await supabase
          .from('matches')
          .update({
            winner_player_id: winnerPid,
            completed_at: new Date().toISOString(),
          })
          .eq('id', matchId);
        if (setWinnerErr) {
          alert(`Failed to set match winner: ${setWinnerErr.message}`);
        } else {
          // Update ELO ratings
          if (shouldMatchBeRated(players.length)) {
            const loserId = players.find((p) => p.id !== winnerPid)?.id;
            if (loserId) {
              try {
                await updateMatchEloRatings(matchId, winnerPid, loserId);
              } catch (error) {
                console.error('Failed to update ELO ratings:', error);
                // Don't show error to user as match completion is more important
              }
            }
          } else if (shouldMatchBeRatedMultiplayer(players.length)) {
            // Multiplayer rating: winner rank 1, all others tied at rank 2
            const results: MultiplayerResult[] = players.map((p) => ({
              playerId: p.id,
              rank: p.id === winnerPid ? 1 : 2,
            }));
            try {
              await updateMatchEloRatingsMultiplayer(matchId, results);
            } catch (error) {
              console.error('Failed to update multiplayer ELO ratings:', error);
            }
          }

          // Trigger match recap commentary
          if (commentaryEnabled && allLegs && allLegs.length > 0) {
            try {
              // Fetch all turns for match recap
              const { data: allTurns } = await supabase
                .from('turns')
                .select(`
                id, leg_id, player_id, turn_number, total_scored, busted, created_at,
                throws:throws(id, turn_id, dart_index, segment, scored)
              `)
                .in('leg_id', allLegs.map((l) => l.id))
                .order('turn_number', { ascending: true });

              if (allTurns && allTurns.length > 0) {
                void triggerMatchRecap(winnerPid, allLegs, players, allTurns);
              }
            } catch (error) {
              console.error('Failed to trigger match recap:', error);
            }
          }
        }
      }
      await loadAll();
    },
    [currentLeg, match, matchId, players, loadAll, commentaryEnabled, triggerMatchRecap]
  );

  const handleBoardClick = useCallback(
    async (_x: number, _y: number, result: SegmentResult) => {
      if (matchWinnerId) return; // match over
      if (!currentLeg || !currentPlayer) return;
      const turnId = await startTurnIfNeeded();
      if (!turnId) return;

      const myScoreStart = ongoingTurnRef.current?.startScore ?? getScoreForPlayer(currentPlayer.id);
      const localSubtotal = localTurn.darts.reduce((s, d) => s + d.scored, 0);
      const outcome = applyThrow(myScoreStart - localSubtotal, result, finishRule);

      const newDartIndex = ongoingTurnRef.current!.darts.length + 1;
      const supabase = await getSupabaseClient();
      const { error: thrErr } = await supabase
        .from('throws')
        .insert({ turn_id: turnId, dart_index: newDartIndex, segment: result.label, scored: result.scored });
      if (thrErr) {
        alert(`Failed to save throw: ${thrErr.message}`);
        return;
      }
      ongoingTurnRef.current!.darts.push({ scored: result.scored, label: result.label, kind: result.kind });
      setLocalTurn((prev) => ({
        playerId: currentPlayer.id,
        darts: [...prev.darts, { scored: result.scored, label: result.label, kind: result.kind }],
      }));

      if (outcome.busted) {
        await finishTurn(true);
        return;
      }
      if (outcome.finished) {
        // Persist the partial turn and finish the leg immediately without waiting for state
        await finishTurn(false, { skipReload: true });
        await endLegAndMaybeMatch(currentPlayer.id);
        return;
      }
      if (newDartIndex >= 3) {
        await finishTurn(false);
        return;
      }
    },
    [
      matchWinnerId,
      currentLeg,
      currentPlayer,
      startTurnIfNeeded,
      ongoingTurnRef,
      getScoreForPlayer,
      localTurn.darts,
      finishRule,
      setLocalTurn,
      finishTurn,
      endLegAndMaybeMatch,
    ]
  );

  const undoLastThrow = useCallback(async () => {
    if (!currentLeg) return;
    const supabase = await getSupabaseClient();
    // If we have an empty local turn (no darts), remove it before undoing previous throws
    if (ongoingTurnRef.current && ongoingTurnRef.current.darts.length === 0) {
      const emptyTurnId = ongoingTurnRef.current.turnId;
      const { data: existingThrows, error: emptyErr } = await supabase
        .from('throws')
        .select('id')
        .eq('turn_id', emptyTurnId)
        .limit(1);
      if (emptyErr) {
        alert(`Failed to check empty turn: ${emptyErr.message}`);
        return;
      }
      if (!existingThrows || existingThrows.length === 0) {
        const { error: delTurnErr } = await supabase.from('turns').delete().eq('id', emptyTurnId);
        if (delTurnErr) {
          alert(`Failed to remove empty turn: ${delTurnErr.message}`);
          return;
        }
        ongoingTurnRef.current = null;
        setLocalTurn({ playerId: null, darts: [] });
      }
    }
    // If we have local darts in the ongoing turn, remove last one
    if (ongoingTurnRef.current && ongoingTurnRef.current.darts.length > 0) {
      const turnId = ongoingTurnRef.current.turnId;
      const lastIndex = ongoingTurnRef.current.darts.length; // 1-based
      const { error: delErr } = await supabase.from('throws').delete().eq('turn_id', turnId).eq('dart_index', lastIndex);
      if (delErr) {
        alert(`Failed to undo throw: ${delErr.message}`);
        return;
      }
      ongoingTurnRef.current.darts.pop();
      setLocalTurn((prev) => ({ playerId: prev.playerId, darts: prev.darts.slice(0, -1) }));
      const newTotal = ongoingTurnRef.current.darts.reduce((sum, dart) => sum + dart.scored, 0);
      await supabase.from('turns').update({ total_scored: newTotal, busted: false }).eq('id', turnId);
      await loadAll();
      return;
    }

    // Otherwise, remove the last persisted throw in the current leg
    const { data: legTurns, error: turnsErr } = await supabase
      .from('turns')
      .select('id, player_id, turn_number')
      .eq('leg_id', currentLeg.id)
      .order('turn_number', { ascending: false });
    if (turnsErr) {
      alert(`Failed to query turns: ${turnsErr.message}`);
      return;
    }
    let last:
      | {
          id: string;
          turn_id: string;
          dart_index: number;
          segment: string;
          scored: number;
          turns: { leg_id: string; player_id: string; turn_number: number };
        }
      | undefined;
    for (const t of legTurns ?? []) {
      const { data: thrRows, error: thrErr } = await supabase
        .from('throws')
        .select('id, turn_id, dart_index, segment, scored')
        .eq('turn_id', t.id)
        .order('dart_index', { ascending: false })
        .limit(1);
      if (thrErr) {
        alert(`Failed to query last throw: ${thrErr.message}`);
        return;
      }
      if (thrRows && thrRows.length > 0) {
        const thr = thrRows[0];
        last = {
          ...thr,
          turns: { leg_id: currentLeg.id, player_id: t.player_id, turn_number: t.turn_number },
        };
        break;
      }
    }
    if (!last) return; // nothing to undo

    const { error: delErr2 } = await supabase.from('throws').delete().eq('id', last.id);
    if (delErr2) {
      alert(`Failed to undo throw: ${delErr2.message}`);
      return;
    }

    // Check remaining throws in that turn
    const { data: remaining } = await supabase
      .from('throws')
      .select('dart_index, segment, scored')
      .eq('turn_id', last.turn_id)
      .order('dart_index');
    const darts = ((remaining as { dart_index: number; segment: string; scored: number }[] | null) ?? []).map(
      (r) => ({
        scored: r.scored,
        label: r.segment,
        kind: 'Single' as SegmentResult['kind'], // kind not needed for local subtotal
      })
    );

    if (darts.length === 0) {
      // If undoing the current player's only throw, keep the turn open with 0 darts
      if (currentPlayer?.id === last.turns.player_id) {
        await supabase.from('turns').update({ total_scored: 0, busted: false }).eq('id', last.turn_id);
        ongoingTurnRef.current = {
          turnId: last.turn_id,
          playerId: last.turns.player_id,
          darts: [],
          startScore: getScoreForPlayer(last.turns.player_id),
        };
        setLocalTurn({ playerId: last.turns.player_id, darts: [] });
        await loadAll();
        return;
      }

      // Otherwise delete empty turn and reopen previous player's turn
      await supabase.from('turns').delete().eq('id', last.turn_id);
      await loadAll();
      const prevLeg = (legs ?? []).find((l) => !l.winner_player_id) ?? legs[legs.length - 1];
      if (!prevLeg) return;
      const turnCount = turns.filter((t) => t.leg_id === prevLeg.id).length;
      const prevPlayer = orderPlayers[(turnCount + orderPlayers.length - 1) % orderPlayers.length];
      ongoingTurnRef.current = {
        turnId: last.turn_id,
        playerId: prevPlayer.id,
        darts: [],
        startScore: getScoreForPlayer(prevPlayer.id),
      };
      setLocalTurn({ playerId: prevPlayer.id, darts: [] });
      return;
    } else {
      // Update turn total to current subtotal and mark not busted
      const newTotal = darts.reduce((s, d) => s + d.scored, 0);
      await supabase.from('turns').update({ total_scored: newTotal, busted: false }).eq('id', last.turn_id);
      // Reopen local turn for that player
      ongoingTurnRef.current = {
        turnId: last.turn_id,
        playerId: last.turns.player_id,
        darts,
        startScore: getScoreForPlayer(last.turns.player_id) + newTotal, // reverse the subtotal to original start
      };
      setLocalTurn({ playerId: last.turns.player_id, darts });
      await loadAll();
      return;
    }
  }, [currentLeg, ongoingTurnRef, setLocalTurn, currentPlayer, getScoreForPlayer, loadAll, legs, turns, orderPlayers]);

  const openEditModal = useCallback(async () => {
    if (!currentLeg) return;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('throws')
      .select('id, turn_id, dart_index, segment, scored, turns:turn_id!inner(leg_id, turn_number, player_id)')
      .eq('turns.leg_id', currentLeg.id)
      .order('turn_number', { foreignTable: 'turns' })
      .order('dart_index');
    if (error) {
      alert(error.message);
      return;
    }
    type ThrowRow = {
      id: string;
      turn_id: string;
      dart_index: number;
      segment: string;
      scored: number;
      turns: { leg_id: string; turn_number: number; player_id: string };
    };
    const rows = ((data ?? []) as unknown as ThrowRow[]).map(
      (r) =>
        ({
          id: r.id,
          turn_id: r.turn_id,
          dart_index: r.dart_index,
          segment: r.segment,
          scored: r.scored,
          player_id: r.turns.player_id,
          turn_number: r.turns.turn_number,
        }) satisfies EditableThrow
    );
    setEditingThrows(rows);
    setSelectedThrowId(null);
    setEditOpen(true);
  }, [currentLeg]);

  const recomputeLegTurns = useCallback(async () => {
    if (!currentLeg || !match) return;
    const supabase = await getSupabaseClient();
    // Load turns for leg
    const { data: tData, error: tErr } = await supabase
      .from('turns')
      .select('id, player_id, turn_number, total_scored, busted')
      .eq('leg_id', currentLeg.id)
      .order('turn_number');
    if (tErr) {
      alert(tErr.message);
      return;
    }
    const turnIds = ((tData ?? []) as { id: string }[]).map((t) => t.id);
    // Load throws for those turns
    const { data: thrData, error: thrErr } = await supabase
      .from('throws')
      .select('id, turn_id, dart_index, segment, scored')
      .in('turn_id', turnIds)
      .order('dart_index');
    if (thrErr) {
      alert(thrErr.message);
      return;
    }

    const legTurns = (
      (tData ?? []) as { id: string; player_id: string; turn_number: number; total_scored: number | null; busted: boolean }[]
    ).sort((a, b) => a.turn_number - b.turn_number);
    const throwsByTurn = new Map<string, { segment: string; scored: number; dart_index: number }[]>();
    for (const thr of (thrData ?? []) as { id: string; turn_id: string; dart_index: number; segment: string; scored: number }[]) {
      if (!throwsByTurn.has(thr.turn_id)) throwsByTurn.set(thr.turn_id, []);
      throwsByTurn.get(thr.turn_id)!.push({ segment: thr.segment, scored: thr.scored, dart_index: thr.dart_index });
    }
    for (const arr of throwsByTurn.values()) arr.sort((a, b) => a.dart_index - b.dart_index);

    // Initialize per-player current scores
    const perPlayerScore = new Map<string, number>();
    for (const p of players) perPlayerScore.set(p.id, parseInt(match.start_score, 10));

    const turnUpdates: { id: string; total_scored: number; busted: boolean }[] = [];
    for (const t of legTurns) {
      const start = perPlayerScore.get(t.player_id) ?? parseInt(match.start_score, 10);
      let current = start;
      let total = 0;
      let busted = false;
      let finished = false;
      const thrList = throwsByTurn.get(t.id) ?? [];
      // Helper to construct full SegmentResult from stored label
      const segmentResultFromLabel = (label: string): SegmentResult => {
        if (label === 'Miss') return { kind: 'Miss', scored: 0, label: 'Miss' };
        if (label === 'SB') return { kind: 'OuterBull', scored: 25, label: 'SB' };
        if (label === 'DB') return { kind: 'InnerBull', scored: 50, label: 'DB' };
        const m = label.match(/^([SDT])(\d{1,2})$/);
        if (m) {
          const mod = m[1] as 'S' | 'D' | 'T';
          const n = parseInt(m[2]!, 10);
          if (mod === 'S') return { kind: 'Single', value: n, scored: n, label };
          if (mod === 'D') return { kind: 'Double', value: n, scored: n * 2, label };
          return { kind: 'Triple', value: n, scored: n * 3, label };
        }
        return { kind: 'Miss', scored: 0, label: 'Miss' };
      };

      for (const thr of thrList) {
        if (finished || busted) break;
        const seg = segmentResultFromLabel(thr.segment);
        const outcome = applyThrow(current, seg, finishRule);
        if (outcome.busted) {
          busted = true;
          total = 0;
          current = start; // revert
          break;
        }
        total += current - outcome.newScore;
        current = outcome.newScore;
        if (outcome.finished) finished = true;
      }
      // Apply end-of-turn score if not busted
      if (!busted) {
        perPlayerScore.set(t.player_id, current);
      }
      if (t.total_scored !== total || t.busted !== busted) {
        turnUpdates.push({ id: t.id, total_scored: total, busted });
      }
    }

    // Persist only changed values (can be many turns if editing historical throws).
    await Promise.all(
      turnUpdates.map((u) => supabase.from('turns').update({ total_scored: u.total_scored, busted: u.busted }).eq('id', u.id))
    );
  }, [currentLeg, finishRule, match, players]);

  const updateSelectedThrow = useCallback(
    async (seg: SegmentResult) => {
      if (!selectedThrowId) return;
      const supabase = await getSupabaseClient();
      const { error } = await supabase.from('throws').update({ segment: seg.label, scored: seg.scored }).eq('id', selectedThrowId);
      if (error) {
        alert(error.message);
        return;
      }
      await recomputeLegTurns();
      await loadAll();
      await openEditModal(); // reload list
    },
    [selectedThrowId, recomputeLegTurns, loadAll, openEditModal]
  );

  const openEditPlayersModal = useCallback(async () => {
    if (!canEditPlayers) return;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('players').select('*').order('display_name');
    if (error) {
      alert(error.message);
      return;
    }
    setAvailablePlayers((data as Player[]) ?? []);
    setEditPlayersOpen(true);
  }, [canEditPlayers]);

  const addNewPlayer = useCallback(async () => {
    const name = newPlayerName.trim();
    if (!name) return;

    const supabase = await getSupabaseClient();

    // Create new player
    const { data: newPlayer, error: playerError } = await supabase
      .from('players')
      .insert({ display_name: name })
      .select('*')
      .single();

    if (playerError) {
      alert(playerError.message);
      return;
    }

    // Add to match with next play order
    const nextOrder = Math.max(...players.map((_, i) => i), -1) + 1;
    const { error: matchPlayerError } = await supabase
      .from('match_players')
      .insert({
        match_id: matchId,
        player_id: (newPlayer as Player).id,
        play_order: nextOrder,
      });

    if (matchPlayerError) {
      alert(matchPlayerError.message);
      return;
    }

    setNewPlayerName('');
    setAvailablePlayers((prev) => [...prev, newPlayer as Player]);
    await loadAll(); // Reload match data
  }, [newPlayerName, matchId, players, loadAll]);

  const addPlayerToMatch = useCallback(
    async (playerId: string) => {
      const supabase = await getSupabaseClient();

      // Check if player is already in match
      if (players.some((p) => p.id === playerId)) {
        alert('Player is already in this match');
        return;
      }

      const nextOrder = Math.max(...players.map((_, i) => i), -1) + 1;
      const { error } = await supabase
        .from('match_players')
        .insert({
          match_id: matchId,
          player_id: playerId,
          play_order: nextOrder,
        });

      if (error) {
        alert(error.message);
        return;
      }

      await loadAll(); // Reload match data
    },
    [matchId, players, loadAll]
  );

  const removePlayerFromMatch = useCallback(
    async (playerId: string) => {
      if (players.length <= 2) {
        alert('Cannot remove player - match needs at least 2 players');
        return;
      }

      try {
        const supabase = await getSupabaseClient();

        // First delete the player from match_players
        const { error } = await supabase.from('match_players').delete().eq('match_id', matchId).eq('player_id', playerId);

        if (error) {
          console.error('Delete error:', error);
          alert(`Failed to remove player: ${error.message}. This might be a database permissions issue.`);
          return;
        }

        // Get remaining players and reorder them properly
        const { data: remainingPlayersData, error: fetchError } = await supabase
          .from('match_players')
          .select('*, players:player_id(*)')
          .eq('match_id', matchId)
          .order('play_order');

        if (fetchError) {
          console.error('Fetch error:', fetchError);
          alert(`Failed to fetch remaining players: ${fetchError.message}`);
          return;
        }

        // Update play orders to be sequential (0, 1, 2, ...)
        const remainingPlayers = (remainingPlayersData as MatchPlayersRow[] | null) ?? [];
        for (let i = 0; i < remainingPlayers.length; i++) {
          const { error: updateError } = await supabase
            .from('match_players')
            .update({ play_order: i })
            .eq('match_id', matchId)
            .eq('player_id', remainingPlayers[i].player_id);

          if (updateError) {
            console.error('Update error:', updateError);
            alert(`Failed to reorder players: ${updateError.message}. This might be a database permissions issue.`);
            return;
          }
        }

        await loadAll(); // Reload match data
      } catch (err) {
        console.error('Unexpected error:', err);
        alert('An unexpected error occurred while removing the player.');
      }
    },
    [matchId, players.length, loadAll]
  );

  const movePlayerUp = useCallback(
    async (index: number) => {
      if (index === 0 || !canReorderPlayers) return; // Can't move first player up

      const supabase = await getSupabaseClient();

      // Swap play orders using a temporary placeholder to avoid unique constraint violation
      const player = players[index];
      const prevPlayer = players[index - 1];
      const tempOrder = 9999; // Temporary placeholder

      // Step 1: Move player to temporary position
      const { error: error1 } = await supabase
        .from('match_players')
        .update({ play_order: tempOrder })
        .eq('match_id', matchId)
        .eq('player_id', player.id);

      if (error1) {
        alert(`Failed to reorder player: ${error1.message}`);
        return;
      }

      // Step 2: Move prevPlayer to player's original position
      const { error: error2 } = await supabase
        .from('match_players')
        .update({ play_order: index })
        .eq('match_id', matchId)
        .eq('player_id', prevPlayer.id);

      if (error2) {
        alert(`Failed to reorder player: ${error2.message}`);
        return;
      }

      // Step 3: Move player to final position
      const { error: error3 } = await supabase
        .from('match_players')
        .update({ play_order: index - 1 })
        .eq('match_id', matchId)
        .eq('player_id', player.id);

      if (error3) {
        alert(`Failed to reorder player: ${error3.message}`);
        return;
      }

      // Step 4: Update current leg's starting_player_id to maintain correct order
      // After swap, determine who should be first (if swapping position 0 and 1)
      if (currentLeg) {
        let newStartingPlayerId = currentLeg.starting_player_id;

        // If we're moving someone to position 0, they should be the starting player
        if (index === 1) {
          newStartingPlayerId = player.id;
        }

        const { error: legError } = await supabase
          .from('legs')
          .update({ starting_player_id: newStartingPlayerId })
          .eq('id', currentLeg.id);

        if (legError) {
          alert(`Failed to update leg starting player: ${legError.message}`);
          return;
        }
      }

      await loadAll();
    },
    [players, matchId, currentLeg, loadAll, canReorderPlayers]
  );

  const movePlayerDown = useCallback(
    async (index: number) => {
      if (index === players.length - 1 || !canReorderPlayers) return; // Can't move last player down

      const supabase = await getSupabaseClient();

      // Swap play orders using a temporary placeholder to avoid unique constraint violation
      const player = players[index];
      const nextPlayer = players[index + 1];
      const tempOrder = 9999; // Temporary placeholder

      // Step 1: Move player to temporary position
      const { error: error1 } = await supabase
        .from('match_players')
        .update({ play_order: tempOrder })
        .eq('match_id', matchId)
        .eq('player_id', player.id);

      if (error1) {
        alert(`Failed to reorder player: ${error1.message}`);
        return;
      }

      // Step 2: Move nextPlayer to player's original position
      const { error: error2 } = await supabase
        .from('match_players')
        .update({ play_order: index })
        .eq('match_id', matchId)
        .eq('player_id', nextPlayer.id);

      if (error2) {
        alert(`Failed to reorder player: ${error2.message}`);
        return;
      }

      // Step 3: Move player to final position
      const { error: error3 } = await supabase
        .from('match_players')
        .update({ play_order: index + 1 })
        .eq('match_id', matchId)
        .eq('player_id', player.id);

      if (error3) {
        alert(`Failed to reorder player: ${error3.message}`);
        return;
      }

      // Step 4: Update current leg's starting_player_id to maintain correct order
      // After swap, determine who should be first (if swapping position 0 and 1)
      if (currentLeg) {
        let newStartingPlayerId = currentLeg.starting_player_id;

        // If we're moving the first player down, the next player becomes first
        if (index === 0) {
          newStartingPlayerId = nextPlayer.id;
        }

        const { error: legError } = await supabase
          .from('legs')
          .update({ starting_player_id: newStartingPlayerId })
          .eq('id', currentLeg.id);

        if (legError) {
          alert(`Failed to update leg starting player: ${legError.message}`);
          return;
        }
      }

      await loadAll();
    },
    [players, matchId, currentLeg, loadAll, canReorderPlayers]
  );

  const startRematch = useCallback(async () => {
    if (!match) return;
    try {
      setRematchLoading(true);
      const supabase = await getSupabaseClient();
      // Load players from DB to avoid race conditions
      const { data: mpData, error: mpLoadErr } = await supabase
        .from('match_players')
        .select('player_id, play_order')
        .eq('match_id', matchId)
        .order('play_order');
      if (mpLoadErr) {
        alert(mpLoadErr.message);
        setRematchLoading(false);
        return;
      }
      const playerIds = ((mpData ?? []) as { player_id: string; play_order: number }[]).map((r) => r.player_id);
      if (playerIds.length < 2) {
        alert('Need at least 2 players to start a rematch');
        setRematchLoading(false);
        return;
      }
      const winnerId = matchWinnerId ?? null;
      const eligibleStarters = winnerId ? playerIds.filter((id) => id !== winnerId) : [...playerIds];
      const starter =
        eligibleStarters.length > 0
          ? eligibleStarters[Math.floor(Math.random() * eligibleStarters.length)]
          : playerIds[0];
      const remaining = playerIds.filter((id) => id !== starter);
      const order = [starter, ...remaining.sort(() => Math.random() - 0.5)];
      const { data: newMatch, error: mErr } = await supabase
        .from('matches')
        .insert({ mode: 'x01', start_score: match.start_score, finish: match.finish, legs_to_win: match.legs_to_win })
        .select('*')
        .single();
      if (mErr || !newMatch) {
        alert(mErr?.message ?? 'Failed to create rematch');
        setRematchLoading(false);
        return;
      }
      const mp = order.map((id, idx) => ({ match_id: (newMatch as MatchRecord).id, player_id: id, play_order: idx }));
      const { error: mpErr } = await supabase.from('match_players').insert(mp);
      if (mpErr) {
        alert(mpErr.message);
        setRematchLoading(false);
        return;
      }
      const { error: lErr } = await supabase
        .from('legs')
        .insert({ match_id: (newMatch as MatchRecord).id, leg_number: 1, starting_player_id: order[0] });
      if (lErr) {
        alert(lErr.message);
        setRematchLoading(false);
        return;
      }
      if (broadcastRematch) {
        await broadcastRematch((newMatch as MatchRecord).id);
      }
      // Redirect to new match page
      routerPush(`/match/${(newMatch as MatchRecord).id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error creating rematch';
      alert(msg);
    } finally {
      setRematchLoading(false);
    }
  }, [match, matchId, routerPush, matchWinnerId, broadcastRematch]);

  const endGameEarly = useCallback(async () => {
    if (!match) return;
    try {
      setEndGameLoading(true);
      const supabase = await getSupabaseClient();

      // Mark the match as ended early
      const { error } = await supabase.from('matches').update({ ended_early: true }).eq('id', matchId);

      if (error) {
        alert(`Failed to end game early: ${error.message}`);
        return;
      }

      // Close the dialog and reload the match data
      setEndGameDialogOpen(false);
      await loadAll();

      // Redirect to home page
      routerPush('/');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error ending game';
      alert(msg);
    } finally {
      setEndGameLoading(false);
    }
  }, [match, matchId, loadAll, routerPush]);

  return {
    editOpen,
    setEditOpen,
    editingThrows,
    selectedThrowId,
    setSelectedThrowId,
    editPlayersOpen,
    setEditPlayersOpen,
    availablePlayers,
    newPlayerName,
    setNewPlayerName,
    endGameDialogOpen,
    setEndGameDialogOpen,
    endGameLoading,
    rematchLoading,
    handleBoardClick,
    undoLastThrow,
    openEditModal,
    updateSelectedThrow,
    openEditPlayersModal,
    addNewPlayer,
    addPlayerToMatch,
    removePlayerFromMatch,
    movePlayerUp,
    movePlayerDown,
    startRematch,
    endGameEarly,
  };
}
