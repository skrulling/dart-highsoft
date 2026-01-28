import { describe, it, expect } from 'vitest';
import { computeCheckoutSuggestions } from './checkoutSuggestions';

describe('computeCheckoutSuggestions', () => {
  describe('double-out rules', () => {
    it('returns empty array for scores above 170 (impossible checkout)', () => {
      expect(computeCheckoutSuggestions(171, 3, 'double_out')).toEqual([]);
      expect(computeCheckoutSuggestions(180, 3, 'double_out')).toEqual([]);
    });

    it('returns empty array for 0 or negative remaining score', () => {
      expect(computeCheckoutSuggestions(0, 3, 'double_out')).toEqual([]);
      expect(computeCheckoutSuggestions(-10, 3, 'double_out')).toEqual([]);
    });

    it('returns empty array for 0 or negative darts left', () => {
      expect(computeCheckoutSuggestions(40, 0, 'double_out')).toEqual([]);
      expect(computeCheckoutSuggestions(40, -1, 'double_out')).toEqual([]);
    });

    it('returns correct checkout for D20 (40)', () => {
      const result = computeCheckoutSuggestions(40, 1, 'double_out');
      expect(result).toContainEqual(['D20']);
    });

    it('returns correct checkout for 170 (T20-T20-DB)', () => {
      const result = computeCheckoutSuggestions(170, 3, 'double_out');
      expect(result).toContainEqual(['T20', 'T20', 'DB']);
    });

    it('returns correct checkout for 167 (T20-T19-DB)', () => {
      const result = computeCheckoutSuggestions(167, 3, 'double_out');
      expect(result).toContainEqual(['T20', 'T19', 'DB']);
    });

    it('returns correct checkout for 164 (T20-T18-DB)', () => {
      const result = computeCheckoutSuggestions(164, 3, 'double_out');
      expect(result).toContainEqual(['T20', 'T18', 'DB']);
    });

    it('returns correct checkout for 100 (T20-D20)', () => {
      const result = computeCheckoutSuggestions(100, 3, 'double_out');
      expect(result).toContainEqual(['T20', 'D20']);
    });

    it('returns correct checkout for 50 (DB)', () => {
      const result = computeCheckoutSuggestions(50, 1, 'double_out');
      expect(result).toContainEqual(['DB']);
    });

    it('returns empty array for impossible checkout with limited darts', () => {
      // 170 requires 3 darts, not possible with 2
      expect(computeCheckoutSuggestions(170, 2, 'double_out')).toEqual([]);
    });

    it('returns empty array for impossible scores (159, 162, 163, 165, 166, 168, 169)', () => {
      // These are impossible in double-out darts
      expect(computeCheckoutSuggestions(159, 3, 'double_out')).toEqual([]);
      expect(computeCheckoutSuggestions(162, 3, 'double_out')).toEqual([]);
      expect(computeCheckoutSuggestions(163, 3, 'double_out')).toEqual([]);
      expect(computeCheckoutSuggestions(165, 3, 'double_out')).toEqual([]);
      expect(computeCheckoutSuggestions(166, 3, 'double_out')).toEqual([]);
      expect(computeCheckoutSuggestions(168, 3, 'double_out')).toEqual([]);
      expect(computeCheckoutSuggestions(169, 3, 'double_out')).toEqual([]);
    });

    it('returns correct checkout for 2 (D1)', () => {
      const result = computeCheckoutSuggestions(2, 1, 'double_out');
      expect(result).toContainEqual(['D1']);
    });

    it('returns correct checkout for 3 (S1-D1)', () => {
      const result = computeCheckoutSuggestions(3, 2, 'double_out');
      expect(result).toContainEqual(['S1', 'D1']);
    });
  });

  describe('single-out rules', () => {
    it('returns suggestions for high scores', () => {
      const result = computeCheckoutSuggestions(180, 3, 'single_out');
      // Should return T20-T20-T20
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain('T20');
    });

    it('returns single dart checkout for simple scores', () => {
      const result = computeCheckoutSuggestions(20, 1, 'single_out');
      // Should include S20 as a valid checkout
      expect(result).toContainEqual(['S20']);
    });

    it('returns double as valid finish in single-out', () => {
      const result = computeCheckoutSuggestions(40, 1, 'single_out');
      // D20 is also valid in single-out
      expect(result).toContainEqual(['D20']);
    });

    it('returns empty for scores impossible with given darts', () => {
      // 181 not possible with 3 darts (max is 180)
      expect(computeCheckoutSuggestions(181, 3, 'single_out')).toEqual([]);
    });

    it('returns limited suggestions (max 3)', () => {
      const result = computeCheckoutSuggestions(60, 3, 'single_out');
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('sorts suggestions by number of darts (fewer first)', () => {
      const result = computeCheckoutSuggestions(60, 3, 'single_out');
      if (result.length > 1) {
        // First result should have same or fewer darts than second
        expect(result[0].length).toBeLessThanOrEqual(result[1].length);
      }
    });
  });

  describe('edge cases', () => {
    it('handles boundary score of 1 in single-out', () => {
      const result = computeCheckoutSuggestions(1, 1, 'single_out');
      expect(result).toContainEqual(['S1']);
    });

    it('handles outer bull (25) checkout', () => {
      const singleOut = computeCheckoutSuggestions(25, 1, 'single_out');
      expect(singleOut).toContainEqual(['SB']);
    });
  });
});
