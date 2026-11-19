import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import type { FoodView } from '../data/reference';
import * as repo from '../data/repo';
import { scaleFactor, scaleRecipe, EngineError, type PrepState } from '../engine';
import { Badge, fmt, fmtN, NumberInput, Seg } from '../ui/kit';
import { FoodPicker, NutrientTable, CalibrateInline } from '../ui/food';
import { RecipeLogSheet } from '../ui/LogSheet';
import { I } from '../ui/icons';
import { FoodIcon } from './Foods';
import { Converter } from './Assistant';
import * as L from 'lucide-react';

const METHODS: [PrepState, string, React.ComponentType<any>][] = [['baked', 'Fırınlama', L.Flame], ['pan_fried', 'Tavada Mühür', L.CookingPot], ['boiled', 'Haşlama', L.Soup], ['stewed', 'Tencere', L.CookingPot],
  ['grilled', 'Izgara', L.Beef], ['steamed', 'Buhar', L.Waves], ['fried', 'Kızartma', L.Droplets], ['raw', 'Pişmeden', L.Salad]];

export function Recipes() {
  const { sv, version, param } = useApp();
  const list = repo.listRecipes(sv.db); void version;
  const [tab, setTab] = useState<'lab' | 'convert'>(param?.tab === 'convert' ? 'convert' : 'lab');
  const [activeId, setActiveId] = useState<number | 'new'>(list[0]?.id ?? 'new');
  const active = activeId === 'new' ? null : list.find(r => r.id === activeId) ?? null;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="pills" style={{ flex: 1 }}>
          {list.map(r => <button key={r.id} className={'pill' + (tab === 'lab' && activeId === r.id ? ' on' : '')} onClick={() => { setTab('lab'); setActiveId(r.id!); }}>{r.name}</button>)}
          <button className={'pill' + (tab === 'lab' && activeId === 'new' ? ' on' : '')} onClick={() => { setTab('lab'); setActiveId('new'); }}>+ Yeni tarif</button>
          <button className={'pill' + (tab === 'convert' ? ' on' : '')} onClick={() => setTab('convert')}>Çiğ ↔ Pişmiş Dönüştürücü</button>
        </div>
      </div>
      {tab === 'lab' ? <KitchenLab key={String(activeId) + ':' + (active ? JSON.stringify(active).length : 0)} initial={active} onSaved={id => setActiveId(id)} onDeleted={() => setActiveId('new')} />
        : <div className="grid g2 g-start"><Converter /><div className="card"><h3>Nasıl çalışır?</h3><div className="small" style={{ color: 'var(--ink-2)', marginTop: 8 }}>Çiğ ve pişmiş ağırlığı bir kez tart: verim katsayısı (Y = pişmiş ÷ çiğ) kaydedilir ve sonraki sefer “ölçülmüş” olarak kullanılır. Kaynaklı genel verim tablosu paketlenmedi; uygulama tahmin uydurmaz.</div></div></div>}
    </div>
  );
}

type Ing = repo.RecipeIngredient & { _food?: FoodView; _unit: string; _err?: string };

/** Inline recipe lab (replaces the old RecipeEditor modal). All math via sv.recipeTotals / engine. */
export function KitchenLab({ initial, onSaved, onDeleted }: { initial: repo.Recipe | null; onSaved: (id: number) => void; onDeleted: () => void }) {
  const { sv, changed, go } = useApp();
  const [name, setName] = useState(initial?.name ?? '');
  const [servings, setServings] = useState<number | ''>(initial?.servings ?? 3);
  const [method, setMethod] = useState<string>(initial?.method ?? 'baked');
  const [cooked, setCooked] = useState<number | ''>(initial?.cooked_weight_g ?? '');
  const [potTotal, setPotTotal] = useState<number | ''>('');
  const tares = repo.tares(sv.db);
  const [tareG, setTareG] = useState<number | ''>(tares[0]?.grams ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [ings, setIngs] = useState<Ing[]>(() => (initial?.ingredients ?? []).map(i => ({ ...i, _food: sv.food(i.food_id), _unit: i.unit === 'g' ? 'g' : i.unit })));
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<number | ''>('');
  const [log, setLog] = useState<number | null>(null);
  const [calibFor, setCalibFor] = useState<number | null>(null);
  const [edit, setEdit] = useState<number | null>(null);
  const [full, setFull] = useState(false);

  function setIng(i: number, patch: Partial<Ing>) {
    setIngs(list => list.map((x, j) => {
      if (j !== i) return x; const n = { ...x, ...patch };
      if (('amount' in patch || '_unit' in patch) && n._food) {
        try { const r = sv.resolveAmount(n._food, n.amount, n._unit); n.grams = r.value; n.grams_value_type = r.value_type; n._err = undefined; }
        catch (e) { n._err = (e as EngineError).message; n.grams = 0; n.grams_value_type = 'missing'; }
      }
      return n;
    }));
  }
  const cookedG = potTotal !== '' && tareG !== '' ? potTotal - tareG : cooked === '' ? null : cooked;
  const recipe: repo.Recipe = { id: initial?.id, name: name.trim() || 'Adsız tarif', servings: servings === '' || servings <= 0 ? 1 : servings, method, cooked_weight_g: cookedG, cooked_weight_value_type: cookedG ? (initial?.cooked_weight_value_type === 'estimated' && cookedG === initial.cooked_weight_g ? 'estimated' : 'measured') : null, notes,
    ingredients: ings.filter(i => i._food && i.grams > 0).map(i => ({ food_id: i.food_id, amount: i.amount, unit: i._unit, grams: i.grams, grams_value_type: i.grams_value_type, is_added_fat: i.is_added_fat ?? 0, fat_absorption_pct: i.fat_absorption_pct ?? null, discarded_g: i.discarded_g ?? null, discarded_note: i.discarded_note ?? null, is_water: i.is_water ?? 0 })) };
  const t = useMemo(() => sv.recipeTotals(recipe), [JSON.stringify(recipe)]); // eslint-disable-line
  const scaled = target !== '' && target > 0 && servings ? scaleRecipe(recipe.ingredients, scaleFactor(servings as number, target), recipe.cooked_weight_g, recipe.cooked_weight_value_type) : null;
  const rawKcal = ings.reduce((s, i) => s + (i._food && i.grams > 0 ? (i._food.per100.energy_kcal?.value ?? 0) * i.grams / 100 : 0), 0);
  const portionG = (t.cookedG ?? t.rawTotalG) / (recipe.servings || 1);
  const diff = t.cookedG != null ? t.rawTotalG - t.cookedG : null;
  const diffPct = diff != null && t.rawTotalG > 0 ? diff / t.rawTotalG * 100 : null;
  const ps = t.perServing; const pk = ps?.energy_kcal.value ?? null;
  const share = (c: string, k: number) => { const g = ps?.[c]?.value; return g != null && pk ? Math.round(g * k / pk * 100) : null; };
  const valid = !!name.trim() && recipe.ingredients.length > 0;

  function save(r = recipe) { const id = repo.saveRecipe(sv.db, r); changed('Tarif kaydedildi'); return id; }
  const ingKey = (n: number) => n;

  return (
    <div>
      <section className="lab-hero">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 12 }}><span className="badge-live" style={{ background: 'var(--accent-soft)', padding: '3px 10px', borderRadius: 999 }}><i className="dot" />Hassas Mutfak Laboratuvarı</span><span className="tiny muted d-only">• Çiğ ağırlık → pişmiş ağırlık → porsiyon</span></div>
          <h1>{initial ? name || 'Adsız tarif' : 'Yeni Tarif'}</h1>
          <div className="sub">Malzemeleri çiğ ağırlıklarıyla gir, pişmiş tencereyi tart: su kaybı ve eklenen yağ hesaba katılarak net pişmiş porsiyon makroları çıkarılır.</div>
        </div>
        <div className="row nowrap" style={{ gap: 14 }}>
          <div className="lab-stat"><div className="eyebrow">Çiğ Giriş</div><b className="num">{fmt(t.rawTotalG)}<small>g</small></b></div>
          <div className="lab-stat"><div className="eyebrow">Pişmiş Net</div><b className="num lime">{t.cookedG ? fmt(t.cookedG) : '—'}<small>g</small></b></div>
        </div>
      </section>
      <div className="lab">
        {/* 1 — raw ingredients */}
        <div className="card">
          <div className="step-h"><h2><i style={{ background: 'var(--protein)' }} />1. Çiğ Malzemeler</h2><span className="count">{ings.length} Kalem</span></div>
          <div className="tile" style={{ marginBottom: 14 }}><label className="f">Tarif adı<input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="ör. Fırında sebzeli somon" /></label></div>
          {ings.map((i, n) => (
            <div className="ing" key={ingKey(n)}>
              <span className="ic">{i._food ? <FoodIcon f={i._food} size={20} /> : <I.salad />}</span>
              <div style={{ minWidth: 0 }}><div className="nm" title={i._food?.name}>{i._food?.name ?? '?'}</div>
                <div className="mt">{i._food ? `P: ${fmtN('protein_g', (i._food.per100.protein_g?.value ?? 0) * i.grams / 100)}g • Y: ${fmtN('fat_g', (i._food.per100.fat_g?.value ?? 0) * i.grams / 100)}g • K: ${fmtN('carb_g', (i._food.per100.carb_g?.value ?? 0) * i.grams / 100)}g` : ''}{i.is_added_fat ? ' • yağ' : ''}{i.is_water ? ' • su (kalori yok)' : ''}</div></div>
              <button className="gr" style={{ border: 0, background: 'none', padding: 0, color: 'inherit', textAlign: 'right' }} onClick={() => setEdit(edit === n ? null : n)} title="Düzenle">
                {i._err ? <span className="chip vt-missing">tartı gerekli</span> : <>{fmt(i.grams)} g{i.grams_value_type !== 'measured' && <> </>}</>}
                <span>{i._food?.per100.energy_kcal?.value == null ? 'kcal eksik' : fmt((i._food.per100.energy_kcal.value * i.grams) / 100) + ' kcal'}</span></button>
              {(edit === n || i._err) && <div className="ctl">
                <div style={{ width: 74 }}><NumberInput value={i.amount} onChange={v => setIng(n, { amount: v === '' ? 0 : v })} aria-label="Miktar" /></div>
                {i._food && <select className="input" style={{ width: 150 }} value={i._unit} onChange={e => setIng(n, { _unit: e.target.value })}>{sv.unitsFor(i._food).map(u => <option key={u.code} value={u.code}>{u.label}</option>)}</select>}
                {i.grams_value_type !== 'measured' && !i._err && <Badge t={i.grams_value_type} />}
                <label className="row tiny" style={{ gap: 4 }}><input type="checkbox" checked={!!i.is_added_fat} onChange={e => setIng(n, { is_added_fat: e.target.checked ? 1 : 0, fat_absorption_pct: e.target.checked ? 100 : null })} /> yağ</label>
                <label className="row tiny" style={{ gap: 4 }}><input type="checkbox" checked={!!i.is_water} onChange={e => setIng(n, { is_water: e.target.checked ? 1 : 0 })} /> su</label>
                <button className="icon-btn" onClick={() => { setIngs(l => l.filter((_, j) => j !== n)); setEdit(null); }} aria-label="Sil"><I.close width={17} /></button>
                {!!i.is_added_fat && <div className="row tiny" style={{ width: '100%' }}><span>Emilim %</span><div style={{ width: 64 }}><NumberInput value={i.fat_absorption_pct ?? 100} onChange={v => setIng(n, { fat_absorption_pct: v === '' ? 100 : v })} /></div><span>veya dökülen (g)</span><div style={{ width: 64 }}><NumberInput value={i.discarded_g ?? ''} onChange={v => setIng(n, { discarded_g: v === '' ? null : v, discarded_note: 'dökülen yağ' })} /></div></div>}
                {i._err && <div className="warn tiny" style={{ width: '100%' }}>{i._err} <button className="link" onClick={() => setCalibFor(n)}>Bir kez tart</button></div>}
                {calibFor === n && i._food && <div style={{ width: '100%' }}><CalibrateInline food={i._food} unit={i._unit} onDone={() => { setCalibFor(null); setIng(n, { amount: i.amount }); }} /></div>}
              </div>}
            </div>))}
          {!ings.length && <div className="tile" style={{ textAlign: 'center', padding: 22 }}><I.salad width={26} style={{ color: 'var(--accent)' }} /><div className="sb" style={{ marginTop: 6 }}>Henüz Malzeme Eklenmedi</div><div className="tiny muted">Çiğ ağırlıklarla ekle; su kalori eklemez.</div></div>}
          <div className="tile" style={{ marginTop: 14, padding: 16 }}><div className="row between nowrap">
            <div><div className="eyebrow" style={{ fontSize: 11 }}>Toplam Brüt Çiğ</div><b style={{ fontSize: 26 }} className="num">{fmt(t.rawTotalG)}</b> <span className="small muted">gram</span></div>
            <div style={{ textAlign: 'right' }}><div className="eyebrow" style={{ fontSize: 11 }}>Çiğ Enerji</div><b style={{ fontSize: 26, color: 'var(--accent)' }} className="num">{fmt(rawKcal)}</b> <span className="small muted">kcal</span></div></div></div>
          {adding ? <div className="tile" style={{ marginTop: 12 }}><FoodPicker tabs={['search', 'recent', 'fav', 'mine']} autoFocus onPick={f => { setIngs(l => [...l, { food_id: f.id, amount: 100, unit: 'g', _unit: 'g', grams: 100, grams_value_type: 'measured', _food: f, is_water: /^(Beverages, water|Water, )/i.test(f.name_en) ? 1 : 0 }]); setAdding(false); setEdit(ings.length); }} /><button className="btn sm ghost" onClick={() => setAdding(false)}>Vazgeç</button></div>
            : <button className="btn block" style={{ marginTop: 12, height: 50, color: 'var(--accent)' }} onClick={() => setAdding(true)}><L.CirclePlus width={18} /> Yeni Malzeme Ekle</button>}
          <div className="tiny muted" style={{ marginTop: 10, textAlign: 'center' }}>Desteklenen: gram, su bardağı, çay bardağı, yk, tk, çk, porsiyon/adet</div>
        </div>
        {/* 2 — cooking & weight */}
        <div className="card">
          <div className="step-h"><h2><i style={{ background: 'var(--fat)' }} />2. Pişirme &amp; Su Kaybı</h2><span className="tiny sb lime">{t.cookedG ? 'TARTILDI' : 'TARTIM BEKLENİYOR'}</span></div>
          <div className="eyebrow" style={{ fontSize: 11, marginBottom: 10 }}>Pişirme Yöntemi</div>
          <div className="methods">{METHODS.map(([v, l, C]) => <button key={v} className={method === v ? 'on' : ''} onClick={() => setMethod(v)}><C width={20} strokeWidth={1.7} />{l}</button>)}</div>
          <div className="tile" style={{ marginTop: 16 }}>
            <div className="row between"><span className="eyebrow" style={{ fontSize: 11 }}>Ağırlık Dönüşümü</span>{diffPct != null && <span className="tiny sb c-y">%{fmt(Math.abs(diffPct), 1)} {diffPct >= 0 ? 'Kayıp' : 'Artış'}</span>}</div>
            <div className="bar" style={{ height: 14, marginTop: 14, background: diff != null && diff > 0 ? '#7c5a3a' : 'var(--track)' }}><i style={{ width: t.cookedG ? Math.min(100, t.cookedG / Math.max(1, t.rawTotalG) * 100) + '%' : '0%' }} /></div>
            <div className="row between tiny" style={{ marginTop: 10 }}><span>Pişen Net: <b>{t.cookedG ? fmt(t.cookedG) + 'g' : '—'}</b></span><span>Fark (su/buhar, yağ): <b className="c-y">{diff != null ? fmt(diff) + 'g' : '—'}</b></span></div>
            <div className="row nowrap" style={{ gap: 10, marginTop: 14, alignItems: 'flex-start', background: 'var(--card-3)', borderRadius: 12, padding: 12 }}>
              <I.flask width={18} style={{ color: 'var(--fat)', flex: 'none', marginTop: 2 }} /><div className="small" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}><b style={{ color: 'var(--ink)' }}>Ölçüm Notu:</b> Pişmiş yemeği çiğ değerle tartmak porsiyon kalorisini saptırır. Pişmiş ağırlığı tartmak 100 g değerlerini <b style={{ color: 'var(--ink)' }}>ölçülmüş</b> yapar; girilmezse sonuç <b style={{ color: 'var(--ink)' }}>tahmini</b> kalır.</div></div>
          </div>
          <div className="row between" style={{ marginTop: 18 }}><span className="eyebrow" style={{ fontSize: 11 }}>Pişmiş Tencere / Kap Net Ağırlığı</span>{potTotal !== '' && tareG !== '' && <span className="tiny sb lime">Dara Çıkarıldı</span>}</div>
          <div className="tile row nowrap" style={{ marginTop: 8, padding: '6px 14px' }}><div style={{ flex: 1 }}><NumberInput value={cookedG ?? ''} onChange={v => { setCooked(v); setPotTotal(''); }} placeholder="tartılan pişmiş ağırlık" style={{ background: 'transparent', border: 0, fontSize: 24, fontWeight: 600, padding: 4 }} aria-label="Pişmiş ağırlık" /></div><span className="muted sb">gram</span></div>
          <details style={{ marginTop: 8 }}><summary className="tiny muted" style={{ cursor: 'pointer' }}>Tencereyle tart (toplam − dara)</summary>
            <div className="grid g2" style={{ marginTop: 8 }}><label className="f">Tencere + yemek (g)<NumberInput value={potTotal} onChange={setPotTotal} /></label>
              <label className="f">Dara<select className="input" value={String(tareG)} onChange={e => setTareG(e.target.value === '' ? '' : +e.target.value)}><option value="">— seç —</option>{tares.map(x => <option key={x.id} value={x.grams}>{x.name} ({fmt(x.grams)} g)</option>)}</select></label></div></details>
          <div className="tile row between nowrap" style={{ marginTop: 16 }}>
            <div><div className="eyebrow" style={{ fontSize: 11 }}>Porsiyon Dağılımı</div><b>{fmt(recipe.servings)} Eşit Porsiyon</b></div>
            <div className="stepper"><button onClick={() => setServings(Math.max(1, (servings || 1) - 1))} aria-label="Azalt"><I.minus width={18} /></button><b>{fmt(recipe.servings)}</b><button onClick={() => setServings((servings || 0) + 1)} aria-label="Artır"><I.plus width={18} /></button></div></div>
          <div className="tile row between" style={{ marginTop: 12 }}><span className="small" style={{ color: 'var(--ink-2)' }}>Porsiyon başı net hedef tartım:</span><b className="lime" style={{ fontSize: 20 }}>~{fmt(portionG, 1)} gram</b></div>
          {!cookedG && <div className="warn small" style={{ marginTop: 12 }}>Pişmiş ağırlık girilmedi: toplam doğru, ancak 100 g ve porsiyon ağırlığı tahmini olur.</div>}
        </div>
        {/* 3 — cooked net macros */}
        <div className="card">
          <div className="step-h"><h2><i style={{ background: 'var(--accent)' }} />3. Pişmiş Net Makrolar</h2>{t.per100 ? <Badge t={t.value_type ?? (cookedG ? 'measured' : 'estimated')} /> : <span className="chip neutral">Bekleniyor</span>}</div>
          <div className="grid g2" style={{ gap: 12 }}>
            <div className="big-res on"><span className="eyebrow">1 Porsiyon ({fmt(portionG)}g)</span><b className="num">{fmt(pk)}</b><span>kcal / porsiyon</span></div>
            <div className="big-res"><span className="eyebrow">100g Pişmiş Besin</span><b className="num">{fmt(t.per100?.energy_kcal.value)}</b><span style={{ color: 'var(--ink-2)' }}>kcal / 100 gram</span></div>
          </div>
          <div className="tile" style={{ marginTop: 14, padding: 18 }}>
            <div className="row between"><span className="eyebrow" style={{ fontSize: 11 }}>Porsiyon Başına Makro</span><span className="tiny sb">1 Porsiyon ({fmt(portionG)}g)</span></div>
            {([['protein_g', 'Protein', 4, 'p', 'var(--protein)'], ['carb_g', 'Karbonhidrat', 4, 'k', 'var(--carb)'], ['fat_g', 'Yağ', 9, 'y', 'var(--fat)']] as [string, string, number, string, string][]).map(([c, n, k, cl, col]) => (
              <div className="mrow" key={c}><div className="top"><span className="nm"><i style={{ background: col }} />{n} {share(c, k) != null && `(%${share(c, k)})`}</span><span className="vv" style={{ color: col }}>{fmtN(c, ps?.[c]?.value)} g</span></div>
                <div className={'bar ' + cl}><i style={{ width: Math.min(100, share(c, k) ?? 0) + '%' }} /></div></div>))}
            <div className="row tiny" style={{ marginTop: 16, gap: 14, color: 'var(--ink-2)' }}><span>Lif: <b style={{ color: 'var(--ink)' }}>{fmtN('fiber_g', ps?.fiber_g?.value)}g</b></span><span>Sodyum: <b style={{ color: 'var(--ink)' }}>{fmtN('sodium_mg', ps?.sodium_mg?.value)}mg</b></span>{t.total.energy_kcal.incomplete && <Badge t="missing" label="eksik veri" />}</div>
          </div>
          {t.warnings.filter(w => !/Pişmiş ağırlık girilmedi/.test(w)).map(w => <div key={w} className="warn small" style={{ marginTop: 10 }}>{w}</div>)}
          <button className="btn primary glow block lg" style={{ marginTop: 16 }} disabled={!valid} onClick={() => { const id = save(); onSaved(id); setLog(id); }}><I.utensils width={18} /> Tarifi Kaydet &amp; Öğünüme Ekle</button>
          <div className="grid g2" style={{ marginTop: 10, gap: 10 }}>
            <button className="btn block" disabled={!valid} onClick={() => { const id = save(); onSaved(id); }}><I.bookmark width={17} /> Kaydet</button>
            <button className="btn block" onClick={() => setFull(!full)}><I.list width={17} /> {full ? 'Gizle' : 'Tüm değerler'}</button>
          </div>
          {full && t.per100 && <div style={{ marginTop: 12 }}><NutrientTable per100={t.per100} amount={t.perServing} grams={portionG} codes={sv.ref.codes()} /><div className="tiny muted">Son sütun 1 porsiyonu gösterir.</div></div>}
          <div className="tile" style={{ marginTop: 12 }}>
            <div className="row"><span className="small">Ölçekle → hedef porsiyon</span><div style={{ width: 80 }}><NumberInput value={target} onChange={setTarget} /></div>{scaled && <span className="tiny muted">k = {fmt(scaled.factor, 3)}</span>}</div>
            {scaled && <div className="small" style={{ marginTop: 8 }}>{scaled.ingredients.map((x, n) => <span key={n} className="chip neutral" style={{ margin: 2 }}>{sv.food((x as any).food_id)?.name.split(',')[0]}: {fmt(x.grams)} g</span>)}
              {scaled.warnings.map(w => <div key={w} className="warn small" style={{ marginTop: 6 }}>{w}</div>)}
              <button className="btn sm" style={{ marginTop: 8 }} onClick={() => { const id = save({ ...recipe, id: undefined, name: `${recipe.name} (×${fmt(scaled.factor, 2)})`, servings: target as number, ingredients: scaled.ingredients, cooked_weight_g: scaled.cookedG, cooked_weight_value_type: scaled.cookedType }); onSaved(id); }}>Ölçeklenmiş kopyayı kaydet</button></div>}
          </div>
          <label className="f" style={{ marginTop: 12 }}>Notlar<textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
          {initial?.id && <button className="btn sm danger ghost" style={{ marginTop: 10 }} onClick={() => { const r = repo.deleteOrArchiveRecipe(sv.db, initial.id!); changed(r === 'archived' ? 'Tarif kayıtlarda kullanıldığı için arşivlendi' : 'Tarif silindi'); onDeleted(); }}><I.trash width={15} /> Tarifi sil</button>}
        </div>
      </div>
      <div className="nf-card">
        <span className="ic"><I.calendar width={24} /></span>
        <div className="grow"><h3>Haftalık Toplu Yemek Hazırlığı</h3><div className="small" style={{ color: 'var(--ink-2)' }}>Kaydettiğin tarifleri haftalık plana yerleştir; alışveriş listesi malzemelerden otomatik çıkar.</div></div>
        <button className="btn" onClick={() => go('plan')}><I.right width={17} /> Haftalık Plan</button>
      </div>
      {log && <RecipeLogSheet recipeId={log} onClose={() => setLog(null)} />}
    </div>
  );
}
export { Seg, fmtN };
