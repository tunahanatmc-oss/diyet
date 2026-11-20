import type { NutrientProfile, PrepState, ValueType, Portion } from '../engine';
import { normalize, parseQuery, scoreDoc, milkVariant, SEARCH_FALLBACK, computeDish, DISH_SOURCE, type SearchDoc, type MilkType, type DishDef, type DishResult } from '../engine';
import { TURKISH_DISHES } from './dishes';

export interface NutrientDef { code: string; name_tr: string; name_en: string; unit: string; usda: number; core: number }
export interface RefFoodRaw { i: number; b: number; p: PrepState; e: string; s: 'F' | 'S' | 'N'; g: number | null; v: (number | null)[]; q: string; t?: string[]; o?: [string, number, string, number][]; n?: string; r?: [number, string] }
export interface ReferenceData { meta: any; nutrients: NutrientDef[]; groups: { id: number; name_en: string }[]; foods: RefFoodRaw[] }

const DISH_ID_MIN = 900_000_000;
export type FoodSource = 'usda_foundation' | 'usda_sr_legacy' | 'usda_fndds' | 'user' | 'label' | 'off' | 'recipe' | 'turkomp_personal';

/** Unified food view used by the UI and services: reference (read-only) or custom (personal DB). */
export interface FoodView {
  id: number;
  kind: 'ref' | 'custom';
  name: string;          // Turkish name when known, else English
  name_en: string;
  aliases: string[];
  prep: PrepState;
  base: number | null;
  source: FoodSource;
  sourceLabel: string;
  sourceId?: string;
  group?: string;
  per100: NutrientProfile;
  portions: Portion[];
  densityGPerMl?: number | null;
  waterLike: boolean;
  note?: string;
  barcode?: string;
  /** inedible part of the food as purchased (USDA SR Legacy refuse), e.g. egg shell 12 % */
  refuse?: { pct: number; desc: string };
  /** ready-made Turkish dish (system recipe computed from USDA ingredients) */
  dish?: { def: DishDef; result: DishResult };
}

export const PREP_TR: Record<string, string> = {
  raw: 'çiğ', dry: 'kuru', boiled: 'haşlanmış', steamed: 'buharda', baked: 'fırında', roasted: 'kavrulmuş/fırın', grilled: 'ızgara',
  fried: 'kızartılmış', pan_fried: 'tavada', stewed: 'yahni/haşlama', microwaved: 'mikrodalga', cooked_unspecified: 'pişmiş',
  canned: 'konserve', drained: 'süzülmüş', prepared: 'hazır',
};
const QT: Record<string, ValueType> = { m: 'measured', s: 'sourced', '-': 'missing' };
const UNIT_TR: Record<string, string> = { cup: 'cup (ABD)', tbsp: 'yemek kaşığı (ABD)', tsp: 'çay kaşığı (ABD)', floz: 'fl oz', piece: 'adet', slice: 'dilim', serving: 'porsiyon', other: 'diğer' };
export function unitLabel(u: string) { return UNIT_TR[u] ?? u; }

export class Reference {
  nutrients: NutrientDef[]; meta: any; groups: Map<number, string>;
  private raw: Map<number, RefFoodRaw> = new Map();
  private views: Map<number, FoodView> = new Map();
  private docs: { id: number; d: SearchDoc }[] = [];
  private descIdx: Map<string, number> = new Map();
  /** true when the last search found no food matching every query word (only the nearest matches). */
  lastPartial = false;
  /** explanation shown with the results when USDA has no food by that name (e.g. americano). */
  lastNote: string | null = null;
  private byBase: Map<number, number[]> = new Map();
  private milkGroups: Map<string, { id: number; milk: MilkType }[]> = new Map();

  constructor(data: ReferenceData, dishes: DishDef[] = TURKISH_DISHES) {
    this.nutrients = data.nutrients; this.meta = data.meta;
    this.groups = new Map(data.groups.map(g => [g.id, g.name_en]));
    for (const f of data.foods) {
      this.raw.set(f.i, f);
      const tr = (f.t ?? []).map(normalize).join(' ');
      this.docs.push({ id: f.i, d: { tr, en: normalize(f.e), prep: f.p, exact: (f.t ?? []).map(normalize), boost: (f.t ? 2 : 0) + (f.s === 'F' ? 0.3 : 0) } });
      if (!this.descIdx.has(f.e.toLowerCase())) this.descIdx.set(f.e.toLowerCase(), f.i);
      if (!this.byBase.has(f.b)) this.byBase.set(f.b, []);
      this.byBase.get(f.b)!.push(f.i);
      if (f.s === 'N') { const mv = milkVariant(f.e); if (!this.milkGroups.has(mv.key)) this.milkGroups.set(mv.key, []); this.milkGroups.get(mv.key)!.push({ id: f.i, milk: mv.milk }); }
    }
    for (const d of dishes) this.addDish(d);
  }
  /** Ready-made dishes: nutrients computed by the recipe engine from the USDA ingredients (engine/dishes.ts). */
  dishIds: number[] = [];
  private addDish(def: DishDef) {
    let result: DishResult;
    try { result = computeDish(def, desc => this.byDesc(desc), this.codes()); } catch (e) { console.warn(e); return; }
    const names = [def.name_tr, ...def.aliases];
    const view: FoodView = {
      id: def.id, kind: 'ref', name: def.name_tr, name_en: def.name_en, aliases: names, prep: 'prepared', base: null, source: 'recipe',
      sourceLabel: DISH_SOURCE, group: 'Hazır yemek', per100: result.per100, portions: result.portions, waterLike: false, dish: { def, result },
    };
    this.views.set(def.id, view);
    this.dishIds.push(def.id);
    this.docs.push({ id: def.id, d: { tr: names.map(normalize).join(' '), en: normalize(def.name_en), prep: 'prepared', exact: names.map(normalize), boost: 12 } });
  }
  get size() { return this.raw.size; }
  codes() { return this.nutrients.map(n => n.code); }
  coreCodes() { return this.nutrients.filter(n => n.core).map(n => n.code); }
  nutrient(code: string) { return this.nutrients.find(n => n.code === code); }

  get(id: number): FoodView | undefined {
    const c = this.views.get(id); if (c) return c;
    const f = this.raw.get(id); if (!f) return undefined;
    const per100: NutrientProfile = {};
    this.nutrients.forEach((n, i) => { const v = f.v[i]; per100[n.code] = v == null ? { value: null, type: 'missing' } : { value: v, type: QT[f.q[i]] ?? 'sourced' }; });
    const src: FoodSource = f.s === 'F' ? 'usda_foundation' : f.s === 'N' ? 'usda_fndds' : 'usda_sr_legacy';
    const srcLabel = f.s === 'F' ? 'USDA Foundation' : f.s === 'N' ? 'USDA FNDDS' : 'USDA SR Legacy';
    const view: FoodView = {
      id: f.i, kind: 'ref', name: f.t?.[0] ?? f.e, name_en: f.e, aliases: f.t ?? [], prep: f.p, base: f.b, source: src,
      sourceLabel: srcLabel, sourceId: String(f.i), group: f.g ? this.groups.get(f.g) : undefined,
      per100,
      portions: (f.o ?? []).map(([label, amount, unit, g]) => ({ label, amount, unit, gram_weight: g, source: srcLabel, value_type: 'sourced' as ValueType })),
      waterLike: /^Beverages, (water|tea|coffee)|^Water, /i.test(f.e) && !/powder|instant, dry|dry powder/i.test(f.e),
      note: f.n,
      refuse: f.r ? { pct: f.r[0], desc: f.r[1] } : undefined,
    };
    this.views.set(id, view); return view;
  }

  /** Other preparation states of the same base food. */
  siblings(id: number): FoodView[] {
    const f = this.raw.get(id); if (!f) return [];
    return (this.byBase.get(f.b) ?? []).filter(x => x !== id).map(x => this.get(x)!).slice(0, 12);
  }

  /** FNDDS coffee drink: the same drink with each milk type present in FNDDS (empty when there is only one). */
  milkVariants(id: number): { food: FoodView; milk: MilkType }[] {
    const f = this.raw.get(id); if (!f || f.s !== 'N') return [];
    const g = this.milkGroups.get(milkVariant(f.e).key) ?? [];
    return g.length > 1 ? g.map(x => ({ food: this.get(x.id)!, milk: x.milk })) : [];
  }

  /** Exact USDA description lookup (case-insensitive). */
  byDesc(desc: string): FoodView | undefined { const id = this.descIdx.get(desc.toLowerCase()); return id == null ? undefined : this.get(id); }

  /**
   * Turkish-aware multi-word search: every word may match the Turkish name, the English name, its English translation
   * (tavuk -> chicken) or, for preparation words, the food's preparation (haşlanmış -> boiled/stewed/simmered).
   * Foods matching every word rank first; when none does, the nearest partial matches are returned and lastPartial is set.
   */
  search(query: string, limit = 40): FoodView[] {
    const fb = SEARCH_FALLBACK[normalize(query)];
    if (fb) { const r = this.searchCore(fb.q, limit); this.lastPartial = true; this.lastNote = fb.note; return r; }
    this.lastNote = null;
    return this.searchCore(query, limit);
  }
  private searchCore(query: string, limit: number): FoodView[] {
    const terms = parseQuery(query); const q = normalize(query);
    this.lastPartial = false;
    if (!terms.length) return [];
    const full: [number, number][] = [], part: [number, number, number][] = [];
    for (const { id, d } of this.docs) {
      const r = scoreDoc(terms, d, q); if (!r.matched) continue;
      if (r.matched === terms.length) full.push([r.score, id]);
      else if (terms.length > 1 && terms.some(t => !t.prep)) part.push([r.matched, r.score - (id >= DISH_ID_MIN && id < 1_000_000_000 ? 20 : 0), id]); // nearest: plain foods before dishes
    }
    full.sort((a, b) => b[0] - a[0]);
    if (full.length) return full.slice(0, limit).map(([, id]) => this.get(id)!);
    // nothing matches every word: nearest = most words matched, at least one food word
    this.lastPartial = part.length > 0;
    part.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    return part.slice(0, limit).map(([, , id]) => this.get(id)!);
  }

}

let refPromise: Promise<Reference> | null = null;
export function loadReference(url = './data/reference.json'): Promise<Reference> {
  if (!refPromise) refPromise = fetch(url).then(r => { if (!r.ok) throw new Error('Besin veritabanı yüklenemedi'); return r.json(); }).then(d => new Reference(d));
  return refPromise;
}
