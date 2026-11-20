import type { NutrientProfile, ValueType } from './types';
import type { Portion } from './measures';
import { cookBatch } from './cooking';

/**
 * Ready-made Turkish home dishes (system recipes). Only the recipe (ingredients in grams) is written by hand;
 * every nutrient value is computed by the recipe engine (cookBatch) from USDA ingredient values.
 * Water contributes mass only. Evaporation is NOT subtracted unless an ingredient gives a USDA cooked form
 * (cookedAs), whose yield is derived from USDA itself: yield = protein(raw) / protein(cooked) (protein is not lost on cooking).
 */
export interface DishIngredient {
  /** exact USDA description of the raw ingredient */
  desc: string;
  name_tr: string;
  grams: number;
  /** water / cooking liquid: mass only */
  water?: boolean;
  /** USDA cooked form used for nutrients + mass (e.g. grilled ground beef: fat drips off) */
  cookedAs?: string;
  note?: string;
}
export type DishVessel = 'kase' | 'tabak' | 'adet';
export interface DishDef {
  /** stable id, never reuse: logs refer to it */
  id: number;
  name_tr: string;
  aliases: string[];
  name_en: string;
  servings: number;
  /** number of pieces the batch makes (adet dishes) */
  pieces?: number;
  vessel: DishVessel;
  /** küçük / orta / büyük in grams (kase/tabak dishes) */
  sizes?: [number, number, number];
  method_tr: string;
  ingredients: DishIngredient[];
  notes?: string[];
}
export interface DishLookup { per100: NutrientProfile; name?: string }
export interface DishResult {
  per100: NutrientProfile;
  totalG: number;
  rawTotalG: number;
  servingG: number;
  pieceG: number | null;
  portions: Portion[];
  ingredients: (DishIngredient & { massG: number })[];
  value_type: ValueType;
  warnings: string[];
}

export const DISH_SOURCE = 'Tahmini – standart tarif, USDA malzemeleri';
export const DISH_PORTION_SOURCE = 'Standart porsiyon varsayımı (tahmini)';
const SIZE_WORDS = ['küçük', 'orta', 'büyük'];

/** Compute one dish from its ingredients. Throws when an ingredient is missing from the reference (no silent gaps). */
export function computeDish(def: DishDef, lookup: (desc: string) => DishLookup | undefined, codes?: string[]): DishResult {
  const warnings: string[] = [];
  const ings: (DishIngredient & { massG: number })[] = [];
  const batch = def.ingredients.map(i => {
    const raw = lookup(i.desc);
    if (!raw) throw new Error(`Malzeme referansta yok: ${i.desc}`);
    if (i.cookedAs) {
      const ck = lookup(i.cookedAs);
      if (!ck) throw new Error(`Pişmiş form referansta yok: ${i.cookedAs}`);
      const pr = raw.per100.protein_g?.value, pc = ck.per100.protein_g?.value;
      if (!pr || !pc) throw new Error(`Verim için protein değeri yok: ${i.desc}`);
      const massG = i.grams * pr / pc;
      ings.push({ ...i, massG });
      return { per100: ck.per100, grams: massG, gramsType: 'estimated' as ValueType, label: i.name_tr };
    }
    ings.push({ ...i, massG: i.grams });
    return { per100: raw.per100, grams: i.grams, gramsType: 'estimated' as ValueType, label: i.name_tr, massOnly: !!i.water };
  });
  const totalG = ings.reduce((s, i) => s + i.massG, 0);
  const rawTotalG = def.ingredients.reduce((s, i) => s + i.grams, 0);
  const out = cookBatch({ ingredients: batch, cookedG: totalG, cookedType: 'estimated', servings: def.servings, codes });
  if (!out.per100) throw new Error('Tarif hesaplanamadı: ' + def.name_tr);
  warnings.push('Pişirmedeki buharlaşma düşülmedi: gerçek yemek biraz daha koyu ise 100 g değeri biraz daha yüksek olur.');
  const servingG = totalG / def.servings;
  const pieceG = def.pieces ? totalG / def.pieces : null;
  const portions: Portion[] = [];
  if (def.vessel === 'adet' && pieceG) portions.push({ label: 'orta adet', amount: 1, unit: 'piece', gram_weight: round1(pieceG), source: 'Tarif: toplam ÷ adet (tahmini)', value_type: 'estimated' });
  if (def.sizes) def.sizes.forEach((g, n) => portions.push({ label: `${SIZE_WORDS[n]} ${def.vessel === 'adet' ? 'tabak' : def.vessel}`, amount: 1, unit: 'other', gram_weight: g, source: DISH_PORTION_SOURCE, value_type: 'estimated' }));
  portions.push({ label: 'porsiyon (tarif ÷ ' + def.servings + ')', amount: 1, unit: 'serving', gram_weight: round1(servingG), source: 'Tarif: toplam ÷ porsiyon (tahmini)', value_type: 'estimated' });
  return { per100: out.per100, totalG, rawTotalG, servingG, pieceG, portions, ingredients: ings, value_type: 'estimated', warnings };
}
const round1 = (x: number) => Math.round(x * 10) / 10;
