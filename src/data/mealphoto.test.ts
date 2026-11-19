import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { openDb } from './db';
import * as repo from './repo';
import { exportBackup, restoreBackup } from './backup';

const locate = (f: string) => path.join(path.resolve(__dirname, '../../node_modules/sql.js/dist'), f);

describe('meal photos (schema v2)', () => {
  it('stores one photo per date+meal (upsert), deletes, and survives backup round-trip', async () => {
    const db = await openDb(null, locate);
    repo.setMealPhoto(db, '2026-11-20', 'breakfast', 'data:image/jpeg;base64,AAAA', 10, 10);
    repo.setMealPhoto(db, '2026-11-20', 'breakfast', 'data:image/jpeg;base64,BBBB', 20, 20);
    repo.setMealPhoto(db, '2026-11-20', 'lunch', 'data:image/jpeg;base64,CCCC', 5, 5);
    const p = repo.mealPhotosOn(db, '2026-11-20');
    expect(Object.keys(p).sort()).toEqual(['breakfast', 'lunch']);
    expect(p.breakfast.data_url).toBe('data:image/jpeg;base64,BBBB');
    const b = await exportBackup(db, 'test');
    const db2 = await restoreBackup(b.bytes, locate);
    expect(repo.mealPhotosOn(db2, '2026-11-20').lunch.width).toBe(5);
    repo.deleteMealPhoto(db, '2026-11-20', 'lunch');
    expect(Object.keys(repo.mealPhotosOn(db, '2026-11-20'))).toEqual(['breakfast']);
  });
  it('loggedDates feeds the streak', async () => {
    const db = await openDb(null, locate);
    const snap = { name: 'x', source: 's', kind: 'ref' as const, per100: {} };
    for (const d of ['2026-11-18', '2026-11-19', '2026-11-19']) repo.addLog(db, { datetime: d + 'T08:00:00+03:00', meal: 'breakfast', food_id: 1, entered_amount: 1, entered_unit: 'g', grams: 1, grams_value_type: 'measured', snapshot: snap });
    expect(repo.loggedDates(db)).toEqual(['2026-11-18', '2026-11-19']);
  });
});
