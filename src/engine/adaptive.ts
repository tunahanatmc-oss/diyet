import { KCAL_PER_KG_DEFAULT } from './energy';

/** TDEE_obs = mean_intake - (T_end - T_start) x E / N_days (spec 5.9). */
export function tdeeObserved(meanIntakeKcal: number, trendStart: number, trendEnd: number, nDays: number, E = KCAL_PER_KG_DEFAULT): number {
  return meanIntakeKcal - ((trendEnd - trendStart) * E) / nDays;
}

export interface AdaptiveInput {
  windowDays?: number;          // 14-35, default 21
  loggedDays: number;           // days with complete logs in window
  weighIns: number;             // weigh-ins in window
  meanIntakeKcal: number;
  trendStart: number;
  trendEnd: number;
  tdeePrev: number;             // previous estimate (start: Mifflin TDEE)
  weeksSincePrev?: number;      // for the 150 kcal/week clamp
  E?: number;
  b?: number;
}
export interface AdaptiveResult { ok: boolean; reason?: string; observed?: number; estimate?: number; clamped?: boolean }

export function adaptiveTdee(i: AdaptiveInput): AdaptiveResult {
  const N = Math.min(35, Math.max(14, i.windowDays ?? 21));
  if (i.loggedDays < 0.8 * N) return { ok: false, reason: `Yetersiz veri: ${N} günün en az %80'i kayıtlı olmalı (${i.loggedDays}/${N}).` };
  if (i.weighIns < 8) return { ok: false, reason: `Yetersiz veri: pencere içinde en az 8 tartı gerekli (${i.weighIns}).` };
  const observed = tdeeObserved(i.meanIntakeKcal, i.trendStart, i.trendEnd, N, i.E);
  const b = i.b ?? 0.25;
  let est = i.tdeePrev + b * (observed - i.tdeePrev);
  const maxMove = 150 * Math.max(1, i.weeksSincePrev ?? 1);
  let clamped = false;
  if (Math.abs(est - i.tdeePrev) > maxMove) { est = i.tdeePrev + Math.sign(est - i.tdeePrev) * maxMove; clamped = true; }
  return { ok: true, observed, estimate: est, clamped };
}
