export const TREND_ALPHA = 0.1;

/** One EWMA step with gap handling: a_eff = 1 - (1 - a)^g (spec 5.8). */
export function trendStep(prev: number, w: number, gapDays = 1, a = TREND_ALPHA): number {
  const aEff = 1 - (1 - a) ** Math.max(1, gapDays);
  return prev + aEff * (w - prev);
}
export function alphaEff(gapDays: number, a = TREND_ALPHA): number { return 1 - (1 - a) ** gapDays; }

export interface WeighIn { datetime: string; value: number }
export interface TrendPoint { date: string; weight: number; trend: number }

function dayKey(iso: string): string { return iso.slice(0, 10); }
function dayDiff(a: string, b: string): number { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

/** Trend series; multiple weigh-ins per day -> earliest one is used. */
export function trendSeries(weighIns: WeighIn[], a = TREND_ALPHA): TrendPoint[] {
  const byDay = new Map<string, WeighIn>();
  for (const w of [...weighIns].sort((x, y) => x.datetime.localeCompare(y.datetime))) {
    const k = dayKey(w.datetime); if (!byDay.has(k)) byDay.set(k, w);
  }
  const days = [...byDay.keys()].sort();
  const out: TrendPoint[] = [];
  let prev: number | null = null; let prevDay: string | null = null;
  for (const d of days) {
    const w = byDay.get(d)!.value;
    const t: number = prev === null ? w : trendStep(prev, w, dayDiff(prevDay!, d), a);
    out.push({ date: d, weight: w, trend: t }); prev = t; prevDay = d;
  }
  return out;
}

/** Trend value on a given date (carried forward from the last weigh-in, T = T_prev). */
export function trendOn(series: TrendPoint[], date: string): number | null {
  let v: number | null = null;
  for (const p of series) { if (p.date <= date) v = p.trend; else break; }
  return v;
}

/** Weekly change = T(today) - T(today - 7 d). */
export function weeklyChange(series: TrendPoint[], today: string): number | null {
  const t = trendOn(series, today);
  const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7);
  const t7 = trendOn(series, d.toISOString().slice(0, 10));
  return t === null || t7 === null ? null : t - t7;
}
