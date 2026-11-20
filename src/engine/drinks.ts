import { normalize } from './search';

/**
 * Coffee-shop drinks from USDA FNDDS (Survey Foods). FNDDS gives each drink up to three milk versions:
 * the standard recipe (reduced-fat 2 % milk in FNDDS' latte/cappuccino/mocha recipes), ", nonfat" and ", with non-dairy milk"
 * (FNDDS "Non-dairy milk, NFS" — oat/almond/soy are not separated).
 */
export type MilkType = 'std' | 'nonfat' | 'nondairy';
export const MILK_TR: Record<MilkType, { name: string; sub: string }> = {
  std: { name: 'Yarım yağlı süt', sub: 'FNDDS standart tarifi: %2 yağlı süt' },
  nonfat: { name: 'Yağsız süt', sub: 'nonfat' },
  nondairy: { name: 'Bitkisel süt', sub: 'yulaf / badem / soya — FNDDS ayırmıyor' },
};

/** Milk type of an FNDDS coffee description and the description with the milk part removed (the variant key). */
export function milkVariant(desc: string): { key: string; milk: MilkType } {
  let milk: MilkType = 'std'; let key = desc;
  if (/, with non-dairy milk/i.test(key)) { milk = 'nondairy'; key = key.replace(/, with non-dairy milk( and whipped cream)?/i, (_m, wc) => (wc ? ', with whipped cream' : '')); }
  else if (/, nonfat\b/i.test(key)) { milk = 'nonfat'; key = key.replace(/, nonfat\b/i, ''); }
  return { key: key.toLowerCase(), milk };
}

const MILK_WORDS = ['sut', 'sutlu', 'yagsiz', 'nonfat', 'skim', 'yarim', 'tam', 'bitkisel', 'yulaf', 'badem', 'soya', 'oat', 'almond', 'soy', 'dairy', 'milk', 'laktozsuz'];
/** Did the user already say which milk? ("yulaf sütlü latte", "skim latte") */
export function queryHasMilk(query: string): boolean {
  return normalize(query).split(' ').some(t => MILK_WORDS.includes(t) || MILK_WORDS.some(w => w.length >= 4 && t.startsWith(w)));
}

/** ml for a weight of a drink, from the food's own "1 fl oz = x g" portion (1 US fl oz = 29.57 ml). */
export function drinkMl(grams: number, flOzGrams: number | null | undefined): number | null {
  return flOzGrams && flOzGrams > 0 ? (grams / flOzGrams) * 29.5735 : null;
}
