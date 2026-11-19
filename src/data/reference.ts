import type { NutrientProfile, PrepState, ValueType, Portion } from '../engine';
import { normalize } from '../engine';

export interface NutrientDef { code: string; name_tr: string; name_en: string; unit: string; usda: number; core: number }
export interface RefFoodRaw { i: number; b: number; p: PrepState; e: string; s: 'F' | 'S'; g: number | null; v: (number | null)[]; q: string; t?: string[]; o?: [string, number, string, number][]; n?: string }
export interface ReferenceData { meta: any; nutrients: NutrientDef[]; groups: { id: number; name_en: string }[]; foods: RefFoodRaw[] }

export type FoodSource = 'usda_foundation' | 'usda_sr_legacy' | 'user' | 'label' | 'off' | 'recipe' | 'turkomp_personal';

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
  private keys: { id: number; key: string; tr: string; boost: number; exact: string[] }[] = [];
  private byBase: Map<number, number[]> = new Map();

  constructor(data: ReferenceData) {
    this.nutrients = data.nutrients; this.meta = data.meta;
    this.groups = new Map(data.groups.map(g => [g.id, g.name_en]));
    for (const f of data.foods) {
      this.raw.set(f.i, f);
      const tr = (f.t ?? []).map(normalize).join(' ');
      this.keys.push({ id: f.i, key: normalize((f.t ?? []).join(' ') + ' ' + f.e), tr, boost: (f.t ? 2 : 0) + (f.s === 'F' ? 0.3 : 0), exact: (f.t ?? []).map(normalize) });
      if (!this.byBase.has(f.b)) this.byBase.set(f.b, []);
      this.byBase.get(f.b)!.push(f.i);
    }
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
    const src: FoodSource = f.s === 'F' ? 'usda_foundation' : 'usda_sr_legacy';
    const view: FoodView = {
      id: f.i, kind: 'ref', name: f.t?.[0] ?? f.e, name_en: f.e, aliases: f.t ?? [], prep: f.p, base: f.b, source: src,
      sourceLabel: f.s === 'F' ? 'USDA Foundation' : 'USDA SR Legacy', sourceId: String(f.i), group: f.g ? this.groups.get(f.g) : undefined,
      per100,
      portions: (f.o ?? []).map(([label, amount, unit, g]) => ({ label, amount, unit, gram_weight: g, source: f.s === 'F' ? 'USDA Foundation' : 'USDA SR Legacy', value_type: 'sourced' as ValueType })),
      waterLike: /^Beverages, (water|tea|coffee)|^Water, /i.test(f.e) && !/powder|instant, dry|dry powder/i.test(f.e),
      note: f.n,
    };
    this.views.set(id, view); return view;
  }

  /** Other preparation states of the same base food. */
  siblings(id: number): FoodView[] {
    const f = this.raw.get(id); if (!f) return [];
    return (this.byBase.get(f.b) ?? []).filter(x => x !== id).map(x => this.get(x)!).slice(0, 12);
  }

  search(query: string, limit = 40): FoodView[] {
    const q = normalize(query); if (!q) return [];
    const toks = q.split(' ');
    const scored: [number, number][] = [];
    for (const k of this.keys) {
      let s = 0; let ok = true;
      for (const t of toks) {
        const i = k.key.indexOf(t);
        if (i < 0) { ok = false; break; }
        s += 1; if (i === 0 || k.key.charCodeAt(i - 1) === 32) s += 2;
        if (k.tr && k.tr.includes(t)) s += 3;
        if (k.tr && k.tr.startsWith(t)) s += 3;
      }
      if (!ok) continue;
      if (k.exact.length) { if (k.exact.includes(q)) s += 12; else if (k.exact[0].startsWith(q)) s += 4; }
      s += k.boost - k.key.length / 200;
      scored.push([s, k.id]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, limit).map(([, id]) => this.get(id)!);
  }
}

let refPromise: Promise<Reference> | null = null;
export function loadReference(url = './data/reference.json'): Promise<Reference> {
  if (!refPromise) refPromise = fetch(url).then(r => { if (!r.ok) throw new Error('Besin veritabanı yüklenemedi'); return r.json(); }).then(d => new Reference(d));
  return refPromise;
}
