import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import type { FoodView } from '../data/reference';
import * as repo from '../data/repo';
import { MEALS, MEAL_TR, type Meal, localDateTime, todayIso } from '../data/services';
import { cookBatch, cookedToRaw, nutrientsFor, type ValueType, type PrepState } from '../engine';
import { Badge, fmt, Modal, NumberInput, Seg } from './kit';
import { FoodPicker, NutrientTable } from './food';
import { guessMeal } from './LogSheet';

const METHODS: [PrepState, string][] = [['boiled', 'Haşlama'], ['steamed', 'Buhar'], ['baked', 'Fırın'], ['grilled', 'Izgara'], ['pan_fried', 'Tava'], ['stewed', 'Tencere/yahni'], ['fried', 'Kızartma']];

/** Raw/cooked calculator (spec 3.1 / 5.2). */
export function CookCalculator({ rawFood, rawG: r0, date, meal: m0, onClose }: { rawFood: FoodView; rawG?: number; date?: string; meal?: Meal; onClose: () => void }) {
  const { sv, changed } = useApp();
  const [rawG, setRawG] = useState<number | ''>(r0 ? Math.round(r0 * 10) / 10 : '');
  const [method, setMethod] = useState<PrepState>('boiled');
  const tares = repo.tares(sv.db);
  const prevY = repo.measuredYields(sv.db, rawFood.id)[0];
  const [mode, setMode] = useState<'direct' | 'pot' | 'prev'>('direct');
  const [cookedDirect, setCookedDirect] = useState<number | ''>('');
  const [potTotal, setPotTotal] = useState<number | ''>('');
  const [tareId, setTareId] = useState<number | ''>(tares[0]?.id ?? '');
  const [tareG, setTareG] = useState<number | ''>(tares[0]?.grams ?? '');
  const [fatFood, setFatFood] = useState<FoodView | null>(() => sv.ref.search('zeytinyağı', 1)[0] ?? null);
  const [fatG, setFatG] = useState<number | ''>('');
  const [absorb, setAbsorb] = useState<number | ''>(100);
  const [pickFat, setPickFat] = useState(false);
  const [discarded, setDiscarded] = useState<number | ''>('');
  const [eaten, setEaten] = useState<number | ''>('');
  const [meal, setMeal] = useState<Meal>(m0 ?? guessMeal());
  const [saveName, setSaveName] = useState(`${rawFood.name.split(',')[0]} (pişmiş, benim)`);

  const cooked: number | null = mode === 'direct' ? (cookedDirect === '' ? null : cookedDirect)
    : mode === 'pot' ? (potTotal !== '' && tareG !== '' ? potTotal - tareG : null)
    : prevY && rawG !== '' ? rawG * prevY.y : null;
  const cookedType: ValueType = mode === 'prev' ? 'estimated' : 'measured';

  const out = useMemo(() => {
    if (rawG === '' || !(rawG > 0) || !cooked || cooked <= 0) return null;
    return cookBatch({
      ingredients: [{ per100: rawFood.per100, grams: rawG }],
      addedFat: fatFood && fatG !== '' && fatG > 0 ? { per100: fatFood.per100, grams: fatG, absorptionPct: absorb === '' ? 100 : absorb } : undefined,
      discarded: discarded !== '' && discarded > 0 ? [{ grams: discarded, label: 'süzülen sıvı' }] : [],
      cookedG: cooked, cookedType, codes: sv.ref.codes(),
    });
  }, [rawG, cooked, cookedType, rawFood, fatFood, fatG, absorb, discarded, sv]);
  const y = out && rawG ? cooked! / (rawG as number) : null;
  const eatenN = out?.per100 && eaten !== '' ? nutrientsFor(out.per100, eaten, 'measured') : null;

  function persistSession(resultFoodId: number | null) {
    return repo.saveCookSession(sv.db, { raw_food_id: rawFood.id, raw_g: rawG as number, method, cooked_g: cooked!, cooked_value_type: cookedType, added_fat_food_id: fatFood?.id ?? null, added_fat_g: fatG === '' ? null : fatG, fat_absorption_pct: absorb === '' ? null : absorb, discarded_g: discarded === '' ? null : discarded, result_custom_food_id: resultFoodId });
  }
  function logPortion() {
    if (!out?.per100 || eaten === '') return;
    const sid = persistSession(null);
    repo.addLog(sv.db, { datetime: localDateTime(new Date(`${date ?? todayIso()}T${new Date().toTimeString().slice(0, 5)}:00`)), meal, food_id: rawFood.id, cook_session_id: sid, entered_amount: eaten, entered_unit: 'g (pişmiş)', grams: eaten, grams_value_type: 'measured',
      snapshot: { name: `${rawFood.name} → pişmiş (${METHODS.find(m => m[0] === method)?.[1]})`, source: 'Pişirme hesabı', kind: 'cooked', per100: out.per100, prep: method } });
    changed('Pişmiş porsiyon kaydedildi'); onClose();
  }
  function saveFood() {
    if (!out?.per100) return;
    const id = repo.saveCustomFood(sv.db, { name_tr: saveName, origin: 'recipe', prep_state: method, base_food_id: rawFood.base, source_note: `${fmt(rawG as number)} g çiğ ${rawFood.name} → ${fmt(cooked!)} g pişmiş (${cookedType === 'measured' ? 'tartıldı' : 'tahmini'})`,
      nutrients: Object.fromEntries(Object.entries(out.per100).map(([k, v]) => [k, { value: v.value, type: v.type }])) });
    persistSession(id); changed('Kendi besininiz olarak kaydedildi'); onClose();
  }

  return (
    <Modal title="Çiğ / pişmiş hesaplayıcı" onClose={onClose} wide>
      <div className="col">
        <div className="small muted">Çiğ besin: <b>{rawFood.name}</b> · {rawFood.sourceLabel}</div>
        <div className="grid g3">
          <label className="f">Çiğ ağırlık (g)<NumberInput value={rawG} onChange={setRawG} /></label>
          <label className="f">Yöntem<select className="input" value={method} onChange={e => setMethod(e.target.value as PrepState)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <div className="f"><span className="small" style={{ fontWeight: 550, color: 'var(--ink-2)' }}>Pişmiş ağırlık</span>
            <Seg value={mode} options={[['direct', 'Tarttım'], ['pot', 'Tencereyle'], ...(prevY ? [['prev', 'Önceki tartım'] as ['prev', string]] : [])]} onChange={setMode} /></div>
        </div>
        {mode === 'direct' && <label className="f">Pişmiş ağırlık (g)<NumberInput value={cookedDirect} onChange={setCookedDirect} placeholder="tartılan pişmiş ağırlık" /></label>}
        {mode === 'pot' && <div className="grid g3">
          <label className="f">Tencere + yemek (g)<NumberInput value={potTotal} onChange={setPotTotal} /></label>
          <label className="f">Kayıtlı dara<select className="input" value={tareId} onChange={e => { const t = tares.find(x => x.id === +e.target.value); setTareId(t?.id ?? ''); setTareG(t?.grams ?? ''); }}><option value="">— elle gir —</option>{tares.map(t => <option key={t.id} value={t.id}>{t.name} ({fmt(t.grams)} g)</option>)}</select></label>
          <label className="f">Boş tencere (g)<NumberInput value={tareG} onChange={setTareG} /></label>
        </div>}
        {mode === 'prev' && prevY && <div className="info small">Önceki tartımınız: verim Y = {fmt(prevY.y, 3)} ({prevY.created_at.slice(0, 10)}). Bu sefer tartmadığınız için sonuç <b>tahmini</b>.</div>}
        {!prevY && mode !== 'prev' && <div className="tiny muted">Bu besin için paketle gelen kaynaklı verim katsayısı yok; en doğrusu pişirdikten sonra tartmak. Bir kez tartınca sonraki sefer “Önceki tartım” seçeneği çıkar.</div>}
        <div className="hr" />
        <h3>Eklenen yağ (isteğe bağlı)</h3>
        <div className="grid g3">
          <label className="f">Yağ türü<button type="button" className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => setPickFat(!pickFat)}>{fatFood?.name ?? 'Seç'}</button></label>
          <label className="f">Yağ (g)<NumberInput value={fatG} onChange={setFatG} /></label>
          <label className="f">Emilim %<NumberInput value={absorb} onChange={setAbsorb} /></label>
        </div>
        <div className="tiny muted">Pilavda olduğu gibi yağ dökülmüyorsa %100. Kızartmada emilim çok değişkendir; girdiğiniz değer “tahmini” işaretlenir.</div>
        {pickFat && <div className="card"><FoodPicker tabs={['search']} onPick={f => { setFatFood(f); setPickFat(false); }} placeholder="Yağ ara (zeytinyağı, tereyağı…)" /></div>}
        <label className="f" style={{ maxWidth: 260 }}>Süzülüp atılan sıvı (g, isteğe bağlı)<NumberInput value={discarded} onChange={setDiscarded} /></label>
        <div className="hr" />
        {out ? <>
          <div className="grid g4">
            <div className="stat"><div className="l">Toplam enerji</div><div className="v">{fmt(out.total.energy_kcal.value ?? out.total.energy_kcal.known)}</div><div className="small muted">kcal</div></div>
            <div className="stat"><div className="l">100 g pişmiş</div><div className="v">{fmt(out.per100?.energy_kcal.value)}</div><div className="small muted">kcal</div></div>
            <div className="stat"><div className="l">Verim (Y)</div><div className="v">{fmt(y, 2)}</div><div className="small muted">pişmiş ÷ çiğ</div></div>
            <div className="stat"><div className="l">Değer türü</div><div style={{ marginTop: 8 }}><Badge t={out.value_type} /></div></div>
          </div>
          {out.warnings.map(w => <div key={w} className="warn small">{w}</div>)}
          <div className="tiny muted">Su ağırlık ekler, kalori eklemez. Vitamin kayıpları (retention) bu sürümde hesaba katılmaz.</div>
          <div className="grid g3">
            <label className="f">Yediğim pişmiş miktar (g)<NumberInput value={eaten} onChange={setEaten} /></label>
            <label className="f">Öğün<select className="input" value={meal} onChange={e => setMeal(e.target.value as Meal)}>{MEALS.map(m => <option key={m} value={m}>{MEAL_TR[m]}</option>)}</select></label>
            <div className="f"><span className="small muted">Çiğ karşılığı</span><b className="num" style={{ paddingTop: 10 }}>{eaten !== '' && y ? fmt(cookedToRaw(eaten, y), 1) + ' g çiğ' : '—'}</b></div>
          </div>
          {out.per100 && <NutrientTable per100={out.per100} amount={eatenN} grams={eaten === '' ? null : eaten} codes={sv.ref.coreCodes()} />}
          <div className="row between">
            <div className="row"><input className="input" style={{ width: 260 }} value={saveName} onChange={e => setSaveName(e.target.value)} /><button className="btn" onClick={saveFood}>Besin olarak kaydet</button></div>
            <button className="btn primary" disabled={eaten === ''} onClick={logPortion}>Porsiyonu kaydet</button>
          </div>
        </> : <div className="empty">Çiğ ve pişmiş ağırlığı girin.</div>}
      </div>
    </Modal>
  );
}
