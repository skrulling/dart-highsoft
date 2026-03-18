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

export type PeriodComparison = {
  recentAvg: number;
  previousAvg: number;
  allTimeAvg: number;
  delta: number;        // recent - previous
  deltaPct: number;     // percentage change
  recentFirst9: number;
  previousFirst9: number;
  deltaFirst9: number;
  recentCheckoutRate: number;
  previousCheckoutRate: number;
  deltaCheckout: number;
  recentBustRate: number;
  previousBustRate: number;
  deltaBust: number;
  recentTonRate: number;
  previousTonRate: number;
  deltaTonRate: number;
};

export function computePeriodComparison(
  playerTurns: TurnRow[],
  playerThrows: ThrowRow[],
  playerLegs: LegRow[],
  legs: LegRow[],
  matches: MatchRow[],
  selectedPlayer: string,
  periodDays: number = 30
): PeriodComparison {
  const now = Date.now();
  const periodMs = periodDays * 24 * 60 * 60 * 1000;
  const recentCutoff = now - periodMs;
  const previousCutoff = now - periodMs * 2;

  const recentTurns = playerTurns.filter(t => new Date(t.created_at).getTime() >= recentCutoff);
  const previousTurns = playerTurns.filter(t => {
    const ts = new Date(t.created_at).getTime();
    return ts >= previousCutoff && ts < recentCutoff;
  });

  const avgOf = (turns: TurnRow[]) => {
    const valid = turns.filter(t => !t.busted);
    if (!valid.length) return 0;
    return Math.round((valid.reduce((s, t) => s + t.total_scored, 0) / valid.length) * 100) / 100;
  };

  const allTimeAvg = avgOf(playerTurns);
  const recentAvg = avgOf(recentTurns);
  const previousAvg = avgOf(previousTurns);
  const delta = Math.round((recentAvg - previousAvg) * 100) / 100;
  const deltaPct = previousAvg > 0 ? Math.round((delta / previousAvg) * 1000) / 10 : 0;

  // First 9 comparison
  const computeFirst9ForTurns = (turns: TurnRow[]) => {
    const throwsByTurn = new Map<string, number>();
    const turnIds = new Set(turns.map(t => t.id));
    for (const th of playerThrows) {
      if (turnIds.has(th.turn_id)) {
        throwsByTurn.set(th.turn_id, (throwsByTurn.get(th.turn_id) ?? 0) + 1);
      }
    }

    const turnsByLeg = new Map<string, TurnRow[]>();
    for (const t of turns) {
      let arr = turnsByLeg.get(t.leg_id);
      if (!arr) { arr = []; turnsByLeg.set(t.leg_id, arr); }
      arr.push(t);
    }

    let totalF9 = 0, countF9 = 0;
    for (const legTurns of turnsByLeg.values()) {
      const sorted = [...legTurns].sort((a, b) => a.turn_number - b.turn_number).slice(0, 3);
      let pts = 0, darts = 0;
      for (const t of sorted) {
        darts += throwsByTurn.get(t.id) ?? 3;
        pts += t.busted ? 0 : t.total_scored;
      }
      if (darts > 0) {
        totalF9 += (pts / darts) * 3;
        countF9++;
      }
    }
    return countF9 > 0 ? Math.round((totalF9 / countF9) * 100) / 100 : 0;
  };

  const recentFirst9 = computeFirst9ForTurns(recentTurns);
  const previousFirst9 = computeFirst9ForTurns(previousTurns);
  const deltaFirst9 = Math.round((recentFirst9 - previousFirst9) * 100) / 100;

  // Checkout rate comparison
  const computeCheckoutRate = (turns: TurnRow[]) => {
    const legIds = new Set(turns.map(t => t.leg_id));
    const relevantLegs = playerLegs.filter(l => legIds.has(l.id));
    const wonLegs = relevantLegs.filter(l => l.winner_player_id === selectedPlayer);

    const legById = new Map<string, LegRow>();
    for (const l of legs) legById.set(l.id, l);
    const matchById = new Map<string, MatchRow>();
    for (const m of matches) matchById.set(m.id, m);

    const turnsByLeg = new Map<string, TurnRow[]>();
    for (const t of turns) {
      let arr = turnsByLeg.get(t.leg_id);
      if (!arr) { arr = []; turnsByLeg.set(t.leg_id, arr); }
      arr.push(t);
    }

    let attempts = 0;
    for (const t of turns) {
      const leg = legById.get(t.leg_id);
      if (!leg) continue;
      const match = matchById.get(leg.match_id);
      if (!match) continue;
      const legTurns = turnsByLeg.get(t.leg_id) ?? [];
      let scoredBefore = 0;
      for (const turn of legTurns) {
        if (turn.turn_number < t.turn_number && !turn.busted) scoredBefore += turn.total_scored;
      }
      const remaining = parseInt(match.start_score) - scoredBefore;
      if (remaining <= 170 && remaining > 0) attempts++;
    }

    return attempts > 0 ? Math.round((wonLegs.length / attempts) * 1000) / 10 : 0;
  };

  const recentCheckoutRate = computeCheckoutRate(recentTurns);
  const previousCheckoutRate = computeCheckoutRate(previousTurns);
  const deltaCheckout = Math.round((recentCheckoutRate - previousCheckoutRate) * 10) / 10;

  // Bust rate comparison
  const bustRateOf = (turns: TurnRow[]) => {
    if (!turns.length) return 0;
    return Math.round((turns.filter(t => t.busted).length / turns.length) * 1000) / 10;
  };

  const recentBustRate = bustRateOf(recentTurns);
  const previousBustRate = bustRateOf(previousTurns);
  const deltaBust = Math.round((recentBustRate - previousBustRate) * 10) / 10;

  // Ton rate comparison (100+ as % of valid turns)
  const tonRateOf = (turns: TurnRow[]) => {
    const valid = turns.filter(t => !t.busted);
    if (!valid.length) return 0;
    const tons = valid.filter(t => t.total_scored >= 100).length;
    return Math.round((tons / valid.length) * 1000) / 10;
  };

  const recentTonRate = tonRateOf(recentTurns);
  const previousTonRate = tonRateOf(previousTurns);
  const deltaTonRate = Math.round((recentTonRate - previousTonRate) * 10) / 10;

  return {
    recentAvg, previousAvg, allTimeAvg, delta, deltaPct,
    recentFirst9, previousFirst9, deltaFirst9,
    recentCheckoutRate, previousCheckoutRate, deltaCheckout,
    recentBustRate, previousBustRate, deltaBust,
    recentTonRate, previousTonRate, deltaTonRate,
  };
}

export function computeCheckoutRateTrend(
  playerTurns: TurnRow[],
  playerLegs: LegRow[],
  legs: LegRow[],
  matches: MatchRow[],
  selectedPlayer: string
): { categories: string[]; daily: number[]; rolling: number[] } {
  const legById = new Map<string, LegRow>();
  for (const l of legs) legById.set(l.id, l);
  const matchById = new Map<string, MatchRow>();
  for (const m of matches) matchById.set(m.id, m);

  const turnsByLeg = new Map<string, TurnRow[]>();
  for (const t of playerTurns) {
    let arr = turnsByLeg.get(t.leg_id);
    if (!arr) { arr = []; turnsByLeg.set(t.leg_id, arr); }
    arr.push(t);
  }

  // For each turn, determine if it was a checkout attempt and if it succeeded
  const dayStats = new Map<string, { attempts: number; successes: number }>();

  for (const t of playerTurns) {
    const leg = legById.get(t.leg_id);
    if (!leg) continue;
    const match = matchById.get(leg.match_id);
    if (!match) continue;

    const legTurns = turnsByLeg.get(t.leg_id) ?? [];
    let scoredBefore = 0;
    for (const turn of legTurns) {
      if (turn.turn_number < t.turn_number && !turn.busted) scoredBefore += turn.total_scored;
    }
    const remaining = parseInt(match.start_score) - scoredBefore;
    if (remaining > 170 || remaining <= 0) continue;

    const day = new Date(t.created_at).toISOString().slice(0, 10);
    const entry = dayStats.get(day) ?? { attempts: 0, successes: 0 };
    entry.attempts++;

    // Check if this was the winning turn of the leg
    if (leg.winner_player_id === selectedPlayer && !t.busted) {
      const isLastTurn = !legTurns.some(
        other => other.turn_number > t.turn_number
      );
      if (isLastTurn) entry.successes++;
    }
    dayStats.set(day, entry);
  }

  const entries = Array.from(dayStats.entries())
    .filter(([, s]) => s.attempts > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const categories = entries.map(([day]) => day);
  const daily = entries.map(([, s]) => Math.round((s.successes / s.attempts) * 1000) / 10);

  const rolling: number[] = [];
  for (let i = 0; i < daily.length; i++) {
    const start = Math.max(0, i - 6);
    const window = daily.slice(start, i + 1);
    rolling.push(Math.round((window.reduce((a, v) => a + v, 0) / window.length) * 10) / 10);
  }

  return { categories, daily, rolling };
}

export function computeBustRateTrend(
  playerTurns: TurnRow[]
): { categories: string[]; daily: number[]; rolling: number[] } {
  const dayStats = new Map<string, { total: number; busts: number }>();

  for (const t of playerTurns) {
    const day = new Date(t.created_at).toISOString().slice(0, 10);
    const entry = dayStats.get(day) ?? { total: 0, busts: 0 };
    entry.total++;
    if (t.busted) entry.busts++;
    dayStats.set(day, entry);
  }

  const entries = Array.from(dayStats.entries())
    .filter(([, s]) => s.total > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const categories = entries.map(([day]) => day);
  const daily = entries.map(([, s]) => Math.round((s.busts / s.total) * 1000) / 10);

  const rolling: number[] = [];
  for (let i = 0; i < daily.length; i++) {
    const start = Math.max(0, i - 6);
    const window = daily.slice(start, i + 1);
    rolling.push(Math.round((window.reduce((a, v) => a + v, 0) / window.length) * 10) / 10);
  }

  return { categories, daily, rolling };
}

export function computeTonRateOverTime(
  playerTurns: TurnRow[]
): { categories: string[]; series: { name: string; data: number[]; color: string }[] } {
  const dayStats = new Map<string, { valid: number; t60: number; t80: number; t100: number; t140: number; t180: number }>();

  for (const t of playerTurns) {
    if (t.busted) continue;
    const day = new Date(t.created_at).toISOString().slice(0, 10);
    if (!dayStats.has(day)) dayStats.set(day, { valid: 0, t60: 0, t80: 0, t100: 0, t140: 0, t180: 0 });
    const entry = dayStats.get(day)!;
    entry.valid++;
    const s = t.total_scored;
    if (s >= 180) entry.t180++;
    else if (s >= 140) entry.t140++;
    else if (s >= 100) entry.t100++;
    else if (s >= 80) entry.t80++;
    else if (s >= 60) entry.t60++;
  }

  const categories = Array.from(dayStats.keys()).sort();
  const pct = (val: number, total: number) => total > 0 ? Math.round((val / total) * 1000) / 10 : 0;

  return {
    categories,
    series: [
      { name: '60–79 %', data: categories.map(d => pct(dayStats.get(d)!.t60, dayStats.get(d)!.valid)), color: '#93c5fd' },
      { name: '80–99 %', data: categories.map(d => pct(dayStats.get(d)!.t80, dayStats.get(d)!.valid)), color: '#60a5fa' },
      { name: '100–139 %', data: categories.map(d => pct(dayStats.get(d)!.t100, dayStats.get(d)!.valid)), color: '#3b82f6' },
      { name: '140–179 %', data: categories.map(d => pct(dayStats.get(d)!.t140, dayStats.get(d)!.valid)), color: '#2563eb' },
      { name: '180 %', data: categories.map(d => pct(dayStats.get(d)!.t180, dayStats.get(d)!.valid)), color: '#1d4ed8' },
    ]
  };
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

export type BustAnalysis = {
  bustRate: number;
  totalBusts: number;
  totalTurns: number;
  bustScoreDistribution: { categories: string[]; data: number[] };
};

export function computeBustAnalysis(playerTurns: TurnRow[]): BustAnalysis {
  const totalTurns = playerTurns.length;
  const bustedTurns = playerTurns.filter(t => t.busted);
  const totalBusts = bustedTurns.length;
  const bustRate = totalTurns > 0 ? Math.round((totalBusts / totalTurns) * 1000) / 10 : 0;

  // Bucket busted turn scores to show what scores players attempt when busting
  const buckets = new Map<string, number>();
  for (const t of bustedTurns) {
    const score = t.total_scored;
    let label: string;
    if (score <= 20) label = '1-20';
    else if (score <= 40) label = '21-40';
    else if (score <= 60) label = '41-60';
    else if (score <= 80) label = '61-80';
    else if (score <= 100) label = '81-100';
    else label = '100+';
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }

  const order = ['1-20', '21-40', '41-60', '61-80', '81-100', '100+'];
  const categories = order.filter(k => buckets.has(k));
  const data = categories.map(k => buckets.get(k)!);

  return { bustRate, totalBusts, totalTurns, bustScoreDistribution: { categories, data } };
}

export type DartsPerLegData = {
  categories: string[];
  data: number[];
  avgDarts: number;
  bestLeg: number;
};

export function computeDartsPerLeg(
  playerTurns: TurnRow[],
  playerThrows: ThrowRow[],
  playerLegs: LegRow[],
  selectedPlayer: string
): DartsPerLegData {
  const wonLegs = playerLegs.filter(l => l.winner_player_id === selectedPlayer);
  if (!wonLegs.length) return { categories: [], data: [], avgDarts: 0, bestLeg: 0 };

  const turnsByLeg = new Map<string, TurnRow[]>();
  for (const t of playerTurns) {
    let arr = turnsByLeg.get(t.leg_id);
    if (!arr) { arr = []; turnsByLeg.set(t.leg_id, arr); }
    arr.push(t);
  }

  const throwCountByTurn = new Map<string, number>();
  for (const th of playerThrows) {
    throwCountByTurn.set(th.turn_id, (throwCountByTurn.get(th.turn_id) ?? 0) + 1);
  }

  const dartCounts: number[] = [];
  for (const leg of wonLegs) {
    const turns = turnsByLeg.get(leg.id);
    if (!turns) continue;
    let totalDarts = 0;
    for (const t of turns) {
      totalDarts += throwCountByTurn.get(t.id) ?? 3;
    }
    dartCounts.push(totalDarts);
  }

  if (!dartCounts.length) return { categories: [], data: [], avgDarts: 0, bestLeg: 0 };

  const bestLeg = Math.min(...dartCounts);
  const avgDarts = Math.round((dartCounts.reduce((s, d) => s + d, 0) / dartCounts.length) * 10) / 10;

  // Bucket into ranges for histogram
  const buckets = new Map<number, number>();
  for (const d of dartCounts) {
    const bucket = Math.floor(d / 3) * 3; // Group in 3-dart buckets
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }

  const sorted = Array.from(buckets.entries()).sort(([a], [b]) => a - b);
  return {
    categories: sorted.map(([b]) => `${b}-${b + 2}`),
    data: sorted.map(([, c]) => c),
    avgDarts,
    bestLeg,
  };
}

export type ScoreConsistency = {
  stdDev: number;
  median: number;
  avgScore: number;
};

export function computeScoreConsistency(playerTurns: TurnRow[]): ScoreConsistency {
  const scores = playerTurns.filter(t => !t.busted).map(t => t.total_scored);
  if (!scores.length) return { stdDev: 0, median: 0, avgScore: 0 };

  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length;
  const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;

  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;

  return { stdDev, median, avgScore: Math.round(avg * 100) / 100 };
}

export type PerDartStats = {
  avgByDart: [number, number, number];
  countByDart: [number, number, number];
};

export function computePerDartStats(playerThrows: ThrowRow[]): PerDartStats {
  const sums = [0, 0, 0];
  const counts = [0, 0, 0];

  for (const th of playerThrows) {
    const idx = th.dart_index - 1; // dart_index is 1-3
    if (idx >= 0 && idx <= 2) {
      sums[idx] += th.scored;
      counts[idx] += 1;
    }
  }

  return {
    avgByDart: [
      counts[0] > 0 ? Math.round((sums[0] / counts[0]) * 10) / 10 : 0,
      counts[1] > 0 ? Math.round((sums[1] / counts[1]) * 10) / 10 : 0,
      counts[2] > 0 ? Math.round((sums[2] / counts[2]) * 10) / 10 : 0,
    ],
    countByDart: [counts[0], counts[1], counts[2]],
  };
}

export type TonCounts = {
  ton180: number;
  ton140: number; // 140-179
  ton100: number; // 100-139
  ton60: number;  // 60-99
  tonPlus: number; // 100+
};

export function computeTonCounts(playerTurns: TurnRow[]): TonCounts {
  let ton180 = 0, ton140 = 0, ton100 = 0, ton60 = 0;

  for (const t of playerTurns) {
    if (t.busted) continue;
    const s = t.total_scored;
    if (s >= 180) ton180++;
    else if (s >= 140) ton140++;
    else if (s >= 100) ton100++;
    else if (s >= 60) ton60++;
  }

  return { ton180, ton140, ton100, ton60, tonPlus: ton180 + ton140 + ton100 };
}

export function computeGamesPerDay(matches: MatchRow[]): number {
  if (!matches.length) return 0;
  const firstMatch = new Date(matches[0].created_at);
  const lastMatch = new Date(matches[matches.length - 1].created_at);
  const daysDiff = Math.max(1, Math.ceil((lastMatch.getTime() - firstMatch.getTime()) / (1000 * 60 * 60 * 24)));
  return Math.round((matches.length / daysDiff) * 10) / 10;
}
