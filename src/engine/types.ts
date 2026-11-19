/** Shared engine types. All engine functions are pure. Units: g, ml, kcal, kg, cm. */
export type ValueType = 'measured' | 'sourced' | 'estimated' | 'missing';

export type PrepState =
  | 'raw' | 'dry' | 'boiled' | 'steamed' | 'baked' | 'roasted' | 'grilled' | 'fried' | 'pan_fried'
  | 'stewed' | 'microwaved' | 'cooked_unspecified' | 'canned' | 'drained' | 'prepared';

export interface Result<T> {
  value: T;
  value_type: ValueType;
  sources: string[];
  warnings: string[];
}

/** A nutrient value per 100 g (or a total). value === null means missing. */
export interface NV { value: number | null; type: ValueType }
export type NutrientProfile = Record<string, NV>;

export class EngineError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export const CORE_NUTRIENTS = ['energy_kcal', 'protein_g', 'fat_g', 'carb_g', 'fiber_g', 'sugar_g', 'satfat_g', 'sodium_mg'] as const;
