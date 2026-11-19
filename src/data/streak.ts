/** Logging streak: consecutive calendar days (local dates, YYYY-MM-DD) with at least one log entry. Computed locally. */
export interface Streak { current: number; activeToday: boolean; best: number; lastDate: string | null }

function prevDay(iso: string): string { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }

/**
 * current = run of consecutive logged days ending today; if today has no log yet the run ending yesterday still
 * counts (the streak is not broken until a full day is missed). Future dates are ignored.
 */
export function computeStreak(dates: Iterable<string>, today: string): Streak {
  const set = new Set<string>();
  for (const d of dates) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today) set.add(d);
  const sorted = [...set].sort();
  let best = 0, run = 0, prev: string | null = null;
  for (const d of sorted) { run = prev && prevDay(d) === prev ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  const activeToday = set.has(today);
  let cur = 0; let d = activeToday ? today : prevDay(today);
  while (set.has(d)) { cur++; d = prevDay(d); }
  return { current: cur, activeToday, best, lastDate: sorted.length ? sorted[sorted.length - 1] : null };
}
