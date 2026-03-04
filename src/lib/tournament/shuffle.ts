/**
 * Fisher-Yates (Knuth) shuffle — produces a uniformly random permutation.
 * Returns a new array; does not mutate the input.
 */
export function fisherYatesShuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
