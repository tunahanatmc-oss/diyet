import React, { useState } from 'react';
import { useApp } from '../store';
import type { FoodView } from '../data/reference';
import * as repo from '../data/repo';
import { todayIso, localDateTime, MEAL_TR, type Meal } from '../data/services';
import { cookedToRaw, rawToCooked, nutrientsFor, round } from '../engine';
import { Badge, fmt, NumberInput, Seg } from '../ui/kit';
import { FoodPicker } from '../ui/food';
import { askGemini, type AssistantReply, type ToolCallLog } from '../integrations/gemini';
import { I } from '../ui/icons';

export const AI_KEY = 'diyet.gemini.key'; export const AI_MODEL = 'diyet.gemini.model';

export function Converter() {
  const { sv } = useApp();
  const [food, setFood] = useState<FoodView | null>(null);
  const [dir, setDir] = useState<'r2c' | 'c2r'>('r2c');
  const [g, setG] = useState<number | ''>(70);
  const [rawW, setRawW] = useState<number | ''>(''); const [cookW, setCookW] = useState<number | ''>('');
  const ys = food ? repo.measuredYields(sv.db, food.id) : [];
  const y = rawW && cookW ? (cookW as number) / (rawW as number) : ys[0]?.y ?? null;
  const out = y && g !== '' ? (dir === 'r2c' ? rawToCooked(g, y) : cookedToRaw(g, y)) : null;
  const rawG = out == null ? null : dir === 'r2c' ? (g as number) : out;
  const kcal = food && rawG != null ? nutrientsFor(food.per100, rawG).energy_kcal.value : null;
  return (
    <div className="card">
      <div className="card-head"><h3>Çiğ ↔ pişmiş dönüştürücü</h3><span className="chip neutral">Hesaplayan: motor</span></div>
      {!food ? <FoodPicker tabs={['search', 'recent']} onPick={setFood} placeholder="Çiğ besin seçin (ör. pirinç, bulgur, makarna)" /> : <div className="col">
        <div className="row between"><b>{food.name}</b><button className="btn sm ghost" onClick={() => setFood(null)}>Değiştir</button></div>
        <div className="row"><Seg value={dir} options={[['r2c', 'Çiğ → pişmiş'], ['c2r', 'Pişmiş → çiğ']]} onChange={setDir} /><div style={{ width: 110 }}><NumberInput value={g} onChange={setG} /></div><span>g {dir === 'r2c' ? 'çiğ' : 'pişmiş'}</span></div>
        {ys.length > 0 && !(rawW && cookW) ? <div className="info small">Sizin tartımınız kullanılıyor: Y = {fmt(ys[0].y, 3)} ({ys[0].created_at.slice(0, 10)}, ölçülmüş).</div>
          : <div className="col"><div className="warn small">Bu besin için kayıtlı tartımınız yok; güvenilir kaynaklı verim katsayısı da eklenmedi. Bir kez tartın:</div>
            <div className="row"><span className="small">Çiğ</span><div style={{ width: 100 }}><NumberInput value={rawW} onChange={setRawW} /></div><span className="small">g → pişmiş</span><div style={{ width: 100 }}><NumberInput value={cookW} onChange={setCookW} /></div><span className="small">g</span>
              {rawW && cookW ? <button className="btn sm soft" onClick={() => repo.saveCookSession(sv.db, { raw_food_id: food.id, raw_g: rawW as number, method: 'boiled', cooked_g: cookW as number, cooked_value_type: 'measured' })}>Tartımı sakla</button> : null}</div></div>}
        {out != null && <div className="row" style={{ gap: 24 }}>
          <div className="stat"><div className="l">{dir === 'r2c' ? 'Pişmiş' : 'Çiğ karşılığı'}</div><div className="v">{fmt(out)} g</div></div>
          <div className="stat"><div className="l">Enerji</div><div className="v">{fmt(kcal)}</div><div className="small muted">kcal (eklenen yağ hariç)</div></div>
          <Badge t={rawW && cookW ? 'measured' : 'measured'} label="sizin tartımınıza göre" />
        </div>}
      </div>}
    </div>
  );
}

function Remaining() {
  const { sv, version } = useApp(); void version;
  const r = sv.remaining(todayIso());
  if (!r) return <div className="card small muted">Hedef yok — Ayarlar’dan profil ve hedef belirleyin.</div>;
  const favs = repo.favourites(sv.db).map(f => f.food_id ? sv.food(f.food_id) : null).filter(Boolean) as FoodView[];
  const sugg = favs.map(f => ({ f, n: nutrientsFor(f.per100, 100) })).filter(x => (x.n.energy_kcal.value ?? 1e9) <= Math.max(0, r.kcal)).sort((a, b) => (b.n.protein_g?.value ?? 0) - (a.n.protein_g?.value ?? 0)).slice(0, 5);
  return (
    <div className="card">
      <div className="card-head"><h3>Bugün kalan</h3><span className="chip neutral">Hesaplayan: motor</span></div>
      <div className="grid g4">
        <div className="stat"><div className="l">Enerji</div><div className="v">{fmt(r.kcal)}</div><div className="small muted">kcal</div></div>
        <div className="stat"><div className="l">Protein</div><div className="v">{fmt(r.protein_g)}</div><div className="small muted">g</div></div>
        <div className="stat"><div className="l">Yağ</div><div className="v">{fmt(r.fat_g)}</div><div className="small muted">g</div></div>
        <div className="stat"><div className="l">Karb.</div><div className="v">{fmt(r.carb_g)}</div><div className="small muted">g</div></div>
      </div>
      {r.incomplete.length > 0 && <div className="warn small" style={{ marginTop: 8 }}>Bazı kayıtlarda eksik veri var; kalan değerler yaklaşık.</div>}
      {sugg.length > 0 && <div className="small" style={{ marginTop: 10 }}>Kalana sığan favoriler (100 g, proteine göre): {sugg.map(s => `${s.f.name} (${fmt(s.n.energy_kcal.value)} kcal, ${fmt(s.n.protein_g?.value, 1)} g P)`).join(' · ')}</div>}
    </div>
  );
}

function Chat() {
  const { sv, changed, go } = useApp();
  const key = localStorage.getItem(AI_KEY); const model = localStorage.getItem(AI_MODEL) || 'gemini-2.5-flash';
  const [msgs, setMsgs] = useState<{ role: 'user' | 'model'; text: string; reply?: AssistantReply }[]>([]);
  const [txt, setTxt] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [img, setImg] = useState<{ mime: string; b64: string; name: string } | null>(null);
  if (!key) return (
    <div className="card">
      <h3>Yapay zekâ asistanı (isteğe bağlı)</h3>
      <p className="small">Kapalı. Açmak için ücretsiz bir Google AI Studio anahtarı gerekir; anahtar yalnızca bu cihazda saklanır. Ücretsiz katmanda Google istemleri ürün geliştirmek için kullanabilir. Asistan hiçbir sayıyı kendisi üretmez: tüm hesaplar uygulamanın motorundan gelir ve ayrıca gösterilir.</p>
      <button className="btn soft" onClick={() => go('settings', { section: 'ai' })}>Ayarlar’da anahtar ekle</button>
    </div>
  );
  async function send() {
    if (!txt.trim() && !img) return; setBusy(true); setErr('');
    const history = msgs.map(m => ({ role: m.role, text: m.text }));
    const user = txt.trim() || 'Bu fotoğraftaki yemeği tahmin et ve kayıt taslağı oluştur.';
    setMsgs(m => [...m, { role: 'user', text: user + (img ? ` [fotoğraf: ${img.name}]` : '') }]); setTxt('');
    try { const r = await askGemini(sv, key!, model, history, user, img ?? undefined); setMsgs(m => [...m, { role: 'model', text: r.text, reply: r }]); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); setImg(null); }
  }
  return (
    <div className="card">
      <div className="card-head"><h3>Asistan</h3><span className="chip neutral">{model}</span></div>
      <div className="chat">
        {!msgs.length && <div className="small muted">Örnek: “70 g kuru pirinç kaç gram pişmiş olur?” · “Bugün kaç kalori kaldı?” · Fotoğraf ekleyip “bunu kaydet”.</div>}
        {msgs.map((m, i) => <React.Fragment key={i}>
          {m.reply?.tools.map((t: ToolCallLog, j: number) => <div className="tool" key={j}><b>Hesaplayan: motor</b> · {t.name}({JSON.stringify(t.args)}) → <code>{JSON.stringify(t.result).slice(0, 400)}</code></div>)}
          <div className={'bubble ' + (m.role === 'user' ? 'u' : 'm')}>{m.text}</div>
          {m.reply && m.reply.hiddenNumbers > 0 && <div className="tiny muted">Araç çıktısında olmayan {m.reply.hiddenNumbers} sayı gizlendi ([?]).</div>}
          {m.reply?.drafts.map((d, j) => <div className="info row between" key={'d' + j}><span className="small">Taslak: <b>{d.name}</b> {fmt(d.grams)} g · {MEAL_TR[d.meal as Meal] ?? d.meal} · {fmt(nutrientsFor(d.per100, d.grams).energy_kcal.value)} kcal <Badge t="estimated" /></span>
            <button className="btn sm primary" onClick={() => { repo.addLog(sv.db, { datetime: localDateTime(), meal: (d.meal as Meal) ?? 'snack', food_id: d.food_id, entered_amount: round(d.grams, 1), entered_unit: 'g', grams: d.grams, grams_value_type: 'estimated', snapshot: { name: d.name, source: 'Asistan taslağı', kind: d.food_id >= 1e9 ? 'custom' : 'ref', per100: d.per100 } }); changed('Taslak onaylandı ve kaydedildi'); }}>Onayla ve kaydet</button></div>)}
        </React.Fragment>)}
        {busy && <div className="small muted">Düşünüyor…</div>}
        {err && <div className="err">{err}</div>}
      </div>
      <div className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }}>
        <label className="icon-btn" title="Fotoğraf"><I.camera width={20} /><input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const b = await f.arrayBuffer(); let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); setImg({ mime: f.type || 'image/jpeg', b64: btoa(s), name: f.name }); }} /></label>
        <input className="input" placeholder={img ? `Fotoğraf: ${img.name} — mesaj (isteğe bağlı)` : 'Sorunuzu yazın…'} value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && !busy && send()} />
        <button className="btn primary" disabled={busy} onClick={send}>Gönder</button>
      </div>
    </div>
  );
}

export function Assistant() {
  return (
    <div>
      <div className="page-head"><div><h1>Asistan</h1><div className="sub">Hazır hesaplar her zaman çalışır; yapay zekâ isteğe bağlıdır ve sayı üretmez.</div></div></div>
      <div className="grid g2"><Converter /><Remaining /></div>
      <div style={{ marginTop: 14 }}><Chat /></div>
    </div>
  );
}
