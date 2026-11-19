import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import * as repo from '../data/repo';
import { exportBackup, logsCsv, weightsCsv, recipesCsv, restoreBackup, APP_VERSION } from '../data/backup';
import { download, canPickFolder, pickBackupFolder, backupFolderName, writeToBackupFolder } from '../data/files';
import { ACTIVITY_TR, PAL, type Activity } from '../engine';
import { fmt, Modal, NumberInput, Seg } from '../ui/kit';
import { localDateTime, todayIso } from '../data/services';
import { I } from '../ui/icons';
import { AI_KEY, AI_MODEL } from './Assistant';
import { ProfileForm } from './Onboarding';
import { getTheme, setTheme, type Theme } from '../ui/theme';

export function TargetsView({ compact }: { compact?: boolean }) {
  const { sv, changed, version } = useApp(); void version;
  const p = repo.getProfile(sv.db); const w = sv.currentWeight();
  const cur = repo.targetOn(sv.db, todayIso());
  const [manual, setManual] = useState<number | ''>('');
  const [allowLow, setAllowLow] = useState(false);
  if (!p || w == null) return <div className="small muted">Profil ve kilo girildiğinde hedefler hesaplanır.</div>;
  const c = sv.computeTargets(p, w, undefined, allowLow);
  return (
    <div className="col">
      <table className="t"><tbody>
        <tr><td>BMR (Mifflin-St Jeor)</td><td className="small muted">10×{fmt(w, 1)} + 6,25×{fmt(p.height_cm)} − 5×{c.age} {p.sex === 'male' ? '+ 5' : '− 161'}</td><td className="r num"><b>{fmt(c.bmr)}</b> kcal</td></tr>
        <tr><td>TDEE</td><td className="small muted">BMR × PAL {fmt(c.pal, 3)} ({ACTIVITY_TR[p.activity_level as Activity]})</td><td className="r num"><b>{fmt(c.tdee)}</b> kcal</td></tr>
        <tr><td>Hedef</td><td className="small muted">{p.goal === 'maintain' ? 'koruma' : `${p.goal === 'lose' ? '−' : '+'}${fmt(p.goal_rate_kg_per_week, 2)} kg/hafta × 7700 / 7`}</td><td className="r num"><b>{fmt(c.kcal)}</b> kcal</td></tr>
        <tr><td>Protein</td><td className="small muted">{fmt(p.protein_per_kg, 1)} g/kg × {fmt(w, 1)}</td><td className="r num">{fmt(c.protein_g)} g</td></tr>
        <tr><td>Yağ</td><td className="small muted">%{fmt(p.fat_fraction * 100)} enerji ÷ 9</td><td className="r num">{fmt(c.fat_g)} g</td></tr>
        <tr><td>Karbonhidrat</td><td className="small muted">kalan enerji ÷ 4</td><td className="r num">{fmt(c.carb_g)} g</td></tr>
      </tbody></table>
      {c.warnings.map(x => <div key={x} className="warn small">{x}</div>)}
      {!compact && <div className="tiny muted">Tahmini değerler: PAL katsayıları, 7700 kcal/kg, 1,6 g/kg protein ve %30 yağ yaygın kabullerdir (kaynakları henüz doğrulanmadı). Mifflin-St Jeor bireysel olarak ±%10’dan fazla sapabilir; birkaç hafta sonra uyarlanabilir TDEE daha iyi tahmin verir.</div>}
      <div className="row">
        <button className="btn primary" onClick={() => { sv.saveComputedTargets(p, w, 'mifflin_tdee', allowLow ? c.kcal : undefined); changed('Hedef kaydedildi'); }}>Bu hedefi kullan</button>
        <span className="small">veya elle:</span><div style={{ width: 110 }}><NumberInput value={manual} onChange={setManual} placeholder="kcal" /></div>
        <button className="btn" disabled={!(manual && manual > 800)} onClick={() => { const m = sv.computeTargets(p, w); repo.addTarget(sv.db, { valid_from: localDateTime(), kcal: manual as number, protein_g: m.protein_g, fat_g: (p.fat_fraction * (manual as number)) / 9, carb_g: ((manual as number) - 4 * m.protein_g - 9 * ((p.fat_fraction * (manual as number)) / 9)) / 4, method: 'manual' }); changed('Elle hedef kaydedildi'); }}>Elle kaydet</button>
      </div>
      {c.kcal <= c.bmr + 1 && p.goal === 'lose' && <label className="row small"><input type="checkbox" checked={allowLow} onChange={e => setAllowLow(e.target.checked)} /> BMR altı hedefe izin ver (önerilmez; bir uzmana danışın)</label>}
      {cur && <div className="small muted">Geçerli hedef: {fmt(cur.kcal)} kcal · P {fmt(cur.protein_g)} · Y {fmt(cur.fat_g)} · K {fmt(cur.carb_g)} g ({cur.method === 'manual' ? 'elle' : cur.method === 'adaptive' ? 'uyarlanabilir' : 'formül'}, {cur.valid_from.slice(0, 10)})</div>}
    </div>
  );
}

export function Settings() {
  const { sv, changed, replaceDb, param, version } = useApp(); void version;
  const [profileEdit, setProfileEdit] = useState(false);
  const ms = repo.measures(sv.db); const tares = repo.tares(sv.db);
  const [newM, setNewM] = useState(''); const [newMl, setNewMl] = useState<number | ''>('');
  const [tName, setTName] = useState(''); const [tG, setTG] = useState<number | ''>('');
  const [folder, setFolder] = useState<string | null>(null);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [key, setKey] = useState(localStorage.getItem(AI_KEY) ?? ''); const [model, setModel] = useState(localStorage.getItem(AI_MODEL) ?? 'gemini-2.5-flash');
  const fileRef = useRef<HTMLInputElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);
  const water = repo.getSetting(sv.db, 'water_target_ml') ?? '';
  const p = repo.getProfile(sv.db);
  const [theme, setThemeS] = useState<Theme>(getTheme());
  useEffect(() => { backupFolderName().then(setFolder).catch(() => {}); }, []);
  useEffect(() => { if (param?.section === 'ai') aiRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [param]);

  async function doExport() {
    const b = await exportBackup(sv.db, sv.ref.meta.version);
    download(b.filename, b.bytes); repo.addBackupLog(sv.db, 'indirildi: ' + b.filename, b.bytes.length, b.checksum, 'manual'); changed('Yedek hazırlandı');
  }
  async function doRestore(f: File) {
    setErr(''); setMsg('');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const db = await restoreBackup(bytes); const out = db.export(); db.close();
      if (!confirm('Mevcut tüm kişisel verileriniz yedektekiyle değiştirilecek. Devam edilsin mi?')) return;
      await replaceDb(out); setMsg('Yedek geri yüklendi.');
    } catch (e) { setErr((e as Error).message + ' Mevcut verileriniz değişmedi.'); }
  }
  return (
    <div>
      <div className="ph" style={{ marginBottom: 22 }}><div><span className="badge-live"><i className="dot" />Çevrimdışı · veriler cihazda</span><h1>Ayarlar / Profil</h1><div className="sub">Her şey bu cihazda; hesap yok, sunucu yok.</div></div></div>
      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h3>Profil ve hedefler</h3><button className="btn sm" onClick={() => setProfileEdit(true)}><I.edit width={15} /> Profili düzenle</button></div>
          {p && <div className="small muted" style={{ marginBottom: 8 }}>{sv.userName() ? sv.userName() + ' · ' : ''}{sv.goalWeight() ? `hedef ${fmt(sv.goalWeight(), 1)} kg · ` : ''}{p.sex === 'male' ? 'Erkek' : 'Kadın'} · {p.birth_date} · {fmt(p.height_cm)} cm · {ACTIVITY_TR[p.activity_level as Activity]} · {p.goal === 'lose' ? 'Kilo ver' : p.goal === 'gain' ? 'Kilo al' : 'Koru'}</div>}
          <TargetsView />
        </div>
        <div className="col">
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Ev ölçüleri</h3>
            <table className="t"><tbody>{ms.map(m => <MeasureRow key={m.id + ':' + m.ml + m.name_tr} m={m} />)}</tbody></table>
            <div className="row" style={{ marginTop: 8 }}><input className="input" style={{ maxWidth: 180 }} placeholder="Yeni ölçü (ör. kepçe)" value={newM} onChange={e => setNewM(e.target.value)} /><div style={{ width: 90 }}><NumberInput value={newMl} onChange={setNewMl} placeholder="ml" /></div>
              <button className="btn sm" disabled={!newM || !(newMl && newMl > 0)} onClick={() => { repo.addMeasure(sv.db, newM, newMl as number); setNewM(''); setNewMl(''); changed('Ölçü eklendi'); }}>Ekle</button></div>
            <div className="tiny muted" style={{ marginTop: 6 }}>Bardağınızın gerçek hacmi farklıysa ml’yi değiştirin; en doğrusu her besin için bir kez tartmaktır (Besinler &gt; besin &gt; Tart).</div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Dara (boş kap ağırlıkları)</h3>
            <div className="list">{tares.map(t => <div className="li" key={t.id}><div className="grow">{t.name}</div><span className="num">{fmt(t.grams)} g</span><button className="icon-btn" onClick={() => { repo.deleteTare(sv.db, t.id); changed(); }}><I.trash width={15} /></button></div>)}</div>
            <div className="row" style={{ marginTop: 8 }}><input className="input" style={{ maxWidth: 180 }} placeholder="ör. büyük tencere" value={tName} onChange={e => setTName(e.target.value)} /><div style={{ width: 90 }}><NumberInput value={tG} onChange={setTG} placeholder="g" /></div>
              <button className="btn sm" disabled={!tName || !(tG && tG > 0)} onClick={() => { repo.addTare(sv.db, tName, tG as number); setTName(''); setTG(''); changed('Dara eklendi'); }}>Ekle</button></div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Görünüm</h3>
            <div className="row small"><span>Tema</span><Seg value={theme} options={[['dark', 'Gece (koyu)'], ['light', 'Krem & Adaçayı (açık)']]} onChange={v => { setTheme(v); setThemeS(v); changed(v === 'light' ? 'Açık tema seçildi' : 'Koyu tema seçildi'); }} /></div>
            <div className="tiny muted" style={{ marginTop: 6 }}>Tercih bu cihazda saklanır (yedeğe girmez).</div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Tercihler</h3>
            <label className="row small"><input type="checkbox" checked={!!p?.uses_scale} onChange={e => { if (p) { repo.saveProfile(sv.db, { ...p, uses_scale: e.target.checked ? 1 : 0 }); changed(); } }} /> Mutfak tartısı kullanıyorum (varsayılan birim: gram)</label>
            <div className="row small" style={{ marginTop: 8 }}><span>Günlük su hedefi (isteğe bağlı)</span><div style={{ width: 100 }}><NumberInput value={water === '' ? '' : +water} onChange={v => { repo.setSetting(sv.db, 'water_target_ml', v === '' ? null : String(v)); changed(); }} placeholder="ml" /></div><span className="muted">Uygulama öneri vermez; kendi hedefiniz.</span></div>
            <div className="row small" style={{ marginTop: 8 }}><span>Dil</span><Seg value={p?.language === 'en' ? 'en' : 'tr'} options={[['tr', 'Türkçe'], ['en', 'English (yakında)']]} onChange={v => { if (p) { repo.saveProfile(sv.db, { ...p, language: v }); changed(v === 'en' ? 'İngilizce arayüz henüz hazır değil; besin adları İngilizce de aranabilir.' : undefined); } }} /></div>
          </div>
        </div>
      </div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Yedekleme</h3>
          <div className="tiny muted" style={{ marginBottom: 8 }}>Yedek; kayıtlar, tarifler, tartılar ve <b>öğün fotoğrafları</b> (küçültülmüş JPEG, öğün başına ~30–80 KB) dahil tüm kişisel verileri içerir. Tema ve Gemini anahtarı yedeğe girmez.</div>
          <div className="row"><button className="btn primary" onClick={doExport}>Yedeği indir (.diyetbackup)</button><button className="btn" onClick={() => fileRef.current?.click()}>Yedekten geri yükle</button>
            <input ref={fileRef} type="file" accept=".diyetbackup,application/zip,application/octet-stream" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) doRestore(f); e.target.value = ''; }} /></div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => download('kayitlar.csv', logsCsv(sv.db), 'text/csv;charset=utf-8')}>logs.csv</button>
            <button className="btn sm" onClick={() => download('kilolar.csv', weightsCsv(sv.db), 'text/csv;charset=utf-8')}>weights.csv</button>
            <button className="btn sm" onClick={() => download('tarifler.csv', recipesCsv(sv.db), 'text/csv;charset=utf-8')}>recipes.csv</button>
          </div>
          <div className="hr" />
          <b className="small">Haftalık otomatik yedek</b>
          {canPickFolder() ? <div className="col" style={{ marginTop: 6 }}>
            <div className="row"><button className="btn sm" onClick={async () => { try { setFolder(await pickBackupFolder()); repo.setSetting(sv.db, 'auto_backup', '1'); changed('Klasör seçildi'); } catch { /* cancelled */ } }}>{folder ? `Klasör: ${folder}` : 'Klasör seç'}</button>
              {folder && <button className="btn sm soft" onClick={async () => { const b = await exportBackup(sv.db, sv.ref.meta.version); const name = `diyet-otomatik-${new Date().toISOString().slice(0, 10)}.diyetbackup`; const ok = await writeToBackupFolder(name, b.bytes, true); if (ok) { repo.addBackupLog(sv.db, folder + '/' + name, b.bytes.length, b.checksum, 'auto'); changed('Yedek klasöre yazıldı'); } else setErr('Klasöre yazma izni verilmedi.'); }}>Şimdi yedekle</button>}</div>
            <div className="tiny muted">Uygulama açıldığında son otomatik yedek 7 günden eskiyse bu klasöre yeni yedek yazılır (son 8 yedek tutulur). Tarayıcı izin isterse bir kez onaylayın.</div>
          </div> : <div className="tiny muted" style={{ marginTop: 4 }}>Bu tarayıcı klasöre otomatik yazmayı desteklemiyor (iPhone/Safari). Uygulama haftada bir yedek hatırlatması gösterir; “Yedeği indir” ile dosyayı iCloud Drive’a veya Google Drive’a kaydedin.</div>}
          <div className="small muted" style={{ marginTop: 6 }}>Son yedek: {repo.lastBackup(sv.db)?.datetime?.slice(0, 16).replace('T', ' ') ?? 'hiç'}</div>
          {msg && <div className="info small" style={{ marginTop: 8 }}>{msg}</div>}{err && <div className="err small" style={{ marginTop: 8 }}>{err}</div>}
        </div>
        <div className="card" ref={aiRef}>
          <h3 style={{ marginBottom: 8 }}>Yapay zekâ (isteğe bağlı)</h3>
          <div className="small muted">Google AI Studio’dan ücretsiz anahtar alın (aistudio.google.com). Anahtar yalnızca bu cihazın tarayıcı deposunda tutulur, yedeğe girmez. Ücretsiz katmanda Google istemleri ürün geliştirmek için kullanabilir; yalnızca siz bir asistan işlemi başlattığınızda gereken bilgi gönderilir.</div>
          <label className="f" style={{ marginTop: 8 }}>API anahtarı<input className="input" type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="AIza…" autoComplete="off" /></label>
          <label className="f" style={{ marginTop: 8 }}>Model<input className="input" value={model} onChange={e => setModel(e.target.value)} /></label>
          <div className="row" style={{ marginTop: 8 }}><button className="btn primary sm" onClick={() => { if (key.trim()) localStorage.setItem(AI_KEY, key.trim()); else localStorage.removeItem(AI_KEY); localStorage.setItem(AI_MODEL, model.trim() || 'gemini-2.5-flash'); changed(key.trim() ? 'Asistan açıldı' : 'Asistan kapatıldı'); }}>Kaydet</button>
            {localStorage.getItem(AI_KEY) && <button className="btn sm danger" onClick={() => { localStorage.removeItem(AI_KEY); setKey(''); changed('Anahtar silindi'); }}>Anahtarı sil</button>}</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginBottom: 8 }}>Veri kaynakları ve lisanslar</h3>
        <ul className="small" style={{ paddingLeft: 18 }}>
          {sv.ref.meta.sources.map((s: any) => <li key={s.code}><b>{s.name}</b> — {s.licence}. <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a></li>)}
          <li>Atıf: {sv.ref.meta.credit}</li>
          <li><b>Open Food Facts</b> — barkod ürünleri; veritabanı ODbL 1.0, içerik DbCL 1.0. openfoodfacts.org. Yalnızca taradığınız ürünler cihazınıza önbelleğe alınır.</li>
          <li><b>TürKomp</b> — uygulamada paketlenmez ve otomatik çekilmez. Kendi kullanımınız için bir değeri elle girebilirsiniz (kaynak: “TürKomp — kişisel”).</li>
          <li><b>FAO/INFOODS yoğunluk verileri</b> — izin alınana kadar paketlenmedi; hacim → ağırlık için USDA porsiyonları ve kendi tartımlarınız kullanılır.</li>
          <li>Açık kaynak: React (MIT), sql.js (MIT), fflate (MIT), zxing-wasm (MIT), Tauri (MIT/Apache-2.0).</li>
        </ul>
        <div className="small muted">Referans veri sürümü: {sv.ref.meta.version} · {sv.ref.size.toLocaleString('tr-TR')} besin · Türkçe ad: {sv.ref.meta.checks?.turkishAliases} · Uygulama {APP_VERSION}</div>
        <div className="small muted" style={{ marginTop: 6 }}>Bu uygulama tıbbi tavsiye vermez. Hastalık, gebelik, yeme bozukluğu geçmişi veya ilaç kullanımı varsa hedefleri bir sağlık profesyoneliyle belirleyin.</div>
        <div className="hr" />
        <button className="btn sm danger" onClick={async () => { if (confirm('Tüm kişisel verileriniz bu cihazdan silinecek. Önce yedek aldınız mı?') && confirm('Emin misiniz? Bu işlem geri alınamaz.')) await replaceDb(null); }}>Tüm verileri sil</button>
      </div>
      {profileEdit && <Modal title="Profil" onClose={() => setProfileEdit(false)}><ProfileForm onDone={() => setProfileEdit(false)} /></Modal>}
    </div>
  );
}

function MeasureRow({ m }: { m: repo.UserMeasure }) {
  const { sv, changed } = useApp();
  const [name, setName] = useState(m.name_tr); const [ml, setMl] = useState<number | ''>(m.ml);
  const dirty = name !== m.name_tr || ml !== m.ml;
  return <tr><td><input className="input" value={name} onChange={e => setName(e.target.value)} /></td><td style={{ width: 110 }}><NumberInput value={ml} onChange={setMl} /></td><td className="small muted">ml</td>
    <td className="r">{dirty && <button className="btn sm primary" disabled={!(ml && ml > 0)} onClick={() => { repo.updateMeasure(sv.db, m.id, name, ml as number); changed('Ölçü güncellendi'); }}>Kaydet</button>}
      {!m.is_default && <button className="icon-btn" onClick={() => { repo.deleteMeasure(sv.db, m.id); changed(); }}><I.trash width={15} /></button>}</td></tr>;
}
export { PAL };
