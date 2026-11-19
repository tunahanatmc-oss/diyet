import React, { useState } from 'react';
import { useApp } from '../store';
import * as repo from '../data/repo';
import { MEALS, MEAL_TR, addDays, todayIso, weekStart, localDateTime, type Meal } from '../data/services';
import { fillToTarget, aggregateGrocery, nutrientsFor, type PlanCandidate } from '../engine';
import { fmt, Modal, NumberInput, Seg } from '../ui/kit';
import { FoodPicker } from '../ui/food';
import { I } from '../ui/icons';

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function Plan() {
  const { sv, version, changed } = useApp();
  const [ws, setWs] = useState(weekStart(todayIso()));
  const [tab, setTab] = useState<'plan' | 'grocery' | 'pantry'>('plan');
  const [add, setAdd] = useState<{ date: string; meal: Meal } | null>(null);
  void version;
  const planId = repo.planFor(sv.db, ws);
  const items = repo.planItems(sv.db, planId);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const itemN = (it: any) => {
    if (it.recipe_id) { const r = repo.getRecipe(sv.db, it.recipe_id); if (!r) return null; const t = sv.recipeTotals(r); return t.per100 ? nutrientsFor(t.per100, it.grams) : null; }
    const f = sv.food(it.food_id); return f ? nutrientsFor(f.per100, it.grams) : null;
  };
  function autoFill(date: string) {
    const t = repo.targetOn(sv.db, date); if (!t) { changed('Önce hedef belirleyin (Ayarlar)'); return; }
    const favs = repo.favourites(sv.db);
    const cands: PlanCandidate[] = [];
    for (const f of favs) {
      if (f.recipe_id) { const r = repo.getRecipe(sv.db, f.recipe_id); if (!r) continue; const tt = sv.recipeTotals(r); if (tt.perServing?.energy_kcal.value) cands.push({ id: 'r' + r.id, kcal: tt.perServing.energy_kcal.value, protein_g: tt.perServing.protein_g?.value ?? 0, label: r.name }); }
      else { const fd = sv.food(f.food_id!); if (!fd) continue; const g = f.default_unit === 'g' && f.default_amount ? f.default_amount : 100; const n = nutrientsFor(fd.per100, g); if (n.energy_kcal.value) cands.push({ id: 'f' + fd.id + ':' + g, kcal: n.energy_kcal.value, protein_g: n.protein_g?.value ?? 0, label: fd.name }); }
    }
    if (!cands.length) { changed('Otomatik doldurma için önce besin/tarif favorileyin'); return; }
    const existing = items.filter(i => i.date === date).reduce((a, i) => a + (itemN(i)?.energy_kcal.value ?? 0), 0);
    const picks = fillToTarget(cands, t.kcal - existing, t.protein_g, 5);
    picks.forEach((p, i) => {
      const meal = MEALS[i % 4];
      if (p.id.startsWith('r')) { const r = repo.getRecipe(sv.db, +p.id.slice(1))!; const tt = sv.recipeTotals(r); repo.addPlanItem(sv.db, planId, { date, meal, recipe_id: r.id!, grams: (tt.cookedG ?? tt.rawTotalG) / r.servings, label: r.name }); }
      else { const [fid, g] = p.id.slice(1).split(':'); repo.addPlanItem(sv.db, planId, { date, meal, food_id: +fid, grams: +g, label: p.label }); }
    });
    changed(picks.length ? `${picks.length} öğe eklendi (favorilerden)` : 'Uygun favori bulunamadı');
  }
  function buildGrocery() {
    const list: { foodId: string; label: string; grams: number }[] = [];
    for (const it of items) {
      if (it.recipe_id) {
        const r = repo.getRecipe(sv.db, it.recipe_id); if (!r) continue; const tt = sv.recipeTotals(r); const portionG = (tt.cookedG ?? tt.rawTotalG) / r.servings;
        const k = it.grams / (portionG * r.servings);
        for (const ing of r.ingredients) if (!ing.is_water) list.push({ foodId: String(ing.food_id), label: sv.food(ing.food_id)?.name ?? '?', grams: ing.grams * k });
      } else list.push({ foodId: String(it.food_id), label: it.label, grams: it.grams });
    }
    repo.replaceGrocery(sv.db, planId, aggregateGrocery(list).map(g => ({ food_id: +g.foodId, label: g.label, grams: g.grams })));
    setTab('grocery'); changed('Alışveriş listesi oluşturuldu');
  }
  return (
    <div>
      <div className="page-head">
        <div><h1>Plan</h1><div className="sub">Haftalık öğün planı, hedef karşılaştırması ve alışveriş listesi.</div></div>
        <div className="row"><button className="icon-btn" onClick={() => setWs(addDays(ws, -7))}><I.left width={22} /></button><span className="num">{ws} haftası</span><button className="icon-btn" onClick={() => setWs(addDays(ws, 7))}><I.right width={22} /></button></div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}><Seg value={tab} options={[['plan', 'Hafta'], ['grocery', 'Alışveriş listesi'], ['pantry', 'Kiler']]} onChange={setTab} />{tab === 'plan' && <button className="btn soft" onClick={buildGrocery}>Listeyi plandan oluştur</button>}</div>
      {tab === 'plan' && <div className="week">{days.map((d, i) => {
        const t = repo.targetOn(sv.db, d); const di = items.filter(x => x.date === d);
        const k = di.reduce((a, x) => a + (itemN(x)?.energy_kcal.value ?? 0), 0); const pr = di.reduce((a, x) => a + (itemN(x)?.protein_g?.value ?? 0), 0);
        return <div className="day" key={d}>
          <div className="row between"><b>{DAYS_TR[i]} <span className="muted small">{d.slice(8)}</span></b><button className="btn sm ghost" title="Favorilerden doldur" onClick={() => autoFill(d)}>Doldur</button></div>
          <div className="small num" style={{ margin: '4px 0 6px' }}>{fmt(k)}{t ? ' / ' + fmt(t.kcal) : ''} kcal · P {fmt(pr)}{t ? '/' + fmt(t.protein_g) : ''} g</div>
          {t && <div className={'bar' + (k > t.kcal ? ' over' : '')} style={{ marginBottom: 6 }}><i style={{ width: Math.min(100, k / t.kcal * 100) + '%' }} /></div>}
          {MEALS.map(m => <div className="slot" key={m}><div className="row between"><span className="muted tiny">{MEAL_TR[m]}</span><button className="icon-btn" style={{ padding: 2 }} onClick={() => setAdd({ date: d, meal: m })}><I.log width={14} /></button></div>
            {di.filter(x => x.meal === m).map(x => <div className="it" key={x.id}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.label}>{x.label.split(',')[0]} <span className="muted">{fmt(x.grams)}g</span></span>
              <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}><button className="icon-btn" style={{ padding: 2 }} title="Yedim — kaydet" onClick={() => {
                const n = itemN(x); if (!n) return; const per100 = x.recipe_id ? sv.recipeTotals(repo.getRecipe(sv.db, x.recipe_id)!).per100! : sv.food(x.food_id)!.per100;
                repo.addLog(sv.db, { datetime: localDateTime(new Date(d + 'T12:00:00')), meal: m, food_id: x.food_id, recipe_id: x.recipe_id, entered_amount: x.grams, entered_unit: 'g', grams: x.grams, grams_value_type: 'measured', snapshot: { name: x.label, source: 'Plan', kind: x.recipe_id ? 'recipe' : 'ref', per100 } });
                changed('Plandan günlüğe eklendi'); }}><I.check width={13} /></button>
                <button className="icon-btn" style={{ padding: 2 }} onClick={() => { repo.deletePlanItem(sv.db, x.id); changed(); }}><I.close width={13} /></button></span></div>)}
          </div>)}
        </div>; })}</div>}
      {tab === 'grocery' && <Grocery planId={planId} />}
      {tab === 'pantry' && <Pantry />}
      {add && <AddPlanItem planId={planId} date={add.date} meal={add.meal} onClose={() => setAdd(null)} />}
    </div>
  );
}

function AddPlanItem({ planId, date, meal, onClose }: { planId: number; date: string; meal: Meal; onClose: () => void }) {
  const { sv, changed } = useApp();
  const [sel, setSel] = useState<{ food_id?: number; recipe_id?: number; label: string; grams: number } | null>(null);
  const [g, setG] = useState<number | ''>(100);
  return (
    <Modal title={`${date} · ${MEAL_TR[meal]}`} onClose={onClose}>
      {!sel ? <FoodPicker autoFocus onPick={f => { setSel({ food_id: f.id, label: f.name, grams: 100 }); setG(100); }} onPickRecipe={id => { const r = repo.getRecipe(sv.db, id)!; const t = sv.recipeTotals(r); const pg = Math.round((t.cookedG ?? t.rawTotalG) / r.servings); setSel({ recipe_id: id, label: r.name, grams: pg }); setG(pg); }} />
        : <div className="col"><b>{sel.label}</b><label className="f">Gram{sel.recipe_id ? ' (1 porsiyon önceden dolduruldu)' : ''}<NumberInput value={g} onChange={setG} autoFocus /></label>
          <button className="btn primary" disabled={!(g && g > 0)} onClick={() => { repo.addPlanItem(sv.db, planId, { date, meal, food_id: sel.food_id, recipe_id: sel.recipe_id, grams: g as number, label: sel.label }); changed('Plana eklendi'); onClose(); }}>Plana ekle</button></div>}
    </Modal>
  );
}

function Grocery({ planId }: { planId: number }) {
  const { sv, changed, version } = useApp(); void version;
  const [txt, setTxt] = useState('');
  const items = repo.groceryItems(sv.db, planId);
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}><input className="input" style={{ maxWidth: 320 }} placeholder="Elle ekle (ör. deterjan)" value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && txt.trim()) { repo.addGroceryManual(sv.db, planId, txt.trim()); setTxt(''); changed(); } }} />
        <button className="btn" onClick={() => { if (txt.trim()) { repo.addGroceryManual(sv.db, planId, txt.trim()); setTxt(''); changed(); } }}>Ekle</button>
        <button className="btn ghost" onClick={() => { const t = items.map(i => `${i.checked ? '✓' : '•'} ${i.label}${i.grams ? ' — ' + fmt(i.grams) + ' g' : ''}`).join('\n'); navigator.clipboard?.writeText(t); changed('Liste kopyalandı'); }}><I.copy width={15} /> Kopyala</button></div>
      <div className="list">{items.map(i => <label className="li" key={i.id} style={{ opacity: i.checked ? .5 : 1 }}><input type="checkbox" checked={!!i.checked} onChange={() => { repo.toggleGrocery(sv.db, i.id); changed(); }} />
        <div className="grow"><div className="t" style={{ textDecoration: i.checked ? 'line-through' : undefined }}>{i.label}</div></div><span className="num small">{i.grams ? fmt(i.grams) + ' g (çiğ)' : ''}</span>
        <button className="icon-btn" onClick={e => { e.preventDefault(); repo.deleteGrocery(sv.db, i.id); changed(); }}><I.trash width={15} /></button></label>)}
        {!items.length && <div className="empty">Liste boş. “Listeyi plandan oluştur” ile haftalık plandaki malzemeleri toplayın.</div>}</div>
    </div>
  );
}

function Pantry() {
  const { sv, changed, version } = useApp(); void version;
  const [label, setLabel] = useState(''); const [g, setG] = useState<number | ''>(''); const [exp, setExp] = useState('');
  const items = repo.pantry(sv.db); const today = todayIso();
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}><input className="input" style={{ maxWidth: 240 }} placeholder="Ürün" value={label} onChange={e => setLabel(e.target.value)} /><div style={{ width: 100 }}><NumberInput value={g} onChange={setG} placeholder="gram" /></div>
        <input className="input" type="date" style={{ width: 170 }} value={exp} onChange={e => setExp(e.target.value)} title="Son kullanma" />
        <button className="btn" disabled={!label.trim()} onClick={() => { repo.addPantry(sv.db, label.trim(), g === '' ? null : g, exp || null); setLabel(''); setG(''); setExp(''); changed(); }}>Ekle</button></div>
      <div className="list">{items.map(i => <div className="li" key={i.id}><div className="grow"><div className="t">{i.label}</div><div className="s">{i.grams ? fmt(i.grams) + ' g' : ''}{i.expires_on ? ' · SKT ' + i.expires_on : ''}</div></div>
        {i.expires_on && i.expires_on <= addDays(today, 3) && <span className="chip vt-missing">{i.expires_on < today ? 'geçti' : 'yaklaşıyor'}</span>}
        <button className="icon-btn" onClick={() => { repo.deletePantry(sv.db, i.id); changed(); }}><I.trash width={15} /></button></div>)}
        {!items.length && <div className="empty">Kilerinizdeki ürünleri ve son kullanma tarihlerini buraya ekleyin.</div>}</div>
    </div>
  );
}
