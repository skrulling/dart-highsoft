import type { TurnRow, ThrowRow, LegRow, MatchRow, PlayerCoreStats, PlayerSegmentRow } from './types';

export function computePlayerCoreStats(
  selectedPlayer: string,
  turns: TurnRow[],
  throws: ThrowRow[],
  legs: LegRow[],
  matches: MatchRow[]
): PlayerCoreStats {
  const playerTurns = turns.filter(t => t.player_id === selectedPlayer);

  // Build lookup sets/maps once — avoids O(n×m) .some()/.find() inside loops
  const playerTurnIds = new Set(playerTurns.map(t => t.id));
  const playerThrows = throws.filter(th => playerTurnIds.has(th.turn_id));

  // Pre-index throws by turn_id for fast per-turn lookups
  const throwCountByTurnId = new Map<string, number>();
  for (const th of playerThrows) {
    throwCountByTurnId.set(th.turn_id, (throwCountByTurnId.get(th.turn_id) ?? 0) + 1);
  }

  const totalScore = playerTurns.reduce((sum, t) => sum + (t.busted ? 0 : t.total_scored), 0);
  const validTurns = playerTurns.filter(t => !t.busted);
  const avgScore = validTurns.length > 0 ? Math.round((totalScore / validTurns.length) * 100) / 100 : 0;
  const legsWon = legs.filter(l => l.winner_player_id === selectedPlayer).length;
  const matchesWon = matches.filter(m => m.winner_player_id === selectedPlayer).length;

  // Set-based leg/match lookups instead of nested .some()
  const playerLegIds = new Set(playerTurns.map(t => t.leg_id));
  const playerLegs = legs.filter(l => playerLegIds.has(l.id));

  const playerMatchIds = new Set(playerLegs.map(l => l.match_id));
  const gamesPlayed = matches.filter(m => playerMatchIds.has(m.id)).length;
  const legsPlayed = playerLegs.length;

  const gameWinRate = gamesPlayed > 0 ? Math.round((matchesWon / gamesPlayed) * 100) : 0;
  const legWinRate = legsPlayed > 0 ? Math.round((legsWon / legsPlayed) * 100) : 0;

  const topRounds = playerTurns
    .filter(t => !t.busted)
    .sort((a, b) => b.total_scored - a.total_scored)
    .slice(0, 3);

  // --- Checkout statistics (optimized with pre-built Maps) ---

  // Map leg_id -> match for O(1) lookup
  const legById = new Map<string, LegRow>();
  for (const l of legs) legById.set(l.id, l);

  const matchById = new Map<string, MatchRow>();
  for (const m of matches) matchById.set(m.id, m);

  // Group player turns by leg_id for O(1) leg-turn lookups
  const playerTurnsByLeg = new Map<string, TurnRow[]>();
  for (const t of playerTurns) {
    let arr = playerTurnsByLeg.get(t.leg_id);
    if (!arr) { arr = []; playerTurnsByLeg.set(t.leg_id, arr); }
    arr.push(t);
  }

  const finishingLegs = playerLegs.filter(l => l.winner_player_id === selectedPlayer);

  // Pre-compute cumulative scores per leg to avoid repeated filtering
  const checkoutAttempts = playerTurns.filter(t => {
    const leg = legById.get(t.leg_id);
    if (!leg) return false;
    const match = matchById.get(leg.match_id);
    if (!match) return false;

    const legTurns = playerTurnsByLeg.get(t.leg_id);
    if (!legTurns) return false;

    let scoredBefore = 0;
    for (const turn of legTurns) {
      if (turn.turn_number < t.turn_number && !turn.busted) {
        scoredBefore += turn.total_scored;
      }
    }
    const scoreBefore = parseInt(match.start_score) - scoredBefore;
    return scoreBefore <= 170 && scoreBefore > 0;
  });

  const successfulCheckouts = finishingLegs.length;
  const checkoutRate = checkoutAttempts.length > 0 ? Math.round((successfulCheckouts / checkoutAttempts.length) * 100) : 0;

  const checkoutTurns = finishingLegs.map(leg => {
    const legTurns = playerTurnsByLeg.get(leg.id);
    if (!legTurns || !legTurns.length) return undefined;
    let last = legTurns[0];
    for (const t of legTurns) {
      if (t.turn_number > last.turn_number) last = t;
    }
    return last;
  }).filter((t): t is TurnRow => t != null && !t.busted);

  const highestCheckoutTurn = checkoutTurns.length
    ? checkoutTurns.reduce((best, t) => t.total_scored > best.total_scored ? t : best)
    : undefined;
  const highestCheckout = highestCheckoutTurn ? highestCheckoutTurn.total_scored : 0;
  const highestCheckoutDarts = highestCheckoutTurn
    ? (throwCountByTurnId.get(highestCheckoutTurn.id) ?? 0)
    : 0;

  const checkoutCounts = { 1: 0, 2: 0, 3: 0 };
  for (const turn of checkoutTurns) {
    const dartCount = throwCountByTurnId.get(turn.id) ?? 0;
    if (dartCount >= 1 && dartCount <= 3) {
      checkoutCounts[dartCount as 1 | 2 | 3]++;
    }
  }

  const totalCheckouts = checkoutTurns.length;
  const checkoutBreakdown = {
    1: totalCheckouts > 0 ? Math.round((checkoutCounts[1] / totalCheckouts) * 100) : 0,
    2: totalCheckouts > 0 ? Math.round((checkoutCounts[2] / totalCheckouts) * 100) : 0,
    3: totalCheckouts > 0 ? Math.round((checkoutCounts[3] / totalCheckouts) * 100) : 0
  };

  // --- 20 and 19 target analysis (single-pass segment counting) ---
  const segmentCounts = new Map<string, number>();
  for (const th of playerThrows) {
    segmentCounts.set(th.segment, (segmentCounts.get(th.segment) ?? 0) + 1);
  }

  const getCount = (seg: string) => segmentCounts.get(seg) ?? 0;

  const hits20Single = getCount('20') + getCount('S20');
  const hits20Double = getCount('D20');
  const hits20Triple = getCount('T20');
  const hits20Total = hits20Single + hits20Double + hits20Triple;
  const misses20Left = getCount('5') + getCount('S5');
  const misses20Right = getCount('1') + getCount('S1');
  const total20Attempts = hits20Total + misses20Left + misses20Right;

  const hits19Single = getCount('19') + getCount('S19');
  const hits19Double = getCount('D19');
  const hits19Triple = getCount('T19');
  const hits19Total = hits19Single + hits19Double + hits19Triple;
  const misses19Left = getCount('7') + getCount('S7');
  const misses19Right = getCount('3') + getCount('S3');
  const total19Attempts = hits19Total + misses19Left + misses19Right;

  const pct = (num: number, den: number) => den > 0 ? Math.round((num / den) * 100) : 0;

  const scoreDistribution = playerTurns.reduce((acc, turn) => {
    if (!turn.busted) {
      const bucket = Math.floor(turn.total_scored / 20) * 20;
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
    playerTurns,
    playerThrows,
    playerLegs,
    checkoutRate,
    highestCheckout,
    highestCheckoutDarts,
    checkoutCounts,
    checkoutBreakdown,
    scoreDistribution,
    hits20Single, hits20Double, hits20Triple, hits20Total,
    misses20Left, misses20Right,
    total20Attempts,
    rate20Double: pct(hits20Double, total20Attempts),
    rate20Triple: pct(hits20Triple, total20Attempts),
    rate20Single: pct(hits20Single, total20Attempts),
    hits19Single, hits19Double, hits19Triple, hits19Total,
    misses19Left, misses19Right,
    total19Attempts,
    rate19Double: pct(hits19Double, total19Attempts),
    rate19Triple: pct(hits19Triple, total19Attempts),
    rate19Single: pct(hits19Single, total19Attempts),
  };
}

export function computeHitDistribution(
  selectedPlayer: string,
  playerSegments: PlayerSegmentRow[],
  playerThrows: ThrowRow[]
): { categories: string[]; data: number[] } {
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

  if (!playerThrows.length) return { categories: [], data: [] };

  const segmentCounts = new Map<string, number>();
  for (const th of playerThrows) {
    if (th.segment && th.segment !== 'MISS' && th.segment !== 'Miss') {
      segmentCounts.set(th.segment, (segmentCounts.get(th.segment) ?? 0) + 1);
    }
  }

  const sorted = Array.from(segmentCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);

  return {
    categories: sorted.map(([segment]) => segment),
    data: sorted.map(([, count]) => count)
  };
}

export function computeScoreDistributionChartData(
  scoreDistribution: Record<number, number>
): { categories: string[]; data: number[] } {
  const buckets = Object.entries(scoreDistribution)
    .sort(([a], [b]) => parseInt(a) - parseInt(b));

  return {
    categories: buckets.map(([bucket]) => `${bucket}-${parseInt(bucket) + 19}`),
    data: buckets.map(([, count]) => count)
  };
}

export function computeTrebleDoubleByNumber(
  selectedPlayer: string,
  playerSegments: PlayerSegmentRow[],
  playerThrows: ThrowRow[]
): { categories: string[]; doubleRates: number[]; trebleRates: number[] } {
  const categories: string[] = [];
  const doubleRates: number[] = [];
  const trebleRates: number[] = [];

  const addRates = (n: number, singles: number, doubles: number, trebles: number) => {
    const total = singles + doubles + trebles;
    if (total <= 0) return;
    categories.push(String(n));
    doubleRates.push(Math.round((doubles / total) * 100));
    trebleRates.push(Math.round((trebles / total) * 100));
  };

  const segmentRows = playerSegments.filter(ps => ps.player_id === selectedPlayer);

  if (segmentRows.length > 0) {
    // Build a Map of segment -> total_hits (single pass)
    const hitsBySegment = new Map<string, number>();
    for (const r of segmentRows) {
      hitsBySegment.set(r.segment, (hitsBySegment.get(r.segment) ?? 0) + r.total_hits);
    }
    const getHits = (seg: string) => hitsBySegment.get(seg) ?? 0;

    for (let n = 1; n <= 20; n++) {
      addRates(n, getHits(String(n)) + getHits(`S${n}`), getHits(`D${n}`), getHits(`T${n}`));
    }
    return { categories, doubleRates, trebleRates };
  }

  if (!playerThrows.length) return { categories: [], doubleRates: [], trebleRates: [] };

  // Build segment count Map in a single pass instead of 60 .filter() calls
  const counts = new Map<string, number>();
  for (const th of playerThrows) {
    counts.set(th.segment, (counts.get(th.segment) ?? 0) + 1);
  }
  const getCount = (seg: string) => counts.get(seg) ?? 0;

  for (let n = 1; n <= 20; n++) {
    addRates(n, getCount(String(n)) + getCount(`S${n}`), getCount(`D${n}`), getCount(`T${n}`));
  }
  return { categories, doubleRates, trebleRates };
}

export function computeTonBandsOverTime(
  playerTurns: TurnRow[]
): { categories: string[]; series: { name: string; data: number[]; color: string }[] } {
  const validTurns = playerTurns.filter(t => !t.busted);
  if (!validTurns.length) return { categories: [], series: [] };

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
}

export function computeAvgScoreTrend(
  playerTurns: TurnRow[]
): { categories: string[]; cumulative: number[]; daily: number[]; rolling: number[] } {
  const validTurns = playerTurns
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
    cumulative.push(Math.round((cumSum / cumCount) * 100) / 100);
    daily.push(Math.round((sum / count) * 100) / 100);
  }

  const rolling: number[] = [];
  for (let i = 0; i < daily.length; i++) {
    const start = Math.max(0, i - 6);
    const window = daily.slice(start, i + 1);
    const windowAvg = window.reduce((acc, val) => acc + val, 0) / window.length;
    rolling.push(Math.round(windowAvg * 100) / 100);
  }

  return { categories: days, cumulative, daily, rolling };
}

export function computeFirstNineTrend(
  playerTurns: TurnRow[],
  playerThrows: ThrowRow[]
): { categories: string[]; daily: number[]; rolling: number[] } {
  const throwsByTurn = new Map<string, number>();
  for (const thr of playerThrows) {
    if (!thr.turn_id) continue;
    throwsByTurn.set(thr.turn_id, (throwsByTurn.get(thr.turn_id) ?? 0) + 1);
  }

  const turnsByLeg = new Map<string, TurnRow[]>();
  for (const turn of playerTurns) {
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
}

export function computeAccuracy20Trend(
  playerTurns: TurnRow[],
  playerThrows: ThrowRow[]
): {
  categories: string[];
  hitPct: number[];
  missLeftPct: number[];
  missRightPct: number[];
  rollingHitPct: number[];
} {
  const turnById = new Map<string, TurnRow>();
  for (const turn of playerTurns) {
    turnById.set(turn.id, turn);
  }

  const dayStats = new Map<string, { hits: number; missLeft: number; missRight: number }>();
  for (const thr of playerThrows) {
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
}

export function computeYBounds(
  values: number[],
  padding: number = 2,
  roundTo: number = 10
): { min: number; max: number } {
  const filtered = values.filter(v => typeof v === 'number');
  if (!filtered.length) return { min: 0, max: 0 };
  const minY = Math.min(...filtered);
  const maxY = Math.max(...filtered);
  return {
    min: Math.floor((minY - padding) * roundTo) / roundTo,
    max: Math.ceil((maxY + padding) * roundTo) / roundTo,
  };
}

export function computeGamesPerDay(matches: MatchRow[]): number {
  if (!matches.length) return 0;
  const firstMatch = new Date(matches[0].created_at);
  const lastMatch = new Date(matches[matches.length - 1].created_at);
  const daysDiff = Math.max(1, Math.ceil((lastMatch.getTime() - firstMatch.getTime()) / (1000 * 60 * 60 * 24)));
  return Math.round((matches.length / daysDiff) * 10) / 10;
}
