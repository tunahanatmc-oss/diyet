import React, { useState } from 'react';
import { useApp } from '../store';
import * as repo from '../data/repo';
import { ACTIVITY_TR, type Activity } from '../engine';
import { NumberInput, Seg, fmt, Logo } from '../ui/kit';
import { canPickFolder, pickBackupFolder } from '../data/files';
import { TargetsView } from './Settings';
import { localDateTime, todayIso } from '../data/services';
import { I } from '../ui/icons';

export function ProfileForm({ onDone, withWeight }: { onDone: () => void; withWeight?: boolean }) {
  const { sv, changed } = useApp();
  const p0 = repo.getProfile(sv.db);
  const [sex, setSex] = useState<'male' | 'female'>(p0?.sex ?? 'male');
  const [birth, setBirth] = useState(p0?.birth_date ?? '');
  const [h, setH] = useState<number | ''>(p0?.height_cm ?? '');
  const [w, setW] = useState<number | ''>(sv.currentWeight() ? Math.round(sv.currentWeight()! * 10) / 10 : '');
  const [act, setAct] = useState<Activity>((p0?.activity_level as Activity) ?? 'light');
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>(p0?.goal ?? 'lose');
  const [rate, setRate] = useState<number | ''>(p0?.goal_rate_kg_per_week ?? 0.5);
  const [prot, setProt] = useState<number | ''>(p0?.protein_per_kg ?? 1.6);
  const [fat, setFat] = useState<number | ''>(p0 ? Math.round(p0.fat_fraction * 100) : 30);
  const [name, setName] = useState(sv.userName());
  const [gw, setGw] = useState<number | ''>(sv.goalWeight() ?? '');
  const ok = birth && h && h > 100 && (!withWeight || (w && w > 25)) && rate !== '' && prot && fat;
  return (
    <div className="col">
      <label className="f">Adınız (selamlama için, yalnızca bu cihazda)<input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="ör. Tunahan" autoComplete="given-name" /></label>
      <div className="row"><span className="small">Cinsiyet (formül için)</span><Seg value={sex} options={[['male', 'Erkek'], ['female', 'Kadın']]} onChange={setSex} /></div>
      <div className="grid g3">
        <label className="f">Doğum tarihi<input className="input" type="date" value={birth} onChange={e => setBirth(e.target.value)} /></label>
        <label className="f">Boy (cm)<NumberInput value={h} onChange={setH} /></label>
        {withWeight && <label className="f">Kilo (kg)<NumberInput value={w} onChange={setW} /></label>}
      </div>
      <label className="f">Aktivite<select className="input" value={act} onChange={e => setAct(e.target.value as Activity)}>{(Object.keys(ACTIVITY_TR) as Activity[]).map(a => <option key={a} value={a}>{ACTIVITY_TR[a]}</option>)}</select></label>
      <div className="row"><span className="small">Hedef</span><Seg value={goal} options={[['lose', 'Kilo ver'], ['maintain', 'Koru'], ['gain', 'Kilo al']]} onChange={setGoal} />
        {goal !== 'maintain' && <><div style={{ width: 90 }}><NumberInput value={rate} onChange={setRate} /></div><span className="small">kg/hafta</span></>}</div>
      {goal !== 'maintain' && <label className="f" style={{ maxWidth: 260 }}>Hedef kilo (kg, isteğe bağlı — İlerleme ekranı için)<NumberInput value={gw} onChange={setGw} /></label>}
      {goal === 'lose' && rate !== '' && rate > 1 && <div className="warn small">Haftada 1 kg’dan hızlı kayıp çoğu kişi için sürdürülebilir değildir.</div>}
      <div className="grid g2">
        <label className="f">Protein (g/kg)<NumberInput value={prot} onChange={setProt} /></label>
        <label className="f">Yağ (% enerji)<NumberInput value={fat} onChange={setFat} /></label>
      </div>
      <button className="btn primary" disabled={!ok} onClick={() => {
        repo.saveProfile(sv.db, { sex, birth_date: birth, height_cm: h as number, activity_level: act, goal, goal_rate_kg_per_week: goal === 'maintain' ? 0 : (rate as number), uses_scale: p0?.uses_scale ?? 1, language: p0?.language ?? 'tr', protein_per_kg: prot as number, fat_fraction: (fat as number) / 100 });
        if (withWeight && w) repo.addMetric(sv.db, 'weight_kg', w as number, localDateTime());
        repo.setSetting(sv.db, 'user_name', name.trim() || null);
        repo.setSetting(sv.db, 'goal_weight_kg', goal !== 'maintain' && gw !== '' && gw > 20 ? String(gw) : null);
        changed(); onDone();
      }}>Devam</button>
    </div>
  );
}

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const { sv, changed } = useApp();
  const [step, setStep] = useState(0);
  const [folder, setFolder] = useState<string | null>(null);
  const ms = repo.measures(sv.db);
  const steps = 5;
  return (
    <div className="onb">
      <div className="card">
        <div className="dots">{Array.from({ length: steps }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        {step === 0 && <div className="col">
          <Logo />
          <h1>Hoş geldiniz</h1>
          <p className="muted">Kişisel beslenme ve kilo takibi. Hesap yok, internet gerekmez; verileriniz yalnızca bu cihazda. Her sayının nereden geldiğini görürsünüz: <b>ölçülmüş</b>, <b>kaynaklı</b>, <b>tahmini</b> veya <b>eksik</b>.</p>
          <div className="row"><span className="small">Dil</span><Seg value="tr" options={[['tr', 'Türkçe']]} onChange={() => {}} /></div>
          <button className="btn primary" onClick={() => setStep(1)}>Başlayalım</button>
        </div>}
        {step === 1 && <div className="col"><h2>Profiliniz ve hedefiniz</h2><p className="small muted">Bazal metabolizma ve hedef kalori için kullanılır.</p><ProfileForm withWeight onDone={() => setStep(2)} /></div>}
        {step === 2 && <div className="col"><h2>Hedefleriniz</h2><p className="small muted">Formül ve varsayımlar açıkça gösterilir; dilediğiniz zaman değiştirebilirsiniz.</p><TargetsView compact />
          <div className="row between"><button className="btn ghost" onClick={() => setStep(1)}>Geri</button><button className="btn primary" onClick={() => { if (!repo.targetOn(sv.db, todayIso())) { sv.saveComputedTargets(repo.getProfile(sv.db)!, sv.currentWeight()!); changed(); } setStep(3); }}>Devam</button></div></div>}
        {step === 3 && <div className="col"><h2>Ev ölçüleri</h2><p className="small muted">Varsayılanlar aşağıda. Bardak ve kaşıklarınız farklıysa Ayarlar’dan değiştirin; en doğrusu bir kez tartmak.</p>
          <ul>{ms.map(m => <li key={m.id}>1 {m.name_tr} = {fmt(m.ml)} ml</li>)}</ul>
          <div className="info small">Hacim yalnızca besine özel bir porsiyon ağırlığı veya sizin tartımınız varsa grama çevrilir. Veri yoksa uygulama tahmin uydurmaz, tartmanızı ister.</div>
          <div className="row between"><button className="btn ghost" onClick={() => setStep(2)}>Geri</button><button className="btn primary" onClick={() => setStep(4)}>Tamam</button></div></div>}
        {step === 4 && <div className="col"><h2>Yedekleme</h2>
          <p className="small muted">Verileriniz cihazda kalır. Kaybolmaması için düzenli yedek alın.</p>
          {canPickFolder() ? <button className="btn" onClick={async () => { try { setFolder(await pickBackupFolder()); repo.setSetting(sv.db, 'auto_backup', '1'); changed(); } catch { /* cancel */ } }}>{folder ? `Klasör: ${folder}` : 'Haftalık otomatik yedek klasörü seç (isteğe bağlı)'}</button>
            : <div className="small">iPhone’da: Ayarlar &gt; Yedeği indir ile dosyayı iCloud Drive’a kaydedin. Uygulama haftada bir hatırlatır.</div>}
          <div className="row between"><button className="btn ghost" onClick={() => setStep(3)}>Geri</button><button className="btn primary" onClick={() => { repo.setSetting(sv.db, 'onboarded', '1'); changed(); onFinish(); }}>Bitir</button></div></div>}
      </div>
    </div>
  );
}
