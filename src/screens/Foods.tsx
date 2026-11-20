import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'lucide-react';
import { useApp } from '../store';
import type { FoodView } from '../data/reference';
import { PREP_TR, unitLabel } from '../data/reference';
import * as repo from '../data/repo';
import { per100FromServing, nutrientsFor, type ValueType, type PrepState } from '../engine';
import { Badge, fmt, fmtN, Modal, NumberInput, Seg, parseNum } from '../ui/kit';
import { FoodPicker, NutrientTable, CalibrateInline } from '../ui/food';
import { LogSheet } from '../ui/LogSheet';
import { I } from '../ui/icons';
import { fetchOff, offToFood } from '../integrations/off';
import { decodeImageFile, decodeVideoFrame, hasNativeDetector } from '../integrations/barcode';

const GROUP_ICON: [RegExp, React.ComponentType<any>][] = [[/Poultry/i, L.Drumstick], [/Finfish|Shellfish/i, L.Fish], [/Dairy|Egg/i, L.Milk], [/Beef|Pork|Lamb|Sausage/i, L.Beef],
  [/Fats|Oils/i, L.Droplet], [/Vegetable/i, L.Carrot], [/Fruit/i, L.Apple], [/Cereal|Grain|Pasta|Baked|Breakfast/i, L.Wheat], [/Legume/i, L.Bean], [/Nut|Seed/i, L.Nut],
  [/Beverage/i, L.CupSoda], [/Sweet|Snack/i, L.Cookie], [/Soup|Meal|Entree|Fast|Restaurant/i, L.Soup], [/Spice/i, L.Leaf]];
export function FoodIcon({ f, size = 26 }: { f: FoodView; size?: number }) {
  const C = f.source === 'recipe' ? L.CookingPot : (GROUP_ICON.find(([r]) => r.test(f.group ?? f.name_en ?? ''))?.[1] ?? L.Salad);
  return <C width={size} height={size} strokeWidth={1.6} />;
}
const RAW = new Set(['raw', 'dry']);
type Filter = 'all' | 'raw' | 'cooked' | 'protein' | 'lowcarb';
type Source = 'recent' | 'fav' | 'mine';
type Sort = 'rel' | 'protein' | 'kcal';
const FILTERS: [Filter, React.ReactNode][] = [['all', 'Tümü'], ['raw', 'Çiğ Besinler'], ['cooked', 'Pişmiş / Hazır'], ['protein', 'Yüksek Protein (>20g)'], ['lowcarb', 'Düşük Karb (<5g)']];
const v100 = (f: FoodView, c: string) => f.per100[c]?.value ?? null;
function missingCore(f: FoodView, codes: string[]) { return codes.find(c => f.per100[c] == null || f.per100[c].type === 'missing'); }

export function Foods() {
  const { sv, version, param, changed } = useApp();
  const [detail, setDetail] = useState<FoodView | null>(null);
  const [create, setCreate] = useState<FoodView | 'new' | null>(param?.create ? 'new' : null);
  const [scan, setScan] = useState(false);
  const [qs, setQ] = useState<string>(param?.q ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [src, setSrc] = useState<Source>('recent');
  const [sort, setSort] = useState<Sort>('rel');
  const [sel, setSel] = useState<FoodView | null>(null);
  const [log, setLog] = useState<{ f: FoodView; a?: number } | null>(null);
  const [amt, setAmt] = useState<Record<string, string>>({});
  void version;
  const core = sv.ref.coreCodes();
  const base: FoodView[] = useMemo(() => {
    if (qs.trim().length >= 2) return sv.search(qs.trim(), 60);
    if (src === 'mine') return repo.listCustomFoods(sv.db);
    const rows = src === 'fav' ? repo.favourites(sv.db) : repo.recentFoods(sv.db, 40);
    return rows.map(r => r.food_id ? sv.food(r.food_id) : undefined).filter(Boolean) as FoodView[];
  }, [qs, src, sv, version]); // eslint-disable-line
  const shown = useMemo(() => {
    let l = base.filter(f => filter === 'all' ? true : filter === 'raw' ? RAW.has(f.prep) : filter === 'cooked' ? !RAW.has(f.prep)
      : filter === 'protein' ? (v100(f, 'protein_g') ?? 0) > 20 : (v100(f, 'carb_g') ?? 99) < 5);
    if (sort === 'protein') l = [...l].sort((a, b) => (v100(b, 'protein_g') ?? -1) - (v100(a, 'protein_g') ?? -1));
    if (sort === 'kcal') l = [...l].sort((a, b) => (v100(a, 'energy_kcal') ?? 1e9) - (v100(b, 'energy_kcal') ?? 1e9));
    return l;
  }, [base, filter, sort]);
  const cur = sel && shown.some(f => f.id === sel.id) ? sel : shown[0] ?? null;
  const isPhone = () => window.matchMedia('(max-width: 820px)').matches;
  const srcNames = (sv.ref.meta.sources ?? []).map((x: any) => x.name as string);

  const Card = ({ f }: { f: FoodView }) => {
    const k = f.per100.energy_kcal; const miss = missingCore(f, core); const key = f.kind + f.id;
    const portion = f.portions.find(p => ['piece', 'serving', 'slice'].includes(p.unit));
    return <div className={'fcard' + (cur?.id === f.id ? ' sel' : '')} role="button" tabIndex={0} onClick={() => isPhone() ? setDetail(f) : setSel(f)} onKeyDown={e => e.key === 'Enter' && (isPhone() ? setDetail(f) : setSel(f))}>
      <div className="fico"><FoodIcon f={f} /><span className="q">100g</span></div>
      <div style={{ minWidth: 0 }}>
        <div className="fname"><span style={{ minWidth: 0 }}>{f.name}</span><span className="chip neutral">{cap(PREP_TR[f.prep] ?? f.prep)}</span></div>
        <div className="fsub">{k?.value == null ? <Badge t="missing" label="Eksik kcal" /> : miss ? <Badge t="missing" label={'Eksik ' + (sv.ref.nutrient(miss)?.name_tr ?? miss).split(' ')[0]} /> : <Badge t={k.type} />}<span>• {f.sourceLabel}<span className="d-only">{portion ? ` • ${portion.label} = ${fmt(portion.gram_weight)} g` : ''}</span></span></div>
      </div>
      <div className="fkc"><b className={k?.value == null ? '' : 'lime'}>{fmt(k?.value)}</b><span>kcal / 100g</span></div>
      <div className="fmac">
        <span><i style={{ background: 'var(--protein)' }} />P:<b className="c-p">{fmtN('protein_g', v100(f, 'protein_g'))}g</b></span>
        <span><i style={{ background: 'var(--carb)' }} />K:<b className="c-k">{fmtN('carb_g', v100(f, 'carb_g'))}g</b></span>
        <span><i style={{ background: 'var(--fat)' }} />Y:<b className="c-y">{fmtN('fat_g', v100(f, 'fat_g'))}g</b></span>
        {v100(f, 'fiber_g') != null && <span className="d-only"><I.leaf width={13} style={{ verticalAlign: -2, marginRight: 4 }} />Lif: {fmtN('fiber_g', v100(f, 'fiber_g'))}g</span>}
        <span className="grow" />
      </div>
      <div className="fadd" onClick={e => e.stopPropagation()}>
        <input className="input num d-only" inputMode="decimal" value={amt[key] ?? '100'} onChange={e => setAmt(a => ({ ...a, [key]: e.target.value }))} aria-label="Gram" /><span className="u d-only">g</span>
        <button className="btn sm d-only" onClick={() => setLog({ f, a: amt[key] ? parseNum(amt[key]) || undefined : undefined })}><I.plus width={15} /> Ekle</button>
        <button className="icon-btn boxed m-only" aria-label="Ekle" onClick={() => setLog({ f })}><I.plus width={20} /></button>
      </div>
    </div>;
  };

  return (
    <div>
      <div className="fhead d-only">
        <span className="k">KATALOG {String(sv.ref.meta.version ?? '').replace(/^reference-/, '').slice(0, 10)}</span><span className="muted">/</span><h1>Besin Veritabanı</h1>
        <span className="chip lime">{sv.ref.size.toLocaleString('tr-TR')} referans besin</span>
        {srcNames.slice(0, 2).map((n: string) => <span className="src" key={n}><i className="dot" />{n}</span>)}
        <span className="src"><i className="dot" style={{ background: 'var(--protein)' }} />Kendi besinlerin: {repo.listCustomFoods(sv.db).length}</span>
      </div>
      <div className="fbar">
        <div className="search"><I.search /><input className="input" placeholder="Besin, marka veya yemek ara..." value={qs} onChange={e => setQ(e.target.value)} data-search autoFocus={!!param?.q} />{qs && <span className="kbd d-only" style={{ top: 15, right: 12 }} onClick={() => setQ('')}>ESC</span>}</div>
        <button className="btn d-only" onClick={() => setScan(true)}><I.barcode width={20} style={{ color: 'var(--accent)' }} /> Barkod Tara</button>
        <button className="icon-btn boxed m-only" aria-label="Barkod tara" onClick={() => setScan(true)}><I.barcode width={24} /></button>
        <select className="input d-only" style={{ width: 170, height: 46 }} value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sırala">
          <option value="rel">Sırala: Alaka</option><option value="protein">Sırala: Protein ↓</option><option value="kcal">Sırala: kcal ↑</option></select>
        <button className="btn d-only" onClick={() => setCreate('new')}><I.plus width={18} /> Yeni besin</button>
      </div>
      <div className="row between" style={{ marginTop: 16, flexWrap: 'nowrap' }}>
        <div className="pills" style={{ flex: 1 }}>{FILTERS.map(([v, l]) => <button key={v} className={'pill' + (filter === v ? ' on' : '')} onClick={() => setFilter(v)}>{l}</button>)}</div>
        <span className="small muted d-only" style={{ whiteSpace: 'nowrap', marginLeft: 14 }}>Görüntülenen: <b style={{ color: 'var(--ink)' }}>{shown.length}/{base.length}</b></span>
      </div>
      <div className="m-only"><div className="row between small nowrap" style={{ marginTop: 16 }}>
        <span className="row" style={{ gap: 8 }}><i className="dot" />{sv.ref.size.toLocaleString('tr-TR')} referans besin</span>
        <select className="input" style={{ width: 'auto', height: 34, padding: '4px 8px', background: 'transparent', border: 0, fontWeight: 600 }} value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sırala">
          <option value="rel">Alakaya Göre</option><option value="protein">Proteine Göre</option><option value="kcal">Kaloriye Göre</option></select>
      </div></div>
      <div className="fgrid">
        <div>
          <div className="flist-h d-only"><span>{qs.trim().length >= 2 ? 'Arama sonuçları' : 'Besin listesi'} &amp; makro dağılımı (100 g)</span><span>Gram girip hızlı ekle</span></div>
          {qs.trim().length < 2 && <div className="seg" style={{ marginBottom: 12 }}>{([['recent', 'Son kayıtlar'], ['fav', 'Favoriler'], ['mine', 'Besinlerim']] as [Source, string][]).map(([v, l]) => <button key={v} className={src === v ? 'on' : ''} onClick={() => setSrc(v)}>{l}</button>)}</div>}
          {shown.map(f => <Card key={f.kind + f.id} f={f} />)}
          {!shown.length && <div className="card meal-empty" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 28 }}>
            <span className="icon-btn boxed" style={{ width: 46, height: 46, borderRadius: 99 }}><I.search width={20} /></span>
            <h3 style={{ marginTop: 8 }}>{qs.trim().length >= 2 ? 'Sonuç Bulunamadı' : src === 'recent' ? 'Henüz Giriş Yapılmadı' : src === 'fav' ? 'Henüz Favori Yok' : 'Henüz Kendi Besinin Yok'}</h3>
            <div className="small muted">{qs.trim().length >= 2 ? 'Farklı yazımı dene veya kendi besinini ekle.' : 'En az 2 harf yazarak referans veritabanında ara.'}</div></div>}
        </div>
        {cur && <aside className="fpanel d-only"><FoodPanel f={cur} onLog={() => setLog({ f: cur })} onOpen={() => setDetail(cur)} onFav={() => { const fav = repo.isFavourite(sv.db, cur.id, null); repo.toggleFavourite(sv.db, cur.id, null); changed(fav ? 'Favorilerden çıkarıldı' : 'Favorilere eklendi'); }} /></aside>}
      </div>
      <div className="nf-card">
        <span className="ic"><I.barcode width={26} /></span>
        <div className="grow"><h3>Aradığın besini bulamadın mı?</h3><div className="small" style={{ color: 'var(--ink-2)' }}>Paketli ürünün barkodunu tara (Open Food Facts) veya etiketteki değerleri elle gir. Boş bıraktığın değer “eksik” sayılır, sıfır değil.</div></div>
        <button className="btn d-only" onClick={() => setCreate('new')}><I.edit width={17} /> Etiketten Ekle</button>
        <button className="btn primary glow d-only" onClick={() => setScan(true)}><I.camera width={17} /> Barkod Tara</button>
        <button className="btn sm m-only" onClick={() => setCreate('new')}>Ekle</button>
      </div>
      {detail && <FoodDetail food={detail} onClose={() => setDetail(null)} onEdit={f => { setDetail(null); setCreate(f); }} />}
      {create && <CustomFoodForm initial={create === 'new' ? null : create} onClose={() => setCreate(null)} />}
      {scan && <BarcodeAdd onClose={() => setScan(false)} onFood={f => { setScan(false); setDetail(f); }} />}
      {log && <LogSheet food={log.f} amount={log.a} unit="g" onClose={() => setLog(null)} />}
    </div>
  );
}
const cap = (x: string) => x.charAt(0).toLocaleUpperCase('tr') + x.slice(1);

/** Right-hand "Seçili Besin Profili" panel (desktop). All numbers are per 100 g from the food's own data. */
function FoodPanel({ f, onLog, onOpen, onFav }: { f: FoodView; onLog: () => void; onOpen: () => void; onFav: () => void }) {
  const { sv } = useApp();
  const kc = v100(f, 'energy_kcal');
  const macroE = (v100(f, 'protein_g') ?? 0) * 4 + (v100(f, 'fat_g') ?? 0) * 9 + (v100(f, 'carb_g') ?? 0) * 4;
  const share = (c: string, k: number) => { const g = v100(f, c); return g != null && macroE > 0 ? Math.round((g * k / macroE) * 100) : null; };
  const sibs = f.kind === 'ref' ? sv.ref.siblings(f.id) : [];
  const fav = repo.isFavourite(sv.db, f.id, null);
  const micro: [string, string, string][] = [['vitd_ug', 'D', 'D Vitamini'], ['vitb12_ug', 'B12', 'B12'], ['iron_mg', 'Fe', 'Demir'], ['potassium_mg', 'K', 'Potasyum']];
  return <>
    <div className="fphero">
      <span className="chip lime" style={{ alignSelf: 'flex-start' }}><I.flask width={13} /> {f.sourceLabel}{f.sourceId ? ' · #' + f.sourceId : ''}</span>
      <div className="eyebrow lime" style={{ marginTop: 'auto', paddingTop: 22, fontSize: 10.5 }}>Seçili Besin Profili</div>
      <div className="row between nowrap" style={{ alignItems: 'flex-end' }}><h2>{f.name}</h2>
        <div style={{ textAlign: 'right', flex: 'none' }}><div className="tiny" style={{ color: 'var(--ink-2)' }}>Enerji</div><b style={{ fontSize: 26, color: 'var(--accent)' }}>{fmt(kc)}</b><span className="small muted">/100g</span></div></div>
    </div>
    {sibs.length > 0 && <div className="tile" style={{ marginTop: 14 }}>
      <div className="row nowrap" style={{ gap: 10 }}><I.swap width={18} style={{ color: 'var(--accent)' }} /><b className="small">Aynı besinin diğer halleri</b><span className="chip neutral" style={{ marginLeft: 'auto' }}>{sibs.length}</span></div>
      <div className="tiny" style={{ color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.6 }}>{sibs.slice(0, 3).map(s => `${cap(PREP_TR[s.prep] ?? s.prep)}: ${fmt(s.per100.energy_kcal?.value)} kcal`).join(' · ')}. Çiğ↔pişmiş çevrim için kendi tartımını Mutfak’ta kullan.</div></div>}
    <div className="ftiles">{([['protein_g', 'Protein', 4, 'c-p'], ['fat_g', 'Yağ', 9, 'c-y'], ['carb_g', 'Karb', 4, 'c-k']] as [string, string, number, string][]).map(([c, n, k, cl]) => (
      <div className="tile" key={c}><span>{n} oranı</span><b className={cl}>{share(c, k) == null ? '—' : '%' + share(c, k)}</b><span>{fmtN(c, v100(f, c))}g / 100g</span></div>))}</div>
    <div className="tiny muted" style={{ marginTop: 6 }}>Oran = makrolardan gelen enerjinin payı (4/9/4 kcal/g varsayımı, tahmini).</div>
    <div className="eyebrow" style={{ fontSize: 10.5, margin: '16px 0 10px' }}>Temel mikrobesin yoğunluğu (100 g)</div>
    <div className="grid g2" style={{ gap: 8 }}>{micro.map(([c, ab, n]) => { const d = sv.ref.nutrient(c); const p = f.per100[c]; return (
      <div className="tile row nowrap" key={c} style={{ padding: '10px 10px', gap: 8 }}><span className="chip neutral" style={{ padding: '2px 5px' }}>{ab}</span><div style={{ minWidth: 0, flex: 1 }}><div className="tiny" style={{ color: 'var(--ink-2)' }}>{n}</div>
        <b className="small num">{p?.value == null ? <span className="chip vt-missing">eksik</span> : `${fmtN(c, p.value)} ${d?.unit ?? ''}`}</b></div></div>); })}</div>
    <div className="row nowrap" style={{ marginTop: 16 }}>
      <button className="btn primary glow" style={{ flex: 1, height: 46, justifyContent: 'center' }} onClick={onLog}><I.plus width={17} /> Günlüğe Aktar</button>
      <button className="icon-btn boxed" style={{ width: 46, height: 46 }} onClick={onFav} title={fav ? 'Favorilerden çıkar' : 'Favorile'}><I.bookmark width={18} fill={fav ? 'currentColor' : 'none'} /></button>
    </div>
    <button className="link" style={{ marginTop: 12 }} onClick={onOpen}>Tüm besin değerleri ve ev ölçüleri <I.right width={14} /></button>
  </>;
}

export function FoodDetail({ food: f0, onClose, onEdit }: { food: FoodView; onClose: () => void; onEdit?: (f: FoodView) => void }) {
  const { sv, version, changed } = useApp();
  const [food, setFood] = useState(f0);
  const [portion, setPortion] = useState<number>(-1);
  const [log, setLog] = useState(false);
  const [calib, setCalib] = useState<string | null>(null);
  void version;
  const sibs = food.kind === 'ref' ? sv.ref.siblings(food.id) : [];
  const p = portion >= 0 ? food.portions[portion] : null;
  const amt = p ? nutrientsFor(food.per100, p.gram_weight / (p.amount || 1), p.value_type ?? 'sourced') : null;
  const ms = repo.measures(sv.db);
  if (log) return <LogSheet food={food} onClose={onClose} />;
  return (
    <Modal title={food.name} onClose={onClose} wide>
      <div className="col">
        <div className="row small"><span className="chip neutral">{PREP_TR[food.prep]}</span><span className="chip vt-sourced">{food.sourceLabel}</span>
          {food.sourceId && <span className="muted">{food.kind === 'ref' ? 'FDC #' : 'Barkod '}{food.sourceId}</span>}{food.group && <span className="muted">· {food.group}</span>}</div>
        {food.kind === 'ref' && food.name !== food.name_en && <div className="small muted">{food.name_en}</div>}
        {food.aliases.length > 1 && <div className="tiny muted">Diğer adlar: {food.aliases.slice(1).join(', ')}</div>}
        {food.note && <div className="tiny muted">{food.note}</div>}
        <div className="row"><span className="small muted">Göster:</span>
          <select className="input" style={{ maxWidth: 320 }} value={portion} onChange={e => setPortion(+e.target.value)}>
            <option value={-1}>yalnızca 100 g</option>{food.portions.map((p, i) => <option key={i} value={i}>{p.label} = {fmt(p.gram_weight, 1)} g</option>)}
          </select></div>
        <NutrientTable per100={food.per100} amount={amt} grams={p ? p.gram_weight / (p.amount || 1) : null} codes={sv.ref.codes()} />
        {sibs.length > 0 && <div><h3 style={{ margin: '8px 0' }}>Aynı besinin diğer halleri</h3>
          <table className="t"><thead><tr><th>Hal</th><th>Ad</th><th className="r">kcal/100 g</th><th className="r">Protein</th><th className="r">Su</th></tr></thead><tbody>
            {[food, ...sibs].map(s => <tr key={s.id} style={{ cursor: 'pointer', background: s.id === food.id ? 'var(--sage-ll)' : undefined }} onClick={() => { setFood(s); setPortion(-1); }}>
              <td>{PREP_TR[s.prep]}</td><td className="small">{s.name}</td><td className="r num">{fmt(s.per100.energy_kcal?.value)}</td><td className="r num">{fmt(s.per100.protein_g?.value, 1)}</td><td className="r num">{fmt(s.per100.water_g?.value, 1)}</td></tr>)}
          </tbody></table></div>}
        <div><h3 style={{ margin: '8px 0' }}>Ev ölçüleri</h3>
          <table className="t"><tbody>{ms.map(m => {
            let txt: React.ReactNode; try { const r = sv.resolveAmount(food, 1, 'm:' + m.id); txt = <><span className="num">{fmt(r.value, 1)} g</span> <Badge t={r.value_type} /></>; } catch { txt = <span className="muted small">güvenilir ağırlık yok</span>; }
            return <tr key={m.id}><td>1 {m.name_tr} <span className="tiny muted">({m.ml} ml)</span></td><td>{txt}</td><td className="r"><button className="btn sm ghost" onClick={() => setCalib(calib === 'm:' + m.id ? null : 'm:' + m.id)}><I.scale width={14} /> Tart</button></td></tr>;
          })}</tbody></table>
          {calib && <CalibrateInline food={food} unit={calib} onDone={() => setCalib(null)} />}
          {food.portions.length > 0 && <div className="tiny muted" style={{ marginTop: 6 }}>Kaynak porsiyonları: {food.portions.map(p => `${p.label} (${unitLabel(p.unit)}) = ${fmt(p.gram_weight, 1)} g`).join(' · ')}</div>}
        </div>
        <div className="row between">
          <div className="row">
            {food.kind === 'custom' && onEdit && <button className="btn" onClick={() => onEdit(food)}><I.edit width={16} /> Düzenle</button>}
            {food.kind === 'custom' && <button className="btn danger" onClick={() => { repo.archiveCustomFood(sv.db, food.id); changed('Besin arşivlendi'); onClose(); }}>Arşivle</button>}
          </div>
          <button className="btn primary" onClick={() => setLog(true)}>Kaydet / yedim</button>
        </div>
      </div>
    </Modal>
  );
}

const PREPS: PrepState[] = ['prepared', 'raw', 'dry', 'boiled', 'steamed', 'baked', 'roasted', 'grilled', 'fried', 'pan_fried', 'stewed', 'canned', 'cooked_unspecified'];
export function CustomFoodForm({ initial, prefill, onClose, onSaved }: { initial: FoodView | null; prefill?: repo.CustomFoodInput; onClose: () => void; onSaved?: (f: FoodView) => void }) {
  const { sv, changed } = useApp();
  const codes = sv.ref.codes();
  const [name, setName] = useState(initial?.name ?? prefill?.name_tr ?? '');
  const [prep, setPrep] = useState<PrepState>((initial?.prep ?? prefill?.prep_state ?? 'prepared') as PrepState);
  const [origin, setOrigin] = useState<repo.CustomFoodInput['origin']>((initial?.source as any) ?? prefill?.origin ?? 'label');
  const [basis, setBasis] = useState<'100' | 'serving'>('100');
  const [servingG, setServingG] = useState<number | ''>('');
  const [vals, setVals] = useState<Record<string, number | ''>>(() => Object.fromEntries(codes.map(c => {
    const v = initial?.per100[c]?.value ?? prefill?.nutrients[c]?.value; return [c, v == null ? '' : Math.round(v * 1000) / 1000];
  })));
  const [portions, setPortions] = useState<{ label_tr: string; gram_weight: number | '' }[]>(initial?.portions.map(p => ({ label_tr: p.label ?? 'porsiyon', gram_weight: p.gram_weight })) ?? prefill?.portions?.map(p => ({ label_tr: p.label_tr, gram_weight: p.gram_weight })) ?? []);
  const [density, setDensity] = useState<number | ''>(initial?.densityGPerMl ?? '');
  const [note, setNote] = useState(initial?.note ?? prefill?.source_note ?? '');
  const [showMicro, setShowMicro] = useState(false);
  const vt: ValueType = origin === 'user' ? 'estimated' : 'sourced';
  function save() {
    const nutrients: repo.CustomFoodInput['nutrients'] = {};
    for (const c of codes) {
      const v = vals[c];
      if (v === '') { nutrients[c] = { value: null, type: 'missing' }; continue; }
      const per100 = basis === 'serving' ? per100FromServing(v, servingG as number) : v;
      nutrients[c] = { value: per100, type: vt, ref: basis === 'serving' ? `${v} / ${servingG} g porsiyon` : undefined };
    }
    const ps = portions.filter(p => p.label_tr && p.gram_weight !== '' && p.gram_weight > 0).map(p => ({ label_tr: p.label_tr, unit: 'serving', amount: 1, gram_weight: p.gram_weight as number, value_type: (origin === 'user' ? 'measured' : 'sourced') as ValueType }));
    if (basis === 'serving' && servingG && !ps.length) ps.push({ label_tr: 'porsiyon', unit: 'serving', amount: 1, gram_weight: servingG as number, value_type: 'sourced' });
    const id = repo.saveCustomFood(sv.db, { id: initial?.id, name_tr: name.trim(), prep_state: prep, origin, source: origin, barcode: initial?.barcode ?? prefill?.barcode ?? null, source_note: note || null, nutrients, portions: ps,
      density: density !== '' && density > 0 ? { g_per_ml: density, value_type: 'estimated', source: origin } : null });
    changed('Besin kaydedildi'); onSaved?.(repo.customFoodView(sv.db, id)!); onClose();
  }
  const valid = name.trim().length > 1 && vals.energy_kcal !== '' && (basis === '100' || (servingG !== '' && servingG > 0));
  return (
    <Modal title={initial ? 'Besini düzenle' : 'Yeni besin'} onClose={onClose} wide>
      <div className="col">
        <div className="grid g3">
          <label className="f" style={{ gridColumn: 'span 2' }}>Ad<input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="ör. Ayran (marka), Ev yapımı tarhana" autoFocus /></label>
          <label className="f">Hazırlık durumu<select className="input" value={prep} onChange={e => setPrep(e.target.value as PrepState)}>{PREPS.map(p => <option key={p} value={p}>{PREP_TR[p]}</option>)}</select></label>
        </div>
        <label className="f">Kaynak<select className="input" value={origin} onChange={e => setOrigin(e.target.value as any)}>
          <option value="label">Ambalaj etiketi</option><option value="turkomp_personal">TürKomp — kendim baktım, kişisel kullanım</option><option value="user">Kendi tahminim</option>{origin === 'off' && <option value="off">Open Food Facts</option>}{origin === 'recipe' && <option value="recipe">Tarif / pişirme</option>}
        </select></label>
        <div className="row"><Seg value={basis} options={[['100', '100 g için'], ['serving', 'Porsiyon için']]} onChange={setBasis} />
          {basis === 'serving' && <><span className="small">Porsiyon =</span><div style={{ width: 100 }}><NumberInput value={servingG} onChange={setServingG} /></div><span className="small">g</span></>}</div>
        <div className="tiny muted">Boş bırakılan değer <b>eksik</b> olarak kaydedilir, sıfır sayılmaz. Değer türü: <Badge t={vt} /></div>
        <div className="grid g4">{codes.filter(c => showMicro || sv.ref.nutrient(c)!.core).map(c => { const d = sv.ref.nutrient(c)!; return (
          <label className="f" key={c}>{d.name_tr} ({d.unit})<NumberInput value={vals[c]} onChange={v => setVals(s => ({ ...s, [c]: v }))} /></label>); })}</div>
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowMicro(!showMicro)}>{showMicro ? 'Mikro besinleri gizle' : 'Mikro besinleri de gir'}</button>
        <h3>Porsiyonlar</h3>
        {portions.map((p, i) => <div className="row" key={i}><input className="input" style={{ maxWidth: 240 }} value={p.label_tr} onChange={e => setPortions(ps => ps.map((x, j) => j === i ? { ...x, label_tr: e.target.value } : x))} placeholder="ör. 1 adet, 1 dilim" />
          <div style={{ width: 110 }}><NumberInput value={p.gram_weight} onChange={v => setPortions(ps => ps.map((x, j) => j === i ? { ...x, gram_weight: v } : x))} placeholder="gram" /></div>
          <button className="icon-btn" onClick={() => setPortions(ps => ps.filter((_, j) => j !== i))}><I.trash width={16} /></button></div>)}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPortions(ps => [...ps, { label_tr: '1 adet', gram_weight: '' }])}>+ Porsiyon ekle</button>
        <label className="f" style={{ maxWidth: 300 }}>Yoğunluk g/ml (sıvılar için, isteğe bağlı)<NumberInput value={density} onChange={setDensity} /></label>
        <label className="f">Not / kaynak açıklaması<input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="ör. etiket, 2026 Kasım" /></label>
        <div className="row between"><span className="tiny muted">Kişisel verileriniz yalnızca bu cihazda saklanır.</span><button className="btn primary" disabled={!valid} onClick={save}>Kaydet</button></div>
      </div>
    </Modal>
  );
}

export function BarcodeAdd({ onClose, onFood }: { onClose: () => void; onFood: (f: FoodView) => void }) {
  const { sv, changed } = useApp();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<string>('');
  const [prefill, setPrefill] = useState<repo.CustomFoodInput | null>(null);
  const [quality, setQuality] = useState<string>('');
  const [live, setLive] = useState(false);
  const video = useRef<HTMLVideoElement>(null); const canvas = useRef<HTMLCanvasElement>(null);

  async function lookup(c: string) {
    c = c.replace(/\D/g, ''); if (c.length < 8) { setStatus('Geçerli bir barkod girin (8-14 hane).'); return; }
    setCode(c);
    const local = repo.customByBarcode(sv.db, c); if (local) { onFood(local); return; }
    let json = repo.offCacheGet(sv.db, c);
    if (!json) {
      if (!navigator.onLine) { setStatus('Çevrimdışısınız. Yeni ürün aramak için internet gerekir; etiketten elle ekleyebilirsiniz.'); return; }
      setStatus('Open Food Facts’te aranıyor…');
      try { json = await fetchOff(c); if (json?.product) { repo.offCacheSet(sv.db, c, json); changed(); } } catch (e) { setStatus((e as Error).message); return; }
    }
    const r = offToFood(c, json);
    if (!r.ok) { setStatus(r.reason!); setPrefill({ name_tr: '', origin: 'label', barcode: c, nutrients: {} }); return; }
    setQuality(r.quality!); setPrefill(r.food!); setStatus('');
  }
  useEffect(() => {
    if (!live) return; let stream: MediaStream | null = null; let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        while (!stop) {
          const r = video.current && canvas.current ? await decodeVideoFrame(video.current, canvas.current).catch(() => null) : null;
          if (r) { stop = true; setLive(false); lookup(r); break; }
          await new Promise(res => setTimeout(res, 250));
        }
      } catch { setStatus('Kamera açılamadı. Fotoğraf seçin veya barkodu elle yazın.'); setLive(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach(t => t.stop()); };
    // eslint-disable-next-line
  }, [live]);

  if (prefill) return (
    <CustomFoodForm initial={null} prefill={prefill} onClose={onClose} onSaved={f => onFood(f)} />
  );
  return (
    <Modal title="Barkod" onClose={onClose}>
      <div className="col">
        <div className="small muted">Yeni ürünler için internet gerekir; bulunan ürün cihazınıza kaydedilir. Veri: Open Food Facts (ODbL), kalite değişkendir — etiketle karşılaştırın.</div>
        {live && <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 14, background: '#000' }} />}
        <canvas ref={canvas} style={{ display: 'none' }} />
        <div className="row">
          {navigator.mediaDevices && <button className="btn soft" onClick={() => setLive(!live)}><I.camera width={17} /> {live ? 'Kamerayı kapat' : 'Kamerayla tara'}</button>}
          <label className="btn"><I.camera width={17} /> Fotoğraftan oku<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return; setStatus('Okunuyor…');
            try { const c = await decodeImageFile(f); if (c) lookup(c); else setStatus('Barkod okunamadı. Daha yakından, net çekin veya elle yazın.'); } catch { setStatus('Barkod okunamadı.'); }
          }} /></label>
        </div>
        {!hasNativeDetector() && live && <div className="tiny muted">Bu tarayıcıda yerleşik barkod okuyucu yok; zxing-wasm kullanılıyor.</div>}
        <div className="row"><input className="input" style={{ maxWidth: 260 }} inputMode="numeric" placeholder="Barkod numarası" value={code} onChange={e => setCode(e.target.value)} /><button className="btn primary" onClick={() => lookup(code)}>Ara</button></div>
        {status && <div className="info small">{status}</div>}
        {quality && <span className={'chip ' + (quality === 'high' ? 'vt-measured' : quality === 'medium' ? 'vt-estimated' : 'vt-missing')}>Veri kalitesi: {quality}</span>}
      </div>
    </Modal>
  );
}
