import React, { useRef, useState } from 'react';
import { useApp } from '../store';
import * as repo from '../data/repo';
import type { FoodView } from '../data/reference';
import { MEALS, MEAL_TR, addDays, todayIso, localDateTime, type Meal } from '../data/services';
import { nutrientsFor } from '../engine';
import { Badge, fmt, fmtN, Modal, NumberInput, Ring, Soon } from '../ui/kit';
import { I } from '../ui/icons';
import * as L from 'lucide-react';
import { LogSheet } from '../ui/LogSheet';
import { fileToThumb } from '../ui/photo';
import { AI_KEY } from './Assistant';

const ORDER: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']; // chronological display order
const Hand = () => <L.Hand className="hand" strokeWidth={1.6} aria-label="el sallama" />;
const MEAL_LONG: Record<Meal, string> = { breakfast: 'Kahvaltı', lunch: 'Öğle Yemeği', dinner: 'Akşam Yemeği', snack: 'Ara Öğün' };
const MEAL_HOUR: Record<Meal, number> = { breakfast: 11, lunch: 16, dinner: 21, snack: 24 };

export function SatietyForm({ entryId, meal, datetime, onClose }: { entryId?: number; meal: Meal; datetime: string; onClose: () => void }) {
  const { sv, changed } = useApp();
  const [h, setH] = useState(5); const [f, setF] = useState(7); const [m, setM] = useState<number | ''>(''); const [note, setNote] = useState('');
  return (
    <Modal title={`Tokluk — ${MEAL_TR[meal]}`} onClose={onClose}>
      <div className="col">
        <label className="f">Öncesi açlık: {h}/10<input type="range" min={1} max={10} value={h} onChange={e => setH(+e.target.value)} /></label>
        <label className="f">Sonrası tokluk: {f}/10<input type="range" min={1} max={10} value={f} onChange={e => setF(+e.target.value)} /></label>
        <label className="f">Kaç dakika sonra acıktınız? (sonradan da girebilirsiniz)<NumberInput value={m} onChange={setM} placeholder="dakika" /></label>
        <label className="f">Not<input className="input" value={note} onChange={e => setNote(e.target.value)} /></label>
        <button className="btn primary" onClick={() => { repo.addSatiety(sv.db, { log_entry_id: entryId ?? null, meal_datetime: datetime, meal, hunger_before: h, fullness_after: f, minutes_until_hungry: m === '' ? null : m, note }); changed('Tokluk notu kaydedildi'); onClose(); }}>Kaydet</button>
      </div>
    </Modal>
  );
}

type Sum = ReturnType<import('../data/services').Services['daySummary']>;

/** Deterministic "Zekâ Önerisi": arithmetic on the day's totals vs. target only — no invented claims. */
function suggestion(s: Sum, isToday: boolean): { html: React.ReactNode; tag: string } {
  const t = s.target; const k = (c: string) => s.total[c].value ?? s.total[c].known;
  if (!t) return { html: <>Hedef belirlenmedi. <b>Ayarlar / Profil</b> bölümünden profilini tamamlayınca kalan bütçe burada hesaplanır.</>, tag: 'Motor' };
  const remK = t.kcal - k('energy_kcal'); const remP = t.protein_g - k('protein_g');
  const approx = s.incomplete.length ? ' (eksik veri nedeniyle yaklaşık)' : '';
  if (!s.entries.length) return { html: <>Bugün henüz kayıt yok. Günlük hedefin <b>{fmt(t.kcal)} kcal</b> ve <b>{fmt(t.protein_g)}g protein</b>.</>, tag: 'Motor' };
  if (remK < -50) return { html: <>Günlük enerji hedefini <b>{fmt(-remK)} kcal</b> aştın{approx}. Kalan proteinin: <b>{fmt(Math.max(0, remP))}g</b>.</>, tag: 'Motor' };
  if (remP > 5) {
    const h = new Date().getHours();
    const next = MEALS.find(m => !s.entries.some(e => e.entry.meal === m) && (!isToday || MEAL_HOUR[m] > h));
    return { html: <>{next ? `${MEAL_LONG[next]} öğününde ` : 'Kalan öğünlerde '}<b>{fmt(remP)}g protein</b> alarak günlük protein hedefini tamamlayabilirsin. Kalan bütçe: <b>{fmt(Math.max(0, remK))} kcal</b>{approx}.</>, tag: 'Motor' };
  }
  return { html: <>Protein hedefine ulaştın. Kalan enerji bütçen <b>{fmt(Math.max(0, remK))} kcal</b>{approx}.</>, tag: 'Motor' };
}

/** Highest-protein food from the user's own favourites/recent logs that fits the remaining budget at 100 g. */
function pickFromHistory(sv: import('../data/services').Services, remK: number | null): { f: FoodView; p: number; k: number } | null {
  const ids = new Set<number>(); const out: FoodView[] = [];
  for (const r of [...repo.favourites(sv.db), ...repo.recentFoods(sv.db, 30)]) { if (r.food_id && !ids.has(r.food_id)) { ids.add(r.food_id); const f = sv.food(r.food_id); if (f) out.push(f); } }
  const c = out.map(f => { const n = nutrientsFor(f.per100, 100); return { f, p: n.protein_g?.value ?? 0, k: n.energy_kcal?.value ?? 0 }; })
    .filter(x => x.k > 0 && x.p > 0 && (remK == null || x.k <= Math.max(0, remK))).sort((a, b) => b.p / b.k - a.p / a.k);
  return c[0] ?? null;
}

export function Today() {
  const { sv, version, changed, go } = useApp();
  const [date, setDate] = useState(todayIso());
  const [sat, setSat] = useState<{ meal: Meal; dt: string; id?: number } | null>(null);
  const [open, setOpen] = useState<Meal | null>(null);
  const [micros, setMicros] = useState(false);
  const [quick, setQuick] = useState<FoodView | null>(null);
  const photoRef = useRef<HTMLInputElement>(null); const photoMeal = useRef<Meal>('breakfast');
  void version;
  const s = sv.daySummary(date);
  const t = s.target;
  const kcal = s.total.energy_kcal; const eaten = kcal.value ?? kcal.known;
  const rem = t ? t.kcal - eaten : null;
  const waterTarget = Number(repo.getSetting(sv.db, 'water_target_ml') ?? 0);
  const isToday = date === todayIso();
  const name = sv.userName();
  const streak = sv.streak();
  const photos = repo.mealPhotosOn(sv.db, date);
  const dlabel = new Date(date + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const sug = suggestion(s, isToday);
  const pick = pickFromHistory(sv, rem);
  const logged = MEALS.filter(m => s.entries.some(e => e.entry.meal === m)).length;
  const lastCook = repo.lastCookSession(sv.db);
  const lastCookFood = lastCook ? sv.food(lastCook.raw_food_id) : null;
  const hasAI = !!localStorage.getItem(AI_KEY);

  const mac = [
    { k: 'protein_g', n: 'Protein', short: 'P', cls: 'p', color: 'var(--protein)', tg: t?.protein_g },
    { k: 'carb_g', n: 'Karb', short: 'K', cls: 'k', color: 'var(--carb)', tg: t?.carb_g },
    { k: 'fat_g', n: 'Yağ', short: 'Y', cls: 'y', color: 'var(--fat)', tg: t?.fat_g },
  ].map(m => ({ ...m, v: s.total[m.k].known, inc: s.total[m.k].incomplete && s.entries.length > 0, pct: m.tg ? Math.round((s.total[m.k].known / m.tg) * 100) : null }));
  // with a target: 7 equal segments of target/7 ml (as in the design); without: 8 × 250 ml glasses
  const cups = waterTarget > 0 ? 7 : 8; const cupMl = waterTarget > 0 ? waterTarget / 7 : 250;
  const cupsOn = s.water / cupMl;
  const addWater = (ml: number) => { repo.addWater(sv.db, ml, localDateTime(new Date(date + 'T' + new Date().toTimeString().slice(0, 8)))); changed(`+${ml} ml su kaydedildi`); };

  function copyYesterday(meal: Meal) {
    const prev = repo.logsOn(sv.db, addDays(date, -1)).filter(e => e.meal === meal);
    for (const e of prev) repo.addLog(sv.db, { ...e, id: undefined, datetime: date + e.datetime.slice(10) });
    changed(prev.length ? `Dünkü ${MEAL_TR[meal].toLowerCase()} kopyalandı (${prev.length})` : 'Dün bu öğünde kayıt yok');
  }
  function pickPhoto(m: Meal) { photoMeal.current = m; photoRef.current?.click(); }
  async function onPhoto(f: File) {
    try { const p = await fileToThumb(f); repo.setMealPhoto(sv.db, date, photoMeal.current, p.dataUrl, p.width, p.height); changed('Öğün fotoğrafı kaydedildi (yalnızca bu cihazda)'); }
    catch (e) { changed((e as Error).message); }
  }

  const DateNav = <span className="datenav">
    <button onClick={() => setDate(addDays(date, -1))} aria-label="Önceki gün"><I.left width={15} /></button>
    <button onClick={() => setDate(addDays(date, 1))} aria-label="Sonraki gün"><I.right width={15} /></button>
    <label className="datepick" title="Tarih seç"><I.calendar width={14} /><input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Tarih seç" /></label>
    {!isToday && <button className="link" style={{ marginLeft: 4 }} onClick={() => setDate(todayIso())}>Bugüne dön</button>}
  </span>;
  const StreakChip = ({ big }: { big?: boolean }) => <span className={'streak' + (big ? ' big' : '')} title={streak.activeToday ? 'Bugün dahil art arda kayıt girilen gün sayısı' : 'Bugün henüz kayıt yok; seri dün itibarıyla'}>
    <I.flame />{streak.current > 0 ? `${streak.current} Günlük Seri` : 'Seri yok'}</span>;
  const helloSub = rem == null ? <>Hedef belirlenmedi.</> : rem >= 0 ? <>Günlük hedefine ulaşmana <b>{fmt(rem)} kcal</b> kaldı.</> : <>Günlük hedefini <b>{fmt(-rem)} kcal</b> aştın.</>;

  // ---------- meal cards ----------
  const mealInfo = (m: Meal) => {
    const es = s.entries.filter(x => x.entry.meal === m); const mt = s.byMeal[m];
    return { es, mt, time: es[0]?.entry.datetime.slice(11, 16) ?? '', title: es.map(x => x.entry.snapshot.name.split(',')[0]).join(' & '),
      desc: es.map(x => `${x.entry.snapshot.name.split(',')[0].toLocaleLowerCase('tr')} (${fmt(x.entry.grams)} g)`).join(', '), inc: mt.energy_kcal.incomplete };
  };
  const Thumb = ({ m, time }: { m: Meal; time: string }) => photos[m]
    ? <button className="thumb" onClick={() => pickPhoto(m)} title="Fotoğrafı değiştir"><img src={photos[m].data_url} alt={`${MEAL_TR[m]} fotoğrafı`} />{time && <span className="time">{time}</span>}</button>
    : <button className="thumb" onClick={() => pickPhoto(m)} title="Fotoğraf ekle (yalnızca bu cihazda saklanır)">{time && <span className="time">{time}</span>}<span className="add"><I.camera width={20} />Fotoğraf</span></button>;
  const Detail = ({ m }: { m: Meal }) => {
    const { es } = mealInfo(m);
    return <div className="meal-detail">
      <div className="list">{es.map(({ entry: e, n }) => (
        <div className="li" key={e.id}>
          <div className="grow"><div className="t">{e.snapshot.name}</div><div className="s">{fmt(e.entered_amount, 1)} {e.entered_unit}{e.entered_unit !== 'g' ? ` ≈ ${fmt(e.grams)} g` : ''} · P {fmtN('protein_g', n.protein_g?.value)} · Y {fmtN('fat_g', n.fat_g?.value)} · K {fmtN('carb_g', n.carb_g?.value)}</div></div>
          {e.grams_value_type !== 'measured' && <Badge t={e.grams_value_type} />}
          <span className="kcal">{n.energy_kcal?.value == null ? <Badge t="missing" /> : fmt(n.energy_kcal.value)}</span>
          <button className="icon-btn" title="Sil" onClick={() => { repo.deleteLog(sv.db, e.id!); changed('Kayıt silindi'); }}><I.trash width={17} /></button>
        </div>))}</div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm soft" onClick={() => go('log', { meal: m, date })}><I.plus width={15} /> Ekle</button>
        <button className="btn sm ghost" onClick={() => copyYesterday(m)}><I.copy width={15} /> Dünden kopyala</button>
        {es.length > 0 && <button className="btn sm ghost" onClick={() => setSat({ meal: m, dt: es[es.length - 1].entry.datetime, id: es[es.length - 1].entry.id })}>Tokluk</button>}
        <button className="btn sm ghost" onClick={() => pickPhoto(m)}><I.camera width={15} /> {photos[m] ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}</button>
        {photos[m] && <button className="btn sm ghost danger" onClick={() => { repo.deleteMealPhoto(sv.db, date, m); changed('Fotoğraf silindi'); }}>Fotoğrafı sil</button>}
      </div>
    </div>;
  };
  const MealCardD = ({ m }: { m: Meal }) => {
    const x = mealInfo(m);
    if (!x.es.length) return <div className="meal">
      <div className="thumb empty-t"><I.utensils width={26} /><span>Kayıt yok</span></div>
      <div className="body"><div className="lbl">{MEAL_LONG[m]} • <em className="o">Kalan Bütçe</em></div><div className="ttl">Henüz Giriş Yapılmadı</div>
        <div className="ds wrap">{rem != null ? <>Kalan bütçe {fmt(Math.max(0, rem))} kcal. </> : null}<button className="link" onClick={() => copyYesterday(m)}>Dünden kopyala</button></div></div>
      {rem != null && <div className="kc"><b>{fmt(Math.max(0, rem))}</b><span>kcal<br />bütçe</span></div>}
      <button className="addm" onClick={() => go('log', { meal: m, date })}><I.plus width={20} /><span>Öğünü<br />Ekle</span></button>
    </div>;
    return <div className="meal">
      <Thumb m={m} time={x.time} />
      <div className="body"><div className="lbl">{MEAL_LONG[m]} • <em>Kaydedildi</em>{x.inc && <Badge t="missing" label="eksik veri" />}</div>
        <div className="ttl" title={x.title}>{x.title}</div><div className="ds" title={x.desc}>{x.desc}</div></div>
      <div className="kc"><b>{fmt(x.mt.energy_kcal.known)}</b><span>kcal</span></div>
      <div className="pky"><span className="c-p">{fmt(x.mt.protein_g.known)}g</span><span className="u">P</span><span className="c-k">{fmt(x.mt.carb_g.known)}g</span><span className="u">K</span><span className="c-y">{fmt(x.mt.fat_g.known)}g</span><span className="u">Y</span></div>
      <button className="more" onClick={() => setOpen(open === m ? null : m)} aria-label="Ayrıntılar"><I.dots width={18} /></button>
    </div>;
  };
  const MealCardM = ({ m }: { m: Meal }) => {
    const x = mealInfo(m);
    if (!x.es.length) return null;
    return <div className="meal" onClick={() => setOpen(open === m ? null : m)} style={{ cursor: 'pointer' }}>
      <span onClick={e => e.stopPropagation()}><Thumb m={m} time="" /></span>
      <div className="body"><div className="lbl row between nowrap" style={{ gap: 6 }}><span>{MEAL_LONG[m]}</span><em className="row nowrap" style={{ gap: 4 }}><I.checkCircle width={13} />Kaydedildi</em></div>
        <div className="ttl">{x.title}</div><div className="ds">{fmt(x.mt.energy_kcal.known)} kcal • {fmt(x.mt.protein_g.known)}g Protein • {x.time}{x.inc ? ' • eksik veri' : ''}</div></div>
    </div>;
  };
  const firstEmpty = ORDER.find(m => !s.entries.some(e => e.entry.meal === m) && (!isToday || MEAL_HOUR[m] > new Date().getHours())) ?? ORDER.find(m => !s.entries.some(e => e.entry.meal === m));

  return (
    <div>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />
      {/* ---------- desktop ---------- */}
      <div className="d-only">
        <section className="hero">
          <div className="grow">
            <div className="row" style={{ gap: 14 }}><span className="badge-live"><i className="dot" />{isToday ? 'Bugün · ' : ''}{dlabel}</span>{DateNav}<StreakChip /></div>
            <h1>Merhaba{name ? `, ${name}` : ''}<Hand /></h1>
            <div className="sub">{helloSub}</div>
          </div>
          <div className="hero-actions">
            <button className="btn primary glow" onClick={() => go('log', { date })}><I.plus width={20} style={{ border: '1.6px solid currentColor', borderRadius: 99, padding: 1 }} /> Öğün Ekle</button>
            <button className="btn blue" onClick={() => addWater(250)}><I.drop width={20} /> +250ml Su</button>
            <button className="btn" onClick={() => go('log', { scan: true, date })}><I.barcode width={20} /> Barkod</button>
          </div>
        </section>
        {s.incomplete.length > 0 && <div className="warn" style={{ marginTop: 16 }}>Eksik veri: bazı besinlerde {s.incomplete.map(c => sv.ref.nutrient(c)?.name_tr.toLowerCase()).join(', ')} değeri yok. Toplamlar “en az” değeridir; eksikler sıfır sayılmadı.</div>}
        <div className="krow">
          <div className="kcard">
            <div className="kh"><span className="eyebrow">Enerji Bütçesi</span><I.zap /></div>
            <Ring value={t ? Math.max(0, t.kcal - eaten) : 0} max={t?.kcal ?? 0} size={166} stroke={12}>
              <div><div className="ring-big">{rem == null ? fmt(eaten) : fmt(Math.abs(rem))}</div><div className="ring-sub">{rem == null ? 'kcal alındı' : rem >= 0 ? 'kcal kaldı' : 'kcal fazla'}</div></div>
            </Ring>
            <div className="duo"><div><div className="l">Alınan</div><div className="v num">{fmt(eaten)} <small>kcal</small></div></div>
              <div><div className="l">Yakılan</div><div className="v" style={{ marginTop: 4 }}><Soon /></div></div></div>
          </div>
          <div className="kcard">
            <div className="kh"><span className="eyebrow">Makro Ayrımı</span>{t && <span className="tiny lime sb">%{fmt(eaten / t.kcal * 100)} Hedefte</span>}</div>
            <div style={{ marginTop: 26 }}>{mac.map(m => <div className="mrow" key={m.k}>
              <div className="top"><span className="nm" style={{ color: m.color }}><i style={{ background: m.color }} />{m.n}{m.inc && <span className="chip vt-missing" style={{ padding: '0 5px' }}>eksik</span>}</span>
                <span className="vv num">{fmt(m.v)}{m.tg ? ` / ${fmt(m.tg)}g` : 'g'} <span>{m.pct != null ? `(%${m.pct})` : ''}</span></span></div>
              <div className={'bar ' + m.cls + (m.tg && m.v > m.tg ? ' over' : '')}><i style={{ width: Math.min(100, m.pct ?? 0) + '%' }} /></div></div>)}</div>
            <div className="kfoot"><span>Kalan: {t ? <><b>{fmt(Math.max(0, t.protein_g - mac[0].v))}g P</b> • <b>{fmt(Math.max(0, t.carb_g - mac[1].v))}g K</b></> : '—'}</span>
              <span className="tiny sb lime">{s.incomplete.length ? 'yaklaşık' : ''}</span></div>
          </div>
          <div className="kcard">
            <div className="kh"><span className="eyebrow">Hidrasyon</span><I.drop style={{ color: 'var(--water)' }} /></div>
            <div className="water-v"><b>{fmt(s.water / 1000, 1)}</b>{waterTarget ? ` / ${fmt(waterTarget / 1000, 1)} Litre` : ' Litre'}</div>
            <div className="water-p">{waterTarget ? `%${fmt(s.water / waterTarget * 100)} Tamamlandı` : 'Hedef belirlenmedi'}</div>
            <div className="cups" title={`Her kutu ≈ ${fmt(cupMl)} ml`}>{Array.from({ length: cups }, (_, i) => <i key={i} className={cupsOn >= i + 1 ? 'on' : cupsOn > i ? 'half' : ''}>{i + 1}</i>)}</div>
            <button className="water-add" onClick={() => addWater(250)} style={{ marginTop: 'auto' }}><I.plus width={18} /> Bardak Ekle (250 ml)</button>
          </div>
          <div className="kcard">
            <div className="kh"><span className="eyebrow row" style={{ gap: 8, color: 'var(--accent)' }}><I.brain width={18} style={{ color: 'var(--accent)' }} />Zekâ Önerisi</span><span className="chip lime" title="Kural tabanlı: yalnızca hedef ve kayıtlarınızın aritmetiği">{sug.tag}</span></div>
            <div className="ai-text">{sug.html}</div>
            {pick ? <div className="ai-mini"><I.utensils width={20} /><div className="grow">{pick.f.name.split(',')[0]}<span>Kayıtlarından · 100 g: {fmt(pick.p, 1)}g P · {fmt(pick.k)} kcal</span></div><button className="link" onClick={() => setQuick(pick.f)}>Ekle</button></div>
              : hasAI ? <div className="ai-mini"><I.sparkles width={20} /><div className="grow">Asistana sor<span>Gemini anahtarın kayıtlı</span></div><button className="link" onClick={() => go('assistant')}>Aç</button></div> : null}
          </div>
        </div>
        <div className="tgrid">
          <div>
            <div className="section-title"><h2>Bugünkü Öğün Günlüğü</h2><span className="count">{s.entries.length} Kayıt</span><span className="grow" /><button className="link" onClick={() => go('log', { date })}>Hızlı Ekle <I.right width={15} /></button></div>
            <div className="meals">{ORDER.map(m => <React.Fragment key={m}><MealCardD m={m} />{open === m && <Detail m={m} />}</React.Fragment>)}</div>
          </div>
          <div className="rightcol">
            <div className="card" style={{ opacity: .92 }}>
              <div className="rc-head"><div className="row nowrap" style={{ gap: 12 }}><I.watch width={20} style={{ color: 'var(--accent)' }} /><h3>Cihaz Senkronizasyonu</h3></div><Soon /></div>
              <div className="tile" style={{ marginTop: 14, padding: '6px 14px' }}>
                <div className="soon-row"><I.dumbbell width={20} /><span className="grow">Antrenman</span><span>—</span></div>
                <div className="soon-row"><I.steps width={20} /><span className="grow">Günlük adım</span><span>—</span></div>
              </div>
              <div className="row between small" style={{ marginTop: 14, color: 'var(--ink-2)' }}><span>Toplam Yakılan Aktif Kalori</span><b className="muted">Yakında</b></div>
              <div className="tiny muted" style={{ marginTop: 8 }}>Apple Watch / cihaz eşitleme henüz yok. Yakılan kalori tahmin edilmez; hedefin TDEE formülünden gelir.</div>
            </div>
            <div className="card">
              <div className="rc-head"><h3>Mikro Besin & Denge</h3><button className="link" style={{ color: 'var(--ink-2)', fontWeight: 500 }} onClick={() => setMicros(!micros)}>{micros ? 'Gizle' : 'Detay'}</button></div>
              {[['fiber_g', 'Diyet Lifi', 'g'], ['sodium_mg', 'Sodyum', 'mg'], ['potassium_mg', 'Potasyum', 'mg']].filter(([c]) => s.total[c]).map(([c, n, u]) => (
                <div className="micro" key={c}><div className="top"><span>{n}</span><b className="num">{fmtN(c, s.total[c].known)} {u}{s.total[c].incomplete && s.entries.length ? <span className="chip vt-missing" style={{ marginLeft: 6 }}>eksik</span> : null}</b></div></div>))}
              <div className="tiny muted" style={{ marginTop: 12 }}>Referans (EFSA) karşılaştırması henüz eklenmedi; yalnızca miktarlar.</div>
              {micros && <table className="t" style={{ marginTop: 10 }}><tbody>{sv.ref.nutrients.filter(n => !n.core).map(n => (
                <tr key={n.code}><td className="small">{n.name_tr}</td><td className="r num small">{fmtN(n.code, s.total[n.code].known)} {n.unit}</td><td>{s.total[n.code].incomplete && s.entries.length ? <Badge t="missing" label="eksik" /> : null}</td></tr>))}</tbody></table>}
            </div>
            <div className="card">
              <div className="rc-head"><div className="row nowrap" style={{ gap: 10 }}><I.hourglass width={20} style={{ color: 'var(--accent)' }} /><h3>Çiğ / Pişmiş Dönüştürücü</h3></div><span className="tiny muted">Pratik</span></div>
              <div className="small" style={{ color: 'var(--ink-2)', marginTop: 10 }}>Pirinç, et veya makarna gibi su çeken/bırakan besinlerin gramajını kendi tartımına göre çevir.</div>
              {lastCook && lastCookFood ? <div className="row between" style={{ marginTop: 14 }}>
                <div><div className="tiny sb">{lastCookFood.name.split(',')[0]} (çiğ)</div><div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(lastCook.raw_g)}g</div></div>
                <div style={{ textAlign: 'right' }}><div className="tiny sb lime">Pişmiş (tartım)</div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{fmt(lastCook.cooked_g)}g</div></div></div>
                : <div className="tiny muted" style={{ marginTop: 12 }}>Henüz pişirme tartımın yok. İlk tartımdan sonra burada görünür.</div>}
              <button className="btn block" style={{ marginTop: 16, height: 42 }} onClick={() => go('recipes', { tab: 'convert' })}>Hesaplayıcıyı Aç</button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- phone ---------- */}
      <div className="m-only">
        <div className="m-hello"><div style={{ minWidth: 0 }}><h1>Merhaba{name ? `, ${name}` : ''}<Hand /></h1><div className="sub">{helloSub}</div></div><StreakChip big /></div>
        {!isToday && <div className="row small" style={{ marginTop: 8 }}><span className="muted">{dlabel}</span>{DateNav}</div>}
        {isToday && <div className="row small" style={{ marginTop: 6 }}>{DateNav}</div>}
        <div className="card m-ring">
          <Ring value={t ? Math.max(0, t.kcal - eaten) : 0} max={t?.kcal ?? 0} size={196} stroke={13}>
            <div><div className="lab">{rem == null ? 'ALINAN' : rem >= 0 ? 'KALAN KALORİ' : 'FAZLA KALORİ'}</div><div className="val num">{rem == null ? fmt(eaten) : fmt(Math.abs(rem))}</div><div className="tg">{t ? `Hedef: ${fmt(t.kcal)} kcal` : 'Hedef yok'}</div></div>
          </Ring>
          <div className="m-duo">
            <div className="tile"><span className="ic"><I.utensils width={17} /></span><div><div className="l">Alınan</div><div className="v num">{fmt(eaten)} kcal</div></div></div>
            <div className="tile"><span className="ic o"><I.flame width={17} /></span><div><div className="l">Yakılan</div><div className="v"><Soon /></div></div></div>
          </div>
        </div>
        {s.incomplete.length > 0 && <div className="warn small" style={{ marginTop: 12 }}>Eksik veri: {s.incomplete.map(c => sv.ref.nutrient(c)?.name_tr.toLowerCase()).join(', ')} bazı besinlerde yok; toplamlar “en az”.</div>}
        <div className="m-sec"><h2>Makro Dengesi</h2><span className="tiny lime sb">Günlük Özet</span></div>
        <div className="m-macros">{mac.map(m => <div className="card" key={m.k}>
          <div className="nm"><span style={{ color: m.color }}>{m.n}</span><span className="muted" style={{ fontWeight: 500 }}>{m.pct != null ? `%${m.pct}` : ''}</span></div>
          <div className="vv num">{fmt(m.v)} <span>{m.tg ? `/${fmt(m.tg)}g` : 'g'}</span></div>
          <div className={'bar ' + m.cls}><i style={{ width: Math.min(100, m.pct ?? 0) + '%' }} /></div>
          <div className="lf">{m.inc ? <span className="chip vt-missing" style={{ padding: '0 5px' }}>eksik veri</span> : m.tg ? (m.tg - m.v >= 0 ? `${fmt(m.tg - m.v)}g kaldı` : `${fmt(m.v - m.tg)}g fazla`) : '—'}</div>
        </div>)}</div>
        <div className="card m-ai"><span className="ic"><I.sparkles width={18} /></span><div><div className="k">ZEKÂ ÖNERİSİ <span>• Kural tabanlı</span></div><p>{sug.html}</p></div></div>
        <div className="card m-water">
          <div className="row between"><h3><I.drop width={20} style={{ color: 'var(--water)' }} /> Su Takibi</h3><span><b className="c-w" style={{ fontSize: 15 }}>{fmt(s.water / 1000, 1)}L</b><span className="small muted">{waterTarget ? ` / ${fmt(waterTarget / 1000, 1)}L` : ' · hedef yok'}</span></span></div>
          <div className="cups">{Array.from({ length: cups }, (_, i) => <i key={i} className={cupsOn >= i + 1 ? 'on' : cupsOn > i ? 'half' : ''}><I.drop width={13} /></i>)}</div>
          <button className="water-add" onClick={() => addWater(250)}><I.plus width={17} /> +250 ml Su Kaydet</button>
        </div>
        <div className="m-sec"><h2>Bugünkü Öğünler <span className="count">{logged}/4</span></h2><button className="link" onClick={() => setOpen(open ? null : (MEALS.find(m => s.entries.some(e => e.entry.meal === m)) ?? null))}>{open ? 'Kapat' : 'Tümünü Gör'}</button></div>
        <div className="meals">{ORDER.map(m => <React.Fragment key={m}><MealCardM m={m} />{open === m && <Detail m={m} />}</React.Fragment>)}
          {firstEmpty && <div className="card meal-empty"><span className="ic" style={{ margin: '0 auto' }}><I.utensils width={20} /></span><h3>{MEAL_LONG[firstEmpty]} Eklenmedi</h3>
            {rem != null && <div className="s">Kalan bütçe: <b>{fmt(Math.max(0, rem))} kcal</b></div>}
            <div className="row" style={{ justifyContent: 'center' }}><button className="btn primary glow" onClick={() => go('log', { meal: firstEmpty, date })}><I.plus width={18} /> Öğün Ekle</button></div>
            <button className="link" style={{ margin: '10px auto 0' }} onClick={() => copyYesterday(firstEmpty)}>Dünden kopyala</button></div>}
        </div>
      </div>
      {sat && <SatietyForm meal={sat.meal} datetime={sat.dt} entryId={sat.id} onClose={() => setSat(null)} />}
      {quick && <LogSheet food={quick} date={date} onClose={() => setQuick(null)} />}
    </div>
  );
}
