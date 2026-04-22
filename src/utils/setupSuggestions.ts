import type { FinishRule } from '@/utils/x01';

export type SetupSuggestion = {
  path: string[];
  target: number;
};

type Throw = { label: string; scored: number };

const SINGLES: Throw[] = [
  ...Array.from({ length: 20 }, (_, i) => ({ label: `S${i + 1}`, scored: i + 1 })),
  { label: 'SB', scored: 25 },
];

const DOUBLES: Throw[] = [
  ...Array.from({ length: 20 }, (_, i) => ({ label: `D${i + 1}`, scored: (i + 1) * 2 })),
  { label: 'DB', scored: 50 },
];

const ALL_THROWS: Throw[] = [...SINGLES, ...DOUBLES];

const TARGETS = [32, 16, 8, 4, 2, 40, 20, 10] as const;
const TARGET_SET = new Set<number>(TARGETS);

export function computeSetupSuggestions(
  remainingScore: number,
  dartsLeft: number,
  finish: FinishRule
): SetupSuggestion | null {
  if (finish !== 'double_out') return null;
  if (dartsLeft <= 0) return null;
  if (remainingScore <= 0) return null;
  if (TARGET_SET.has(remainingScore)) return null;

  for (let depth = 1; depth <= dartsLeft; depth++) {
    const best = searchAtDepth(remainingScore, depth);
    if (best) return best;
  }
  return null;
}

function searchAtDepth(score: number, depth: number): SetupSuggestion | null {
  const bestByTarget = new Map<number, { path: string[]; lastScored: number }>();
  const path: string[] = [];

  function dfs(currentScore: number, remaining: number, lastScored: number): void {
    if (remaining === 0) {
      if (TARGET_SET.has(currentScore)) {
        const existing = bestByTarget.get(currentScore);
        if (!existing || lastScored > existing.lastScored) {
          bestByTarget.set(currentScore, { path: path.slice(), lastScored });
        }
      }
      return;
    }
    for (const t of ALL_THROWS) {
      const nextScore = currentScore - t.scored;
      if (nextScore < 2) continue;
      path.push(t.label);
      dfs(nextScore, remaining - 1, t.scored);
      path.pop();
    }
  }

  dfs(score, depth, 0);

  if (bestByTarget.size === 0) return null;

  for (const target of TARGETS) {
    const found = bestByTarget.get(target);
    if (found) return { path: found.path, target };
  }
  return null;
}
