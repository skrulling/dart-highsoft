import { describe, it, expect } from 'vitest';
import { fisherYatesShuffle } from './shuffle';

describe('fisherYatesShuffle', () => {
  it('returns an array of the same length', () => {
    const input = [1, 2, 3, 4, 5];
    const result = fisherYatesShuffle(input);
    expect(result).toHaveLength(input.length);
  });

  it('contains the same elements', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = fisherYatesShuffle(input);
    expect(result.sort()).toEqual([...input].sort());
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    fisherYatesShuffle(input);
    expect(input).toEqual(copy);
  });

  it('handles empty array', () => {
    expect(fisherYatesShuffle([])).toEqual([]);
  });

  it('handles single element', () => {
    expect(fisherYatesShuffle([42])).toEqual([42]);
  });

  it('produces different orderings over many runs (not stuck)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(JSON.stringify(fisherYatesShuffle(input)));
    }
    // With 8 elements, 100 shuffles should produce many distinct orderings
    expect(seen.size).toBeGreaterThan(50);
  });
});
