import { describe, it, expect } from 'vitest';
import { alignDailyTrends } from './alignTrends';

const toDay = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

describe('alignDailyTrends', () => {
  it('returns empty output for empty input', () => {
    const out = alignDailyTrends([]);
    expect(out.timestamps).toEqual([]);
    expect(out.seriesData).toEqual([]);
  });

  it('aligns two fully-overlapping series without nulls', () => {
    const out = alignDailyTrends([
      { categories: ['2026-01-01', '2026-01-02'], values: [10, 20] },
      { categories: ['2026-01-01', '2026-01-02'], values: [5, 7] },
    ]);
    expect(out.timestamps).toEqual([toDay('2026-01-01'), toDay('2026-01-02')]);
    expect(out.seriesData[0]).toEqual([[toDay('2026-01-01'), 10], [toDay('2026-01-02'), 20]]);
    expect(out.seriesData[1]).toEqual([[toDay('2026-01-01'), 5], [toDay('2026-01-02'), 7]]);
  });

  it('fills missing days with null in the union axis', () => {
    const out = alignDailyTrends([
      { categories: ['2026-01-01', '2026-01-03'], values: [10, 30] },
      { categories: ['2026-01-02'], values: [99] },
    ]);
    expect(out.timestamps).toEqual([
      toDay('2026-01-01'),
      toDay('2026-01-02'),
      toDay('2026-01-03'),
    ]);
    expect(out.seriesData[0]).toEqual([
      [toDay('2026-01-01'), 10],
      [toDay('2026-01-02'), null],
      [toDay('2026-01-03'), 30],
    ]);
    expect(out.seriesData[1]).toEqual([
      [toDay('2026-01-01'), null],
      [toDay('2026-01-02'), 99],
      [toDay('2026-01-03'), null],
    ]);
  });

  it('sorts dates ascending regardless of input order', () => {
    const out = alignDailyTrends([
      { categories: ['2026-03-05', '2026-01-10'], values: [2, 1] },
    ]);
    expect(out.timestamps).toEqual([toDay('2026-01-10'), toDay('2026-03-05')]);
    expect(out.seriesData[0]).toEqual([
      [toDay('2026-01-10'), 1],
      [toDay('2026-03-05'), 2],
    ]);
  });
});
