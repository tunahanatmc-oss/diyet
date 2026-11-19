import type { NutrientProfile, Result, ValueType } from './types';
import { EngineError } from './types';
import { nutrientsFor, sumProfiles, per100Of } from './nutrients';
import { weakest } from './valueType';

/** Y = C / R (spec 5.2). */
export function yieldRatio(rawG: number, cookedG: number): number {
  if (!(rawG > 0) || !(cookedG > 0)) throw new EngineError('BAD_INPUT', 'Çiğ ve pişmiş ağırlık pozitif olmalı');
  return cookedG / rawG;
}

/** C = R x Y_source; always estimated. */
export function cookedFromYield(rawG: number, y: number, source: string): Result<number> {
  return { value: rawG * y, value_type: 'estimated', sources: [source], warnings: ['Pişmiş ağırlık kaynaklı verim katsayısından tahmin edildi. Tartmak daha doğru.'] };
}

/** raw_equiv_g = cooked_eaten_g / Y. */
export function cookedToRaw(cookedEatenG: number, y: number): number {
  if (!(y > 0)) throw new EngineError('BAD_INPUT', 'Verim oranı pozitif olmalı');
  return cookedEatenG / y;
}

export function rawToCooked(rawG: number, y: number): number { return rawG * y; }

/** Edible weight after refuse (bone, skin, peel) - spec 5.3. */
export function edibleGrams(grossG: number, refusePct: number): number {
  if (refusePct < 0 || refusePct >= 100) throw new EngineError('BAD_INPUT', 'Atık yüzdesi 0-100 arasında olmalı');
  return grossG * (1 - refusePct / 100);
}
export function refusePctFromWeights(boneG: number, grossG: number): number { return (boneG / grossG) * 100; }

/** Nutrients added by cooking fat: N(fat food, added_g x absorption/100). */
export function addedFatNutrients(fatPer100: NutrientProfile, addedG: number, absorptionPct: number, absorptionType: ValueType = 'estimated'): NutrientProfile {
  return nutrientsFor(fatPer100, (addedG * absorptionPct) / 100, absorptionPct >= 100 ? 'measured' : absorptionType);
}

export interface BatchIngredient { per100: NutrientProfile; grams: number; gramsType?: ValueType; label?: string; massOnly?: boolean /* water: mass, 0 kcal */ }
export interface Discarded { per100?: NutrientProfile; grams: number; label?: string; fatOnly?: boolean }
export interface BatchInput {
  ingredients: BatchIngredient[];          // raw weights; water contributes mass only (give it a zero/empty profile or skip)
  addedFat?: { per100: NutrientProfile; grams: number; absorptionPct: number; absorptionType?: ValueType };
  discarded?: Discarded[];
  cookedG?: number | null;                 // weighed final weight
  cookedType?: ValueType;                  // 'measured' if weighed
  servings?: number;
  codes?: string[];
}
export interface BatchOutput {
  total: ReturnType<typeof sumProfiles>;
  per100: NutrientProfile | null;
  perServing: NutrientProfile | null;
  rawTotalG: number;
  cookedG: number | null;
  yield: number | null;
  value_type: ValueType;
  warnings: string[];
}

/** Cooked batch / recipe totals (spec 5.2.3-5.2.5). No retention factors in MVP. */
export function cookBatch(inp: BatchInput): BatchOutput {
  const warnings: string[] = [];
  const parts: NutrientProfile[] = inp.ingredients.filter(i => !i.massOnly).map(i => nutrientsFor(i.per100, i.grams, i.gramsType ?? 'measured'));
  if (inp.addedFat && inp.addedFat.grams > 0) {
    parts.push(addedFatNutrients(inp.addedFat.per100, inp.addedFat.grams, inp.addedFat.absorptionPct, inp.addedFat.absorptionType));
    if (inp.addedFat.absorptionPct < 100) warnings.push('Yağ emilim yüzdesi sizin girdiğiniz değer; sonuç tahmini.');
  }
  for (const d of inp.discarded ?? []) {
    if (d.per100) {
      const neg = nutrientsFor(d.per100, -d.grams, 'estimated');
      if (d.fatOnly) for (const k of Object.keys(neg)) if (k !== 'fat_g' && k !== 'energy_kcal' && k !== 'satfat_g') neg[k] = { value: 0, type: 'estimated' };
      parts.push(neg);
    } else if (d.grams > 0) warnings.push(`Atılan kısım (${d.label ?? 'bilinmiyor'}) bileşimi bilinmiyor; toplam tahmini.`);
  }
  const total = sumProfiles(parts, inp.codes);
  const rawTotalG = inp.ingredients.reduce((s, i) => s + i.grams, 0);
  const cookedG = inp.cookedG && inp.cookedG > 0 ? inp.cookedG : null;
  let vt: ValueType = 'measured';
  for (const nv of Object.values(total)) vt = weakest(vt, nv.type === 'missing' ? 'estimated' : nv.type);
  if ((inp.discarded ?? []).some(d => !d.per100 && d.grams > 0)) vt = weakest(vt, 'estimated');
  let per100: NutrientProfile | null = null;
  const totalProfile: NutrientProfile = Object.fromEntries(Object.entries(total).map(([k, v]) => [k, { value: v.value, type: v.type }]));
  if (cookedG) per100 = per100Of(totalProfile, cookedG, inp.cookedType ?? 'measured');
  else {
    warnings.push('Pişmiş ağırlık girilmedi: toplam doğru, ancak 100 g değerleri çiğ toplam ağırlığa göre tahmini.');
    if (rawTotalG > 0) per100 = per100Of(totalProfile, rawTotalG, 'estimated');
  }
  const perServing = inp.servings && inp.servings > 0 ? per100Of(totalProfile, inp.servings * 100, 'measured') : null;
  // per100Of(total, servings*100) == total / servings
  return { total, per100, perServing, rawTotalG, cookedG, yield: cookedG && rawTotalG ? cookedG / rawTotalG : null, value_type: vt, warnings };
}

/** Per 100 g cooked from a total energy (convenience for tests/UI). */
export function per100Cooked(totalKcal: number, cookedG: number): number { return (totalKcal / cookedG) * 100; }
