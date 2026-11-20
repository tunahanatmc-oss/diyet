import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import type { FoodView } from '../data/reference';
import { PREP_TR } from '../data/reference';
import * as repo from '../data/repo';
import { MEALS, MEAL_TR, type Meal, localDateTime, todayIso } from '../data/services';
import { edibleGrams, nutrientsFor, weakest, type ValueType, sizeGroups, primarySizeGroup, defaultSizeOption, sizeGrams, type SizeLevel,
  isWholeHenEgg, eggPrepFor, eggPrepFactor, eggClassGrams, EU_EGG_CLASSES, EGG_PREPS, EGG_RAW_DESC, EGG_NOTE, type EggClass, MILK_TR, drinkMl } from '../engine';
import { Badge, fmt, Modal, NumberInput, Seg } from './kit';
import { NutrientTable, useResolve, CalibrateInline } from './food';
import { CookCalculator } from './CookCalculator';
import { I } from './icons';

export function guessMeal(d = new Date()): Meal {
  const h = d.getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

type Mode = 'egg' | 'size' | 'free';
const largeOf = (f?: FoodView) => f?.portions.find(p => (p.label ?? '').toLowerCase() === 'large')?.gram_weight ?? null;

function getJson<T>(db: any, key: string): T | null { try { const v = repo.getSetting(db, key); return v ? JSON.parse(v) as T : null; } catch { return null; } }

export function LogSheet({ food: initial, date, meal: initMeal, amount: a0, unit: u0, askPrep, askMilk, onClose }: { food: FoodView; date?: string; meal?: Meal; amount?: number; unit?: string; askPrep?: boolean; askMilk?: boolean; onClose: () => void }) {
  const { sv, version, changed } = useApp();
  const [food, setFoodState] = useState(initial);
  const profile = repo.getProfile(sv.db);
  const units = useMemo(() => sv.unitsFor(food), [food, sv, version]);
  const countUnit = !!u0 && /^adet\b/.test(u0); // re-log of a size entry ("adet Orta", "adet M (AB)")
  const [amount, setAmount] = useState<number | ''>(a0 != null && !countUnit ? a0 : (profile?.uses_scale ? 100 : 1));
  // FNDDS drinks without sizes (espresso, Türk kahvesi): default to their own household portion, e.g. "espresso cup (2 fl oz)"
  const drinkUnit = initial.source === 'usda_fndds' && a0 == null ? units.find(u => u.code.startsWith('p:'))?.code : undefined;
  const [unit, setUnit] = useState(u0 && units.some(u => u.code === u0) ? u0 : drinkUnit ?? (profile?.uses_scale === 0 && units.length > 1 ? units[1].code : 'g'));
  const [meal, setMeal] = useState<Meal>(initMeal ?? guessMeal());
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [withBone, setWithBone] = useState(false);
  const [refuse, setRefuse] = useState<number | ''>('');
  const [cook, setCook] = useState(false);
  const [calib, setCalib] = useState(false);

  // ---- egg flow (EU S/M/L/XL) ----
  const isEgg = food.kind === 'ref' && isWholeHenEgg(food.name_en);
  const rawEgg = useMemo(() => (isEgg ? (food.prep === 'raw' ? food : sv.ref.byDesc(EGG_RAW_DESC)) : undefined), [isEgg, food, sv]);
  const eggRefuse = rawEgg?.refuse?.pct ?? sv.ref.byDesc(EGG_RAW_DESC)?.refuse?.pct ?? null;
  const eggFactor = isEgg ? eggPrepFactor(largeOf(food), largeOf(sv.ref.byDesc(EGG_RAW_DESC))) : 1;
  const [eggCls, setEggCls] = useState<EggClass>(() => (repo.getSetting(sv.db, 'size:egg') as EggClass) || 'M');

  // ---- preparation step ----
  const prepOptions: { food: FoodView; label: string; sub?: string }[] = useMemo(() => {
    if (isEgg) return EGG_PREPS.map(p => ({ p, f: p.code === 'raw' && food.prep === 'raw' ? food : sv.ref.byDesc(p.desc) })).filter(x => x.f).map(x => ({ food: x.f!, label: x.p.name_tr }));
    if (food.kind !== 'ref' || food.source === 'usda_fndds') return [];
    const sib = sv.ref.siblings(food.id);
    if (!sib.length) return [];
    return [food, ...sib].slice(0, 9).map(f => ({ food: f, label: PREP_TR[f.prep] ?? f.prep, sub: f.name }));
  }, [isEgg, food.id, sv]);
  const milkOpts = useMemo(() => (food.kind === 'ref' ? sv.ref.milkVariants(food.id) : []), [food.id, sv]);
  const [step, setStep] = useState<'prep' | 'milk' | 'amount'>(() => (a0 == null && milkOpts.length > 1 && askMilk ? 'milk'
    : a0 == null && prepOptions.length > 1 && (askPrep || (isEgg && food.prep === 'raw' && askPrep !== false)) ? 'prep' : 'amount'));
  const flOzG = food.portions.find(p => p.unit === 'floz' && p.amount === 1)?.gram_weight ?? null;
  const kcal100 = food.per100.energy_kcal?.value ?? null;

  // ---- generic size picker ----
  const groups = useMemo(() => sizeGroups(food.portions), [food]);
  const remembered = useMemo(() => getJson<{ g: string; l: SizeLevel }>(sv.db, 'size:' + food.id), [food.id, sv, version]);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const group = groups.find(g => g.key === (groupKey ?? remembered?.g)) ?? primarySizeGroup(groups);
  const [level, setLevel] = useState<SizeLevel | null>(null);
  const sizeOpt = group ? (group.options.find(o => o.level === level) ?? defaultSizeOption(group, remembered?.g === group.key ? remembered.l : null)) : null;
  const [count, setCount] = useState<number | ''>(countUnit && a0 ? a0 : 1);
  const canEgg = isEgg && eggRefuse != null;
  const [mode, setMode] = useState<Mode>(() => (a0 != null && !countUnit ? 'free' : canEgg ? 'egg' : groups.length ? 'size' : 'free'));

  function setFood(f: FoodView) {
    setFoodState(f); setGroupKey(null); setLevel(null);
    const eggNext = f.kind === 'ref' && isWholeHenEgg(f.name_en);
    if (mode !== 'free' || a0 == null) setMode(eggNext && eggRefuse != null ? 'egg' : sizeGroups(f.portions).length ? 'size' : 'free');
  }

  const r = useResolve(food, amount, unit, version);
  const siblings = food.kind === 'ref' ? sv.ref.siblings(food.id) : [];
  let grams: number | null; let gType: ValueType; let gSources: string[] = []; let gNote: string | null = null;
  if (mode === 'egg' && canEgg) {
    const e = eggClassGrams(eggCls, eggRefuse!, eggFactor);
    grams = count === '' || !(count > 0) ? null : sizeGrams({ grams: e.value }, count); gType = 'estimated'; gSources = e.sources; gNote = EGG_NOTE;
  } else if (mode === 'size' && sizeOpt) {
    grams = count === '' || !(count > 0) ? null : sizeGrams(sizeOpt, count); gType = sizeOpt.value_type; gSources = [`${sizeOpt.source}: 1 ${sizeOpt.portionLabel} = ${fmt(sizeOpt.grams, 1)} g`];
  } else {
    grams = r.grams; gType = r.type;
    if (grams != null && withBone && refuse !== '' && refuse >= 0 && refuse < 100) { grams = edibleGrams(grams, refuse); gType = weakest(gType, 'measured'); }
  }
  const n = grams != null ? nutrientsFor(food.per100, grams, gType) : null;
  const fav = repo.isFavourite(sv.db, food.id, null);
  const eggDef = EU_EGG_CLASSES.find(c => c.code === eggCls)!;

  function enteredUnit(): string {
    if (mode === 'egg') return `adet ${eggCls} (AB)`;
    if (mode === 'size' && sizeOpt) return `adet ${sizeOpt.label_tr}`;
    return unit === 'g' ? 'g' : units.find(u => u.code === unit)?.label ?? unit;
  }
  function save() {
    if (grams == null) return;
    const d = date ?? todayIso();
    const dt = localDateTime(new Date(`${d}T${time}:00`));
    const sized = mode !== 'free';
    repo.addLog(sv.db, {
      datetime: dt, meal, food_id: food.id, entered_amount: sized ? count as number : amount as number, entered_unit: enteredUnit(),
      grams, grams_value_type: gType, snapshot: { name: food.name, source: food.sourceLabel, kind: food.kind, per100: food.per100, prep: food.prep },
      note: mode === 'egg' ? `${EGG_NOTE}: ${eggCls} ≈${eggDef.shellG} g kabuklu, USDA kabuk %${eggRefuse}` : mode === 'size' && sizeOpt ? `USDA porsiyonu: ${sizeOpt.portionLabel} = ${fmt(sizeOpt.grams, 1)} g` : withBone && refuse !== '' ? `Kemik/atık %${refuse} düşüldü` : null,
    });
    // remember the chosen size as next default (personal DB)
    if (mode === 'egg') repo.setSetting(sv.db, 'size:egg', eggCls);
    if (mode === 'size' && group && sizeOpt) repo.setSetting(sv.db, 'size:' + food.id, JSON.stringify({ g: group.key, l: sizeOpt.level }));
    if (isEgg) { const pc = eggPrepFor(food.name_en)?.code; if (pc) repo.setSetting(sv.db, 'eggprep', pc); }
    changed(`${food.name} kaydedildi`); onClose();
  }
  if (cook) return <CookCalculator rawFood={food} rawG={grams ?? undefined} date={date} meal={meal} onClose={onClose} />;

  if (step === 'milk') {
    return (
      <Modal title={food.name.replace(/,.*$/, '')} onClose={onClose}>
        <div className="col" data-step="milk">
          <div className="steptitle">Hangi süt?</div>
          <div className="prepgrid">
            {milkOpts.map(o => <button key={o.food.id} className={'prepbtn' + (o.food.id === food.id ? ' on' : '')} onClick={() => { setFood(o.food); setStep('amount'); }}>
              <b>{MILK_TR[o.milk].name}</b><span>{MILK_TR[o.milk].sub}</span></button>)}
          </div>
          <div className="tiny muted">USDA FNDDS her içecek için yalnızca bu süt seçeneklerini veriyor.</div>
        </div>
      </Modal>
    );
  }

  if (step === 'prep') {
    const lastEggPrep = isEgg ? repo.getSetting(sv.db, 'eggprep') : null;
    return (
      <Modal title={isEgg ? 'Yumurta' : food.name} onClose={onClose}>
        <div className="col" data-step="prep">
          <div className="steptitle">Nasıl hazırlandı?</div>
          <div className="prepgrid">
            {prepOptions.map(o => {
              const on = isEgg ? (lastEggPrep ? eggPrepFor(o.food.name_en)?.code === lastEggPrep : false) : o.food.id === food.id;
              return <button key={o.food.id} className={'prepbtn' + (on ? ' on' : '')} onClick={() => { setFood(o.food); setStep('amount'); }}>
                <b>{o.label}</b>{o.sub && <span>{o.sub}</span>}</button>;
            })}
          </div>
          <div className="tiny muted">{isEgg ? 'Değerler seçtiğiniz hazırlığın USDA kaydından gelir.' : 'Her hazırlık USDA’da ayrı kayıttır; besin değerleri farklıdır.'}</div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={food.name} onClose={onClose}>
      <div className="col">
        <div className="row small muted"><span className="chip neutral">{PREP_TR[food.prep]}</span><span>{food.sourceLabel}{food.sourceId ? ' · #' + food.sourceId : ''}</span>{food.kind === 'ref' && food.name !== food.name_en && <span>· {food.name_en}</span>}</div>
        {milkOpts.length > 1 && <div className="row small"><span>Süt: <b>{MILK_TR[milkOpts.find(o => o.food.id === food.id)?.milk ?? 'std'].name}</b></span>
          <button className="btn sm ghost" onClick={() => setStep('milk')} data-change-milk>Değiştir</button></div>}
        {prepOptions.length > 1 && <div className="row small"><span>Hazırlık: <b>{isEgg ? EGG_PREPS.find(p => p.code === eggPrepFor(food.name_en)?.code)?.name_tr : PREP_TR[food.prep]}</b></span>
          <button className="btn sm ghost" onClick={() => setStep('prep')} data-change-prep>Değiştir</button></div>}

        {mode === 'egg' && canEgg && (
          <div className="col" data-step="size">
            <div className="steptitle">Yumurta boyu (AB / TR sınıfı)</div>
            <div className="sizegrid">
              {EU_EGG_CLASSES.map(c => { const g = eggClassGrams(c.code, eggRefuse!, eggFactor).value; return (
                <button key={c.code} className={'sizebtn' + (c.code === eggCls ? ' on' : '')} onClick={() => setEggCls(c.code)} data-size={c.code}>
                  <b>{c.code}</b><span>{c.name_tr}</span><small className="num">{fmt(g)} g</small><em>{c.range} kabuklu</em>{kcal100 != null && <em className="num">{fmt(kcal100 * g / 100)} kcal</em>}</button>); })}
            </div>
          </div>
        )}
        {mode === 'size' && group && sizeOpt && (
          <div className="col" data-step="size">
            <div className="row between"><div className="steptitle">Boy seçin</div>
              {groups.length > 1 && <Seg value={group.key} options={groups.map(g => [g.key, g.label_tr] as [string, string])} onChange={k => { setGroupKey(k); setLevel(null); }} />}</div>
            <div className="sizegrid">
              {group.options.map(o => (
                <button key={o.level} className={'sizebtn' + (o.level === sizeOpt.level ? ' on' : '')} onClick={() => setLevel(o.level)} data-size={o.level}>
                  <span className="big">{o.label_tr}</span>
                  <small className="num">{flOzG ? `${fmt(drinkMl(o.grams, flOzG), 0)} ml` : `${fmt(o.grams, o.grams < 10 ? 1 : 0)} g`}</small>
                  {kcal100 != null && <em className="num">{fmt(kcal100 * o.grams / 100)} kcal{flOzG ? ` · ${fmt(o.grams)} g` : ''}</em>}</button>))}
            </div>
          </div>
        )}
        {mode !== 'free' && (
          <div className="row between wrap">
            <div className="stepper"><button type="button" className="icon-btn boxed" aria-label="Azalt" onClick={() => setCount(c => Math.max(0.5, ((c || 1) as number) - ((c as number) > 1 ? 1 : 0.5)))}>−</button>
              <div style={{ width: 70 }}><NumberInput value={count} onChange={setCount} aria-label="Adet" /></div>
              <button type="button" className="icon-btn boxed" aria-label="Artır" onClick={() => setCount(c => ((c || 0) as number) + 1)}>+</button><span className="muted">adet</span></div>
            <button className="btn sm ghost" onClick={() => { setMode('free'); setUnit('g'); setAmount(grams != null ? Math.round(grams) : 100); }} data-gram>Gram gir</button>
          </div>
        )}
        {mode !== 'free' && grams != null && (
          <div className="col"><div className="row small"><span>Toplam ≈ <b className="num">{fmt(grams, 0)} g</b></span><Badge t={gType} /></div>
            {gNote && <div className="tiny">{gNote}.</div>}
            <div className="tiny muted">{gSources.join(' · ')}</div></div>
        )}

        {mode === 'free' && <>
          {(canEgg || groups.length > 0) && <div><button className="btn sm ghost" onClick={() => setMode(canEgg ? 'egg' : 'size')}>← Boy ile seç</button></div>}
          {prepOptions.length <= 1 && siblings.length > 0 && <label className="f">Hazırlık durumu
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
          {withBone && <div className="row small"><span>Atık oranı %</span><div style={{ width: 90 }}><NumberInput value={refuse} onChange={setRefuse} /></div><span className="muted">{food.refuse ? `USDA: %${food.refuse.pct} (${food.refuse.desc})` : 'Kendi ölçümünüz: kemik g ÷ toplam g × 100'}</span></div>}
        </>}
        <div className="grid g2">
          <label className="f">Öğün<select className="input" value={meal} onChange={e => setMeal(e.target.value as Meal)}>{MEALS.map(m => <option key={m} value={m}>{MEAL_TR[m]}</option>)}</select></label>
          <label className="f">Saat<input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
        </div>
        {food.note && <div className="tiny muted">Not: {food.note}</div>}
        <NutrientTable per100={food.per100} amount={n} grams={grams} codes={sv.ref.coreCodes()} gramsType={gType} />
        <div className="row between">
          <div className="row">
            <button className="btn ghost" onClick={() => { const sized = mode !== 'free'; const a = sized ? (count === '' ? undefined : count) : amount === '' ? undefined : amount; repo.toggleFavourite(sv.db, food.id, null, a, sized ? enteredUnit() : unit); changed(fav ? 'Favorilerden çıkarıldı' : 'Favorilere eklendi'); }}><I.star width={17} fill={fav ? 'currentColor' : 'none'} /> {fav ? 'Favori' : 'Favorile'}</button>
            {['raw', 'dry'].includes(food.prep) && !isEgg && <button className="btn soft" onClick={() => setCook(true)}><I.pot width={17} /> Pişir</button>}
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
