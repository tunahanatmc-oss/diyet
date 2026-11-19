/**
 * Application services: glue between engine (math), reference data and personal DB.
 * The UI and the AI assistant call these; neither does math itself.
 */
import type { DB } from './db';
import type { Reference, FoodView } from './reference';
import * as repo from './repo';
import { computeStreak } from './streak';
import {
  resolveVolume, resolveCount, nutrientsFor, sumProfiles, cookBatch, EngineError, bmrMifflin, tdee, goalTarget, macroTargets, ageFromBirth,
  trendSeries, trendOn, weeklyChange, adaptiveTdee, PAL, type Activity, type NutrientProfile, type Result, type ValueType, type TotalNV,
} from '../engine';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Meal = typeof MEALS[number];
export const MEAL_TR: Record<Meal, string> = { breakfast: 'Kahvaltı', lunch: 'Öğle', dinner: 'Akşam', snack: 'Ara öğün' };

export class Services {
  constructor(public db: DB, public ref: Reference) {}

  food(id: number): FoodView | undefined {
    return id >= 1_000_000_000 ? repo.customFoodView(this.db, id) : this.ref.get(id);
  }
  search(query: string, limit = 40): FoodView[] {
    const custom = repo.listCustomFoods(this.db).filter(f => {
      const n = query.toLocaleLowerCase('tr'); return f.name.toLocaleLowerCase('tr').includes(n) || (f.barcode ?? '') === query;
    });
    return [...custom.slice(0, 10), ...this.ref.search(query, limit)];
  }

  /** Units available for a food: g, every household measure, and count units from its portions. */
  unitsFor(f: FoodView): { code: string; label: string }[] {
    const u = [{ code: 'g', label: 'gram' }];
    for (const m of repo.measures(this.db)) u.push({ code: 'm:' + m.id, label: `${m.name_tr} (${m.ml} ml)` });
    const seen = new Set<string>();
    for (const p of f.portions) if (['piece', 'slice', 'serving'].includes(p.unit) && !seen.has(p.unit + p.label)) {
      seen.add(p.unit + p.label); u.push({ code: 'p:' + f.portions.indexOf(p), label: `${p.label} (${p.gram_weight} g)` });
    }
    return u;
  }

  /** amount + unit -> grams (spec 5.4). Throws EngineError NO_WEIGHT_DATA when there is no reliable weight. */
  resolveAmount(f: FoodView, amount: number, unit: string): Result<number> {
    if (unit === 'g') return { value: amount, value_type: 'measured', sources: ['Gram'], warnings: [] };
    if (unit.startsWith('m:')) {
      const id = +unit.slice(2); const m = repo.measures(this.db).find(x => x.id === id);
      if (!m) throw new EngineError('BAD_UNIT', 'Ölçü bulunamadı');
      return resolveVolume({ n: amount, measureMl: m.ml, calibrationG: repo.calibrationFor(this.db, id, f.id), portions: f.portions, densityGPerMl: f.densityGPerMl, waterLike: f.waterLike });
    }
    if (unit.startsWith('p:')) {
      const p = f.portions[+unit.slice(2)]; if (!p) throw new EngineError('BAD_UNIT', 'Porsiyon bulunamadı');
      return resolveCount(amount, p.unit, [p]);
    }
    return resolveCount(amount, unit, f.portions);
  }

  nutrientsFor(f: FoodView, grams: number, gramsType: ValueType = 'measured') { return nutrientsFor(f.per100, grams, gramsType); }

  // ---------- recipes ----------
  /** Recipe totals: raw ingredients + absorbed fat - discarded parts (spec 5.2). Water = mass only. */
  recipeTotals(r: repo.Recipe) {
    const ingredients = r.ingredients.map(i => {
      const f = this.food(i.food_id);
      const water = !!i.is_water || /^(Beverages, water|Water, )/i.test(f?.name_en ?? '');
      if (i.is_added_fat) {
        const abs = i.fat_absorption_pct ?? 100;
        return { per100: f?.per100 ?? {}, grams: (i.grams * abs) / 100, gramsType: (abs < 100 ? 'estimated' : i.grams_value_type) as ValueType, label: f?.name };
      }
      return { per100: f?.per100 ?? {}, grams: i.grams, gramsType: i.grams_value_type, label: f?.name, massOnly: water };
    });
    const discarded = r.ingredients.filter(i => (i.discarded_g ?? 0) > 0).map(i => ({
      grams: i.discarded_g!, label: i.discarded_note ?? 'atılan kısım', per100: i.is_added_fat ? this.food(i.food_id)?.per100 : undefined,
    }));
    const out = cookBatch({ ingredients, discarded, cookedG: r.cooked_weight_g, cookedType: (r.cooked_weight_value_type ?? 'estimated') as ValueType, servings: r.servings, codes: this.ref.codes() });
    // raw mass shown to the user is the full ingredient mass (incl. water and all oil added)
    out.rawTotalG = r.ingredients.reduce((s, i) => s + i.grams, 0);
    if (r.ingredients.some(i => i.is_added_fat && (i.fat_absorption_pct ?? 100) < 100)) out.warnings.push('Yağ emilim yüzdesi sizin girdiğiniz değer; sonuç tahmini.');
    return out;
  }

  // ---------- day ----------
  entryNutrients(e: repo.LogEntry): NutrientProfile { return nutrientsFor(e.snapshot.per100, e.grams, e.grams_value_type); }
  daySummary(date: string) {
    const entries = repo.logsOn(this.db, date);
    const perEntry = entries.map(e => ({ entry: e, n: this.entryNutrients(e) }));
    const codes = this.ref.codes();
    const byMeal = Object.fromEntries(MEALS.map(m => [m, sumProfiles(perEntry.filter(x => x.entry.meal === m).map(x => x.n), codes)])) as Record<Meal, Record<string, TotalNV>>;
    const total = sumProfiles(perEntry.map(x => x.n), codes);
    const target = repo.targetOn(this.db, date);
    const water = repo.waterOn(this.db, date);
    const incomplete = this.ref.coreCodes().filter(c => entries.length && total[c].incomplete);
    return { date, entries: perEntry, byMeal, total, target, water, incomplete };
  }
  remaining(date: string) {
    const s = this.daySummary(date); const t = s.target; if (!t) return null;
    const k = (c: string) => s.total[c].value ?? s.total[c].known;
    return { kcal: t.kcal - k('energy_kcal'), protein_g: t.protein_g - k('protein_g'), fat_g: t.fat_g - k('fat_g'), carb_g: t.carb_g - k('carb_g'), incomplete: s.incomplete };
  }

  /** Consecutive days with at least one log entry (local, see data/streak.ts). */
  streak(today = todayIso()) { return computeStreak(repo.loggedDates(this.db), today); }
  userName(): string { return (repo.getSetting(this.db, 'user_name') ?? '').trim(); }
  goalWeight(): number | null { const v = Number(repo.getSetting(this.db, 'goal_weight_kg')); return v > 0 ? v : null; }

  // ---------- weight ----------
  trend() { return trendSeries(repo.metrics(this.db, 'weight_kg').map(m => ({ datetime: m.datetime, value: m.value }))); }
  trendSummary(today: string) {
    const s = this.trend(); return { series: s, trend: trendOn(s, today), weekly: weeklyChange(s, today), latest: s.length ? s[s.length - 1] : null };
  }
  currentWeight(): number | null { const s = this.trend(); return s.length ? s[s.length - 1].trend : null; }

  // ---------- targets ----------
  computeTargets(p: repo.Profile, weightKg: number, onDate = todayIso(), allowBelowBmr = false) {
    const age = ageFromBirth(p.birth_date, onDate);
    const bmr = bmrMifflin(weightKg, p.height_cm, age, p.sex);
    const t = tdee(bmr, p.activity_level as Activity);
    const goal = goalTarget(t, bmr, p.goal, p.goal_rate_kg_per_week, 7700, allowBelowBmr);
    const m = macroTargets(goal.value, weightKg, p.protein_per_kg ?? 1.6, p.fat_fraction ?? 0.3);
    return { age, bmr, pal: PAL[p.activity_level as Activity], tdee: t, kcal: goal.value, ...m, warnings: [...goal.warnings, ...m.warnings] };
  }
  saveComputedTargets(p: repo.Profile, weightKg: number, method: 'mifflin_tdee' | 'adaptive' = 'mifflin_tdee', kcalOverride?: number) {
    const c = this.computeTargets(p, weightKg);
    const kcal = kcalOverride ?? c.kcal;
    const m = kcalOverride ? macroTargets(kcal, weightKg, p.protein_per_kg, p.fat_fraction) : c;
    repo.addTarget(this.db, { valid_from: localDateTime(), kcal, protein_g: m.protein_g, fat_g: m.fat_g, carb_g: m.carb_g, method, inputs_json: JSON.stringify({ ...c, weightKg }) });
  }

  // ---------- adaptive TDEE (spec 5.9) ----------
  adaptive(today: string, windowDays = 21) {
    const p = repo.getProfile(this.db); const w = this.currentWeight();
    if (!p || w == null) return { ok: false as const, reason: 'Profil ve kilo gerekli.' };
    const start = new Date(today + 'T00:00:00Z'); start.setUTCDate(start.getUTCDate() - (windowDays - 1));
    const from = start.toISOString().slice(0, 10);
    const logs = repo.logsBetween(this.db, from, today);
    const byDay = new Map<string, number>(); let anyMissing = new Set<string>();
    for (const e of logs) {
      const d = e.datetime.slice(0, 10); const k = this.entryNutrients(e).energy_kcal?.value;
      if (k == null) anyMissing.add(d); byDay.set(d, (byDay.get(d) ?? 0) + (k ?? 0));
    }
    const loggedDays = [...byDay.keys()].filter(d => !anyMissing.has(d)).length;
    const mean = loggedDays ? [...byDay.entries()].filter(([d]) => !anyMissing.has(d)).reduce((s, [, v]) => s + v, 0) / loggedDays : 0;
    const series = this.trend();
    const weighIns = series.filter(x => x.date >= from && x.date <= today).length;
    const tStart = trendOn(series, from) ?? series.find(x => x.date >= from)?.trend ?? null;
    const tEnd = trendOn(series, today);
    const base = this.computeTargets(p, w).tdee;
    const prev = Number(repo.getSetting(this.db, 'adaptive_tdee_prev') ?? base);
    if (tStart == null || tEnd == null) return { ok: false as const, reason: 'Pencere başında ve sonunda trend kilo gerekli.' };
    const r = adaptiveTdee({ windowDays, loggedDays, weighIns, meanIntakeKcal: mean, trendStart: tStart, trendEnd: tEnd, tdeePrev: prev });
    return { ...r, loggedDays, weighIns, mean, tStart, tEnd, base, prev, windowDays };
  }
}

export function todayIso(d = new Date()): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10);
}
export function localDateTime(d = new Date()): string {
  const off = -d.getTimezoneOffset(); const sign = off >= 0 ? '+' : '-'; const a = Math.abs(off);
  const z = new Date(d.getTime() + off * 60000).toISOString().slice(0, 19);
  return `${z}${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
export function addDays(iso: string, n: number): string { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function weekStart(iso: string): string { const d = new Date(iso + 'T00:00:00Z'); const wd = (d.getUTCDay() + 6) % 7; return addDays(iso, -wd); }
