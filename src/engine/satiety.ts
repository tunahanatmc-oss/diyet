/** Satiety helpers (Stage 6, L4). Pure descriptive stats - no medical claim. */
export interface SatietyRow { kcal: number | null; protein_g: number | null; fiber_g: number | null; hunger_before: number; fullness_after: number; minutes_until_hungry: number | null }

/** Minutes of satiety per 100 kcal - higher = the meal kept you full longer per calorie. */
export function satietyPer100kcal(r: SatietyRow): number | null {
  if (r.minutes_until_hungry == null || !r.kcal || r.kcal <= 0) return null;
  return (r.minutes_until_hungry / r.kcal) * 100;
}

/** Pearson correlation; null if fewer than 3 pairs or no variance. */
export function correlation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length); if (n < 3) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n; const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
