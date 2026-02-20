"use client";

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });
import { getSupabaseClient } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EloLeaderboard } from '@/components/EloLeaderboard';
import { PlayerEloStats } from '@/components/PlayerEloStats';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';

type PlayerRow = { id: string; display_name: string };
type SummaryRow = { player_id: string; display_name: string; wins: number; avg_per_turn: number };
type LegRow = { id: string; match_id: string; leg_number: number; created_at: string; winner_player_id: string | null };
type TurnRow = { id: string; leg_id: string; player_id: string; total_scored: number; busted: boolean; turn_number: number; created_at: string };
type ThrowRow = { id: string; turn_id: string; dart_index: number; segment: string; scored: number };
type MatchRow = { id: string; created_at: string; winner_player_id: string | null; ended_early?: boolean; start_score: string };
type PlayerSegmentRow = { player_id: string; display_name: string; segment: string; total_hits: number; total_score: number; avg_score: number; segment_number: number | null };
type PlayerAccuracyRow = { player_id: string; display_name: string; doubles_attempted: number; doubles_hit: number; doubles_accuracy: number; trebles_attempted: number; trebles_hit: number; trebles_accuracy: number; total_throws: number };
type PlayerAdjacencyRow = { player_id: string; display_name: string; hits_20: number; hits_1: number; hits_5: number; hits_20_area: number; hits_19: number; hits_3: number; hits_7: number; hits_19_area: number; total_throws: number; accuracy_20_in_area: number; accuracy_19_in_area: number };

export default function StatsPage() {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [legs, setLegs] = useState<LegRow[]>([]);
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [throws, setThrows] = useState<ThrowRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [playerSegments, setPlayerSegments] = useState<PlayerSegmentRow[]>([]);
  const [, setPlayerAccuracy] = useState<PlayerAccuracyRow[]>([]);
  const [playerAdjacency, setPlayerAdjacency] = useState<PlayerAdjacencyRow[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [globalStats, setGlobalStats] = useState({ turns: 0, throws: 0 });
  const [activeView, setActiveView] = useState<'traditional' | 'elo'>('traditional');
  const [warningDismissed, setWarningDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const supabase = await getSupabaseClient();
        
        // Load basic data and global counts in parallel
        const [
          { data: s }, 
          { data: p }, 
          { data: l }, 
          { data: m },
          { count: turnsCount },
          { count: throwsCount },
          { data: segmentData },
          { data: accuracyData },
          { data: adjacencyData }
        ] = await Promise.all([
          supabase
            .from('player_summary')
            .select('*')
            .order('wins', { ascending: false }),
          supabase
            .from('players')
            .select('id, display_name')
            .eq('is_active', true)
            .order('display_name'),
          supabase
            .from('legs')
            .select('*, matches!inner(ended_early)')
            .eq('matches.ended_early', false)
            .order('created_at')
            .limit(100000),
          supabase
            .from('matches')
            .select('id, created_at, winner_player_id, start_score')
            .eq('ended_early', false)
            .order('created_at')
            .limit(100000),
          supabase
            .from('turns')
            .select('legs!inner(matches!inner(ended_early))', { count: 'exact', head: true })
            .eq('legs.matches.ended_early', false),
          supabase
            .from('throws')
            .select('turns!inner(legs!inner(matches!inner(ended_early)))', { count: 'exact', head: true })
            .eq('turns.legs.matches.ended_early', false),
          supabase.from('player_segment_summary').select('*').limit(100000),
          supabase.from('player_accuracy_stats').select('*').limit(100000),
          supabase.from('player_adjacency_stats').select('*').limit(100000)
        ]);
        
        setSummary(((s as unknown) as SummaryRow[]) ?? []);
        const pl = ((p as unknown) as PlayerRow[]) ?? [];
        setPlayers(pl);
        const lg = ((l as unknown) as LegRow[]) ?? [];
        setLegs(lg);
        const mt = ((m as unknown) as MatchRow[]) ?? [];
        setMatches(mt);
        setGlobalStats({ turns: turnsCount ?? 0, throws: throwsCount ?? 0 });
        
        setPlayerSegments(((segmentData as unknown) as PlayerSegmentRow[]) ?? []);
        setPlayerAccuracy(((accuracyData as unknown) as PlayerAccuracyRow[]) ?? []);
        setPlayerAdjacency(((adjacencyData as unknown) as PlayerAdjacencyRow[]) ?? []);
        
      } catch (error) {
        console.error('Error loading stats:', error);
        setSummary([]);
        setPlayers([]);
        setLegs([]);
        setMatches([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Lazy load player details when selected
  useEffect(() => {
    setWarningDismissed(false); // Reset warning when player changes

    if (!selectedPlayer) {
      setTurns([]);
      setThrows([]);
      return;
    }

    (async () => {
      try {
        setPlayerLoading(true);
        const supabase = await getSupabaseClient();

        // Fetch turns for selected player
        const { data: t } = await supabase
          .from('turns')
          .select('id, leg_id, player_id, total_scored, busted, turn_number, created_at, legs!inner(matches!inner(ended_early))')
          .eq('player_id', selectedPlayer)
          .eq('legs.matches.ended_early', false)
          .order('created_at')
          .limit(100000);
        
        const playerTurns = ((t as unknown) as TurnRow[]) ?? [];
        setTurns(playerTurns);

        if (playerTurns.length > 0) {
          // Fetch throws for these turns in parallel batches
          const turnIds = playerTurns.map(turn => turn.id);
          const batchSize = 200;
          const batches: string[][] = [];
          for (let i = 0; i < turnIds.length; i += batchSize) {
            batches.push(turnIds.slice(i, i + batchSize));
          }

          const batchResults = await Promise.all(
            batches.map((batch) =>
              supabase
                .from('throws')
                .select('id, turn_id, dart_index, segment, scored')
                .in('turn_id', batch)
            )
          );

          const allThrows: ThrowRow[] = batchResults.flatMap(
            ({ data }) => ((data as unknown) as ThrowRow[]) ?? []
          );
          setThrows(allThrows);
        } else {
          setThrows([]);
        }

      } catch (error) {
        console.error('Error loading player details:', error);
        setTurns([]);
        setThrows([]);
      } finally {
        setPlayerLoading(false);
      }
    })();
  }, [selectedPlayer]);

  // Overall statistics
  const overallStats = useMemo(() => {
    const totalMatches = matches.length;
    const totalLegs = legs.length;
    const totalTurns = globalStats.turns;
    const totalThrows = globalStats.throws;
    const completedMatches = matches.filter(m => m.winner_player_id).length;
    const avgTurnsPerLeg = legs.length > 0 ? Math.round((totalTurns / legs.length) * 10) / 10 : 0;
    const avgThrowsPerTurn = totalTurns > 0 ? Math.round((totalThrows / totalTurns) * 10) / 10 : 0;
    
    return {
      totalMatches,
      totalLegs,
      totalTurns,
      totalThrows,
      completedMatches,
      avgTurnsPerLeg,
      avgThrowsPerTurn
    };
  }, [matches, legs, globalStats]);

  // Data limit warning detection
  const dataLimitWarnings = useMemo(() => {
    const THRESHOLD = 95000; // 95% of 100000 limit

    const legsWarning = legs.length >= THRESHOLD;
    const matchesWarning = matches.length >= THRESHOLD;
    const turnsWarning = selectedPlayer ? turns.length >= THRESHOLD : false;

    return {
      anyWarning: legsWarning || matchesWarning || turnsWarning,
      message: [
        legsWarning && 'leg data',
        matchesWarning && 'match data',
        turnsWarning && 'player turn data'
      ].filter(Boolean).join(', ')
    };
  }, [legs.length, matches.length, turns.length, selectedPlayer]);

  // Top players by average score (desc)
  const topAvgPlayers = useMemo(() => {
    return [...summary]
      .sort((a, b) => b.avg_per_turn - a.avg_per_turn)
      .slice(0, 8);
  }, [summary]);

  // Player-specific data
  const selectedPlayerData = useMemo(() => {
    if (!selectedPlayer) return null;
    
    const playerTurns = turns.filter(t => t.player_id === selectedPlayer);
    const playerThrows = throws.filter(th => 
      playerTurns.some(t => t.id === th.turn_id)
    );
    
    // Calculate stats
    const totalScore = playerTurns.reduce((sum, t) => sum + (t.busted ? 0 : t.total_scored), 0);
    const validTurns = playerTurns.filter(t => !t.busted);
    const avgScore = validTurns.length > 0 ? Math.round((totalScore / validTurns.length) * 100) / 100 : 0;
    const legsWon = legs.filter(l => l.winner_player_id === selectedPlayer).length;
    const matchesWon = matches.filter(m => m.winner_player_id === selectedPlayer).length;
    
    // Calculate total games and legs played
    const playerLegs = legs.filter(l => 
      playerTurns.some(t => t.leg_id === l.id)
    );
    const legsPlayed = playerLegs.length;
    
    const playerMatches = matches.filter(m => 
      playerLegs.some(l => l.match_id === m.id)
    );
    const gamesPlayed = playerMatches.length;
    
    // Calculate win rates
    const gameWinRate = gamesPlayed > 0 ? Math.round((matchesWon / gamesPlayed) * 100) : 0;
    const legWinRate = legsPlayed > 0 ? Math.round((legsWon / legsPlayed) * 100) : 0;
    
    // Top 3 highest rounds
    const topRounds = playerTurns
      .filter(t => !t.busted)
      .sort((a, b) => b.total_scored - a.total_scored)
      .slice(0, 3);

    // Calculate checkout statistics
    const finishingLegs = playerLegs.filter(l => l.winner_player_id === selectedPlayer);
    const checkoutAttempts = playerTurns.filter(t => {
      // Find the leg and match for this turn
      const leg = legs.find(l => l.id === t.leg_id);
      if (!leg) return false;
      const match = matches.find(m => m.id === leg.match_id);
      if (!match) return false;
      
      // Calculate remaining score before this turn
      const legTurns = turns.filter(turn => turn.leg_id === t.leg_id && turn.player_id === t.player_id);
      const turnsBeforeThis = legTurns.filter(turn => turn.turn_number < t.turn_number);
      const scoreBefore = parseInt(match.start_score) - turnsBeforeThis.reduce((sum, turn) => sum + (turn.busted ? 0 : turn.total_scored), 0);
      
      // This is a checkout attempt if remaining score was <= 170 and > 0
      return scoreBefore <= 170 && scoreBefore > 0;
    });
    
    const successfulCheckouts = finishingLegs.length;
    const checkoutRate = checkoutAttempts.length > 0 ? Math.round((successfulCheckouts / checkoutAttempts.length) * 100) : 0;

    // Calculate highest checkout and checkout breakdown
    const checkoutTurns = finishingLegs.map(leg => {
      const legTurns = playerTurns.filter(t => t.leg_id === leg.id);
      // Sort by turn number to find the last one
      const sortedTurns = legTurns.sort((a, b) => a.turn_number - b.turn_number);
      return sortedTurns[sortedTurns.length - 1];
    }).filter(t => t && !t.busted);

    const highestCheckoutTurn = checkoutTurns.sort((a, b) => b.total_scored - a.total_scored)[0];
    const highestCheckout = highestCheckoutTurn ? highestCheckoutTurn.total_scored : 0;
    const highestCheckoutDarts = highestCheckoutTurn 
      ? playerThrows.filter(th => th.turn_id === highestCheckoutTurn.id).length 
      : 0;

    const checkoutCounts = {
      1: 0,
      2: 0,
      3: 0
    };

    checkoutTurns.forEach(turn => {
      const turnThrows = playerThrows.filter(th => th.turn_id === turn.id);
      const dartCount = turnThrows.length;
      if (dartCount >= 1 && dartCount <= 3) {
        checkoutCounts[dartCount as 1 | 2 | 3]++;
      }
    });

    const totalCheckouts = checkoutTurns.length;
    const checkoutBreakdown = {
      1: totalCheckouts > 0 ? Math.round((checkoutCounts[1] / totalCheckouts) * 100) : 0,
      2: totalCheckouts > 0 ? Math.round((checkoutCounts[2] / totalCheckouts) * 100) : 0,
      3: totalCheckouts > 0 ? Math.round((checkoutCounts[3] / totalCheckouts) * 100) : 0
    };

    // Calculate specific 20 and 19 target analysis
    const throws20Area = playerThrows.filter(th => ['20', 'S20', 'D20', 'T20', '1', 'S1', '5', 'S5'].includes(th.segment));
    const throws19Area = playerThrows.filter(th => ['19', 'S19', 'D19', 'T19', '3', 'S3', '7', 'S7'].includes(th.segment));
    
    // 20 analysis - check multiple segment formats
    const hits20Single = playerThrows.filter(th => th.segment === '20' || th.segment === 'S20').length;
    const hits20Double = playerThrows.filter(th => th.segment === 'D20').length;
    const hits20Triple = playerThrows.filter(th => th.segment === 'T20').length;
    const hits20Total = hits20Single + hits20Double + hits20Triple;
    const misses20Left = playerThrows.filter(th => th.segment === '5' || th.segment === 'S5').length; // Left of 20 (5 is left)
    const misses20Right = playerThrows.filter(th => th.segment === '1' || th.segment === 'S1').length; // Right of 20 (1 is right)
    
    // 19 analysis - check multiple segment formats  
    const hits19Single = playerThrows.filter(th => th.segment === '19' || th.segment === 'S19').length;
    const hits19Double = playerThrows.filter(th => th.segment === 'D19').length;
    const hits19Triple = playerThrows.filter(th => th.segment === 'T19').length;
    const hits19Total = hits19Single + hits19Double + hits19Triple;
    const misses19Left = playerThrows.filter(th => th.segment === '7' || th.segment === 'S7').length; // Left of 19 (7 is left)
    const misses19Right = playerThrows.filter(th => th.segment === '3' || th.segment === 'S3').length; // Right of 19 (3 is right)
    
    // Calculate percentages for 20
    const total20Attempts = throws20Area.length;
    const rate20Double = total20Attempts > 0 ? Math.round((hits20Double / total20Attempts) * 100) : 0;
    const rate20Triple = total20Attempts > 0 ? Math.round((hits20Triple / total20Attempts) * 100) : 0;
    const rate20Single = total20Attempts > 0 ? Math.round((hits20Single / total20Attempts) * 100) : 0;
    
    // Calculate percentages for 19
    const total19Attempts = throws19Area.length;
    const rate19Double = total19Attempts > 0 ? Math.round((hits19Double / total19Attempts) * 100) : 0;
    const rate19Triple = total19Attempts > 0 ? Math.round((hits19Triple / total19Attempts) * 100) : 0;
    const rate19Single = total19Attempts > 0 ? Math.round((hits19Single / total19Attempts) * 100) : 0;

    // Score distribution
    const scoreDistribution = playerTurns.reduce((acc, turn) => {
      if (!turn.busted) {
        const score = turn.total_scored;
        const bucket = Math.floor(score / 20) * 20; // Group in 20-point buckets
        acc[bucket] = (acc[bucket] || 0) + 1;
      }
      return acc;
    }, {} as Record<number, number>);

    return {
      totalTurns: playerTurns.length,
      totalThrows: playerThrows.length,
      avgScore,
      legsWon,
      matchesWon,
      gamesPlayed,
      legsPlayed,
      gameWinRate,
      legWinRate,
      topRounds,
      throws: playerThrows,
      turns: playerTurns,
      checkoutRate,
      highestCheckout,
      highestCheckoutDarts,
      checkoutCounts,
      checkoutBreakdown,
      scoreDistribution,
      // 20 target analysis
      hits20Single,
      hits20Double, 
      hits20Triple,
      hits20Total,
      misses20Left,
      misses20Right,
      total20Attempts,
      rate20Double,
      rate20Triple,
      rate20Single,
      // 19 target analysis
      hits19Single,
      hits19Double,
      hits19Triple, 
      hits19Total,
      misses19Left,
      misses19Right,
      total19Attempts,
      rate19Double,
      rate19Triple,
      rate19Single
    };
  }, [selectedPlayer, turns, throws, legs, matches]);

  // Hit distribution data for selected player
  const hitDistribution = useMemo(() => {
    if (!selectedPlayer) return { categories: [], data: [] };
    
    // Try to use optimized segment data first
    const playerSegmentData = playerSegments.filter(ps => ps.player_id === selectedPlayer);
    
    if (playerSegmentData.length > 0) {
      const sorted = playerSegmentData
        .filter(ps => ps.segment !== 'MISS' && ps.segment !== 'Miss')
        .sort((a, b) => b.total_hits - a.total_hits)
        .slice(0, 15);
        
      return {
        categories: sorted.map(ps => ps.segment),
        data: sorted.map(ps => ps.total_hits)
      };
    }
    
    // Fallback to legacy calculation if optimized data not available
    if (!selectedPlayerData?.throws.length) return { categories: [], data: [] };
    
    const segmentCounts = selectedPlayerData.throws.reduce((acc, th) => {
      if (th.segment && th.segment !== 'MISS' && th.segment !== 'Miss') {
        acc[th.segment] = (acc[th.segment] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const sorted = Object.entries(segmentCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15);
    
    return {
      categories: sorted.map(([segment]) => segment),
      data: sorted.map(([,count]) => count)
    };
  }, [selectedPlayer, playerSegments, selectedPlayerData]);

  // Score distribution chart data
  const scoreDistributionData = useMemo(() => {
    if (!selectedPlayerData?.scoreDistribution) return { categories: [], data: [] };
    
    const buckets = Object.entries(selectedPlayerData.scoreDistribution)
      .sort(([a], [b]) => parseInt(a) - parseInt(b));
    
    return {
      categories: buckets.map(([bucket]) => `${bucket}-${parseInt(bucket) + 19}`),
      data: buckets.map(([,count]) => count)
    };
  }, [selectedPlayerData]);

  // Treble/Double rate by number (1–20)
  const trebleDoubleByNumberData = useMemo(() => {
    if (!selectedPlayer) return { categories: [], doubleRates: [], trebleRates: [] };

    // Prefer aggregated table if available
    const segmentRows = playerSegments.filter(ps => ps.player_id === selectedPlayer);

    const numbers = Array.from({ length: 20 }, (_, i) => i + 1);
    const categories: string[] = [];
    const doubleRates: number[] = [];
    const trebleRates: number[] = [];

    const addRates = (n: number, singles: number, doubles: number, trebles: number) => {
      const total = singles + doubles + trebles;
      if (total <= 0) return; // Skip numbers without attempts
      categories.push(String(n));
      doubleRates.push(Math.round((doubles / total) * 100));
      trebleRates.push(Math.round((trebles / total) * 100));
    };

    if (segmentRows.length > 0) {
      for (const n of numbers) {
        const singles = segmentRows
          .filter(r => r.segment === String(n) || r.segment === `S${n}`)
          .reduce((s, r) => s + r.total_hits, 0);
        const doubles = segmentRows
          .filter(r => r.segment === `D${n}`)
          .reduce((s, r) => s + r.total_hits, 0);
        const trebles = segmentRows
          .filter(r => r.segment === `T${n}`)
          .reduce((s, r) => s + r.total_hits, 0);
        addRates(n, singles, doubles, trebles);
      }
      return { categories, doubleRates, trebleRates };
    }

    // Fallback: compute from raw throws
    if (!selectedPlayerData?.throws.length) return { categories: [], doubleRates: [], trebleRates: [] };
    for (const n of numbers) {
      const singles = selectedPlayerData.throws.filter(th => th.segment === String(n) || th.segment === `S${n}`).length;
      const doubles = selectedPlayerData.throws.filter(th => th.segment === `D${n}`).length;
      const trebles = selectedPlayerData.throws.filter(th => th.segment === `T${n}`).length;
      addRates(n, singles, doubles, trebles);
    }
    return { categories, doubleRates, trebleRates };
  }, [selectedPlayer, playerSegments, selectedPlayerData]);

  // Ton bands over time (daily counts of 60–79, 80–99, 100–139, 140–179, 180)
  const tonBandsOverTimeData = useMemo(() => {
    if (!selectedPlayerData) return { categories: [], series: [] };

    const validTurns = selectedPlayerData.turns.filter(t => !t.busted);
    if (!validTurns.length) return { categories: [], series: [] };

    // Group by day YYYY-MM-DD
    const dayMap = new Map<string, { b60: number; b80: number; b100: number; b140: number; b180: number }>();
    for (const t of validTurns) {
      const day = new Date(t.created_at).toISOString().slice(0, 10);
      if (!dayMap.has(day)) dayMap.set(day, { b60: 0, b80: 0, b100: 0, b140: 0, b180: 0 });
      const bucket = dayMap.get(day)!;
      const score = t.total_scored;
      if (score >= 180) bucket.b180 += 1;
      else if (score >= 140) bucket.b140 += 1;
      else if (score >= 100) bucket.b100 += 1;
      else if (score >= 80) bucket.b80 += 1;
      else if (score >= 60) bucket.b60 += 1;
    }

    const categories = Array.from(dayMap.keys()).sort();
    const b60 = categories.map(d => dayMap.get(d)!.b60);
    const b80 = categories.map(d => dayMap.get(d)!.b80);
    const b100 = categories.map(d => dayMap.get(d)!.b100);
    const b140 = categories.map(d => dayMap.get(d)!.b140);
    const b180 = categories.map(d => dayMap.get(d)!.b180);

    return {
      categories,
      series: [
        { name: '60–79', data: b60, color: '#93c5fd' },
        { name: '80–99', data: b80, color: '#60a5fa' },
        { name: '100–139', data: b100, color: '#3b82f6' },
        { name: '140–179', data: b140, color: '#2563eb' },
        { name: '180', data: b180, color: '#1d4ed8' },
      ]
    };
  }, [selectedPlayerData]);

  // Average score trends (daily and cumulative averages per played day)
  const avgScoreTrend = useMemo(() => {
    if (!selectedPlayerData) return { categories: [] as string[], cumulative: [] as number[], daily: [] as number[], rolling: [] as number[] };

    const validTurns = selectedPlayerData.turns
      .filter(t => !t.busted)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const byDay = new Map<string, { sum: number; count: number }>();
    for (const turn of validTurns) {
      const day = new Date(turn.created_at).toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { sum: 0, count: 0 };
      entry.sum += turn.total_scored;
      entry.count += 1;
      byDay.set(day, entry);
    }

    const days = Array.from(byDay.keys()).sort();
    const cumulative: number[] = [];
    const daily: number[] = [];

    let cumSum = 0;
    let cumCount = 0;
    for (const day of days) {
      const { sum, count } = byDay.get(day)!;
      cumSum += sum;
      cumCount += count;
      const cumulativeAvg = Math.round((cumSum / cumCount) * 100) / 100;
      const dailyAvg = Math.round((sum / count) * 100) / 100;
      cumulative.push(cumulativeAvg);
      daily.push(dailyAvg);
    }

    const rolling: number[] = [];
    for (let i = 0; i < daily.length; i++) {
      const start = Math.max(0, i - 6);
      const window = daily.slice(start, i + 1);
      const windowAvg = window.reduce((acc, val) => acc + val, 0) / window.length;
      rolling.push(Math.round(windowAvg * 100) / 100);
    }

    return { categories: days, cumulative, daily, rolling };
  }, [selectedPlayerData]);

  const firstNineTrend = useMemo(() => {
    if (!selectedPlayerData) return { categories: [] as string[], daily: [] as number[], rolling: [] as number[] };

    const throwsByTurn = new Map<string, number>();
    for (const thr of selectedPlayerData.throws) {
      if (!thr.turn_id) continue;
      throwsByTurn.set(thr.turn_id, (throwsByTurn.get(thr.turn_id) ?? 0) + 1);
    }

    const turnsByLeg = new Map<string, (typeof selectedPlayerData.turns)[number][]>();
    for (const turn of selectedPlayerData.turns) {
      if (!turnsByLeg.has(turn.leg_id)) turnsByLeg.set(turn.leg_id, []);
      turnsByLeg.get(turn.leg_id)!.push(turn);
    }

    const dayMap = new Map<string, { sum: number; count: number }>();
    for (const legTurns of turnsByLeg.values()) {
      const sorted = [...legTurns].sort((a, b) => a.turn_number - b.turn_number);
      const firstVisits = sorted.slice(0, 3);
      if (!firstVisits.length) continue;

      let totalPoints = 0;
      let totalDarts = 0;
      let day: string | null = null;

      for (const turn of firstVisits) {
        const throwsInTurn = throwsByTurn.get(turn.id) ?? 3;
        totalDarts += throwsInTurn;
        totalPoints += turn.busted ? 0 : turn.total_scored;
        if (!day) {
          const ts = (turn as { created_at?: string }).created_at;
          if (ts) day = new Date(ts).toISOString().slice(0, 10);
        }
      }

      if (!day || totalDarts === 0) continue;
      const firstNineAvg = Math.round(((totalPoints / totalDarts) * 3) * 100) / 100;
      const entry = dayMap.get(day) ?? { sum: 0, count: 0 };
      entry.sum += firstNineAvg;
      entry.count += 1;
      dayMap.set(day, entry);
    }

    const entries = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const categories = entries.map(([day]) => day);
    const daily = entries.map(([, stats]) => Math.round((stats.sum / stats.count) * 100) / 100);

    const rolling: number[] = [];
    for (let i = 0; i < daily.length; i++) {
      const start = Math.max(0, i - 6);
      const window = daily.slice(start, i + 1);
      const windowAvg = window.reduce((acc, val) => acc + val, 0) / window.length;
      rolling.push(Math.round(windowAvg * 100) / 100);
    }

    return { categories, daily, rolling };
  }, [selectedPlayerData]);

  const accuracy20Trend = useMemo(() => {
    if (!selectedPlayerData) {
      return {
        categories: [] as string[],
        hitPct: [] as number[],
        missLeftPct: [] as number[],
        missRightPct: [] as number[],
        rollingHitPct: [] as number[],
      };
    }

    const turnById = new Map<string, (typeof selectedPlayerData.turns)[number]>();
    for (const turn of selectedPlayerData.turns) {
      turnById.set(turn.id, turn);
    }

    const dayStats = new Map<string, { hits: number; missLeft: number; missRight: number }>();
    for (const thr of selectedPlayerData.throws) {
      const segment = thr.segment;
      if (!segment) continue;

      let bucket: 'hit' | 'left' | 'right' | null = null;
      if (segment === '20' || segment === 'S20' || segment === 'D20' || segment === 'T20') bucket = 'hit';
      else if (segment === '5' || segment === 'S5') bucket = 'left';
      else if (segment === '1' || segment === 'S1') bucket = 'right';
      else continue;

      const createdAt =
        (thr as { created_at?: string }).created_at ??
        turnById.get(thr.turn_id)?.created_at;
      if (!createdAt) continue;
      const day = new Date(createdAt).toISOString().slice(0, 10);

      const entry = dayStats.get(day) ?? { hits: 0, missLeft: 0, missRight: 0 };
      if (bucket === 'hit') entry.hits += 1;
      if (bucket === 'left') entry.missLeft += 1;
      if (bucket === 'right') entry.missRight += 1;
      dayStats.set(day, entry);
    }

    const entries = Array.from(dayStats.entries())
      .filter(([, stats]) => stats.hits + stats.missLeft + stats.missRight > 0)
      .sort((a, b) => a[0].localeCompare(b[0]));

    const categories = entries.map(([day]) => day);
    const hitPct: number[] = [];
    const missLeftPct: number[] = [];
    const missRightPct: number[] = [];

    for (const [, stats] of entries) {
      const total = stats.hits + stats.missLeft + stats.missRight;
      const toPct = (value: number) => Math.round((value / total) * 1000) / 10;
      hitPct.push(toPct(stats.hits));
      missLeftPct.push(toPct(stats.missLeft));
      missRightPct.push(toPct(stats.missRight));
    }

    const rollingHitPct: number[] = [];
    for (let i = 0; i < hitPct.length; i++) {
      const start = Math.max(0, i - 6);
      const window = hitPct.slice(start, i + 1);
      const average = window.reduce((acc, val) => acc + val, 0) / window.length;
      rollingHitPct.push(Math.round(average * 10) / 10);
    }

    return { categories, hitPct, missLeftPct, missRightPct, rollingHitPct };
  }, [selectedPlayerData]);

  // Bounds for y-axis (padding ±2 around min/max)
  const {
    categories: avgScoreCategories,
    cumulative: avgScoreSeriesData,
    daily: avgDailyScoreSeriesData,
    rolling: avgRollingScoreSeriesData = [],
  } = avgScoreTrend;

  const avgScoreYBounds = useMemo(() => {
    const values = [
      ...avgScoreSeriesData,
      ...avgDailyScoreSeriesData,
      ...avgRollingScoreSeriesData,
    ].filter((v) => typeof v === 'number');
    if (!values.length) return { min: 0, max: 0 };
    const ys = values.map(Number);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      min: Math.floor((minY - 2) * 10) / 10,
      max: Math.ceil((maxY + 2) * 10) / 10,
    };
  }, [avgScoreSeriesData, avgDailyScoreSeriesData, avgRollingScoreSeriesData]);

  const {
    categories: firstNineCategories,
    daily: firstNineDailySeries,
    rolling: firstNineRollingSeries,
  } = firstNineTrend;

  const firstNineYBounds = useMemo(() => {
    const values = [...firstNineDailySeries, ...firstNineRollingSeries];
    if (!values.length) return { min: 0, max: 0 };
    const minY = Math.min(...values);
    const maxY = Math.max(...values);
    return {
      min: Math.floor((minY - 2) * 10) / 10,
      max: Math.ceil((maxY + 2) * 10) / 10,
    };
  }, [firstNineDailySeries, firstNineRollingSeries]);

  const {
    categories: accuracy20Categories,
    hitPct: accuracy20HitPct,
    missLeftPct: accuracy20MissLeftPct,
    missRightPct: accuracy20MissRightPct,
    rollingHitPct: accuracy20RollingHitPct,
  } = accuracy20Trend;

  const accuracy20YBounds = useMemo(() => {
    const values = [
      ...accuracy20HitPct,
      ...accuracy20MissLeftPct,
      ...accuracy20MissRightPct,
      ...accuracy20RollingHitPct,
    ];
    if (!values.length) return { min: 0, max: 100 };
    const minY = Math.min(...values, 0);
    const maxY = Math.max(...values, 100);
    return {
      min: Math.floor((minY - 5) / 5) * 5,
      max: Math.ceil((maxY + 5) / 5) * 5,
    };
  }, [accuracy20HitPct, accuracy20MissLeftPct, accuracy20MissRightPct, accuracy20RollingHitPct]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg">Loading statistics...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Statistics Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive dart game analytics and performance insights</p>
        </div>
        
        {/* View Toggle */}
        <div className="flex gap-2">
          <Button
            variant={activeView === 'traditional' ? 'default' : 'outline'}
            onClick={() => setActiveView('traditional')}
          >
            📊 Performance Stats
          </Button>
          <Button
            variant={activeView === 'elo' ? 'default' : 'outline'}
            onClick={() => setActiveView('elo')}
          >
            🏆 Elo Rankings
          </Button>
          <Button asChild variant="outline">
            <Link href="/elo-multi">👥 Multiplayer Elo</Link>
          </Button>
        </div>
      </div>

      {/* Elo View */}
      {activeView === 'elo' && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <EloLeaderboard limit={20} showRecentChanges={true} />
            </div>
            
            <div>
              {selectedPlayer ? (
                <PlayerEloStats 
                  player={players.find(p => p.id === selectedPlayer) || { id: selectedPlayer, display_name: 'Unknown' }} 
                  showHistory={true}
                />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Player Elo Stats</CardTitle>
                    <CardDescription>Select a player below to view their Elo rating and history</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a player..." />
                      </SelectTrigger>
                      <SelectContent>
                        {players.map(player => (
                          <SelectItem key={player.id} value={player.id}>
                            {player.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Performance Stats View */}
      {activeView === 'traditional' && (
        <div className="space-y-6">
          {/* Data Limit Warning Banner */}
          {!warningDismissed && dataLimitWarnings.anyWarning && (
            <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="flex-1 space-y-1">
                  <div className="font-semibold text-yellow-900 dark:text-yellow-100 flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    Data Limit Warning
                  </div>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Your {dataLimitWarnings.message} is approaching the query limit (95,000+ rows).
                    Some statistics may be incomplete. Consider archiving old matches or filtering data by date range.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWarningDismissed(true)}
                  className="text-yellow-900 dark:text-yellow-100 hover:bg-yellow-100 dark:hover:bg-yellow-800/30"
                >
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Overall Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Matches</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.totalMatches}</div>
                <p className="text-xs text-muted-foreground">
                  {overallStats.completedMatches} completed
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Legs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.totalLegs}</div>
                <p className="text-xs text-muted-foreground">
                  ~{overallStats.avgTurnsPerLeg} turns/leg
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Turns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.totalTurns}</div>
                <p className="text-xs text-muted-foreground">
                  ~{overallStats.avgThrowsPerTurn} throws/turn
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Throws</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.totalThrows}</div>
                <p className="text-xs text-muted-foreground">darts thrown</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active Players</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{players.length}</div>
                <p className="text-xs text-muted-foreground">registered</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary.length > 0 ? Math.round(summary.reduce((sum, p) => sum + p.avg_per_turn, 0) / summary.length) : 0}
                </div>
                <p className="text-xs text-muted-foreground">per turn</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Games/Day</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(() => {
                    if (!matches.length) return 0;
                    const firstMatch = new Date(matches[0].created_at);
                    const lastMatch = new Date(matches[matches.length - 1].created_at);
                    const daysDiff = Math.max(1, Math.ceil((lastMatch.getTime() - firstMatch.getTime()) / (1000 * 60 * 60 * 24)));
                    return Math.round((matches.length / daysDiff) * 10) / 10;
                  })()}
                </div>
                <p className="text-xs text-muted-foreground">average</p>
              </CardContent>
            </Card>
          </div>

          {/* Player Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Player Deep Dive</CardTitle>
              <CardDescription>Select a player to view comprehensive statistics, visualizations, and performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
                <SelectTrigger className="w-full md:w-[300px]">
                  <SelectValue placeholder="Choose a player to analyze..." />
                </SelectTrigger>
                <SelectContent>
                  {players.map(player => (
                    <SelectItem key={player.id} value={player.id}>
                      {player.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Player-Specific Content */}
          {selectedPlayer && selectedPlayerData && (
            <Tabs defaultValue="overview" className="space-y-6">
              {playerLoading && (
                <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center">
                  <div className="text-lg font-semibold animate-pulse">Loading player data...</div>
                </div>
              )}
              <TabsList className="grid w-full grid-cols-4 h-14 p-1 bg-muted border rounded-lg shadow-sm">
                <TabsTrigger value="overview" className="text-sm font-medium rounded-md px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:border data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 transition-all duration-200">Overview</TabsTrigger>
                <TabsTrigger value="performance" className="text-sm font-medium rounded-md px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:border data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 transition-all duration-200">Performance</TabsTrigger>
                <TabsTrigger value="accuracy" className="text-sm font-medium rounded-md px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:border data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 transition-all duration-200">Target Analysis</TabsTrigger>
                <TabsTrigger value="trends" className="text-sm font-medium rounded-md px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:border data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 transition-all duration-200">Trends</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Games Played</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{selectedPlayerData.gamesPlayed}</div>
                      <p className="text-xs text-muted-foreground">{selectedPlayerData.matchesWon} wins</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Legs Played</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{selectedPlayerData.legsPlayed}</div>
                      <p className="text-xs text-muted-foreground">{selectedPlayerData.legsWon} wins</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Game Win Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{selectedPlayerData.gameWinRate}%</div>
                      <p className="text-xs text-muted-foreground">match success</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Leg Win Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{selectedPlayerData.legWinRate}%</div>
                      <p className="text-xs text-muted-foreground">leg success</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{selectedPlayerData.avgScore}</div>
                      <p className="text-xs text-muted-foreground">per turn</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Turns</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{selectedPlayerData.totalTurns}</div>
                      <p className="text-xs text-muted-foreground">completed</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Throws</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{selectedPlayerData.totalThrows}</div>
                      <p className="text-xs text-muted-foreground">darts thrown</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Checkout Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{selectedPlayerData.checkoutRate}%</div>
                      <p className="text-xs text-muted-foreground">finish success</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Highest Checkout</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{selectedPlayerData.highestCheckout}</div>
                      <p className="text-xs text-muted-foreground">
                        {selectedPlayerData.highestCheckout > 0 
                          ? `${selectedPlayerData.highestCheckoutDarts} darts` 
                          : 'best finish'}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Checkout Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle>Checkout Breakdown</CardTitle>
                    <CardDescription>Percentage of checkouts by number of darts used</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-lg">
                        <div className="text-3xl font-bold text-green-600 dark:text-green-400">{selectedPlayerData.checkoutBreakdown[1]}%</div>
                        <div className="text-sm font-medium mt-1 text-green-900 dark:text-green-100">1 Dart Used</div>
                        <div className="text-xs text-green-700 dark:text-green-300/80">({selectedPlayerData.checkoutCounts[1]} times)</div>
                      </div>
                      <div className="bg-blue-100 dark:bg-blue-900/20 p-4 rounded-lg">
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{selectedPlayerData.checkoutBreakdown[2]}%</div>
                        <div className="text-sm font-medium mt-1 text-blue-900 dark:text-blue-100">2 Darts Used</div>
                        <div className="text-xs text-blue-700 dark:text-blue-300/80">({selectedPlayerData.checkoutCounts[2]} times)</div>
                      </div>
                      <div className="bg-purple-100 dark:bg-purple-900/20 p-4 rounded-lg">
                        <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{selectedPlayerData.checkoutBreakdown[3]}%</div>
                        <div className="text-sm font-medium mt-1 text-purple-900 dark:text-purple-100">3 Darts Used</div>
                        <div className="text-xs text-purple-700 dark:text-purple-300/80">({selectedPlayerData.checkoutCounts[3]} times)</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Top 3 Highest Rounds */}
                <Card>
                  <CardHeader>
                    <CardTitle>🏆 Top 3 Highest Rounds</CardTitle>
                    <CardDescription>Best single-turn performances</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      {selectedPlayerData.topRounds.map((turn, index) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        const colors = [
                          'bg-yellow-100 text-yellow-800 border-yellow-300',
                          'bg-gray-100 text-gray-800 border-gray-300', 
                          'bg-orange-100 text-orange-800 border-orange-300'
                        ];
                        
                        return (
                          <Badge 
                            key={turn.id} 
                            variant="outline" 
                            className={`text-lg py-2 px-4 ${colors[index]}`}
                          >
                            {medals[index]} {turn.total_scored}
                          </Badge>
                        );
                      })}
                      {selectedPlayerData.topRounds.length === 0 && (
                        <p className="text-muted-foreground">No valid rounds recorded</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Performance Tab */}
              <TabsContent value="performance" className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Score Distribution</CardTitle>
                      <CardDescription>Turn score frequency breakdown</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Chart options={{
                          title: { text: null },
                          chart: { type: 'column', height: 300 },
                          xAxis: {
                            categories: scoreDistributionData.categories,
                            title: { text: 'Score Range' }
                          },
                          yAxis: { 
                            title: { text: 'Frequency' },
                            min: 0
                          },
                          series: [{
                            name: 'Turns',
                            data: scoreDistributionData.data,
                            color: '#3b82f6'
                          }],
                          legend: { enabled: false },
                          plotOptions: {
                            column: {
                              borderRadius: 2,
                              dataLabels: {
                                enabled: true
                              }
                            }
                          }
                        }}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Most Hit Segments</CardTitle>
                      <CardDescription>Top dartboard areas targeted</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Chart options={{
                          title: { text: null },
                          chart: { type: 'column', height: 300 },
                          xAxis: {
                            categories: hitDistribution.categories,
                            labels: { rotation: -45 },
                            title: { text: 'Dartboard Segment' }
                          },
                          yAxis: { 
                            title: { text: 'Hit Count' },
                            min: 0
                          },
                          series: [{
                            name: 'Hits',
                            data: hitDistribution.data,
                            color: '#8b5cf6'
                          }],
                          legend: { enabled: false },
                          plotOptions: {
                            column: {
                              borderRadius: 2,
                              dataLabels: {
                                enabled: true
                              }
                            }
                          }
                        }}
                      />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Target Analysis Tab */}
              <TabsContent value="accuracy" className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* 20 Target Analysis */}
                  <Card>
                    <CardHeader>
                      <CardTitle>🎯 20 Target Analysis</CardTitle>
                      <CardDescription>Performance when targeting 20 ({selectedPlayerData.total20Attempts} attempts)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="bg-green-50 p-3 rounded">
                            <div className="text-2xl font-bold text-green-600">{selectedPlayerData.rate20Triple}%</div>
                            <div className="text-xs text-muted-foreground">Triple 20</div>
                            <div className="text-xs text-gray-500">({selectedPlayerData.hits20Triple} hits)</div>
                          </div>
                          <div className="bg-blue-50 p-3 rounded">
                            <div className="text-2xl font-bold text-blue-600">{selectedPlayerData.rate20Double}%</div>
                            <div className="text-xs text-muted-foreground">Double 20</div>
                            <div className="text-xs text-gray-500">({selectedPlayerData.hits20Double} hits)</div>
                          </div>
                          <div className="bg-yellow-50 p-3 rounded">
                            <div className="text-2xl font-bold text-yellow-600">{selectedPlayerData.rate20Single}%</div>
                            <div className="text-xs text-muted-foreground">Single 20</div>
                            <div className="text-xs text-gray-500">({selectedPlayerData.hits20Single} hits)</div>
                          </div>
                        </div>
                        
                        <div className="mt-4 p-3 bg-gray-50 rounded">
                          <div className="text-sm font-medium mb-2">Miss Direction</div>
                          <div className="grid grid-cols-2 gap-3 text-center">
                            <div>
                              <div className="text-lg font-bold text-red-500">{selectedPlayerData.misses20Left}</div>
                              <div className="text-xs text-muted-foreground">Left (5s)</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-red-500">{selectedPlayerData.misses20Right}</div>
                              <div className="text-xs text-muted-foreground">Right (1s)</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* 19 Target Analysis */}
                  <Card>
                    <CardHeader>
                      <CardTitle>🎯 19 Target Analysis</CardTitle>
                      <CardDescription>Performance when targeting 19 ({selectedPlayerData.total19Attempts} attempts)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="bg-green-50 p-3 rounded">
                            <div className="text-2xl font-bold text-green-600">{selectedPlayerData.rate19Triple}%</div>
                            <div className="text-xs text-muted-foreground">Triple 19</div>
                            <div className="text-xs text-gray-500">({selectedPlayerData.hits19Triple} hits)</div>
                          </div>
                          <div className="bg-blue-50 p-3 rounded">
                            <div className="text-2xl font-bold text-blue-600">{selectedPlayerData.rate19Double}%</div>
                            <div className="text-xs text-muted-foreground">Double 19</div>
                            <div className="text-xs text-gray-500">({selectedPlayerData.hits19Double} hits)</div>
                          </div>
                          <div className="bg-yellow-50 p-3 rounded">
                            <div className="text-2xl font-bold text-yellow-600">{selectedPlayerData.rate19Single}%</div>
                            <div className="text-xs text-muted-foreground">Single 19</div>
                            <div className="text-xs text-gray-500">({selectedPlayerData.hits19Single} hits)</div>
                          </div>
                        </div>
                        
                        <div className="mt-4 p-3 bg-gray-50 rounded">
                          <div className="text-sm font-medium mb-2">Miss Direction</div>
                          <div className="grid grid-cols-2 gap-3 text-center">
                            <div>
                              <div className="text-lg font-bold text-red-500">{selectedPlayerData.misses19Left}</div>
                              <div className="text-xs text-muted-foreground">Left (7s)</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-red-500">{selectedPlayerData.misses19Right}</div>
                              <div className="text-xs text-muted-foreground">Right (3s)</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Dartboard Adjacency Analysis */}
                {(() => {
                  const adjacencyData = playerAdjacency.find(pa => pa.player_id === selectedPlayer);
                  if (adjacencyData) {
                    return (
                      <div className="grid md:grid-cols-2 gap-6">
                        <Card>
                          <CardHeader>
                            <CardTitle>🎯 20 vs Adjacent Segments</CardTitle>
                            <CardDescription>Accuracy when targeting 20 (neighbors: 1, 5)</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              <div className="grid grid-cols-3 gap-4 text-center">
                                <div className="bg-blue-50 p-3 rounded">
                                  <div className="text-2xl font-bold text-blue-600">{adjacencyData.hits_20}</div>
                                  <div className="text-xs text-muted-foreground">Hits on 20</div>
                                </div>
                                <div className="bg-gray-50 p-3 rounded">
                                  <div className="text-2xl font-bold text-gray-600">{adjacencyData.hits_1 + adjacencyData.hits_5}</div>
                                  <div className="text-xs text-muted-foreground">Hits on 1,5</div>
                                </div>
                                <div className="bg-green-50 p-3 rounded">
                                  <div className="text-2xl font-bold text-green-600">{adjacencyData.accuracy_20_in_area || 0}%</div>
                                  <div className="text-xs text-muted-foreground">20 accuracy</div>
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground text-center">
                                Total hits in 20 area: {adjacencyData.hits_20_area}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        
                        <Card>
                          <CardHeader>
                            <CardTitle>🎯 19 vs Adjacent Segments</CardTitle>
                            <CardDescription>Accuracy when targeting 19 (neighbors: 3, 7)</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              <div className="grid grid-cols-3 gap-4 text-center">
                                <div className="bg-purple-50 p-3 rounded">
                                  <div className="text-2xl font-bold text-purple-600">{adjacencyData.hits_19}</div>
                                  <div className="text-xs text-muted-foreground">Hits on 19</div>
                                </div>
                                <div className="bg-gray-50 p-3 rounded">
                                  <div className="text-2xl font-bold text-gray-600">{adjacencyData.hits_3 + adjacencyData.hits_7}</div>
                                  <div className="text-xs text-muted-foreground">Hits on 3,7</div>
                                </div>
                                <div className="bg-green-50 p-3 rounded">
                                  <div className="text-2xl font-bold text-green-600">{adjacencyData.accuracy_19_in_area || 0}%</div>
                                  <div className="text-xs text-muted-foreground">19 accuracy</div>
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground text-center">
                                Total hits in 19 area: {adjacencyData.hits_19_area}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Treble/Double Rate by Number */}
                <Card>
                  <CardHeader>
                    <CardTitle>Treble/Double Rate by Number</CardTitle>
                    <CardDescription>Success rates across 1–20 (excluding bull)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Chart options={{
                        title: { text: null },
                        chart: { type: 'bar', height: 500 },
                        xAxis: {
                          categories: trebleDoubleByNumberData.categories,
                          title: { text: 'Number' },
                        },
                        yAxis: {
                          title: { text: 'Hit Rate (%)' },
                          min: 0,
                          max: 100,
                        },
                        series: [
                          {
                            type: 'bar',
                            name: 'Double %',
                            data: trebleDoubleByNumberData.doubleRates,
                            color: '#3b82f6',
                          },
                          {
                            type: 'bar',
                            name: 'Treble %',
                            data: trebleDoubleByNumberData.trebleRates,
                            color: '#10b981',
                          },
                        ],
                        legend: { enabled: true },
                        tooltip: {
                          shared: true,
                          valueSuffix: '%',
                        },
                        plotOptions: {
                          bar: {
                            borderRadius: 2,
                            dataLabels: {
                              enabled: false,
                            },
                          },
                        },
                      }}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Target Comparison Chart</CardTitle>
                    <CardDescription>20 vs 19 target success rates</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Chart options={{
                        title: { text: null },
                        chart: { type: 'column', height: 400 },
                        xAxis: {
                          categories: ['20 Triple', '20 Double', '20 Single', '19 Triple', '19 Double', '19 Single'],
                          title: { text: 'Target Type' }
                        },
                        yAxis: { 
                          title: { text: 'Success Rate (%)' },
                          min: 0
                        },
                        series: [{
                          name: 'Hit Rate',
                          data: [
                            selectedPlayerData.rate20Triple,
                            selectedPlayerData.rate20Double,
                            selectedPlayerData.rate20Single,
                            selectedPlayerData.rate19Triple,
                            selectedPlayerData.rate19Double,
                            selectedPlayerData.rate19Single
                          ],
                          colorByPoint: true,
                          colors: ['#10b981', '#3b82f6', '#f59e0b', '#10b981', '#3b82f6', '#f59e0b'],
                          dataLabels: {
                            enabled: true,
                            format: '{y}%'
                          }
                        }],
                        legend: { enabled: false },
                        plotOptions: {
                          column: {
                            borderRadius: 4
                          }
                        }
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Trends Tab */}
              <TabsContent value="trends" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Average Score Over Time</CardTitle>
                    <CardDescription>Performance progression and consistency tracking</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Chart options={{
                        title: { text: null },
                        chart: { height: 400 },
                        xAxis: {
                          type: 'category',
                          categories: avgScoreCategories,
                          title: { text: 'Date' },
                          tickInterval: undefined,
                          tickmarkPlacement: 'on',
                          labels: {
                            // Only show every Nth label to reduce clutter
                            step: Math.ceil(avgScoreCategories.length / 8) || 1,
                          },
                        },
                        yAxis: { 
                          title: { text: 'Average Score' },
                          min: avgScoreYBounds.min,
                          max: avgScoreYBounds.max,
                        },
                        series: [
                          {
                            type: 'spline',
                            name: 'Cumulative Average',
                            data: avgScoreSeriesData,
                            color: '#3b82f6',
                            lineWidth: 3,
                            marker: {
                              radius: 4,
                              symbol: 'circle'
                            }
                          },
                          {
                            type: 'spline',
                            name: '7-day Rolling Average',
                            data: avgRollingScoreSeriesData,
                            color: '#8b5cf6',
                            dashStyle: 'Dot',
                            lineWidth: 2,
                            marker: {
                              radius: 3,
                              symbol: 'circle'
                            }
                          },
                          {
                            type: 'spline',
                            name: 'Daily Average',
                            data: avgDailyScoreSeriesData,
                            color: '#f97316',
                            dashStyle: 'ShortDash',
                            lineWidth: 2,
                            marker: {
                              radius: 3,
                              symbol: 'circle'
                            }
                          }
                        ],
                        legend: { enabled: true },
                        tooltip: {
                          shared: true,
                          valueDecimals: 2,
                          headerFormat: '<span style="font-size: 10px">{point.key}</span><br/>'
                        },
                        plotOptions: {
                          spline: {
                            marker: {
                              enabled: true,
                              states: {
                                hover: {
                                  radiusPlus: 2
                                }
                              }
                            }
                          }
                        }
                      }}
                    />
                  </CardContent>
                </Card>

                {/* First Nine Performance */}
                <Card>
                  <CardHeader>
                    <CardTitle>First Nine Average</CardTitle>
                    <CardDescription>Opening three visits (first 9 darts) per day</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Chart options={{
                        title: { text: null },
                        chart: { height: 360 },
                        xAxis: {
                          type: 'category',
                          categories: firstNineCategories,
                          title: { text: 'Date' },
                          tickmarkPlacement: 'on',
                          labels: {
                            step: Math.ceil((firstNineCategories.length || 1) / 8),
                          },
                        },
                        yAxis: {
                          title: { text: 'First 9 Average (per 3 darts)' },
                          min: firstNineYBounds.min,
                          max: firstNineYBounds.max,
                        },
                        series: [
                          {
                            type: 'spline',
                            name: '7-day Rolling Average',
                            data: firstNineRollingSeries,
                            color: '#10b981',
                            lineWidth: 3,
                            marker: { radius: 4, symbol: 'circle' },
                          },
                          {
                            type: 'spline',
                            name: 'Daily Average',
                            data: firstNineDailySeries,
                            color: '#0ea5e9',
                            dashStyle: 'ShortDash',
                            lineWidth: 2,
                            marker: { radius: 3, symbol: 'circle' },
                          },
                        ],
                        legend: { enabled: true },
                        tooltip: {
                          shared: true,
                          valueDecimals: 2,
                          headerFormat: '<span style="font-size: 10px">{point.key}</span><br/>',
                        },
                      }}
                    />
                  </CardContent>
                </Card>

                {/* 20 Bed Accuracy */}
                <Card>
                  <CardHeader>
                    <CardTitle>20 Bed Accuracy</CardTitle>
                    <CardDescription>Hit rate vs. misses into 1 or 5 when aiming at 20</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Chart options={{
                        title: { text: null },
                        chart: { height: 360 },
                        xAxis: {
                          type: 'category',
                          categories: accuracy20Categories,
                          title: { text: 'Date' },
                          tickmarkPlacement: 'on',
                          labels: {
                            step: Math.ceil((accuracy20Categories.length || 1) / 8),
                          },
                        },
                        yAxis: {
                          title: { text: 'Percentage (%)' },
                          min: accuracy20YBounds.min,
                          max: accuracy20YBounds.max,
                        },
                        series: [
                          {
                            type: 'spline',
                            name: '20 Hit %',
                            data: accuracy20HitPct,
                            color: '#f97316',
                            lineWidth: 3,
                            marker: { radius: 4, symbol: 'circle' },
                          },
                          {
                            type: 'spline',
                            name: 'Rolling Hit % (7d)',
                            data: accuracy20RollingHitPct,
                            color: '#fb923c',
                            dashStyle: 'Dot',
                            lineWidth: 2,
                            marker: { radius: 3, symbol: 'circle' },
                          },
                          {
                            type: 'spline',
                            name: 'Miss Left (5) %',
                            data: accuracy20MissLeftPct,
                            color: '#64748b',
                            dashStyle: 'ShortDash',
                            marker: { radius: 3, symbol: 'circle' },
                          },
                          {
                            type: 'spline',
                            name: 'Miss Right (1) %',
                            data: accuracy20MissRightPct,
                            color: '#0f172a',
                            dashStyle: 'ShortDashDot',
                            marker: { radius: 3, symbol: 'circle' },
                          },
                        ],
                        legend: { enabled: true },
                        tooltip: {
                          shared: true,
                          valueSuffix: '%',
                          valueDecimals: 1,
                          headerFormat: '<span style="font-size: 10px">{point.key}</span><br/>',
                        },
                      }}
                    />
                  </CardContent>
                </Card>

                {/* Ton Bands Over Time */}
                <Card>
                  <CardHeader>
                    <CardTitle>Ton Bands Over Time</CardTitle>
                    <CardDescription>Daily distribution of high-scoring turns</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Chart options={{
                        title: { text: null },
                        chart: { type: 'column', height: 380 },
                        xAxis: {
                          categories: tonBandsOverTimeData.categories,
                          type: 'category',
                          title: { text: 'Date' },
                          labels: {
                            step: Math.ceil((tonBandsOverTimeData.categories.length || 1) / 8),
                          },
                        },
                        yAxis: {
                          min: 0,
                          title: { text: 'Turns' },
                        },
                        legend: { enabled: true },
                        tooltip: {
                          shared: true,
                        },
                        plotOptions: {
                          column: {
                            stacking: 'normal',
                            borderRadius: 2,
                          },
                        },
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        series: tonBandsOverTimeData.series as any,
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {/* Overall Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>🏆 Match Wins by Player</CardTitle>
                <CardDescription>Championship leaderboard</CardDescription>
              </CardHeader>
              <CardContent>
                <Chart options={{
                    title: { text: null },
                    chart: { type: 'bar', height: 300 },
                    xAxis: { 
                      categories: summary.slice(0, 8).map(d => d.display_name),
                      title: { text: 'Player' }
                    },
                    yAxis: { 
                      title: { text: 'Wins' },
                      min: 0
                    },
                    series: [{
                      name: 'Match Wins',
                      data: summary.slice(0, 8).map(d => d.wins),
                      color: '#3b82f6',
                      dataLabels: {
                        enabled: true
                      }
                    }],
                    legend: { enabled: false },
                    plotOptions: {
                      bar: {
                        borderRadius: 2
                      }
                    }
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>📊 Average Score by Player</CardTitle>
                <CardDescription>Consistency rankings</CardDescription>
              </CardHeader>
              <CardContent>
                <Chart options={{
                    title: { text: null },
                    chart: { type: 'bar', height: 300 },
                    xAxis: { 
                      categories: topAvgPlayers.map(d => d.display_name),
                      title: { text: 'Player' }
                    },
                    yAxis: { 
                      title: { text: 'Average Score' },
                      min: 0
                    },
                    series: [{
                      name: 'Avg Score',
                      data: topAvgPlayers.map(d => Number(d.avg_per_turn.toFixed?.(2) ?? d.avg_per_turn)),
                      color: '#10b981',
                      dataLabels: {
                        enabled: true,
                        format: '{y:.1f}'
                      }
                    }],
                    legend: { enabled: false },
                    plotOptions: {
                      bar: {
                        borderRadius: 2
                      }
                    }
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
