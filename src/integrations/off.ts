/** Open Food Facts lookup (online only, cached per product). Data: ODbL 1.0 - attribution shown in the app. */
import type { ValueType } from '../engine';
import type { CustomFoodInput } from '../data/repo';

export interface OffResult { ok: boolean; reason?: string; product?: any; food?: CustomFoodInput; quality?: 'high' | 'medium' | 'low' }

const MAP: [string, string, number][] = [
  ['energy_kcal', 'energy-kcal_100g', 1], ['protein_g', 'proteins_100g', 1], ['fat_g', 'fat_100g', 1], ['carb_g', 'carbohydrates_100g', 1],
  ['fiber_g', 'fiber_100g', 1], ['sugar_g', 'sugars_100g', 1], ['satfat_g', 'saturated-fat_100g', 1], ['sodium_mg', 'sodium_100g', 1000],
];

export async function fetchOff(barcode: string): Promise<any> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,product_name_tr,brands,nutriments,serving_quantity,serving_size,quantity,completeness,nutrition_data_per`;
  const r = await fetch(url);
  if (!r.ok && r.status !== 404) throw new Error('Open Food Facts yanıt vermedi (' + r.status + ')');
  return r.json();
}

export function offToFood(barcode: string, json: any): OffResult {
  if (!json || json.status === 0 || !json.product) return { ok: false, reason: 'Ürün Open Food Facts veritabanında bulunamadı. Etiketten elle ekleyebilirsiniz.' };
  const p = json.product; const n = p.nutriments ?? {};
  const nutrients: CustomFoodInput['nutrients'] = {};
  let have = 0;
  for (const [code, key, mul] of MAP) {
    const v = n[key];
    if (v === undefined || v === null || v === '' || Number.isNaN(+v)) nutrients[code] = { value: null, type: 'missing' };
    else { nutrients[code] = { value: +v * mul, type: 'sourced' as ValueType, ref: 'OFF ' + key }; have++; }
  }
  const quality = have >= 7 && (p.completeness ?? 0) > 0.6 ? 'high' : have >= 4 ? 'medium' : 'low';
  const name = p.product_name_tr || p.product_name || 'Ürün ' + barcode;
  const portions = p.serving_quantity > 0 ? [{ label_tr: 'porsiyon' + (p.serving_size ? ` (${p.serving_size})` : ''), unit: 'serving', amount: 1, gram_weight: +p.serving_quantity, value_type: 'sourced' as ValueType }] : [];
  return {
    ok: true, product: p, quality,
    food: { name_tr: p.brands ? `${name} (${p.brands})` : name, origin: 'off', source: 'off', barcode, source_note: `Open Food Facts, veri kalitesi: ${quality}. ODbL 1.0.`, nutrients, portions, prep_state: 'prepared' },
  };
}
