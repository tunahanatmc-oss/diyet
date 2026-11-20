import { EngineError, type Result } from './types';

/**
 * Hen eggs by EU / Turkish weight class.
 * Class limits: Commission Delegated Regulation (EU) 2023/2465 Art. 5 (same as Reg. (EC) No 589/2008 Art. 4, which it replaced):
 *   XL ≥ 73 g · L 63–<73 g · M 53–<63 g · S < 53 g  (weight of the egg in shell).
 * Representative in-shell weight per class (our documented choice, value_type 'estimated'):
 *   M and L = midpoint of their range (58, 68). S and XL are open-ended: S = 48 g (5 g under the S/M limit,
 *   mirroring M's half-width), XL = 76 g (3 g over the limit; XL eggs rarely exceed ~80 g).
 * Edible part = in-shell weight × (1 − refuse). Refuse for "Egg, whole, raw, fresh" in USDA SR Legacy (NDB 01123) = 12 % (shell).
 */
export type EggClass = 'S' | 'M' | 'L' | 'XL';
export interface EggClassDef { code: EggClass; name_tr: string; range: string; shellG: number }
export const EU_EGG_CLASSES: EggClassDef[] = [
  { code: 'S', name_tr: 'Küçük', range: '< 53 g', shellG: 48 },
  { code: 'M', name_tr: 'Orta', range: '53–63 g', shellG: 58 },
  { code: 'L', name_tr: 'Büyük', range: '63–73 g', shellG: 68 },
  { code: 'XL', name_tr: 'Çok büyük', range: '≥ 73 g', shellG: 76 },
];
export const EGG_CLASS_SOURCE = 'AB Yönetmeliği 2023/2465 md. 5 (eski 589/2008 md. 4) ağırlık sınıfları';
export const EGG_NOTE = 'AB sınıfı ortalama ağırlık, kabuk düşüldü';

/** Preparation options; `desc` is the exact USDA SR Legacy description they map to. */
export interface EggPrep { code: string; name_tr: string; desc: string }
export const EGG_PREPS: EggPrep[] = [
  { code: 'boiled', name_tr: 'Haşlanmış', desc: 'Egg, whole, cooked, hard-boiled' },
  { code: 'fried', name_tr: 'Sahanda / kızarmış', desc: 'Egg, whole, cooked, fried' },
  { code: 'omelet', name_tr: 'Omlet', desc: 'Egg, whole, cooked, omelet' },
  { code: 'scrambled', name_tr: 'Çırpılmış (scrambled)', desc: 'Egg, whole, cooked, scrambled' },
  { code: 'poached', name_tr: 'Poşe', desc: 'Egg, whole, cooked, poached' },
  { code: 'raw', name_tr: 'Çiğ', desc: 'Egg, whole, raw, fresh' },
];
export const EGG_RAW_DESC = 'Egg, whole, raw, fresh';

/** Whole hen egg (raw or cooked), the foods the egg flow applies to. Not white/yolk, dried, frozen, duck, goose, quail. */
export function isWholeHenEgg(descEn: string): boolean {
  const d = descEn.toLowerCase();
  if (/dried|frozen|powder|substitute|white|yolk|duck|goose|quail|turkey|pickled|salted/.test(d)) return false;
  return /^egg, whole, (raw, fresh|cooked, (hard-boiled|fried|omelet|scrambled|poached))$/.test(d) || /^eggs, grade a, large, egg whole$/.test(d);
}

export function eggPrepFor(descEn: string): EggPrep | undefined {
  const d = descEn.toLowerCase();
  return EGG_PREPS.find(p => p.desc.toLowerCase() === d) ?? (/^eggs, grade a, large, egg whole$/.test(d) ? EGG_PREPS.find(p => p.code === 'raw') : undefined);
}

/**
 * Cooked-state factor from USDA's own "1 large" portions: grams of 1 large egg in this preparation ÷ grams of 1 large raw egg
 * (hard-boiled 50/50, fried 46/50, scrambled & omelet 61/50 — those include the milk/fat of USDA's recipe).
 */
export function eggPrepFactor(prepLargeG: number | null | undefined, rawLargeG: number | null | undefined): number {
  if (!prepLargeG || !rawLargeG || !(prepLargeG > 0) || !(rawLargeG > 0)) return 1;
  return prepLargeG / rawLargeG;
}

/** Edible grams of ONE egg of an EU class: shellG × (1 − refuse%) × prepFactor. */
export function eggClassGrams(cls: EggClass, refusePct: number, prepFactor = 1): Result<number> {
  const c = EU_EGG_CLASSES.find(x => x.code === cls);
  if (!c) throw new EngineError('BAD_INPUT', 'Bilinmeyen yumurta sınıfı');
  if (!(refusePct >= 0 && refusePct < 100)) throw new EngineError('BAD_INPUT', 'Kabuk oranı 0–100 arası olmalı');
  const g = c.shellG * (1 - refusePct / 100) * prepFactor;
  return {
    value: Math.round(g * 10) / 10,
    value_type: 'estimated',
    sources: [`${EGG_CLASS_SOURCE}: ${c.code} ${c.range}, temsilî ${c.shellG} g kabuklu`, `USDA SR Legacy kabuk (refuse) %${refusePct}`]
      .concat(prepFactor !== 1 ? [`USDA pişirme oranı ×${prepFactor.toFixed(2)} (1 büyük yumurta, pişmiş ÷ çiğ)`] : []),
    warnings: [EGG_NOTE],
  };
}
