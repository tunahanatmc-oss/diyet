import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import type { FoodView } from '../data/reference';
import { PREP_TR } from '../data/reference';
import * as repo from '../data/repo';
import { MEALS, MEAL_TR, type Meal, localDateTime, todayIso } from '../data/services';
import { edibleGrams, nutrientsFor, weakest, type ValueType } from '../engine';
import { Badge, fmt, Modal, NumberInput, Seg } from './kit';
import { NutrientTable, useResolve, CalibrateInline } from './food';
import { CookCalculator } from './CookCalculator';
import { I } from './icons';

export function guessMeal(d = new Date()): Meal {
  const h = d.getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

export function LogSheet({ food: initial, date, meal: initMeal, amount: a0, unit: u0, onClose }: { food: FoodView; date?: string; meal?: Meal; amount?: number; unit?: string; onClose: () => void }) {
  const { sv, version, changed } = useApp();
  const [food, setFood] = useState(initial);
  const profile = repo.getProfile(sv.db);
  const units = useMemo(() => sv.unitsFor(food), [food, sv, version]);
  const [amount, setAmount] = useState<number | ''>(a0 ?? (profile?.uses_scale ? 100 : 1));
  const [unit, setUnit] = useState(u0 && units.some(u => u.code === u0) ? u0 : profile?.uses_scale === 0 && units.length > 1 ? units[1].code : 'g');
  const [meal, setMeal] = useState<Meal>(initMeal ?? guessMeal());
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [withBone, setWithBone] = useState(false);
  const [refuse, setRefuse] = useState<number | ''>('');
  const [cook, setCook] = useState(false);
  const [calib, setCalib] = useState(false);
  const r = useResolve(food, amount, unit, version);
  const siblings = food.kind === 'ref' ? sv.ref.siblings(food.id) : [];
  let grams = r.grams; let gType: ValueType = r.type;
  if (grams != null && withBone && refuse !== '' && refuse >= 0 && refuse < 100) { grams = edibleGrams(grams, refuse); gType = weakest(gType, 'measured'); }
  const n = grams != null ? nutrientsFor(food.per100, grams, gType) : null;
  const fav = repo.isFavourite(sv.db, food.id, null);

  function save() {
    if (grams == null) return;
    const d = date ?? todayIso();
    const dt = localDateTime(new Date(`${d}T${time}:00`));
    repo.addLog(sv.db, {
      datetime: dt, meal, food_id: food.id, entered_amount: amount as number, entered_unit: unit === 'g' ? 'g' : units.find(u => u.code === unit)?.label ?? unit,
      grams, grams_value_type: gType, snapshot: { name: food.name, source: food.sourceLabel, kind: food.kind, per100: food.per100, prep: food.prep },
      note: withBone && refuse !== '' ? `Kemik/atık %${refuse} düşüldü` : null,
    });
    changed(`${food.name} kaydedildi`); onClose();
  }
  if (cook) return <CookCalculator rawFood={food} rawG={grams ?? undefined} date={date} meal={meal} onClose={onClose} />;
  return (
    <Modal title={food.name} onClose={onClose}>
      <div className="col">
        <div className="row small muted"><span className="chip neutral">{PREP_TR[food.prep]}</span><span>{food.sourceLabel}{food.sourceId ? ' · #' + food.sourceId : ''}</span>{food.kind === 'ref' && food.name !== food.name_en && <span>· {food.name_en}</span>}</div>
        {siblings.length > 0 && <label className="f">Hazırlık durumu
          <select className="input" value={food.id} onChange={e => setFood(sv.food(+e.target.value)!)}>
            <option value={food.id}>{PREP_TR[food.prep]} — {food.name}</option>
            {siblings.map(s => <option key={s.id} value={s.id}>{PREP_TR[s.prep]} — {s.name}</option>)}
          </select></label>}
        <div className="grid g2">
          <label className="f">Miktar<NumberInput value={amount} onChange={setAmount} autoFocus /></label>
          <label className="f">Birim<select className="input" value={unit} onChange={e => { setUnit(e.target.value); setCalib(false); }}>{units.map(u => <option key={u.code} value={u.code}>{u.label}</option>)}</select></label>
        </div>
        {r.error ? (
          <div className="col"><div className="warn">{r.error}</div>{r.errorCode === 'NO_WEIGHT_DATA' && <CalibrateInline food={food} unit={unit} onDone={() => setCalib(false)} />}</div>
        ) : r.grams != null && unit !== 'g' && (
          <div className="row small"><span>≈ <b className="num">{fmt(r.grams, 1)} g</b></span><Badge t={r.type} /><span className="muted">{r.sources.join('; ')}</span>
            {unit.startsWith('m:') && r.type !== 'measured' && <button className="btn sm ghost" onClick={() => setCalib(!calib)}><I.scale width={15} /> Tartarak kalibre et</button>}</div>
        )}
        {calib && <CalibrateInline food={food} unit={unit} onDone={() => setCalib(false)} />}
        <label className="row small"><input type="checkbox" checked={withBone} onChange={e => setWithBone(e.target.checked)} /> Kemikli / kabuklu tarttım (yenmeyen kısmı düş)</label>
        {withBone && <div className="row small"><span>Atık oranı %</span><div style={{ width: 90 }}><NumberInput value={refuse} onChange={setRefuse} /></div><span className="muted">Kendi ölçümünüz: kemik g ÷ toplam g × 100</span></div>}
        <div className="grid g2">
          <label className="f">Öğün<select className="input" value={meal} onChange={e => setMeal(e.target.value as Meal)}>{MEALS.map(m => <option key={m} value={m}>{MEAL_TR[m]}</option>)}</select></label>
          <label className="f">Saat<input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
        </div>
        {food.note && <div className="tiny muted">Not: {food.note}</div>}
        <NutrientTable per100={food.per100} amount={n} grams={grams} codes={sv.ref.coreCodes()} gramsType={gType} />
        <div className="row between">
          <div className="row">
            <button className="btn ghost" onClick={() => { repo.toggleFavourite(sv.db, food.id, null, amount === '' ? undefined : amount, unit); changed(fav ? 'Favorilerden çıkarıldı' : 'Favorilere eklendi'); }}><I.star width={17} fill={fav ? 'currentColor' : 'none'} /> {fav ? 'Favori' : 'Favorile'}</button>
            {['raw', 'dry'].includes(food.prep) && <button className="btn soft" onClick={() => setCook(true)}><I.pot width={17} /> Pişir</button>}
          </div>
          <button className="btn primary" disabled={grams == null} onClick={save}>Kaydet</button>
        </div>
      </div>
    </Modal>
  );
}

export function RecipeLogSheet({ recipeId, date, meal: m0, onClose }: { recipeId: number; date?: string; meal?: Meal; onClose: () => void }) {
  const { sv, changed } = useApp();
  const rc = repo.getRecipe(sv.db, recipeId)!;
  const t = sv.recipeTotals(rc);
  const [unit, setUnit] = useState<'porsiyon' | 'g'>('porsiyon');
  const [amount, setAmount] = useState<number | ''>(1);
  const [meal, setMeal] = useState<Meal>(m0 ?? guessMeal());
  const mass = t.cookedG ?? t.rawTotalG;
  const portionG = mass / rc.servings;
  const grams = amount === '' ? null : unit === 'g' ? amount : amount * portionG;
  const gType: ValueType = unit === 'g' ? 'measured' : t.cookedG ? (rc.cooked_weight_value_type as ValueType ?? 'estimated') : 'estimated';
  const n = grams != null && t.per100 ? nutrientsFor(t.per100, grams, gType) : null;
  function save() {
    if (grams == null || !t.per100) return;
    repo.addLog(sv.db, { datetime: localDateTime(new Date(`${date ?? todayIso()}T${new Date().toTimeString().slice(0, 5)}:00`)), meal, recipe_id: rc.id!, entered_amount: amount as number, entered_unit: unit, grams, grams_value_type: gType,
      snapshot: { name: rc.name, source: 'Tarifim', kind: 'recipe', per100: t.per100 } });
    changed(`${rc.name} kaydedildi`); onClose();
  }
  return (
    <Modal title={rc.name} onClose={onClose}>
      <div className="col">
        {!t.cookedG && <div className="warn">Pişmiş ağırlık girilmemiş: porsiyon ağırlığı ve 100 g değerleri tahmini.</div>}
        <div className="grid g3">
          <label className="f">Miktar<NumberInput value={amount} onChange={setAmount} autoFocus /></label>
          <label className="f">Birim<select className="input" value={unit} onChange={e => setUnit(e.target.value as any)}><option value="porsiyon">porsiyon (≈{fmt(portionG)} g)</option><option value="g">gram (pişmiş)</option></select></label>
          <label className="f">Öğün<select className="input" value={meal} onChange={e => setMeal(e.target.value as Meal)}>{MEALS.map(m => <option key={m} value={m}>{MEAL_TR[m]}</option>)}</select></label>
        </div>
        {t.per100 && <NutrientTable per100={t.per100} amount={n} grams={grams} codes={sv.ref.coreCodes()} />}
        <div className="row between"><span /><button className="btn primary" onClick={save} disabled={grams == null}>Kaydet</button></div>
      </div>
    </Modal>
  );
}
