import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { Reference } from './reference';
import { TURKISH_DISHES } from './dishes';
import { computeDish, nutrientsFor, sizeGroups, primarySizeGroup, defaultSizeOption, DISH_SOURCE } from '../engine';

let ref: Reference;
beforeAll(() => { ref = new Reference(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/data/reference.json'), 'utf8'))); });

const NAMES = ['mercimek çorbası', 'ezogelin', 'menemen', 'kuru fasulye', 'nohut yemeği', 'pirinç pilavı', 'bulgur pilavı', 'karnıyarık', 'imam bayıldı', 'taze fasulye',
  'kısır', 'mantı', 'sigara böreği', 'su böreği', 'lahmacun', 'köfte', 'tavuk sote', 'yayla çorbası', 'sütlaç', 'cacık'];

describe('Ready-made Turkish dishes', () => {
  it('all 20 dishes are built, with unique stable ids, from ingredients that exist in USDA', () => {
    expect(TURKISH_DISHES.length).toBe(20);
    expect(new Set(TURKISH_DISHES.map(d => d.id)).size).toBe(20);
    expect(ref.dishIds.length).toBe(20);
    for (const d of TURKISH_DISHES) for (const i of d.ingredients) {
      const f = ref.byDesc(i.desc); expect(f, i.desc).toBeDefined();
      if (!i.water) expect(f!.per100.energy_kcal?.value, i.desc).not.toBeNull();
    }
  });
  it('every dish has kcal and macros computed, tahmini, with the source label', () => {
    for (const d of TURKISH_DISHES) {
      const f = ref.get(d.id)!;
      expect(f.sourceLabel).toBe(DISH_SOURCE);
      expect(f.per100.energy_kcal.type).toBe('estimated');
      for (const c of ['energy_kcal', 'protein_g', 'fat_g', 'carb_g']) expect(f.per100[c].value, d.name_tr + ' ' + c).toBeGreaterThan(0);
      expect(f.per100.energy_kcal.value!).toBeLessThan(450);
    }
  });
  it('per 100 g equals the engine sum of USDA ingredients divided by the batch mass (water = mass only)', () => {
    const d = TURKISH_DISHES[0];
    const kcal = d.ingredients.filter(i => !i.water).reduce((s, i) => s + nutrientsFor(ref.byDesc(i.desc)!.per100, i.grams).energy_kcal.value!, 0);
    const mass = d.ingredients.reduce((s, i) => s + i.grams, 0);
    expect(ref.get(d.id)!.per100.energy_kcal.value!).toBeCloseTo(kcal / mass * 100, 6);
  });
  it('grilled köfte uses the USDA grilled beef and a USDA-derived cooking yield (< 1)', () => {
    const k = TURKISH_DISHES.find(d => d.name_tr.startsWith('Köfte'))!;
    const r = computeDish(k, x => ref.byDesc(x));
    const beef = r.ingredients.find(i => i.cookedAs)!;
    expect(beef.massG / beef.grams).toBeGreaterThan(0.6); expect(beef.massG / beef.grams).toBeLessThan(0.9);
    expect(r.totalG).toBeLessThan(r.rawTotalG);
    expect(r.pieceG).toBeCloseTo(r.totalG / 16, 6);
  });
  it('bowl/plate sizes become a küçük/orta/büyük picker with grams; medium is the default', () => {
    const f = ref.get(900000001)!;
    const g = primarySizeGroup(sizeGroups(f.portions))!;
    expect(g.label_tr).toBe('Kase');
    expect(g.options.map(o => [o.level, o.grams])).toEqual([['s', 200], ['m', 250], ['l', 350]]);
    expect(defaultSizeOption(g).level).toBe('m');
    expect(g.options[1].value_type).toBe('estimated');
    const lah = primarySizeGroup(sizeGroups(ref.get(900000015)!.portions))!;
    expect(lah.label_tr).toBe('Adet (bütün)');
  });
  it('"mercimek çorbası" finds the Turkish dish first; every dish is found by its name', () => {
    expect(ref.search('mercimek çorbası', 5)[0].id).toBe(900000001);
    expect(ref.search('mercimek corbasi', 5)[0].id).toBe(900000001);
    expect(ref.lastPartial).toBe(false);
    for (const n of NAMES) expect(ref.search(n, 3)[0].dish, n).toBeDefined();
  });
  it('plain ingredient searches are not taken over by dishes', () => {
    expect(ref.search('mercimek', 1)[0].dish).toBeUndefined();
    expect(ref.search('yoğurt', 1)[0].dish).toBeUndefined();
    expect(ref.search('tavuk göğsü', 1)[0].dish).toBeUndefined();
  });
});
