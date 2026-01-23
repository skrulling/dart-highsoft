import { describe, it, expect } from 'vitest';
import { applyThrow, calculate3DartAverage, type FinishRule, type TurnForAverage } from './x01';
import type { SegmentResult } from './dartboard';

describe('x01 Game Logic', () => {
  describe('Double-Out Finish Rule', () => {
    const finish: FinishRule = 'double_out';

    describe('Exact Finish with Doubles', () => {
      it('should finish when hitting D20 from 40', () => {
        const segment: SegmentResult = { kind: 'Double', value: 20, scored: 40, label: 'D20' };
        const result = applyThrow(40, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });

      it('should finish when hitting D16 from 32', () => {
        const segment: SegmentResult = { kind: 'Double', value: 16, scored: 32, label: 'D16' };
        const result = applyThrow(32, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });

      it('should finish when hitting D10 from 20', () => {
        const segment: SegmentResult = { kind: 'Double', value: 10, scored: 20, label: 'D10' };
        const result = applyThrow(20, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });

      it('should finish when hitting D1 from 2', () => {
        const segment: SegmentResult = { kind: 'Double', value: 1, scored: 2, label: 'D1' };
        const result = applyThrow(2, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });

      it('should finish when hitting D2 from 4', () => {
        const segment: SegmentResult = { kind: 'Double', value: 2, scored: 4, label: 'D2' };
        const result = applyThrow(4, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });
    });

    describe('Finish with Inner Bull (50)', () => {
      it('should finish when hitting inner bull from 50', () => {
        const segment: SegmentResult = { kind: 'InnerBull', scored: 50, label: 'DB' };
        const result = applyThrow(50, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });
    });

    describe('Bust - Going Below Zero', () => {
      it('should bust when D20 brings score below 0 from 30', () => {
        const segment: SegmentResult = { kind: 'Double', value: 20, scored: 40, label: 'D20' };
        const result = applyThrow(30, segment, finish);
        expect(result).toEqual({ newScore: 30, busted: true, finished: false });
      });

      it('should bust when T20 brings score below 0 from 50', () => {
        const segment: SegmentResult = { kind: 'Triple', value: 20, scored: 60, label: 'T20' };
        const result = applyThrow(50, segment, finish);
        expect(result).toEqual({ newScore: 50, busted: true, finished: false });
      });

      it('should bust when inner bull brings score below 0 from 40', () => {
        const segment: SegmentResult = { kind: 'InnerBull', scored: 50, label: 'DB' };
        const result = applyThrow(40, segment, finish);
        expect(result).toEqual({ newScore: 40, busted: true, finished: false });
      });
    });

    describe('Bust - Landing on 1', () => {
      it('should bust when landing on 1 (D20 from 41)', () => {
        const segment: SegmentResult = { kind: 'Double', value: 20, scored: 40, label: 'D20' };
        const result = applyThrow(41, segment, finish);
        expect(result).toEqual({ newScore: 41, busted: true, finished: false });
      });

      it('should bust when landing on 1 (D16 from 33)', () => {
        const segment: SegmentResult = { kind: 'Double', value: 16, scored: 32, label: 'D16' };
        const result = applyThrow(33, segment, finish);
        expect(result).toEqual({ newScore: 33, busted: true, finished: false });
      });

      it('should bust when landing on 1 (S20 from 21)', () => {
        const segment: SegmentResult = { kind: 'Single', value: 20, scored: 20, label: 'S20' };
        const result = applyThrow(21, segment, finish);
        expect(result).toEqual({ newScore: 21, busted: true, finished: false });
      });
    });

    describe('Bust - Finishing with Non-Double', () => {
      it('should bust when finishing with single from exact score', () => {
        const segment: SegmentResult = { kind: 'Single', value: 20, scored: 20, label: 'S20' };
        const result = applyThrow(20, segment, finish);
        expect(result).toEqual({ newScore: 20, busted: true, finished: false });
      });

      it('should bust when finishing with triple from exact score', () => {
        const segment: SegmentResult = { kind: 'Triple', value: 20, scored: 60, label: 'T20' };
        const result = applyThrow(60, segment, finish);
        expect(result).toEqual({ newScore: 60, busted: true, finished: false });
      });

      it('should bust when finishing with outer bull from 25', () => {
        const segment: SegmentResult = { kind: 'OuterBull', scored: 25, label: 'SB' };
        const result = applyThrow(25, segment, finish);
        expect(result).toEqual({ newScore: 25, busted: true, finished: false });
      });

      it('should bust when finishing with miss from 0', () => {
        const segment: SegmentResult = { kind: 'Miss', scored: 0, label: 'Miss' };
        const result = applyThrow(0, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: true, finished: false });
      });
    });

    describe('Normal Scoring', () => {
      it('should reduce score normally when not finishing', () => {
        const segment: SegmentResult = { kind: 'Single', value: 20, scored: 20, label: 'S20' };
        const result = applyThrow(100, segment, finish);
        expect(result).toEqual({ newScore: 80, busted: false, finished: false });
      });

      it('should handle double scoring without finishing', () => {
        const segment: SegmentResult = { kind: 'Double', value: 20, scored: 40, label: 'D20' };
        const result = applyThrow(100, segment, finish);
        expect(result).toEqual({ newScore: 60, busted: false, finished: false });
      });

      it('should handle triple scoring', () => {
        const segment: SegmentResult = { kind: 'Triple', value: 20, scored: 60, label: 'T20' };
        const result = applyThrow(100, segment, finish);
        expect(result).toEqual({ newScore: 40, busted: false, finished: false });
      });

      it('should handle miss (zero score)', () => {
        const segment: SegmentResult = { kind: 'Miss', scored: 0, label: 'Miss' };
        const result = applyThrow(100, segment, finish);
        expect(result).toEqual({ newScore: 100, busted: false, finished: false });
      });

      it('should allow score of 2 (not bust)', () => {
        const segment: SegmentResult = { kind: 'Single', value: 1, scored: 1, label: 'S1' };
        const result = applyThrow(3, segment, finish);
        expect(result).toEqual({ newScore: 2, busted: false, finished: false });
      });
    });
  });

  describe('Single-Out Finish Rule', () => {
    const finish: FinishRule = 'single_out';

    describe('Exact Finish with Any Segment', () => {
      it('should finish with single from exact score', () => {
        const segment: SegmentResult = { kind: 'Single', value: 20, scored: 20, label: 'S20' };
        const result = applyThrow(20, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });

      it('should finish with double from exact score', () => {
        const segment: SegmentResult = { kind: 'Double', value: 20, scored: 40, label: 'D20' };
        const result = applyThrow(40, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });

      it('should finish with triple from exact score', () => {
        const segment: SegmentResult = { kind: 'Triple', value: 20, scored: 60, label: 'T20' };
        const result = applyThrow(60, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });

      it('should finish with inner bull from 50', () => {
        const segment: SegmentResult = { kind: 'InnerBull', scored: 50, label: 'DB' };
        const result = applyThrow(50, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });

      it('should finish with outer bull from 25', () => {
        const segment: SegmentResult = { kind: 'OuterBull', scored: 25, label: 'SB' };
        const result = applyThrow(25, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });

      it('should finish with S1 from 1', () => {
        const segment: SegmentResult = { kind: 'Single', value: 1, scored: 1, label: 'S1' };
        const result = applyThrow(1, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });

      it('should finish with D1 from 2', () => {
        const segment: SegmentResult = { kind: 'Double', value: 1, scored: 2, label: 'D1' };
        const result = applyThrow(2, segment, finish);
        expect(result).toEqual({ newScore: 0, busted: false, finished: true });
      });
    });

    describe('Bust - Only Going Below Zero', () => {
      it('should bust when going below 0 with single', () => {
        const segment: SegmentResult = { kind: 'Single', value: 20, scored: 20, label: 'S20' };
        const result = applyThrow(10, segment, finish);
        expect(result).toEqual({ newScore: 10, busted: true, finished: false });
      });

      it('should bust when going below 0 with double', () => {
        const segment: SegmentResult = { kind: 'Double', value: 20, scored: 40, label: 'D20' };
        const result = applyThrow(30, segment, finish);
        expect(result).toEqual({ newScore: 30, busted: true, finished: false });
      });

      it('should bust when going below 0 with triple', () => {
        const segment: SegmentResult = { kind: 'Triple', value: 20, scored: 60, label: 'T20' };
        const result = applyThrow(50, segment, finish);
        expect(result).toEqual({ newScore: 50, busted: true, finished: false });
      });
    });

    describe('No Bust on Landing on 1', () => {
      it('should NOT bust when landing on 1 (S20 from 21)', () => {
        const segment: SegmentResult = { kind: 'Single', value: 20, scored: 20, label: 'S20' };
        const result = applyThrow(21, segment, finish);
        expect(result).toEqual({ newScore: 1, busted: false, finished: false });
      });

      it('should NOT bust when landing on 1 (D20 from 41)', () => {
        const segment: SegmentResult = { kind: 'Double', value: 20, scored: 40, label: 'D20' };
        const result = applyThrow(41, segment, finish);
        expect(result).toEqual({ newScore: 1, busted: false, finished: false });
      });

      it('should NOT bust when landing on 1 (outer bull from 26)', () => {
        const segment: SegmentResult = { kind: 'OuterBull', scored: 25, label: 'SB' };
        const result = applyThrow(26, segment, finish);
        expect(result).toEqual({ newScore: 1, busted: false, finished: false });
      });
    });

    describe('Normal Scoring', () => {
      it('should reduce score normally', () => {
        const segment: SegmentResult = { kind: 'Single', value: 20, scored: 20, label: 'S20' };
        const result = applyThrow(100, segment, finish);
        expect(result).toEqual({ newScore: 80, busted: false, finished: false });
      });

      it('should handle miss (zero score)', () => {
        const segment: SegmentResult = { kind: 'Miss', scored: 0, label: 'Miss' };
        const result = applyThrow(100, segment, finish);
        expect(result).toEqual({ newScore: 100, busted: false, finished: false });
      });

      it('should handle outer bull scoring', () => {
        const segment: SegmentResult = { kind: 'OuterBull', scored: 25, label: 'SB' };
        const result = applyThrow(100, segment, finish);
        expect(result).toEqual({ newScore: 75, busted: false, finished: false });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle maximum single score (S20 = 20)', () => {
      const segment: SegmentResult = { kind: 'Single', value: 20, scored: 20, label: 'S20' };
      const result = applyThrow(501, segment, 'single_out');
      expect(result).toEqual({ newScore: 481, busted: false, finished: false });
    });

    it('should handle maximum double score (D20 = 40)', () => {
      const segment: SegmentResult = { kind: 'Double', value: 20, scored: 40, label: 'D20' };
      const result = applyThrow(501, segment, 'double_out');
      expect(result).toEqual({ newScore: 461, busted: false, finished: false });
    });

    it('should handle maximum triple score (T20 = 60)', () => {
      const segment: SegmentResult = { kind: 'Triple', value: 20, scored: 60, label: 'T20' };
      const result = applyThrow(501, segment, 'single_out');
      expect(result).toEqual({ newScore: 441, busted: false, finished: false });
    });

    it('should handle starting from 201', () => {
      const segment: SegmentResult = { kind: 'Single', value: 1, scored: 1, label: 'S1' };
      const result = applyThrow(201, segment, 'double_out');
      expect(result).toEqual({ newScore: 200, busted: false, finished: false });
    });

    it('should handle starting from 301', () => {
      const segment: SegmentResult = { kind: 'Single', value: 1, scored: 1, label: 'S1' };
      const result = applyThrow(301, segment, 'single_out');
      expect(result).toEqual({ newScore: 300, busted: false, finished: false });
    });
  });

  describe('3-Dart Average Calculation (PDC Standard)', () => {
    describe('Standard Cases - All 3-Dart Turns', () => {
      it('should calculate average for perfect 180s', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 180, darts_thrown: 3 },
          { busted: false, total_scored: 180, darts_thrown: 3 },
          { busted: false, total_scored: 180, darts_thrown: 3 },
        ];
        expect(calculate3DartAverage(turns)).toBe(180);
      });

      it('should calculate average for mixed scores', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: false, total_scored: 45, darts_thrown: 3 },
          { busted: false, total_scored: 30, darts_thrown: 3 },
        ];
        // (60 + 45 + 30) / 9 darts * 3 = 135/9 * 3 = 45
        expect(calculate3DartAverage(turns)).toBe(45);
      });

      it('should calculate average for low scores', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 26, darts_thrown: 3 },
          { busted: false, total_scored: 26, darts_thrown: 3 },
          { busted: false, total_scored: 26, darts_thrown: 3 },
        ];
        expect(calculate3DartAverage(turns)).toBe(26);
      });

      it('should handle single turn', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 100, darts_thrown: 3 },
        ];
        expect(calculate3DartAverage(turns)).toBe(100);
      });
    });

    describe('Busted Turns - Excluded Completely', () => {
      it('should exclude busted turn from calculation', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: true, total_scored: 40, darts_thrown: 3 }, // Excluded
          { busted: false, total_scored: 45, darts_thrown: 3 },
        ];
        // Only count non-busted: (60 + 45) / 6 darts * 3 = 105/6 * 3 = 52.5
        expect(calculate3DartAverage(turns)).toBe(52.5);
      });

      it('should exclude multiple busted turns', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: true, total_scored: 80, darts_thrown: 3 }, // Excluded
          { busted: true, total_scored: 70, darts_thrown: 3 }, // Excluded
          { busted: false, total_scored: 60, darts_thrown: 3 },
        ];
        // Only count: (60 + 60) / 6 darts * 3 = 120/6 * 3 = 60
        expect(calculate3DartAverage(turns)).toBe(60);
      });

      it('should return 0 if all turns are busted', () => {
        const turns: TurnForAverage[] = [
          { busted: true, total_scored: 60, darts_thrown: 3 },
          { busted: true, total_scored: 45, darts_thrown: 3 },
        ];
        expect(calculate3DartAverage(turns)).toBe(0);
      });
    });

    describe('Variable Dart Counts - Checkout Scenarios', () => {
      it('should handle 1-dart checkout finish', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: false, total_scored: 40, darts_thrown: 1 }, // D20 checkout
        ];
        // (60 + 40) / 4 darts * 3 = 100/4 * 3 = 75
        expect(calculate3DartAverage(turns)).toBe(75);
      });

      it('should handle 2-dart checkout finish', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: false, total_scored: 50, darts_thrown: 2 }, // T18, D8
        ];
        // (60 + 50) / 5 darts * 3 = 110/5 * 3 = 66
        expect(calculate3DartAverage(turns)).toBe(66);
      });

      it('should handle mixed dart counts', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: false, total_scored: 100, darts_thrown: 3 },
          { busted: false, total_scored: 32, darts_thrown: 2 }, // T16, D8
          { busted: false, total_scored: 40, darts_thrown: 1 }, // D20
        ];
        // (60 + 100 + 32 + 40) / 9 darts * 3 = 232/9 * 3 = 77.333...
        expect(calculate3DartAverage(turns)).toBeCloseTo(77.333, 2);
      });
    });

    describe('Default Dart Count - When Not Specified', () => {
      it('should default to 3 darts when darts_thrown not provided', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 60 }, // No darts_thrown
          { busted: false, total_scored: 45 }, // No darts_thrown
        ];
        // Assumes 3 darts each: (60 + 45) / 6 * 3 = 52.5
        expect(calculate3DartAverage(turns)).toBe(52.5);
      });

      it('should handle mix of specified and default dart counts', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: false, total_scored: 45 }, // Defaults to 3
          { busted: false, total_scored: 32, darts_thrown: 2 },
        ];
        // (60 + 45 + 32) / (3 + 3 + 2) * 3 = 137/8 * 3 = 51.375
        expect(calculate3DartAverage(turns)).toBe(51.375);
      });
    });

    describe('Edge Cases', () => {
      it('should return 0 for empty array', () => {
        expect(calculate3DartAverage([])).toBe(0);
      });

      it('should handle turns with 0 score', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 0, darts_thrown: 3 },
          { busted: false, total_scored: 60, darts_thrown: 3 },
        ];
        // (0 + 60) / 6 * 3 = 30
        expect(calculate3DartAverage(turns)).toBe(30);
      });

      it('should handle all zero scores', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 0, darts_thrown: 3 },
          { busted: false, total_scored: 0, darts_thrown: 3 },
        ];
        expect(calculate3DartAverage(turns)).toBe(0);
      });

      it('should ignore turns with null total_scored', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: false, total_scored: null, darts_thrown: 3 }, // Ignored
          { busted: false, total_scored: 45, darts_thrown: 3 },
        ];
        // Only count valid scores: (60 + 45) / 6 * 3 = 52.5
        expect(calculate3DartAverage(turns)).toBe(52.5);
      });

      it('should return 0 if all scores are null', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: null, darts_thrown: 3 },
          { busted: false, total_scored: null, darts_thrown: 3 },
        ];
        expect(calculate3DartAverage(turns)).toBe(0);
      });
    });

    describe('Real-World Tournament Scenarios', () => {
      it('should calculate professional-level average (90+)', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 100, darts_thrown: 3 },
          { busted: false, total_scored: 85, darts_thrown: 3 },
          { busted: false, total_scored: 95, darts_thrown: 3 },
          { busted: false, total_scored: 92, darts_thrown: 3 },
        ];
        // (100 + 85 + 95 + 92) / 12 * 3 = 372/12 * 3 = 93
        expect(calculate3DartAverage(turns)).toBe(93);
      });

      it('should calculate intermediate-level average (50-60)', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: false, total_scored: 45, darts_thrown: 3 },
          { busted: false, total_scored: 55, darts_thrown: 3 },
          { busted: true, total_scored: 40, darts_thrown: 3 }, // Excluded
          { busted: false, total_scored: 50, darts_thrown: 3 },
        ];
        // (60 + 45 + 55 + 50) / 12 * 3 = 210/12 * 3 = 52.5
        expect(calculate3DartAverage(turns)).toBe(52.5);
      });

      it('should handle 9-darter scenario (perfect game)', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 180, darts_thrown: 3 }, // T20, T20, T20
          { busted: false, total_scored: 180, darts_thrown: 3 }, // T20, T20, T20
          { busted: false, total_scored: 141, darts_thrown: 3 }, // T20, T19, D12
        ];
        // (180 + 180 + 141) / 9 * 3 = 501/9 * 3 = 167
        expect(calculate3DartAverage(turns)).toBe(167);
      });

      it('should handle typical 501 game with checkout', () => {
        const turns: TurnForAverage[] = [
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: false, total_scored: 100, darts_thrown: 3 },
          { busted: false, total_scored: 85, darts_thrown: 3 },
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: true, total_scored: 96, darts_thrown: 3 }, // Bust - excluded
          { busted: false, total_scored: 60, darts_thrown: 3 },
          { busted: false, total_scored: 96, darts_thrown: 2 }, // T20, D18 checkout
        ];
        // Non-busted: (60+100+85+60+60+96) / 17 * 3 = 461/17 * 3 = 81.353
        expect(calculate3DartAverage(turns)).toBeCloseTo(81.353, 2);
      });
    });
  });
});
