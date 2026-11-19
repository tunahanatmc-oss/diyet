import type { Result, ValueType } from './types';
import { EngineError } from './types';

export interface Measure { code: string; name_tr: string; name_en: string; ml: number; is_default?: boolean }

/** Turkish household measures (spec M6). Defaults, editable by the user. */
export const DEFAULT_MEASURES: Measure[] = [
  { code: 'su_bardagi', name_tr: 'su bardağı', name_en: 'water glass', ml: 200, is_default: true },
  { code: 'cay_bardagi', name_tr: 'çay bardağı', name_en: 'tea glass', ml: 100, is_default: true },
  { code: 'yemek_kasigi', name_tr: 'yemek kaşığı', name_en: 'tablespoon', ml: 15, is_default: true },
  { code: 'tatli_kasigi', name_tr: 'tatlı kaşığı', name_en: 'dessert spoon', ml: 10, is_default: true },
  { code: 'cay_kasigi', name_tr: 'çay kaşığı', name_en: 'teaspoon', ml: 5, is_default: true },
];

/** US volume units in USDA portions (spec 5.4 constants; standard US definitions, shown as estimated). */
export const US_VOLUME_ML: Record<string, number> = { cup: 236.6, tbsp: 14.8, tsp: 4.93, floz: 29.57 };

export interface Portion { unit: string; amount: number; gram_weight: number; label?: string; source?: string; value_type?: ValueType }

export interface VolumeInput {
  n: number;
  measureMl: number;
  calibrationG?: number | null;   // what ONE measure of this food weighed on the user's scale
  portions?: Portion[];
  densityGPerMl?: number | null;
  densitySource?: string;
  waterLike?: boolean;
}

/** Volume -> weight resolution order (spec 5.4). Never a silent guess. */
export function resolveVolume(inp: VolumeInput): Result<number> {
  if (inp.calibrationG && inp.calibrationG > 0) {
    return { value: inp.n * inp.calibrationG, value_type: 'measured', sources: ['Kendi tartımınız (kalibrasyon)'], warnings: [] };
  }
  const vol = (inp.portions ?? []).filter(p => US_VOLUME_ML[p.unit] && p.gram_weight > 0 && p.amount > 0);
  if (vol.length) {
    const order = ['cup', 'tbsp', 'tsp', 'floz'];
    vol.sort((a, b) => order.indexOf(a.unit) - order.indexOf(b.unit));
    const p = vol[0];
    const vPortion = US_VOLUME_ML[p.unit] * p.amount;
    return {
      value: inp.n * p.gram_weight * (inp.measureMl / vPortion),
      value_type: 'estimated',
      sources: [`${p.source ?? 'USDA'} porsiyonu: ${p.amount} ${p.unit} = ${p.gram_weight} g, ${inp.measureMl} ml'ye ölçeklendi`],
      warnings: ['Ölçek dolu/silme farkı sonucu değiştirir; bir kez tartarak kalibre edin.'],
    };
  }
  if (inp.densityGPerMl && inp.densityGPerMl > 0) {
    return { value: inp.n * inp.measureMl * inp.densityGPerMl, value_type: 'estimated', sources: [inp.densitySource ?? 'Yoğunluk'], warnings: [] };
  }
  if (inp.waterLike) {
    return { value: inp.n * inp.measureMl * 1.0, value_type: 'estimated', sources: ['Su benzeri sıvı varsayımı: 1,00 g/ml'], warnings: [] };
  }
  throw new EngineError('NO_WEIGHT_DATA', 'Bu ölçü için güvenilir ağırlık yok. Bir kez tartmak ister misiniz?');
}

/** Non-volume units: piece/slice/serving from a portion; grams directly. */
export function resolveCount(n: number, unit: string, portions: Portion[]): Result<number> {
  const p = portions.find(x => x.unit === unit && x.gram_weight > 0);
  if (!p) throw new EngineError('NO_WEIGHT_DATA', 'Bu birim için porsiyon ağırlığı yok. Gram girin veya bir kez tartın.');
  return { value: (n * p.gram_weight) / (p.amount || 1), value_type: p.value_type ?? 'sourced', sources: [`${p.source ?? 'USDA'}: ${p.label ?? unit} = ${p.gram_weight} g`], warnings: [] };
}

/** Calibration helper: grams one measure holds = weighed grams / count. */
export function calibrate(weighedG: number, count = 1): number {
  if (!(weighedG > 0) || !(count > 0)) throw new EngineError('BAD_INPUT', 'Tartım pozitif olmalı');
  return weighedG / count;
}
