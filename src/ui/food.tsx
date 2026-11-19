import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import type { FoodView } from '../data/reference';
import { PREP_TR } from '../data/reference';
import * as repo from '../data/repo';
import type { NutrientProfile, ValueType } from '../engine';
import { EngineError, weakest } from '../engine';
import { Badge, fmt, fmtN, Seg, NumberInput, VT_TR } from './kit';
import { I } from './icons';

export function FoodRow({ f, onClick, right }: { f: FoodView; onClick?: () => void; right?: React.ReactNode }) {
  const k = f.per100.energy_kcal;
  return (
    <button className="li" onClick={onClick} type="button">
      <div className="grow">
        <div className="t">{f.name}</div>
        <div className="s">{f.kind === 'ref' && f.name !== f.name_en ? f.name_en + ' · ' : ''}{f.sourceLabel}</div>
      </div>
      <span className="chip neutral hide-m">{PREP_TR[f.prep] ?? f.prep}</span>
      {right ?? <span className="kcal">{k?.value == null ? <Badge t="missing" /> : fmt(k.value) + ' kcal'}<span className="tiny muted"> /100g</span></span>}
    </button>
  );
}

export type PickTab = 'search' | 'recent' | 'fav' | 'mine' | 'recipes';
export function FoodPicker({ onPick, onPickRecipe, tabs = ['search', 'recent', 'fav', 'mine', 'recipes'], autoFocus, placeholder }: {
  onPick: (f: FoodView, amount?: number, unit?: string) => void; onPickRecipe?: (id: number) => void; tabs?: PickTab[]; autoFocus?: boolean; placeholder?: string;
}) {
  const { sv, version } = useApp();
  const [qs, setQ] = useState('');
  const [tab, setTab] = useState<PickTab>(tabs.includes('recent') ? 'recent' : 'search');
  const results = useMemo(() => (qs.trim().length >= 2 ? sv.search(qs, 40) : []), [qs, sv, version]);
  const labels: Record<PickTab, string> = { search: 'Arama', recent: 'Son', fav: 'Favoriler', mine: 'Besinlerim', recipes: 'Tarifler' };
  const showing = qs.trim().length >= 2 ? 'search' : tab;
  return (
    <div className="col">
      <div className="search"><I.search /><input className="input" autoFocus={autoFocus} placeholder={placeholder ?? 'Besin ara… (ör. pirinç, tavuk göğsü, yoğurt)'} value={qs} onChange={e => setQ(e.target.value)} data-search /></div>
      {qs.trim().length < 2 && tabs.length > 1 && <Seg value={tab} options={tabs.filter(t => t !== 'search').map(t => [t, labels[t]] as [PickTab, string])} onChange={setTab} />}
      <div className="list">
        {showing === 'search' && (results.length ? results.map(f => <FoodRow key={f.kind + f.id} f={f} onClick={() => onPick(f)} />) : qs.trim().length >= 2 ? <div className="empty">Sonuç yok. “Besinler” bölümünden kendi besininizi ekleyebilirsiniz.</div> : <div className="empty">En az 2 harf yazın.</div>)}
        {showing === 'recent' && <Recent onPick={onPick} onPickRecipe={onPickRecipe} />}
        {showing === 'fav' && <Favs onPick={onPick} onPickRecipe={onPickRecipe} />}
        {showing === 'mine' && (repo.listCustomFoods(sv.db).map(f => <FoodRow key={f.id} f={f} onClick={() => onPick(f)} />).concat().length ? repo.listCustomFoods(sv.db).map(f => <FoodRow key={f.id} f={f} onClick={() => onPick(f)} />) : <div className="empty">Henüz kendi besininiz yok.</div>)}
        {showing === 'recipes' && (repo.listRecipes(sv.db).length ? repo.listRecipes(sv.db).map(r => (
          <button key={r.id} className="li" onClick={() => onPickRecipe?.(r.id!)}><div className="grow"><div className="t">{r.name}</div><div className="s">{fmt(r.servings)} porsiyon · tarif</div></div><I.recipes width={18} /></button>
        )) : <div className="empty">Henüz tarif yok.</div>)}
      </div>
    </div>
  );
}
function Recent({ onPick, onPickRecipe }: { onPick: (f: FoodView, a?: number, u?: string) => void; onPickRecipe?: (id: number) => void }) {
  const { sv } = useApp(); const rows = repo.recentFoods(sv.db);
  if (!rows.length) return <div className="empty">Son kayıtlarınız burada görünecek.</div>;
  return <>{rows.map((r, i) => {
    if (r.recipe_id) return <button key={'r' + i} className="li" onClick={() => onPickRecipe?.(r.recipe_id!)}><div className="grow"><div className="t">{r.name}</div><div className="s">son: {fmt(r.entered_amount, 1)} {r.entered_unit}</div></div></button>;
    const f = sv.food(r.food_id!); if (!f) return null;
    return <FoodRow key={'f' + i} f={f} onClick={() => onPick(f, r.entered_amount, r.entered_unit)} right={<span className="small muted">son: {fmt(r.entered_amount, 1)} {r.entered_unit === 'g' ? 'g' : ''}</span>} />;
  })}</>;
}
function Favs({ onPick, onPickRecipe }: { onPick: (f: FoodView, a?: number, u?: string) => void; onPickRecipe?: (id: number) => void }) {
  const { sv } = useApp(); const rows = repo.favourites(sv.db);
  if (!rows.length) return <div className="empty">Yıldızladığınız besinler burada.</div>;
  return <>{rows.map(r => {
    if (r.recipe_id) { const rc = repo.getRecipe(sv.db, r.recipe_id); return rc ? <button key={r.id} className="li" onClick={() => onPickRecipe?.(rc.id!)}><div className="grow"><div className="t">{rc.name}</div><div className="s">tarif</div></div></button> : null; }
    const f = sv.food(r.food_id!); return f ? <FoodRow key={r.id} f={f} onClick={() => onPick(f, r.default_amount ?? undefined, r.default_unit ?? undefined)} /> : null;
  })}</>;
}

export function NutrientTable({ per100, amount, grams, codes, gramsType }: { per100: NutrientProfile; amount?: NutrientProfile | null; grams?: number | null; codes: string[]; gramsType?: ValueType }) {
  const { sv } = useApp();
  return (
    <table className="t">
      <thead><tr><th>Besin öğesi</th><th className="r">100 g</th>{amount && <th className="r">{fmt(grams ?? 0)} g</th>}<th>Değer türü</th></tr></thead>
      <tbody>{codes.map(c => {
        const def = sv.ref.nutrient(c); const p = per100[c] ?? { value: null, type: 'missing' as ValueType }; const a = amount?.[c];
        return <tr key={c}><td>{def?.name_tr ?? c} <span className="tiny muted">{def?.unit}</span></td><td className="r num">{fmtN(c, p.value)}</td>{amount && <td className="r num">{fmtN(c, a?.value)}</td>}<td><Badge t={a ? a.type : gramsType ? weakest(p.type, gramsType) : p.type} /></td></tr>;
      })}</tbody>
    </table>
  );
}

export interface Resolved { grams: number | null; type: ValueType; sources: string[]; warnings: string[]; error?: string; errorCode?: string }
export function useResolve(f: FoodView | null, amount: number | '', unit: string, version: number): Resolved {
  const { sv } = useApp();
  return useMemo(() => {
    if (!f || amount === '' || !(amount > 0)) return { grams: null, type: 'missing', sources: [], warnings: [] };
    try { const r = sv.resolveAmount(f, amount, unit); return { grams: r.value, type: r.value_type, sources: r.sources, warnings: r.warnings }; }
    catch (e) { return { grams: null, type: 'missing', sources: [], warnings: [], error: (e as Error).message, errorCode: (e as EngineError).code }; }
  }, [f, amount, unit, version, sv]);
}

/** Inline "weigh once" calibration for a measure + food. */
export function CalibrateInline({ food, unit, onDone }: { food: FoodView; unit: string; onDone: () => void }) {
  const { sv, changed } = useApp();
  const [g, setG] = useState<number | ''>('');
  const [level, setLevel] = useState<'level' | 'heaped' | 'packed'>('level');
  if (!unit.startsWith('m:')) return null;
  const m = repo.measures(sv.db).find(x => x.id === +unit.slice(2));
  return (
    <div className="info col">
      <div><b>Bir kez tartın:</b> 1 {m?.name_tr} {food.name} kaç gram geldi?</div>
      <div className="row"><div style={{ width: 120 }}><NumberInput value={g} onChange={setG} placeholder="gram" /></div>
        <Seg value={level} options={[['level', 'silme'], ['heaped', 'tepeleme'], ['packed', 'bastırılmış']]} onChange={setLevel} />
        <button className="btn primary sm" disabled={!(g && g > 0)} onClick={() => { repo.saveCalibration(sv.db, m!.id, food.id, g as number, level); changed('Ölçü kalibre edildi'); onDone(); }}>Kaydet</button></div>
      <div className="tiny">Bu değer bundan sonra bu besin için “ölçülmüş” olarak kullanılır.</div>
    </div>
  );
}

export function vtText(t: ValueType) { return VT_TR[t]; }
