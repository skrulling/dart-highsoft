import { describe, it, expect } from 'vitest';
import {
  calculateExpectedScore,
  calculateNewEloRatings,
  getEloTier,
  formatEloChange,
  shouldMatchBeRated,
} from './eloRating';

describe('calculateExpectedScore', () => {
  it('returns 0.5 for equal ratings', () => {
    const result = calculateExpectedScore(1500, 1500);
    expect(result).toBeCloseTo(0.5, 5);
  });

  it('returns higher probability for higher rated player', () => {
    const result = calculateExpectedScore(1600, 1400);
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeLessThan(1);
  });

  it('returns lower probability for lower rated player', () => {
    const result = calculateExpectedScore(1400, 1600);
    expect(result).toBeLessThan(0.5);
    expect(result).toBeGreaterThan(0);
  });

  it('returns approximately 0.76 for 200 rating difference', () => {
    const result = calculateExpectedScore(1600, 1400);
    expect(result).toBeCloseTo(0.76, 1);
  });

  it('returns approximately 0.91 for 400 rating difference', () => {
    const result = calculateExpectedScore(1800, 1400);
    expect(result).toBeCloseTo(0.91, 1);
  });

  it('sum of both players expected scores equals 1', () => {
    const expected1 = calculateExpectedScore(1600, 1400);
    const expected2 = calculateExpectedScore(1400, 1600);
    expect(expected1 + expected2).toBeCloseTo(1, 5);
  });
});

describe('calculateNewEloRatings', () => {
  it('winner gains and loser loses rating', () => {
    const result = calculateNewEloRatings(1500, 1500);
    expect(result.newWinnerRating).toBeGreaterThan(1500);
    expect(result.newLoserRating).toBeLessThan(1500);
  });

  it('returns correct changes for equal ratings with default K=32', () => {
    const result = calculateNewEloRatings(1500, 1500);
    // With equal ratings, expected score is 0.5
    // Winner: 32 * (1 - 0.5) = 16
    // Loser: 32 * (0 - 0.5) = -16
    expect(result.winnerChange).toBe(16);
    expect(result.loserChange).toBe(-16);
  });

  it('winner gains less when heavily favored', () => {
    const favored = calculateNewEloRatings(1800, 1400);
    const equal = calculateNewEloRatings(1500, 1500);
    expect(favored.winnerChange).toBeLessThan(equal.winnerChange);
  });

  it('winner gains more when heavily underdog', () => {
    const underdog = calculateNewEloRatings(1400, 1800);
    const equal = calculateNewEloRatings(1500, 1500);
    expect(underdog.winnerChange).toBeGreaterThan(equal.winnerChange);
  });

  it('respects custom K-factor', () => {
    const k16 = calculateNewEloRatings(1500, 1500, 16);
    const k32 = calculateNewEloRatings(1500, 1500, 32);
    const k64 = calculateNewEloRatings(1500, 1500, 64);

    expect(k16.winnerChange).toBe(8);
    expect(k32.winnerChange).toBe(16);
    expect(k64.winnerChange).toBe(32);
  });

  it('never lets rating go below 100', () => {
    const result = calculateNewEloRatings(150, 100, 64);
    expect(result.newLoserRating).toBe(100);
  });

  it('changes are rounded to integers', () => {
    const result = calculateNewEloRatings(1600, 1400);
    expect(Number.isInteger(result.winnerChange)).toBe(true);
    expect(Number.isInteger(result.loserChange)).toBe(true);
  });
});

describe('getEloTier', () => {
  it('returns Grand Master for 2400+', () => {
    expect(getEloTier(2400).name).toBe('Grand Master');
    expect(getEloTier(2500).name).toBe('Grand Master');
    expect(getEloTier(2400).icon).toBe('👑');
  });

  it('returns Master for 2200-2399', () => {
    expect(getEloTier(2200).name).toBe('Master');
    expect(getEloTier(2399).name).toBe('Master');
    expect(getEloTier(2200).icon).toBe('💎');
  });

  it('returns Expert for 1800-2199', () => {
    expect(getEloTier(1800).name).toBe('Expert');
    expect(getEloTier(2199).name).toBe('Expert');
    expect(getEloTier(1800).icon).toBe('🥇');
  });

  it('returns Advanced for 1600-1799', () => {
    expect(getEloTier(1600).name).toBe('Advanced');
    expect(getEloTier(1799).name).toBe('Advanced');
  });

  it('returns Intermediate for 1400-1599', () => {
    expect(getEloTier(1400).name).toBe('Intermediate');
    expect(getEloTier(1599).name).toBe('Intermediate');
  });

  it('returns Novice for 1300-1399', () => {
    expect(getEloTier(1300).name).toBe('Novice');
    expect(getEloTier(1399).name).toBe('Novice');
  });

  it('returns Beginner for 1200-1299', () => {
    expect(getEloTier(1200).name).toBe('Beginner');
    expect(getEloTier(1299).name).toBe('Beginner');
  });

  it('returns Noob for below 1200', () => {
    expect(getEloTier(1199).name).toBe('Noob');
    expect(getEloTier(100).name).toBe('Noob');
  });

  it('includes appropriate colors', () => {
    expect(getEloTier(2400).color).toContain('purple');
    expect(getEloTier(2200).color).toContain('red');
    expect(getEloTier(1800).color).toContain('orange');
  });
});

describe('formatEloChange', () => {
  it('formats positive change with plus sign', () => {
    const result = formatEloChange(16);
    expect(result.text).toBe('+16');
    expect(result.color).toContain('green');
  });

  it('formats negative change without additional sign', () => {
    const result = formatEloChange(-16);
    expect(result.text).toBe('-16');
    expect(result.color).toContain('red');
  });

  it('formats zero change', () => {
    const result = formatEloChange(0);
    expect(result.text).toBe('0');
    expect(result.color).toContain('gray');
  });

  it('handles large positive changes', () => {
    const result = formatEloChange(100);
    expect(result.text).toBe('+100');
  });

  it('handles large negative changes', () => {
    const result = formatEloChange(-50);
    expect(result.text).toBe('-50');
  });
});

describe('shouldMatchBeRated', () => {
  it('returns true for 2 players (1v1)', () => {
    expect(shouldMatchBeRated(2)).toBe(true);
  });

  it('returns false for 1 player', () => {
    expect(shouldMatchBeRated(1)).toBe(false);
  });

  it('returns false for 3+ players', () => {
    expect(shouldMatchBeRated(3)).toBe(false);
    expect(shouldMatchBeRated(4)).toBe(false);
    expect(shouldMatchBeRated(10)).toBe(false);
  });

  it('returns false for 0 players', () => {
    expect(shouldMatchBeRated(0)).toBe(false);
  });
});
