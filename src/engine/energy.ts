import type { Result } from './types';

export type Sex = 'male' | 'female';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';
export type Goal = 'lose' | 'maintain' | 'gain';

/** PAL presets (spec 5.7; widely used convention - shown as estimated). */
export const PAL: Record<Activity, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9 };
export const ACTIVITY_TR: Record<Activity, string> = {
  sedentary: 'Hareketsiz (masa başı)', light: 'Hafif aktif (haftada 1-3 gün)', moderate: 'Orta aktif (haftada 3-5 gün)',
  very: 'Çok aktif (haftada 6-7 gün)', extra: 'Aşırı aktif (ağır iş / günde 2 antrenman)',
};
export const KCAL_PER_KG_DEFAULT = 7700;

/** Mifflin-St Jeor (PMID 2305711): 10W + 6.25H - 5A + s; s = +5 men, -161 women. */
export function bmrMifflin(weightKg: number, heightCm: number, ageY: number, sex: Sex): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageY + (sex === 'male' ? 5 : -161);
}

export function tdee(bmr: number, activityOrPal: Activity | number): number {
  const pal = typeof activityOrPal === 'number' ? activityOrPal : PAL[activityOrPal];
  return bmr * pal;
}

export function ageFromBirth(birthIso: string, onIso: string): number {
  const b = new Date(birthIso); const d = new Date(onIso);
  let a = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) a--;
  return a;
}

/** kcal_target = TDEE + delta; delta = rate_kg_per_week x E / 7 (negative for loss). Floor at BMR with warning. */
export function goalTarget(tdeeKcal: number, bmr: number, goal: Goal, rateKgPerWeek: number, E = KCAL_PER_KG_DEFAULT, allowBelowBmr = false): Result<number> {
  const sign = goal === 'lose' ? -1 : goal === 'gain' ? 1 : 0;
  const delta = (sign * Math.abs(rateKgPerWeek) * E) / 7;
  let kcal = tdeeKcal + delta;
  const warnings: string[] = [];
  if (kcal < bmr) {
    warnings.push(`Hedef (${Math.round(kcal)} kcal) bazal metabolizmanın (${Math.round(bmr)} kcal) altında.`);
    if (!allowBelowBmr) { kcal = bmr; warnings.push('Hedef BMR seviyesine yükseltildi. Daha düşük hedef için açıkça onay verin.'); }
  }
  return { value: kcal, value_type: 'estimated', sources: ['Mifflin-St Jeor + PAL', `${E} kcal/kg (kabaca kural, tahmini)`], warnings };
}

export interface MacroTargets { protein_g: number; fat_g: number; carb_g: number; warnings: string[] }

/** protein = p x W; fat = f x kcal / 9; carb = remainder / 4 (spec 5.7). */
export function macroTargets(kcal: number, weightKg: number, p = 1.6, f = 0.3): MacroTargets {
  const protein_g = p * weightKg;
  const fat_g = (f * kcal) / 9;
  const carb_g = (kcal - 4 * protein_g - 9 * fat_g) / 4;
  const warnings = carb_g < 0 ? ['Karbonhidrat hedefi negatif çıktı; protein veya yağ oranını düşürün.'] : [];
  return { protein_g, fat_g, carb_g, warnings };
}
