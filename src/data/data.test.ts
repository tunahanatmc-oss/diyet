import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { openDb, q, one, userVersion, type DB } from './db';
import * as repo from './repo';
import { exportBackup, restoreBackup, tableChecksums, RestoreError, logsCsv } from './backup';
import { Reference } from './reference';
import { Services } from './services';
import { SCHEMA_VERSION } from './schema';
import { zipSync, strToU8 } from 'fflate';

const wasmDir = path.resolve(__dirname, '../../node_modules/sql.js/dist');
const locate = (f: string) => path.join(wasmDir, f);
let ref: Reference;

beforeAll(() => {
  ref = new Reference(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/data/reference.json'), 'utf8')));
});

async function seeded(): Promise<DB> {
  const db = await openDb(null, locate);
  repo.saveProfile(db, { sex: 'male', birth_date: '1998-09-10', height_cm: 180, activity_level: 'moderate', goal: 'lose', goal_rate_kg_per_week: 0.5, uses_scale: 1, language: 'tr', protein_per_kg: 1.6, fat_fraction: 0.3 });
  repo.addMetric(db, 'weight_kg', 80, '2026-11-01T07:00:00+03:00', 'sabah, çok şükür');
  const id = repo.saveCustomFood(db, { name_tr: 'Ev yapımı ayran (şişe)', origin: 'label', nutrients: { energy_kcal: { value: 38, type: 'sourced' }, fat_g: { value: null, type: 'missing' } } });
  repo.addLog(db, { datetime: '2026-11-01T08:00:00+03:00', meal: 'breakfast', food_id: id, entered_amount: 200, entered_unit: 'g', grams: 200, grams_value_type: 'measured', snapshot: { name: 'Ev yapımı ayran (şişe)', source: 'label', kind: 'custom', per100: { energy_kcal: { value: 38, type: 'sourced' }, fat_g: { value: null, type: 'missing' } } } });
  repo.addWater(db, 250);
  return db;
}

describe('persistence', () => {
  it('fresh install migrates to current schema and seeds measures', async () => {
    const db = await openDb(null, locate);
    expect(userVersion(db)).toBe(SCHEMA_VERSION);
    expect(repo.measures(db).map(m => m.ml)).toEqual([200, 100, 15, 10, 5]);
  });
  it('custom food ids start at 1,000,000,000', async () => {
    const db = await seeded();
    expect(repo.listCustomFoods(db)[0].id).toBe(1_000_000_000);
  });
  it('missing stays missing (not 0) and is flagged incomplete', async () => {
    const db = await seeded(); const s = new Services(db, ref).daySummary('2026-11-01');
    expect(s.total.fat_g.incomplete).toBe(true); expect(s.total.energy_kcal.value).toBeCloseTo(76);
  });
  it('snapshot keeps history stable when the food changes later', async () => {
    const db = await seeded(); const sv = new Services(db, ref);
    const id = repo.listCustomFoods(db)[0].id;
    repo.saveCustomFood(db, { id, name_tr: 'Ev yapımı ayran (şişe)', origin: 'label', nutrients: { energy_kcal: { value: 99, type: 'sourced' } } });
    expect(sv.daySummary('2026-11-01').total.energy_kcal.value).toBeCloseTo(76);
  });
  it('deleting a recipe used in logs is blocked -> archived', async () => {
    const db = await seeded();
    const rid = repo.saveRecipe(db, { name: 'Mercimek çorbası', servings: 6, method: 'boiled', cooked_weight_g: 2000, cooked_weight_value_type: 'measured', ingredients: [{ food_id: 168877, amount: 100, unit: 'g', grams: 100, grams_value_type: 'measured' }] });
    repo.addLog(db, { datetime: '2026-11-02T13:00:00+03:00', meal: 'lunch', recipe_id: rid, entered_amount: 1, entered_unit: 'porsiyon', grams: 333, grams_value_type: 'measured', snapshot: { name: 'x', source: 'recipe', kind: 'recipe', per100: {} } });
    expect(() => db.run('DELETE FROM recipe WHERE id=?', [rid])).toThrow();
    expect(repo.deleteOrArchiveRecipe(db, rid)).toBe('archived');
  });
});

describe('backup / restore (spec 7.3)', () => {
  it('round trip: export -> wipe -> restore -> every table equal, Turkish chars intact', async () => {
    const db = await seeded();
    const before = await tableChecksums(db);
    const { bytes } = await exportBackup(db, ref.meta.version);
    db.close();
    const restored = await restoreBackup(bytes, locate);
    expect(await tableChecksums(restored)).toEqual(before);
    expect(one<any>(restored, 'SELECT name_tr FROM custom_food')!.name_tr).toBe('Ev yapımı ayran (şişe)');
    expect(one<any>(restored, 'SELECT note FROM body_metric')!.note).toBe('sabah, çok şükür');
  });
  it('corrupt / wrong file refused', async () => {
    await expect(restoreBackup(new Uint8Array([1, 2, 3]), locate)).rejects.toBeInstanceOf(RestoreError);
    const fake = zipSync({ 'manifest.json': strToU8('{"app":"other"}'), 'personal.json': strToU8('{}') });
    await expect(restoreBackup(fake, locate)).rejects.toBeInstanceOf(RestoreError);
  });
  it('backup from newer schema refused with clear message', async () => {
    const p = strToU8('{"tables":{}}');
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', p))].map(b => b.toString(16).padStart(2, '0')).join('');
    const z = zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'diyet-app', schema_version: 999, parts: { 'personal.json': h } })), 'personal.json': p });
    await expect(restoreBackup(z, locate)).rejects.toThrow(/daha yeni/);
  });
  it('tampered checksum refused', async () => {
    const db = await seeded(); const { bytes } = await exportBackup(db, 'x');
    const { unzipSync } = await import('fflate'); const f = unzipSync(bytes);
    f['personal.json'] = strToU8('{"tables":{}}');
    await expect(restoreBackup(zipSync(f), locate)).rejects.toThrow(/bozulmuş/);
  });
  it('CSV has BOM and Turkish letters', async () => {
    const db = await seeded(); const c = logsCsv(db);
    expect(c.charCodeAt(0)).toBe(0xfeff); expect(c).toContain('Ev yapımı ayran');
  });
});

describe('reference data & services', () => {
  it('reference has USDA foods with Turkish names, search is accent-insensitive', () => {
    expect(ref.size).toBeGreaterThan(7000);
    const a = ref.search('pirinc')[0]; const b = ref.search('PİRİNÇ')[0];
    expect(a.id).toBe(b.id); expect(a.name.toLocaleLowerCase('tr')).toContain('pirinç');
  });
  it('search p95 < 100 ms on the full reference DB', () => {
    const qs = ['pirinç', 'tavuk göğsü', 'ispanak', 'yogurt', 'apple', 'kıyma', 'mercimek', 'su', 'ekmek', 'zeytinyağı', 'cheese', 'domates', 'beef ground raw', 'süt', 'muz'];
    const times: number[] = [];
    for (let r = 0; r < 4; r++) for (const s of qs) { const t = performance.now(); ref.search(s); times.push(performance.now() - t); }
    times.sort((x, y) => x - y); expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(100);
  });
  it('rice journey: 1 su bardağı raw rice resolves from USDA cup portion (estimated), not a guess', async () => {
    const db = await openDb(null, locate); const sv = new Services(db, ref);
    const rice = ref.get(168877)!; const m = repo.measures(db)[0];
    const r = sv.resolveAmount(rice, 1, 'm:' + m.id);
    expect(r.value_type).toBe('estimated'); expect(r.value).toBeCloseTo(185 * 200 / 236.6, 1);
    repo.saveCalibration(db, m.id, rice.id, 170);
    const c = sv.resolveAmount(rice, 1, 'm:' + m.id); expect(c.value).toBe(170); expect(c.value_type).toBe('measured');
  });
  it('recipe totals: water adds mass only; added oil with absorption', async () => {
    const db = await openDb(null, locate); const sv = new Services(db, ref);
    const water = ref.search('su, musluk')[0];
    const oil = ref.get(ref.search('zeytinyağı')[0].id)!;
    const r: repo.Recipe = { name: 'Pilav', servings: 2, method: 'boiled', cooked_weight_g: 520, cooked_weight_value_type: 'measured', ingredients: [
      { food_id: 168877, amount: 180, unit: 'g', grams: 180, grams_value_type: 'measured' },
      { food_id: water.id, amount: 360, unit: 'g', grams: 360, grams_value_type: 'measured', is_water: 1 },
      { food_id: oil.id, amount: 10, unit: 'g', grams: 10, grams_value_type: 'measured', is_added_fat: 1, fat_absorption_pct: 100 },
    ] };
    const t = sv.recipeTotals(r);
    const expected = 365 * 1.8 + (oil.per100.energy_kcal.value! * 10) / 100;
    expect(t.total.energy_kcal.value).toBeCloseTo(expected, 1);
    expect(t.per100!.energy_kcal.value).toBeCloseTo(expected / 520 * 100, 1);
  });
});

describe('search ranking', () => {
  it('exact Turkish alias ranks first', () => {
    expect(ref.search('pirinç')[0].id).toBe(168877);
    expect(ref.search('domates')[0].name).toMatch(/^Domates/);
    expect(ref.search('ispanak')[0].name).toMatch(/Ispanak/);
  });
});
