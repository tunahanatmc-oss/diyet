import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { Reference } from './reference';
import { queryHasPrep, queryHasMilk, drinkMl, parseQuery, sizeGroups, primarySizeGroup, defaultSizeOption, isWholeHenEgg, EGG_PREPS, eggClassGrams, eggPrepFactor } from '../engine';

let ref: Reference;
beforeAll(() => { ref = new Reference(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/data/reference.json'), 'utf8'))); });
const top = (q: string, n = 3) => ref.search(q, n);

describe('Turkish multi-word search on the real reference DB', () => {
  it('"haşlanmış tavuk" -> a chicken stewed/boiled entry in top 3', () => {
    const r = top('haşlanmış tavuk');
    expect(r.some(f => /^chicken/i.test(f.name_en) && /stewed|boiled|simmered/i.test(f.name_en))).toBe(true);
    expect(ref.lastPartial).toBe(false);
  });
  it('"ızgara tavuk göğsü" -> grilled chicken breast first', () => {
    const f = top('ızgara tavuk göğsü')[0];
    expect(f.name_en).toMatch(/chicken.*breast.*grilled/i);
  });
  it('"haşlanmış yumurta" -> hard-boiled egg first', () => expect(top('haşlanmış yumurta')[0].name_en).toBe('Egg, whole, cooked, hard-boiled'));
  it('"HAŞLANMIŞ YUMURTA" / "haslanmis yumurta" (case, accents) give the same', () => {
    expect(top('HAŞLANMIŞ YUMURTA')[0].id).toBe(top('haslanmis yumurta')[0].id);
  });
  it('"pilav" -> ready-made pirinç pilavı first, cooked rice right after', () => {
    const r = top('pilav', 5); expect(r[0].name).toBe('Pirinç pilavı');
    expect(r.some(f => /^Rice, .*cooked/.test(f.name_en))).toBe(true);
  });
  it('English words still work, unknown words fall back to nearest partial', () => {
    expect(top('banana')[0].name_en).toMatch(/^Bananas/);
    const r = top('tavuk xyzqw'); expect(ref.lastPartial).toBe(true); expect(r[0].name_en).toMatch(/^Chicken/);
  });
  it('prep words are recognised', () => {
    expect(queryHasPrep('ızgara köfte')).toBe(true);
    expect(queryHasPrep('tavuk göğsü')).toBe(false);
    expect(parseQuery('göğsü')[0].en).toContain('breast');
  });
});

describe('size pickers & egg flow on real data', () => {
  it('banana medium = 118 g (USDA)', () => {
    const g = primarySizeGroup(sizeGroups(ref.search('muz', 1)[0].portions))!;
    expect(defaultSizeOption(g).grams).toBe(118);
  });
  it('every egg prep maps to a USDA entry and raw egg refuse is 12 %', () => {
    for (const p of EGG_PREPS) expect(ref.byDesc(p.desc), p.desc).toBeTruthy();
    const raw = ref.byDesc('Egg, whole, raw, fresh')!;
    expect(raw.refuse?.pct).toBe(12);
    expect(isWholeHenEgg(raw.name_en)).toBe(true);
  });
  it('boiled M egg = 51 g; fried M egg uses USDA 46/50 factor', () => {
    const large = (d: string) => ref.byDesc(d)!.portions.find(p => p.label === 'large')!.gram_weight;
    const raw = large('Egg, whole, raw, fresh');
    expect(eggClassGrams('M', 12, eggPrepFactor(large('Egg, whole, cooked, hard-boiled'), raw)).value).toBe(51);
    expect(eggClassGrams('M', 12, eggPrepFactor(large('Egg, whole, cooked, fried'), raw)).value).toBe(47);
  });
});

describe('coffee drinks (USDA FNDDS)', () => {
  it('"ice latte" -> Coffee, Iced Latte first, with small/medium/large sizes (FNDDS 360/480/600 g)', () => {
    const f = top('ice latte')[0];
    expect(f.name_en).toBe('Coffee, Iced Latte');
    expect(f.sourceLabel).toBe('USDA FNDDS');
    const g = primarySizeGroup(sizeGroups(f.portions))!;
    expect(g.options.map(o => [o.level, o.grams])).toEqual([['s', 360], ['m', 480], ['l', 600]]);
    expect(defaultSizeOption(g).level).toBe('m');
  });
  it('Turkish names find the drinks', () => {
    expect(top('buzlu latte')[0].name_en).toBe('Coffee, Iced Latte');
    expect(top('kapuçino')[0].name_en).toBe('Coffee, Cappuccino');
    expect(top('türk kahvesi')[0].name_en).toBe('Coffee, Turkish');
    expect(top('filtre kahve')[0].name_en).toBe('Coffee, brewed');
    expect(top('yulaf sütlü latte')[0].name_en).toBe('Coffee, Latte, with non-dairy milk');
  });
  it('milk variants: latte has standard / nonfat / non-dairy', () => {
    const latte = ref.byDesc('Coffee, Latte')!;
    expect(ref.milkVariants(latte.id).map(v => v.milk).sort()).toEqual(['nondairy', 'nonfat', 'std']);
    expect(queryHasMilk('yulaf sütlü latte')).toBe(true);
    expect(queryHasMilk('ice latte')).toBe(false);
  });
  it('americano is not in USDA: honest note + espresso', () => {
    const r = ref.search('americano', 5);
    expect(ref.lastNote).toMatch(/americano/);
    expect(r[0].name_en).toMatch(/espresso/i);
  });
  it('ml from the food\'s own fl oz portion', () => {
    expect(Math.round(drinkMl(360, 30)!)).toBe(355);
  });
});
