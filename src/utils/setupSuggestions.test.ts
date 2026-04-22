import { describe, it, expect } from 'vitest';
import { computeSetupSuggestions } from './setupSuggestions';

describe('computeSetupSuggestions - gating', () => {
  it('returns null for single_out', () => {
    expect(computeSetupSuggestions(100, 3, 'single_out')).toBeNull();
  });

  it('returns null when dartsLeft is 0', () => {
    expect(computeSetupSuggestions(100, 0, 'double_out')).toBeNull();
  });

  it('returns null when remaining score is 0', () => {
    expect(computeSetupSuggestions(0, 3, 'double_out')).toBeNull();
  });

  it('returns null when score is already a target (checkout handles it)', () => {
    for (const target of [32, 16, 8, 4, 2, 40, 20, 10]) {
      expect(computeSetupSuggestions(target, 3, 'double_out')).toBeNull();
    }
  });
});

describe('computeSetupSuggestions - single-dart setups', () => {
  it('34 with 1 dart: S2 leaves 32', () => {
    const result = computeSetupSuggestions(34, 1, 'double_out');
    expect(result).toEqual({ path: ['S2'], target: 32 });
  });

  it('33 with 1 dart: S1 leaves 32', () => {
    const result = computeSetupSuggestions(33, 1, 'double_out');
    expect(result).toEqual({ path: ['S1'], target: 32 });
  });

  it('24 with 1 dart: S8 leaves 16 (32 unreachable)', () => {
    const result = computeSetupSuggestions(24, 1, 'double_out');
    expect(result).toEqual({ path: ['S8'], target: 16 });
  });

  it('prefers 32-line over 40-line when both reachable at same depth', () => {
    // From 50: reach 40 via S10, reach 32 via S18/D9 (both score 18). 32 wins.
    const result = computeSetupSuggestions(50, 1, 'double_out');
    expect(result?.target).toBe(32);
    expect(result?.path).toEqual(['S18']); // S preferred over D at equal score (easier target)
  });

  it('falls back to 40-line when 32-line unreachable', () => {
    // From 60 with 1 dart: 60-32=28 not a valid S/D throw (max 25 for singles, 28 needs D14=28 ✓)
    // Actually 28 is D14. So 32 IS reachable. Pick a case where only 40-line works.
    // From 45 with 1 dart: 45-32=13 (S13 ✓). So 32 still reachable. Pick harder.
    // From 55 with 1 dart: 55-32=23 (not a valid S/D; singles max 25, but 23 is not a double (odd); S23 doesn't exist (singles 1-20,25)).
    // 55-16=39 (not S/D: S39 no, D19.5 no). 55-8=47 (no). 55-4=51 (no). 55-2=53 (no). 32-line unreachable.
    // 55-40=15 (S15 ✓). Target 40.
    const result = computeSetupSuggestions(55, 1, 'double_out');
    expect(result).toEqual({ path: ['S15'], target: 40 });
  });

  it('returns null when no S/D reaches any target in 1 dart', () => {
    // 99 with 1 dart: max reduction 50 (DB). 99-50=49, not a target.
    // 99-anything S/D: 99-50=49, 99-40=59, etc. None hit 32,16,8,4,2,40,20,10.
    const result = computeSetupSuggestions(99, 1, 'double_out');
    expect(result).toBeNull();
  });
});

describe('computeSetupSuggestions - multi-dart setups', () => {
  it('finds 2-dart setup when 1-dart impossible', () => {
    // 99 with 2 darts: can we reach 32 in 2 S/D throws? 99-32=67. Need two S/D summing to 67.
    // S17+D25(DB)=17+50=67 ✓. Or D17+SB=34+25=59 no. SB+D21 no. S17+DB valid.
    // Lots of options; algorithm picks one where last throw has max scored value (tie-break).
    const result = computeSetupSuggestions(99, 2, 'double_out');
    expect(result?.target).toBe(32);
    expect(result?.path.length).toBe(2);
    // Last throw should be DB (50) per tie-break (largest scored value)
    expect(result?.path[1]).toBe('DB');
  });

  it('prefers shorter path even if longer path reaches higher-priority target', () => {
    // If 40 reachable in 1 dart but 32 requires 2 darts, pick 40.
    // From 60 with 2 darts: 60-32=28 (D14 single throw). 1-dart to 32 exists. Pick 32 in 1 dart.
    const result1 = computeSetupSuggestions(60, 2, 'double_out');
    expect(result1?.target).toBe(32);
    expect(result1?.path.length).toBe(1);

    // Craft case where 1-dart only reaches 40 but 2-dart reaches 32.
    // 55: 1-dart to 40 via S15. 2-dart to 32? 55-32=23. S3+D10=3+20=23 ✓. So 2-dart to 32 exists.
    // But depth-first wins: return 1-dart to 40.
    const result2 = computeSetupSuggestions(55, 2, 'double_out');
    expect(result2?.target).toBe(40);
    expect(result2?.path.length).toBe(1);
  });

  it('returns null when no path reaches any target within dartsLeft', () => {
    // 200 with 3 darts: max reduction 150 (3×DB). 200-150=50 not a target. 200-32=168 too big.
    // No path reaches any target.
    const result = computeSetupSuggestions(200, 3, 'double_out');
    expect(result).toBeNull();
  });
});

describe('computeSetupSuggestions - dart-reactive scenario (user example)', () => {
  it('after hitting S1 from 35 with 2 darts, setup tip for 34/1-dart leaves 32', () => {
    // Before throw: 35, 2 darts → checkout S3, D16 (existing checkout util handles).
    // After S1: 34, 1 dart left. No 1-dart checkout. Setup: S2 → 32.
    const result = computeSetupSuggestions(34, 1, 'double_out');
    expect(result).toEqual({ path: ['S2'], target: 32 });
  });
});
