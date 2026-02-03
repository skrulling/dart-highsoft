import { describe, it, expect } from 'vitest';
import {
  polarFromPoint,
  getSegmentByAngle,
  classifyRing,
  computeHit,
  isDoubleKind,
  segmentFromSelection,
  BOARD_RADIUS,
  DOUBLE_OUTER_RADIUS,
  DOUBLE_INNER_RADIUS,
  TRIPLE_OUTER_RADIUS,
  TRIPLE_INNER_RADIUS,
  OUTER_BULL_RADIUS,
  INNER_BULL_RADIUS,
} from './dartboard';

describe('polarFromPoint', () => {
  const cx = 250;
  const cy = 250;

  it('returns r=0 for center point', () => {
    const result = polarFromPoint(250, 250, cx, cy);
    expect(result.r).toBe(0);
  });

  it('returns correct radius for point directly above center', () => {
    const result = polarFromPoint(250, 150, cx, cy);
    expect(result.r).toBeCloseTo(100, 5);
    expect(result.angleFromTopCw).toBeCloseTo(0, 1);
  });

  it('returns 90 degrees for point to the right', () => {
    const result = polarFromPoint(350, 250, cx, cy);
    expect(result.angleFromTopCw).toBeCloseTo(90, 1);
  });

  it('returns 180 degrees for point below', () => {
    const result = polarFromPoint(250, 350, cx, cy);
    expect(result.angleFromTopCw).toBeCloseTo(180, 1);
  });

  it('returns 270 degrees for point to the left', () => {
    const result = polarFromPoint(150, 250, cx, cy);
    expect(result.angleFromTopCw).toBeCloseTo(270, 1);
  });
});

describe('getSegmentByAngle', () => {
  it('returns 20 for angle near 0 degrees (top)', () => {
    expect(getSegmentByAngle(0)).toBe(20);
    expect(getSegmentByAngle(8)).toBe(20);
  });

  it('returns 1 for angle around 18 degrees', () => {
    expect(getSegmentByAngle(18)).toBe(1);
    expect(getSegmentByAngle(26)).toBe(1);
  });

  it('returns 5 for angle near 360 (wraps to 20)', () => {
    expect(getSegmentByAngle(352)).toBe(20);
  });

  it('handles all 20 segments in order', () => {
    const expectedOrder = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    for (let i = 0; i < 20; i++) {
      // Each segment spans 18 degrees, with 20 centered at the top (0 degrees)
      // The code offsets by 9 degrees so 20 is centered at 0, meaning segment boundaries are at -9, 9, 27...
      const angle = i * 18; // Start of each segment (20 starts at -9 which wraps to 351, but 0 is well within 20's range)
      expect(getSegmentByAngle(angle)).toBe(expectedOrder[i]);
    }
  });
});

describe('classifyRing', () => {
  it('returns InnerBull for radius <= INNER_BULL_RADIUS', () => {
    expect(classifyRing(0)).toBe('InnerBull');
    expect(classifyRing(INNER_BULL_RADIUS)).toBe('InnerBull');
  });

  it('returns OuterBull for radius between inner and outer bull', () => {
    expect(classifyRing(INNER_BULL_RADIUS + 1)).toBe('OuterBull');
    expect(classifyRing(OUTER_BULL_RADIUS)).toBe('OuterBull');
  });

  it('returns Single for radius between outer bull and triple', () => {
    expect(classifyRing(OUTER_BULL_RADIUS + 1)).toBe('Single');
    expect(classifyRing(TRIPLE_INNER_RADIUS)).toBe('Single');
  });

  it('returns Triple for radius in triple ring', () => {
    expect(classifyRing(TRIPLE_INNER_RADIUS + 1)).toBe('Triple');
    expect(classifyRing(TRIPLE_OUTER_RADIUS)).toBe('Triple');
  });

  it('returns Single for radius between triple and double', () => {
    expect(classifyRing(TRIPLE_OUTER_RADIUS + 1)).toBe('Single');
    expect(classifyRing(DOUBLE_INNER_RADIUS)).toBe('Single');
  });

  it('returns Double for radius in double ring', () => {
    expect(classifyRing(DOUBLE_INNER_RADIUS + 1)).toBe('Double');
    expect(classifyRing(DOUBLE_OUTER_RADIUS)).toBe('Double');
  });

  it('returns BoardOutside for radius beyond double ring', () => {
    expect(classifyRing(DOUBLE_OUTER_RADIUS + 1)).toBe('BoardOutside');
    expect(classifyRing(300)).toBe('BoardOutside');
  });
});

describe('computeHit', () => {
  const center = 250;

  it('returns Miss for click outside board', () => {
    const result = computeHit(0, 0);
    expect(result.kind).toBe('Miss');
    expect(result.scored).toBe(0);
    expect(result.label).toBe('Miss');
  });

  it('returns InnerBull (DB) for center click', () => {
    const result = computeHit(center, center);
    expect(result.kind).toBe('InnerBull');
    expect(result.scored).toBe(50);
    expect(result.label).toBe('DB');
  });

  it('returns OuterBull (SB) for click in outer bull area', () => {
    const result = computeHit(center, center - 20);
    expect(result.kind).toBe('OuterBull');
    expect(result.scored).toBe(25);
    expect(result.label).toBe('SB');
  });

  it('returns Triple for click in triple ring', () => {
    // Triple ring is around radius 120-140
    const result = computeHit(center, center - 130);
    expect(result.kind).toBe('Triple');
    expect(result.scored).toBe(60); // T20
    expect(result.label).toBe('T20');
  });

  it('returns Double for click in double ring', () => {
    // Double ring is around radius 210-230
    const result = computeHit(center, center - 220);
    expect(result.kind).toBe('Double');
    expect(result.scored).toBe(40); // D20
    expect(result.label).toBe('D20');
  });

  it('returns Single for click in single area', () => {
    // Inner single area is around radius 31-119
    const result = computeHit(center, center - 80);
    expect(result.kind).toBe('Single');
    expect(result.scored).toBe(20); // S20
    expect(result.label).toBe('S20');
  });

  it('correctly identifies segment value for different angles', () => {
    // Click to the right of center should be different segment
    const result = computeHit(center + 80, center);
    expect(result.kind).toBe('Single');
    expect(result.scored).toBe(6); // S6 is at 90 degrees
    expect(result.label).toBe('S6');
  });
});

describe('isDoubleKind', () => {
  it('returns true for Double', () => {
    expect(isDoubleKind('Double')).toBe(true);
  });

  it('returns true for InnerBull', () => {
    expect(isDoubleKind('InnerBull')).toBe(true);
  });

  it('returns false for Single', () => {
    expect(isDoubleKind('Single')).toBe(false);
  });

  it('returns false for Triple', () => {
    expect(isDoubleKind('Triple')).toBe(false);
  });

  it('returns false for OuterBull', () => {
    expect(isDoubleKind('OuterBull')).toBe(false);
  });

  it('returns false for Miss', () => {
    expect(isDoubleKind('Miss')).toBe(false);
  });
});

describe('segmentFromSelection', () => {
  describe('bulls', () => {
    it('returns OuterBull for SB', () => {
      const result = segmentFromSelection('SB');
      expect(result.kind).toBe('OuterBull');
      expect(result.scored).toBe(25);
      expect(result.label).toBe('SB');
    });

    it('returns InnerBull for DB', () => {
      const result = segmentFromSelection('DB');
      expect(result.kind).toBe('InnerBull');
      expect(result.scored).toBe(50);
      expect(result.label).toBe('DB');
    });
  });

  describe('singles', () => {
    it('returns Single with correct value', () => {
      const result = segmentFromSelection('S', 20);
      expect(result.kind).toBe('Single');
      expect(result.scored).toBe(20);
      expect(result.label).toBe('S20');
    });

    it('clamps value to minimum 1', () => {
      const result = segmentFromSelection('S', 0);
      expect(result.scored).toBe(1);
      expect(result.label).toBe('S1');
    });

    it('clamps value to maximum 20', () => {
      const result = segmentFromSelection('S', 25);
      expect(result.scored).toBe(20);
      expect(result.label).toBe('S20');
    });
  });

  describe('doubles', () => {
    it('returns Double with correct value', () => {
      const result = segmentFromSelection('D', 20);
      expect(result.kind).toBe('Double');
      expect(result.scored).toBe(40);
      expect(result.label).toBe('D20');
    });

    it('returns correct score for D16', () => {
      const result = segmentFromSelection('D', 16);
      expect(result.scored).toBe(32);
      expect(result.label).toBe('D16');
    });
  });

  describe('triples', () => {
    it('returns Triple with correct value', () => {
      const result = segmentFromSelection('T', 20);
      expect(result.kind).toBe('Triple');
      expect(result.scored).toBe(60);
      expect(result.label).toBe('T20');
    });

    it('returns correct score for T19', () => {
      const result = segmentFromSelection('T', 19);
      expect(result.scored).toBe(57);
      expect(result.label).toBe('T19');
    });
  });
});

describe('board geometry constants', () => {
  it('has correct board radius', () => {
    expect(BOARD_RADIUS).toBe(230);
  });

  it('has correct ring hierarchy', () => {
    expect(INNER_BULL_RADIUS).toBeLessThan(OUTER_BULL_RADIUS);
    expect(OUTER_BULL_RADIUS).toBeLessThan(TRIPLE_INNER_RADIUS);
    expect(TRIPLE_INNER_RADIUS).toBeLessThan(TRIPLE_OUTER_RADIUS);
    expect(TRIPLE_OUTER_RADIUS).toBeLessThan(DOUBLE_INNER_RADIUS);
    expect(DOUBLE_INNER_RADIUS).toBeLessThan(DOUBLE_OUTER_RADIUS);
  });
});
