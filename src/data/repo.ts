import type { DB, Row } from './db';
import { q, one, run, tx } from './db';
import { CUSTOM_ID_START } from './schema';
import type { NutrientProfile, ValueType, Portion } from '../engine';
import type { FoodView } from './reference';

const now = () => new Date().toISOString();

// ---------- settings ----------
export function getSetting(db: DB, key: string, def: string | null = null): string | null {
  return one<{ value: string }>(db, 'SELECT value FROM settings WHERE key=?', [key])?.value ?? def;
}
export function setSetting(db: DB, key: string, value: string | null) {
  if (value === null) run(db, 'DELETE FROM settings WHERE key=?', [key]);
  else run(db, 'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
}

// ---------- profile & targets ----------
export interface Profile { sex: 'male' | 'female'; birth_date: string; height_cm: number; activity_level: string; goal: 'lose' | 'maintain' | 'gain'; goal_rate_kg_per_week: number; uses_scale: number; language: string; protein_per_kg: number; fat_fraction: number }
export function getProfile(db: DB): Profile | undefined { return one<Profile>(db, 'SELECT * FROM profile WHERE id=1'); }
export function saveProfile(db: DB, p: Profile) {
  run(db, `INSERT INTO profile(id,sex,birth_date,height_cm,activity_level,goal,goal_rate_kg_per_week,uses_scale,language,protein_per_kg,fat_fraction,updated_at)
    VALUES(1,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET sex=excluded.sex,birth_date=excluded.birth_date,height_cm=excluded.height_cm,
    activity_level=excluded.activity_level,goal=excluded.goal,goal_rate_kg_per_week=excluded.goal_rate_kg_per_week,uses_scale=excluded.uses_scale,
    language=excluded.language,protein_per_kg=excluded.protein_per_kg,fat_fraction=excluded.fat_fraction,updated_at=excluded.updated_at`,
    [p.sex, p.birth_date, p.height_cm, p.activity_level, p.goal, p.goal_rate_kg_per_week, p.uses_scale, p.language, p.protein_per_kg, p.fat_fraction, now()]);
}
export interface Target { id?: number; valid_from: string; kcal: number; protein_g: number; fat_g: number; carb_g: number; fiber_g?: number | null; method: string; inputs_json?: string }
export function addTarget(db: DB, t: Target) {
  return run(db, 'INSERT INTO target(valid_from,kcal,protein_g,fat_g,carb_g,fiber_g,method,inputs_json) VALUES(?,?,?,?,?,?,?,?)',
    [t.valid_from, t.kcal, t.protein_g, t.fat_g, t.carb_g, t.fiber_g ?? null, t.method, t.inputs_json ?? null]);
}
export function targetOn(db: DB, date: string): Target | undefined {
  return one<Target>(db, 'SELECT * FROM target WHERE substr(valid_from,1,10) <= ? ORDER BY valid_from DESC, id DESC LIMIT 1', [date])
    ?? one<Target>(db, 'SELECT * FROM target ORDER BY valid_from ASC, id ASC LIMIT 1');
}

// ---------- measures, calibration, tare ----------
export interface UserMeasure { id: number; code: string; name_tr: string; name_en: string; ml: number; is_default: number; sort_order: number }
export function measures(db: DB): UserMeasure[] { return q<UserMeasure>(db, 'SELECT * FROM user_measure ORDER BY sort_order, id'); }
export function updateMeasure(db: DB, id: number, name_tr: string, ml: number) { run(db, 'UPDATE user_measure SET name_tr=?, ml=? WHERE id=?', [name_tr, ml, id]); }
export function addMeasure(db: DB, name_tr: string, ml: number) {
  const code = 'custom_' + Date.now().toString(36);
  return run(db, 'INSERT INTO user_measure(code,name_tr,name_en,ml,is_default,sort_order) VALUES(?,?,?,?,0,99)', [code, name_tr, name_tr, ml]);
}
export function deleteMeasure(db: DB, id: number) { run(db, 'DELETE FROM user_measure WHERE id=? AND is_default=0', [id]); }
export function calibrationFor(db: DB, measureId: number, foodId: number): number | null {
  return one<{ grams: number }>(db, 'SELECT grams FROM measure_calibration WHERE measure_id=? AND food_id=? ORDER BY created_at DESC, id DESC LIMIT 1', [measureId, foodId])?.grams ?? null;
}
export function saveCalibration(db: DB, measureId: number, foodId: number, grams: number, level = 'level') {
  run(db, 'INSERT INTO measure_calibration(measure_id,food_id,grams,level,created_at) VALUES(?,?,?,?,?)', [measureId, foodId, grams, level, now()]);
}
export function tares(db: DB) { return q<{ id: number; name: string; grams: number }>(db, 'SELECT * FROM tare ORDER BY name'); }
export function addTare(db: DB, name: string, grams: number) { return run(db, 'INSERT INTO tare(name,grams) VALUES(?,?)', [name, grams]); }
export function deleteTare(db: DB, id: number) { run(db, 'DELETE FROM tare WHERE id=?', [id]); }

// ---------- custom foods ----------
export interface CustomFoodInput {
  id?: number; name_tr: string; name_en?: string; prep_state?: string; origin: 'user' | 'label' | 'turkomp_personal' | 'off' | 'recipe';
  source?: string; barcode?: string | null; source_note?: string | null; base_food_id?: number | null;
  nutrients: Record<string, { value: number | null; type: ValueType; ref?: string }>;
  portions?: { label_tr: string; unit: string; amount: number; gram_weight: number; value_type?: ValueType }[];
  density?: { g_per_ml: number; condition?: string; value_type?: ValueType; source?: string } | null;
}
export function saveCustomFood(db: DB, f: CustomFoodInput): number {
  return tx(db, () => {
    let id = f.id;
    if (id) {
      run(db, 'UPDATE custom_food SET name_tr=?,name_en=?,prep_state=?,origin=?,source=?,barcode=?,source_note=?,base_food_id=?,updated_at=? WHERE id=?',
        [f.name_tr, f.name_en ?? null, f.prep_state ?? 'prepared', f.origin, f.source ?? f.origin, f.barcode ?? null, f.source_note ?? null, f.base_food_id ?? null, now(), id]);
      run(db, 'DELETE FROM custom_food_nutrient WHERE food_id=?', [id]);
      run(db, 'DELETE FROM custom_portion WHERE food_id=?', [id]);
      run(db, 'DELETE FROM custom_density WHERE food_id=?', [id]);
    } else {
      const max = one<{ m: number | null }>(db, 'SELECT MAX(id) AS m FROM custom_food')?.m ?? null;
      id = Math.max(CUSTOM_ID_START, (max ?? CUSTOM_ID_START - 1) + 1);
      run(db, 'INSERT INTO custom_food(id,name_tr,name_en,prep_state,origin,source,barcode,source_note,base_food_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        [id, f.name_tr, f.name_en ?? null, f.prep_state ?? 'prepared', f.origin, f.source ?? f.origin, f.barcode ?? null, f.source_note ?? null, f.base_food_id ?? null, now(), now()]);
    }
    for (const [code, nv] of Object.entries(f.nutrients)) {
      const missing = nv.value === null || nv.value === undefined || Number.isNaN(nv.value);
      run(db, 'INSERT INTO custom_food_nutrient(food_id,nutrient_code,amount_per_100g,value_type,source_ref) VALUES(?,?,?,?,?)',
        [id, code, missing ? null : nv.value, missing ? 'missing' : nv.type, nv.ref ?? null]);
    }
    for (const p of f.portions ?? []) run(db, 'INSERT INTO custom_portion(food_id,label_tr,unit,amount,gram_weight,value_type,source) VALUES(?,?,?,?,?,?,?)',
      [id, p.label_tr, p.unit, p.amount, p.gram_weight, p.value_type ?? 'measured', f.origin]);
    if (f.density) run(db, 'INSERT INTO custom_density(food_id,g_per_ml,condition,value_type,source) VALUES(?,?,?,?,?)',
      [id, f.density.g_per_ml, f.density.condition ?? null, f.density.value_type ?? 'estimated', f.density.source ?? f.origin]);
    return id!;
  });
}
export function archiveCustomFood(db: DB, id: number) { run(db, 'UPDATE custom_food SET archived=1 WHERE id=?', [id]); }

const ORIGIN_LABEL: Record<string, string> = { user: 'Kendi girişim', label: 'Etiket', turkomp_personal: 'TürKomp (kişisel giriş)', off: 'Open Food Facts', recipe: 'Tarif / pişirme' };
export function customFoodView(db: DB, id: number): FoodView | undefined {
  const f = one<Row>(db, 'SELECT * FROM custom_food WHERE id=?', [id]); if (!f) return undefined;
  const per100: NutrientProfile = {};
  for (const n of q<Row>(db, 'SELECT * FROM custom_food_nutrient WHERE food_id=?', [id])) per100[n.nutrient_code] = { value: n.amount_per_100g, type: n.value_type };
  const portions: Portion[] = q<Row>(db, 'SELECT * FROM custom_portion WHERE food_id=?', [id]).map(p => ({ label: p.label_tr, unit: p.unit, amount: p.amount, gram_weight: p.gram_weight, value_type: p.value_type, source: ORIGIN_LABEL[f.origin] }));
  const d = one<Row>(db, 'SELECT * FROM custom_density WHERE food_id=? LIMIT 1', [id]);
  return {
    id, kind: 'custom', name: f.name_tr, name_en: f.name_en ?? f.name_tr, aliases: [], prep: f.prep_state, base: f.base_food_id, source: f.origin,
    sourceLabel: ORIGIN_LABEL[f.origin] ?? f.origin, sourceId: f.barcode ?? undefined, per100, portions, densityGPerMl: d?.g_per_ml ?? null,
    waterLike: false, note: f.source_note ?? undefined, barcode: f.barcode ?? undefined,
  };
}
export function listCustomFoods(db: DB, includeArchived = false): FoodView[] {
  return q<{ id: number }>(db, `SELECT id FROM custom_food ${includeArchived ? '' : 'WHERE archived=0'} ORDER BY name_tr`).map(r => customFoodView(db, r.id)!);
}
export function customByBarcode(db: DB, barcode: string): FoodView | undefined {
  const r = one<{ id: number }>(db, 'SELECT id FROM custom_food WHERE barcode=? AND archived=0', [barcode]);
  return r ? customFoodView(db, r.id) : undefined;
}

// ---------- recipes ----------
export interface RecipeIngredient { id?: number; food_id: number; amount: number; unit: string; grams: number; grams_value_type: ValueType; is_added_fat?: number; fat_absorption_pct?: number | null; discarded_g?: number | null; discarded_note?: string | null; is_water?: number }
export interface Recipe { id?: number; name: string; servings: number; method: string; cooked_weight_g: number | null; cooked_weight_value_type: ValueType | null; notes?: string; ingredients: RecipeIngredient[]; archived?: number }
export function saveRecipe(db: DB, r: Recipe): number {
  return tx(db, () => {
    let id = r.id;
    if (id) run(db, 'UPDATE recipe SET name=?,servings=?,method=?,cooked_weight_g=?,cooked_weight_value_type=?,notes=?,updated_at=? WHERE id=?',
      [r.name, r.servings, r.method, r.cooked_weight_g, r.cooked_weight_value_type, r.notes ?? null, now(), id]);
    else id = run(db, 'INSERT INTO recipe(name,servings,method,cooked_weight_g,cooked_weight_value_type,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      [r.name, r.servings, r.method, r.cooked_weight_g, r.cooked_weight_value_type, r.notes ?? null, now(), now()]);
    run(db, 'DELETE FROM recipe_ingredient WHERE recipe_id=?', [id]);
    r.ingredients.forEach((i, n) => run(db, `INSERT INTO recipe_ingredient(recipe_id,food_id,amount,unit,grams,grams_value_type,is_added_fat,fat_absorption_pct,discarded_g,discarded_note,is_water,sort_order)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [id!, i.food_id, i.amount, i.unit, i.grams, i.grams_value_type, i.is_added_fat ?? 0, i.fat_absorption_pct ?? null, i.discarded_g ?? null, i.discarded_note ?? null, i.is_water ?? 0, n]));
    return id!;
  });
}
export function getRecipe(db: DB, id: number): Recipe | undefined {
  const r = one<Row>(db, 'SELECT * FROM recipe WHERE id=?', [id]); if (!r) return undefined;
  return { ...(r as any), ingredients: q<RecipeIngredient>(db, 'SELECT * FROM recipe_ingredient WHERE recipe_id=? ORDER BY sort_order', [id]) };
}
export function listRecipes(db: DB): Recipe[] {
  return q<{ id: number }>(db, 'SELECT id FROM recipe WHERE archived=0 ORDER BY name').map(r => getRecipe(db, r.id)!);
}
/** Delete is blocked when used in logs (FK RESTRICT) - archive instead (spec 7.2). */
export function deleteOrArchiveRecipe(db: DB, id: number): 'deleted' | 'archived' {
  const used = one<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM log_entry WHERE recipe_id=?', [id])!.c;
  if (used > 0) { run(db, 'UPDATE recipe SET archived=1 WHERE id=?', [id]); return 'archived'; }
  run(db, 'DELETE FROM recipe WHERE id=?', [id]); return 'deleted';
}

// ---------- cook sessions ----------
export function saveCookSession(db: DB, c: { raw_food_id: number; raw_g: number; method: string; cooked_g: number; cooked_value_type: ValueType; added_fat_food_id?: number | null; added_fat_g?: number | null; fat_absorption_pct?: number | null; discarded_g?: number | null; result_custom_food_id?: number | null }) {
  return run(db, `INSERT INTO cook_session(raw_food_id,raw_g,method,cooked_g,cooked_value_type,added_fat_food_id,added_fat_g,fat_absorption_pct,discarded_g,result_custom_food_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [c.raw_food_id, c.raw_g, c.method, c.cooked_g, c.cooked_value_type, c.added_fat_food_id ?? null, c.added_fat_g ?? null, c.fat_absorption_pct ?? null, c.discarded_g ?? null, c.result_custom_food_id ?? null, now()]);
}
/** The user's own measured yields for a food (used by the quick converter). */
export function measuredYields(db: DB, rawFoodId: number): { y: number; method: string; created_at: string }[] {
  return q<Row>(db, "SELECT raw_g, cooked_g, method, created_at FROM cook_session WHERE raw_food_id=? AND cooked_value_type='measured' AND raw_g>0 AND cooked_g>0 ORDER BY created_at DESC", [rawFoodId])
    .map(r => ({ y: r.cooked_g / r.raw_g, method: r.method, created_at: r.created_at }));
}

// ---------- log ----------
export interface Snapshot { name: string; source: string; kind: 'ref' | 'custom' | 'recipe' | 'cooked'; per100: NutrientProfile; prep?: string }
export interface LogEntry { id?: number; datetime: string; meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'; food_id?: number | null; recipe_id?: number | null; cook_session_id?: number | null; entered_amount: number; entered_unit: string; grams: number; grams_value_type: ValueType; snapshot: Snapshot; note?: string | null }
export function addLog(db: DB, e: LogEntry): number {
  return run(db, 'INSERT INTO log_entry(datetime,meal,food_id,recipe_id,cook_session_id,entered_amount,entered_unit,grams,grams_value_type,snapshot_json,note) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    [e.datetime, e.meal, e.food_id ?? null, e.recipe_id ?? null, e.cook_session_id ?? null, e.entered_amount, e.entered_unit, e.grams, e.grams_value_type, JSON.stringify(e.snapshot), e.note ?? null]);
}
function rowToLog(r: Row): LogEntry { const { snapshot_json, ...rest } = r; return { ...(rest as any), snapshot: JSON.parse(snapshot_json) }; }
export function logsOn(db: DB, date: string): LogEntry[] {
  return q<Row>(db, 'SELECT * FROM log_entry WHERE substr(datetime,1,10)=? ORDER BY datetime, id', [date]).map(rowToLog);
}
export function logsBetween(db: DB, from: string, to: string): LogEntry[] {
  return q<Row>(db, 'SELECT * FROM log_entry WHERE substr(datetime,1,10) BETWEEN ? AND ? ORDER BY datetime, id', [from, to]).map(rowToLog);
}
export function deleteLog(db: DB, id: number) { run(db, 'DELETE FROM log_entry WHERE id=?', [id]); }
export function recentFoods(db: DB, limit = 30): { food_id: number | null; recipe_id: number | null; entered_amount: number; entered_unit: string; name: string }[] {
  return q<Row>(db, `SELECT food_id, recipe_id, entered_amount, entered_unit, snapshot_json, MAX(datetime) AS last FROM log_entry
    WHERE cook_session_id IS NULL GROUP BY COALESCE(food_id, -recipe_id) ORDER BY last DESC LIMIT ?`, [limit])
    .map(r => ({ food_id: r.food_id, recipe_id: r.recipe_id, entered_amount: r.entered_amount, entered_unit: r.entered_unit, name: JSON.parse(r.snapshot_json).name }));
}

// ---------- favourites ----------
export function favourites(db: DB) { return q<{ id: number; food_id: number | null; recipe_id: number | null; default_amount: number | null; default_unit: string | null }>(db, 'SELECT * FROM favourite ORDER BY id DESC'); }
export function isFavourite(db: DB, foodId?: number | null, recipeId?: number | null) {
  return !!one(db, 'SELECT id FROM favourite WHERE (food_id IS ? AND recipe_id IS ?)', [foodId ?? null, recipeId ?? null]);
}
export function toggleFavourite(db: DB, foodId: number | null, recipeId: number | null, amount?: number, unit?: string) {
  if (isFavourite(db, foodId, recipeId)) run(db, 'DELETE FROM favourite WHERE food_id IS ? AND recipe_id IS ?', [foodId, recipeId]);
  else run(db, 'INSERT INTO favourite(food_id,recipe_id,default_amount,default_unit) VALUES(?,?,?,?)', [foodId, recipeId, amount ?? null, unit ?? null]);
}

// ---------- body metrics, water, satiety ----------
export function addMetric(db: DB, type: string, value: number, datetime = now(), note: string | null = null) {
  return run(db, 'INSERT INTO body_metric(datetime,type,value,note) VALUES(?,?,?,?)', [datetime, type, value, note]);
}
export function metrics(db: DB, type: string) { return q<{ id: number; datetime: string; value: number; note: string | null }>(db, 'SELECT * FROM body_metric WHERE type=? ORDER BY datetime', [type]); }
export function deleteMetric(db: DB, id: number) { run(db, 'DELETE FROM body_metric WHERE id=?', [id]); }
export function addWater(db: DB, ml: number, datetime = now()) { return run(db, 'INSERT INTO water_log(datetime,ml) VALUES(?,?)', [datetime, ml]); }
export function waterOn(db: DB, date: string): number { return one<{ s: number }>(db, 'SELECT COALESCE(SUM(ml),0) AS s FROM water_log WHERE substr(datetime,1,10)=?', [date])!.s; }
export function addSatiety(db: DB, s: { log_entry_id?: number | null; meal_datetime: string; meal: string; hunger_before: number; fullness_after: number; minutes_until_hungry?: number | null; energy?: number | null; note?: string | null }) {
  return run(db, 'INSERT INTO satiety_log(log_entry_id,meal_datetime,meal,hunger_before,fullness_after,minutes_until_hungry,energy,note) VALUES(?,?,?,?,?,?,?,?)',
    [s.log_entry_id ?? null, s.meal_datetime, s.meal, s.hunger_before, s.fullness_after, s.minutes_until_hungry ?? null, s.energy ?? null, s.note ?? null]);
}
export function satietyLogs(db: DB) { return q<Row>(db, 'SELECT * FROM satiety_log ORDER BY meal_datetime DESC'); }

// ---------- meal plan & grocery ----------
export function planFor(db: DB, weekStart: string): number {
  const p = one<{ id: number }>(db, 'SELECT id FROM meal_plan WHERE week_start=?', [weekStart]);
  return p ? p.id : run(db, 'INSERT INTO meal_plan(week_start,name,created_at) VALUES(?,?,?)', [weekStart, 'Hafta ' + weekStart, now()]);
}
export function planItems(db: DB, planId: number) { return q<Row>(db, 'SELECT * FROM meal_plan_item WHERE plan_id=? ORDER BY date, meal, id', [planId]); }
export function addPlanItem(db: DB, planId: number, it: { date: string; meal: string; food_id?: number | null; recipe_id?: number | null; grams: number; label: string }) {
  return run(db, 'INSERT INTO meal_plan_item(plan_id,date,meal,food_id,recipe_id,grams,label) VALUES(?,?,?,?,?,?,?)', [planId, it.date, it.meal, it.food_id ?? null, it.recipe_id ?? null, it.grams, it.label]);
}
export function deletePlanItem(db: DB, id: number) { run(db, 'DELETE FROM meal_plan_item WHERE id=?', [id]); }
export function groceryItems(db: DB, planId: number) { return q<Row>(db, 'SELECT * FROM grocery_item WHERE plan_id=? ORDER BY checked, label', [planId]); }
export function replaceGrocery(db: DB, planId: number, items: { food_id: number | null; label: string; grams: number }[]) {
  tx(db, () => {
    run(db, 'DELETE FROM grocery_item WHERE plan_id=? AND manual=0', [planId]);
    for (const i of items) run(db, 'INSERT INTO grocery_item(plan_id,food_id,label,grams,checked,manual) VALUES(?,?,?,?,0,0)', [planId, i.food_id, i.label, i.grams]);
  });
}
export function addGroceryManual(db: DB, planId: number, label: string) { run(db, 'INSERT INTO grocery_item(plan_id,label,manual) VALUES(?,?,1)', [planId, label]); }
export function toggleGrocery(db: DB, id: number) { run(db, 'UPDATE grocery_item SET checked = 1 - checked WHERE id=?', [id]); }
export function deleteGrocery(db: DB, id: number) { run(db, 'DELETE FROM grocery_item WHERE id=?', [id]); }

// ---------- pantry ----------
export function pantry(db: DB) { return q<Row>(db, 'SELECT * FROM pantry_item ORDER BY expires_on IS NULL, expires_on, label'); }
export function addPantry(db: DB, label: string, grams: number | null, expires_on: string | null) { run(db, 'INSERT INTO pantry_item(label,grams,expires_on) VALUES(?,?,?)', [label, grams, expires_on]); }
export function deletePantry(db: DB, id: number) { run(db, 'DELETE FROM pantry_item WHERE id=?', [id]); }

// ---------- Open Food Facts cache ----------
export function offCacheGet(db: DB, barcode: string) { const r = one<Row>(db, 'SELECT * FROM off_cache WHERE barcode=?', [barcode]); return r ? JSON.parse(r.json) : null; }
export function offCacheSet(db: DB, barcode: string, json: unknown) {
  run(db, 'INSERT INTO off_cache(barcode,json,fetched_at,licence) VALUES(?,?,?,?) ON CONFLICT(barcode) DO UPDATE SET json=excluded.json, fetched_at=excluded.fetched_at',
    [barcode, JSON.stringify(json), now(), 'Open Food Facts - ODbL 1.0 (database), DbCL (contents)']);
}

export function addBackupLog(db: DB, path: string, size: number, checksum: string, kind: 'manual' | 'auto') {
  run(db, 'INSERT INTO backup_log(datetime,path,size_bytes,checksum,kind) VALUES(?,?,?,?,?)', [now(), path, size, checksum, kind]);
}
export function lastBackup(db: DB, kind?: string) { return one<Row>(db, `SELECT * FROM backup_log ${kind ? 'WHERE kind=?' : ''} ORDER BY datetime DESC LIMIT 1`, kind ? [kind] : []); }

// ---------- meal photos (v2) ----------
export interface MealPhoto { id: number; date: string; meal: string; mime: string; data_url: string; width: number; height: number; created_at: string }
export function mealPhotosOn(db: DB, date: string): Record<string, MealPhoto> {
  return Object.fromEntries(q<MealPhoto>(db, 'SELECT * FROM meal_photo WHERE date=?', [date]).map(p => [p.meal, p]));
}
export function setMealPhoto(db: DB, date: string, meal: string, dataUrl: string, width: number, height: number) {
  run(db, `INSERT INTO meal_photo(date,meal,mime,data_url,width,height,created_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(date,meal) DO UPDATE SET mime=excluded.mime, data_url=excluded.data_url, width=excluded.width, height=excluded.height, created_at=excluded.created_at`,
    [date, meal, 'image/jpeg', dataUrl, width, height, now()]);
}
export function deleteMealPhoto(db: DB, date: string, meal: string) { run(db, 'DELETE FROM meal_photo WHERE date=? AND meal=?', [date, meal]); }

/** Distinct local dates (YYYY-MM-DD) that have at least one log entry. */
export function loggedDates(db: DB): string[] {
  return q<{ d: string }>(db, 'SELECT DISTINCT substr(datetime,1,10) AS d FROM log_entry ORDER BY d').map(r => r.d);
}
export function lastCookSession(db: DB) {
  return one<{ raw_food_id: number; raw_g: number; cooked_g: number; cooked_value_type: string; method: string; created_at: string }>(db, "SELECT * FROM cook_session WHERE raw_g>0 AND cooked_g>0 ORDER BY created_at DESC, id DESC LIMIT 1");
}
