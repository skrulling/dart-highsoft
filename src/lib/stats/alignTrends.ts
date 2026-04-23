export type SeriesInput = {
  /** ISO date strings (YYYY-MM-DD) or millisecond timestamps, aligned with `values`. */
  categories: string[];
  values: number[];
};

export type AlignedSeries = {
  /** Union of all input dates as millisecond timestamps, sorted ascending. */
  timestamps: number[];
  /** For each input series, a list of [timestamp, value] pairs or [timestamp, null] for missing days. */
  seriesData: Array<Array<[number, number | null]>>;
};

/**
 * Aligns N daily time series on a shared x-axis (union of dates, sorted).
 * Missing days for a given series are filled with null so Highcharts renders gaps.
 * Input categories are YYYY-MM-DD strings; output uses ms timestamps for Highcharts
 * `xAxis.type: 'datetime'`.
 */
export function alignDailyTrends(series: SeriesInput[]): AlignedSeries {
  const dateSet = new Set<string>();
  for (const s of series) {
    for (const d of s.categories) dateSet.add(d);
  }
  const sortedDates = Array.from(dateSet).sort();
  const timestamps = sortedDates.map(d => new Date(`${d}T00:00:00Z`).getTime());

  const seriesData = series.map(s => {
    const byDate = new Map<string, number>();
    for (let i = 0; i < s.categories.length; i++) {
      byDate.set(s.categories[i], s.values[i]);
    }
    return sortedDates.map((d, i): [number, number | null] => {
      const v = byDate.get(d);
      return [timestamps[i], v === undefined ? null : v];
    });
  });

  return { timestamps, seriesData };
}
