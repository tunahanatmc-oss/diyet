import type { NV, NutrientProfile, ValueType } from './types';
import { weakest } from './valueType';

/** N(x) = amount_per_100g x grams / 100 (spec 5.1). Missing stays missing. */
export function nutrientAmount(per100: number | null, grams: number): number | null {
  if (per100 === null || per100 === undefined || Number.isNaN(per100)) return null;
  return (per100 * grams) / 100;
}

/** Nutrients of `grams` of a food. gramsType propagates (e.g. estimated volume conversion). */
export function nutrientsFor(per100: NutrientProfile, grams: number, gramsType: ValueType = 'measured'): NutrientProfile {
  const out: NutrientProfile = {};
  for (const [k, nv] of Object.entries(per100)) {
    const v = nutrientAmount(nv.value, grams);
    out[k] = { value: v, type: v === null ? 'missing' : weakest(nv.type, gramsType) };
  }
  return out;
}

export interface TotalNV extends NV { incomplete: boolean; known: number }

/**
 * Sum profiles. If any component is missing, the total is flagged incomplete and its type is 'missing'
 * (weakest), while `known` carries the sum of the known parts for display ("en az ...").
 */
export function sumProfiles(profiles: NutrientProfile[], codes?: string[]): Record<string, TotalNV> {
  const keys = codes ?? Array.from(new Set(profiles.flatMap(p => Object.keys(p))));
  const out: Record<string, TotalNV> = {};
  for (const k of keys) {
    let known = 0; let incomplete = false; const types: ValueType[] = [];
    for (const p of profiles) {
      const nv = p[k];
      if (!nv || nv.value === null) { incomplete = true; types.push('missing'); continue; }
      known += nv.value; types.push(nv.type);
    }
    out[k] = { value: incomplete ? null : known, type: profiles.length ? weakest(...types) : 'measured', incomplete, known };
  }
  return out;
}

/** Scale a total profile to per-100 g of a given mass. */
export function per100Of(total: NutrientProfile, massG: number, massType: ValueType = 'measured'): NutrientProfile {
  const out: NutrientProfile = {};
  for (const [k, nv] of Object.entries(total)) {
    out[k] = nv.value === null ? { value: null, type: 'missing' } : { value: (nv.value / massG) * 100, type: weakest(nv.type, massType) };
  }
  return out;
}

/** Label values per serving -> per 100 g (custom food entry). */
export function per100FromServing(valuePerServing: number, servingG: number): number {
  if (!(servingG > 0)) throw new Error('Porsiyon ağırlığı pozitif olmalı');
  return (valuePerServing / servingG) * 100;
}
