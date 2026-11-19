import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { offToFood } from './off';
import { guardNumbers, runTool } from './gemini';
import { openDb } from '../data/db';
import { Reference } from '../data/reference';
import { Services } from '../data/services';
import * as repo from '../data/repo';

const locate = (f: string) => path.resolve(__dirname, '../../node_modules/sql.js/dist', f);
const ref = new Reference(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/data/reference.json'), 'utf8')));

describe('Open Food Facts mapping', () => {
  it('maps per-100 g nutriments, sodium g->mg, missing stays missing', () => {
    const r = offToFood('8690000000000', { status: 1, product: { product_name: 'Ayran', brands: 'X', nutriments: { 'energy-kcal_100g': 37, proteins_100g: 1.8, fat_100g: 1.9, sodium_100g: 0.32 }, serving_quantity: 200 } });
    expect(r.ok).toBe(true);
    expect(r.food!.nutrients.sodium_mg.value).toBeCloseTo(320);
    expect(r.food!.nutrients.fiber_g.value).toBeNull();
    expect(r.food!.nutrients.fiber_g.type).toBe('missing');
    expect(r.food!.portions![0].gram_weight).toBe(200);
  });
  it('not found -> clear reason', () => expect(offToFood('1', { status: 0 }).ok).toBe(false));
});

describe('AI guard & tools', () => {
  it('hides numbers not present in tool outputs', () => {
    const g = guardNumbers('Pişmiş 197 g olur, yaklaşık 252 kcal.', [{ name: 'cook_convert', args: {}, result: { cooked_g: 197 } }]);
    expect(g.text).toContain('197'); expect(g.text).toContain('[?]'); expect(g.hidden).toBe(1);
  });
  it('cook_convert uses the user measured yield; refuses without one', async () => {
    const db = await openDb(null, locate); const sv = new Services(db, ref);
    expect(runTool(sv, 'cook_convert', { raw_food_id: 168877, raw_g: 70 }).error).toBe('NO_YIELD');
    repo.saveCookSession(db, { raw_food_id: 168877, raw_g: 180, method: 'boiled', cooked_g: 520, cooked_value_type: 'measured' });
    const r = runTool(sv, 'cook_convert', { raw_food_id: 168877, raw_g: 70 });
    expect(r.cooked_g).toBeCloseTo(202.2, 1);
  });
  it('resolve_amount via Turkish measure name', async () => {
    const db = await openDb(null, locate); const sv = new Services(db, ref);
    const r = runTool(sv, 'resolve_amount', { food_id: 168877, amount: 1, unit: 'su bardağı' });
    expect(r.value_type).toBe('estimated'); expect(r.grams).toBeCloseTo(156.4, 1);
  });
});
