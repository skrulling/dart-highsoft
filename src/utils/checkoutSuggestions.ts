import { getDoubleOutCheckout } from '@/utils/checkoutTable';
import type { FinishRule } from '@/utils/x01';

type Option = { label: string; scored: number; isDouble: boolean };

export function computeCheckoutSuggestions(
  remainingScore: number,
  dartsLeft: number,
  finish: FinishRule
): string[][] {
  if (dartsLeft <= 0) return [];
  if (remainingScore <= 0) return [];
  if (remainingScore > dartsLeft * 60) return []; // impossible in remaining darts

  if (finish === 'double_out') {
    return getDoubleOutCheckout(remainingScore, dartsLeft);
  }

  const singles: Option[] = [];
  for (let n = 1; n <= 20; n++) singles.push({ label: `S${n}`, scored: n, isDouble: false });
  singles.push({ label: 'SB', scored: 25, isDouble: false });

  const doubles: Option[] = [];
  for (let n = 1; n <= 20; n++) doubles.push({ label: `D${n}`, scored: n * 2, isDouble: true });
  doubles.push({ label: 'DB', scored: 50, isDouble: true });

  const triples: Option[] = [];
  for (let n = 1; n <= 20; n++) triples.push({ label: `T${n}`, scored: n * 3, isDouble: false });

  const dfsSuggestions: string[][] = [];
  const seen = new Set<string>();
  const orderedOptions: Option[] = [...triples, ...singles, ...doubles].sort((a, b) => b.scored - a.scored);

  function addSuggestion(path: string[]) {
    const key = path.join('>');
    if (seen.has(key)) return;
    seen.add(key);
    dfsSuggestions.push(path);
  }

  function dfs(rem: number, dartsRemaining: number, path: string[]) {
    if (dfsSuggestions.length >= 5) return;
    if (rem < 0) return;
    if (rem === 0) {
      if (path.length > 0) addSuggestion([...path]);
      return;
    }
    if (dartsRemaining === 0) return;

    for (const opt of orderedOptions) {
      if (opt.scored > rem) continue;
      const newRem = rem - opt.scored;
      if (newRem === 0) {
        addSuggestion([...path, opt.label]);
        if (dfsSuggestions.length >= 5) return;
        continue;
      }
      if (dartsRemaining === 1) continue;
      dfs(newRem, dartsRemaining - 1, [...path, opt.label]);
      if (dfsSuggestions.length >= 5) return;
    }
  }

  dfs(remainingScore, dartsLeft, []);
  dfsSuggestions.sort((a, b) => a.length - b.length);
  return dfsSuggestions.slice(0, 3);
}
