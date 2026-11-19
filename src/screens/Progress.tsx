import React, { useState } from 'react';
import { useApp } from '../store';
import * as repo from '../data/repo';
import { addDays, todayIso, localDateTime, MEAL_TR, type Meal } from '../data/services';
import { bmi, bmiCategory, BMI_TR, BMI_LIMITS_TR, satietyPer100kcal, correlation, trendOn, type TrendPoint } from '../engine';
import { Badge, fmt, Modal, NumberInput, Soon } from '../ui/kit';
import { I } from '../ui/icons';

export function WeightEntry({ onClose }: { onClose: () => void }) {
  const { sv, changed } = useApp();
  const [kg, setKg] = useState<number | ''>(sv.currentWeight() ? Math.round(sv.currentWeight()! * 10) / 10 : '');
  const [waist, setWaist] = useState<number | ''>('');
  const [dt, setDt] = useState(() => localDateTime().slice(0, 16));
  const [note, setNote] = useState('');
  const first = repo.metrics(sv.db, 'weight_kg').length === 0;
  return (
    <Modal title="Kilo gir" onClose={onClose}>
      <div className="col">
        {first && <div className="info small">İpucu: Tutarlı veri için sabah, tuvaletten sonra, yemeden önce tartılın.</div>}
        <div className="grid g2">
          <label className="f">Kilo (kg)<NumberInput value={kg} onChange={setKg} autoFocus /></label>
          <label className="f">Bel (cm, isteğe bağlı)<NumberInput value={waist} onChange={setWaist} /></label>
        </div>
        <label className="f">Tarih ve saat<input className="input" type="datetime-local" value={dt} onChange={e => setDt(e.target.value)} /></label>
        <label className="f">Not<input className="input" value={note} onChange={e => setNote(e.target.value)} /></label>
        <button className="btn primary" disabled={!(kg && kg > 20 && kg < 400)} onClick={() => {
          const iso = localDateTime(new Date(dt));
          repo.addMetric(sv.db, 'weight_kg', kg as number, iso, note || null);
          if (waist !== '' && waist > 0) repo.addMetric(sv.db, 'waist_cm', waist, iso);
          changed('Kilo kaydedildi'); onClose();
        }}>Kaydet</button>
      </div>
    </Modal>
  );
}

const MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const dshort = (d: string) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`;
function WeightChart({ pts, goal, phone }: { pts: TrendPoint[]; goal: number | null; phone?: boolean }) {
  const today = todayIso();
  if (pts.length < 2) return <div className="tile" style={{ textAlign: 'center', padding: 36, marginTop: 18 }}><I.chart width={28} style={{ color: 'var(--accent)' }} /><div className="sb" style={{ marginTop: 8 }}>Henüz Yeterli Tartı Yok</div><div className="small muted">Grafik için bu aralıkta en az 2 tartı gerekli.</div></div>;
  const W = phone ? 380 : 880, H = phone ? 300 : 330, L0 = phone ? 50 : 56, R = phone ? 20 : 40, T = 24, B = 44;
  const vals = pts.flatMap(p => [p.weight, p.trend]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (goal != null && goal > lo - 6 && goal < hi + 6) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
  lo = Math.floor(lo - 0.3); hi = Math.ceil(hi + 0.3); if (hi - lo < 2) hi = lo + 2;
  const t0 = Date.parse(pts[0].date), t1 = Math.max(t0 + 86400000, Date.parse(pts[pts.length - 1].date));
  const x = (d: string) => L0 + ((Date.parse(d) - t0) / (t1 - t0)) * (W - L0 - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const step = Math.max(1, Math.round((hi - lo) / (phone ? 4 : 5)));
  const ticks: number[] = []; for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  const line = pts.map(p => `${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join(' ');
  const area = `M${x(pts[0].date)},${H - B} L${line.split(' ').join(' L')} L${x(pts[pts.length - 1].date)},${H - B} Z`;
  const nx = phone ? 5 : 8; const spanD = Math.round((t1 - t0) / 86400000);
  const xl = Array.from({ length: Math.min(nx, spanD + 1) }, (_, i) => ({ date: addDays(pts[0].date, Math.round(i * spanD / (Math.min(nx, spanD + 1) - 1 || 1))) }));
  const last = pts[pts.length - 1]; const lx = x(last.date), ly = y(last.trend);
  const tw = phone ? 150 : 214, th = phone ? 52 : 58; const tx = Math.min(W - R - tw, Math.max(L0, lx - tw - 14)), ty = Math.max(4, ly - th - 26);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', marginTop: 18, overflow: 'visible' }} role="img" aria-label="Kilo ve trend grafiği">
      <defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      {ticks.map(v => <g key={v}><line x1={L0} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line-2)" strokeDasharray="0" opacity={.6} /><text x={L0 - 10} y={y(v) + 4} fontSize="11.5" fill="var(--muted)" textAnchor="end">{phone ? `${fmt(v)} kg` : fmt(v, 1)}</text></g>)}
      {goal != null && goal >= lo && goal <= hi && <g><line x1={L0 - 6} x2={W - R} y1={y(goal)} y2={y(goal)} stroke="var(--water)" strokeDasharray="5 5" strokeWidth={1.5} /><text x={L0 - 10} y={y(goal) + 4} fontSize="11.5" fontWeight="700" fill="var(--water)" textAnchor="end">{phone ? `${fmt(goal)} kg` : fmt(goal, 1)}</text>
        <text x={W - R} y={y(goal) - 8} fontSize="11" fill="var(--water)" textAnchor="end" opacity=".8">Hedef Çizgisi</text></g>}
      <path d={area} fill="url(#tg)" />
      {!phone && <polyline fill="none" stroke="var(--fat)" strokeOpacity=".55" strokeWidth={1} points={pts.map(p => `${x(p.date)},${y(p.weight)}`).join(' ')} />}
      <polyline fill="none" stroke="var(--accent)" strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" points={line} />
      {pts.map(p => <circle key={p.date} cx={x(p.date)} cy={y(p.weight)} r={phone ? 4.5 : 3.6} fill="var(--fat)" stroke={phone ? 'none' : 'var(--card)'} strokeWidth={1} />)}
      <line x1={lx} x2={lx} y1={T} y2={H - B} stroke="var(--accent)" strokeDasharray="3 4" opacity=".7" />
      <circle cx={lx} cy={ly} r={7} fill={phone ? 'var(--fat)' : 'var(--accent)'} stroke="var(--card)" strokeWidth={2.5} />
      <g transform={`translate(${tx},${ty})`}><rect width={tw} height={th} rx={10} fill="var(--card-3)" />
        {phone ? <><circle cx={14} cy={18} r={4} fill="var(--fat)" /><text x={24} y={22} fontSize="12.5" fontWeight="600" fill="var(--ink)">Tartı: {fmt(last.weight, 1)} kg</text>
          <circle cx={14} cy={38} r={4} fill="var(--accent)" /><text x={24} y={42} fontSize="12.5" fontWeight="600" fill="var(--ink)">Trend: {fmt(last.trend, 1)} kg</text></>
          : <><text x={12} y={20} fontSize="11" fill="var(--ink-2)">{dshort(last.date)}{last.date === today ? ' (Bugün)' : ''}</text><text x={tw - 12} y={20} fontSize="11" fill="var(--accent)" textAnchor="end" fontWeight="600">{last.trend <= pts[0].trend ? 'Düşüş' : 'Artış'}</text>
            <text x={12} y={44} fontSize="12.5" fill="var(--ink)">Tartı: <tspan fill="var(--fat)" fontWeight="700">{fmt(last.weight, 1)} kg</tspan></text><text x={tw - 12} y={44} fontSize="12.5" fill="var(--ink)" textAnchor="end">Trend: <tspan fill="var(--accent)" fontWeight="700">{fmt(last.trend, 2)} kg</tspan></text></>}</g>
      {xl.map((p, i) => <text key={p.date} x={x(p.date)} y={H - 14} fontSize="11.5" fill={i === xl.length - 1 ? 'var(--accent)' : 'var(--ink-2)'} fontWeight={i === xl.length - 1 ? 700 : 500} textAnchor={i === 0 ? 'start' : i === xl.length - 1 ? 'end' : 'middle'}>{p.date === today && i === xl.length - 1 ? (phone ? 'Bugün' : `${dshort(p.date)} (Bugün)`) : dshort(p.date)}</text>)}
    </svg>
  );
}

function InlineWeigh() {
  const { sv, changed } = useApp();
  const [kg, setKg] = useState<number | ''>(''); const [dt, setDt] = useState(() => localDateTime().slice(0, 16)); const [note, setNote] = useState('');
  return <div className="card p24">
    <div className="rc-head"><div className="row nowrap" style={{ gap: 10 }}><I.scale width={20} style={{ color: 'var(--accent)' }} /><h3 style={{ fontSize: 19 }}>Yeni Tartı Kaydet</h3></div><span className="tiny" style={{ color: 'var(--ink-2)' }}>Sabah aç karnına</span></div>
    <div className="grid g2" style={{ marginTop: 18, gap: 14 }}>
      <label className="f"><span className="eyebrow" style={{ fontSize: 10.5 }}>Ağırlık (kg)</span><NumberInput value={kg} onChange={setKg} placeholder={sv.currentWeight() ? fmt(sv.currentWeight(), 1) : 'kg'} style={{ fontSize: 22, fontWeight: 600, height: 50 }} /></label>
      <label className="f"><span className="eyebrow" style={{ fontSize: 10.5 }}>Tarih & Saat</span><input className="input" type="datetime-local" value={dt} onChange={e => setDt(e.target.value)} style={{ height: 50 }} /></label>
    </div>
    <label className="f" style={{ marginTop: 14 }}><span className="eyebrow" style={{ fontSize: 10.5 }}>Not / Faktör</span><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="ör. normal dinlenme, tuzlu akşam yemeği" /></label>
    <button className="btn primary glow block lg" style={{ marginTop: 18 }} disabled={!(kg && kg > 20 && kg < 400)} onClick={() => { repo.addMetric(sv.db, 'weight_kg', kg as number, localDateTime(new Date(dt)), note || null); setKg(''); setNote(''); changed('Tartı kaydedildi'); }}><I.checkCircle width={19} /> Tartıyı Kaydet</button>
  </div>;
}

export function Progress() {
  const { sv, version, changed, go } = useApp();
  const [entry, setEntry] = useState(false);
  const [allW, setAllW] = useState(false);
  const [range, setRange] = useState<'7' | '14' | '30' | '90' | '365'>('14');
  void version;
  const today = todayIso();
  const tr = sv.trendSummary(today);
  const p = repo.getProfile(sv.db);
  const b = p && tr.trend ? bmi(tr.trend, p.height_cm) : null;
  const ad = sv.adaptive(today);
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const end = addDays(today, -7 * i); const start = addDays(end, -6);
    const logs = repo.logsBetween(sv.db, start, end);
    const days = new Map<string, number>();
    for (const e of logs) days.set(e.datetime.slice(0, 10), (days.get(e.datetime.slice(0, 10)) ?? 0) + (sv.entryNutrients(e).energy_kcal?.value ?? 0));
    const avg = days.size ? [...days.values()].reduce((a, c) => a + c, 0) / days.size : null;
    const tgt = repo.targetOn(sv.db, end)?.kcal ?? null;
    return { start, end, days: days.size, avg, tgt, trendEnd: tr.series.length ? (tr.series.filter(x => x.date <= end).pop()?.trend ?? null) : null };
  });
  const sat = repo.satietyLogs(sv.db).map(s => {
    const dayLogs = repo.logsOn(sv.db, s.meal_datetime.slice(0, 10)).filter(e => e.meal === s.meal);
    const k = dayLogs.reduce((a, e) => a + (sv.entryNutrients(e).energy_kcal?.value ?? 0), 0);
    const pr = dayLogs.reduce((a, e) => a + (sv.entryNutrients(e).protein_g?.value ?? 0), 0);
    const fb = dayLogs.reduce((a, e) => a + (sv.entryNutrients(e).fiber_g?.value ?? 0), 0);
    return { ...(s as any), kcal: k, protein: pr, fiber: fb, per100: satietyPer100kcal({ kcal: k, protein_g: pr, fiber_g: fb, hunger_before: s.hunger_before, fullness_after: s.fullness_after, minutes_until_hungry: s.minutes_until_hungry }) };
  });
  const withMin = sat.filter(s => s.per100 != null && s.kcal > 0);
  const corrP = correlation(withMin.map(s => (s.protein * 4) / s.kcal), withMin.map(s => s.per100!));
  const weights = repo.metrics(sv.db, 'weight_kg').slice().reverse().slice(0, 12);
  const RANGES: [string, string][] = [['7', 'Son 7 Gün'], ['14', 'Son 14 Gün'], ['30', '30 Gün'], ['90', '3 Ay'], ['365', '1 Yıl']];
  const from = addDays(today, -(+range - 1));
  const pts = tr.series.filter(x => x.date >= from);
  const goal = sv.goalWeight();
  const first = tr.series[0];
  const toGo = goal != null && tr.trend != null ? tr.trend - goal : null;
  const pctDone = goal != null && first && tr.trend != null && first.trend !== goal ? Math.max(0, Math.min(100, (first.trend - tr.trend) / (first.trend - goal) * 100)) : null;
  // average daily intake on fully logged days in range vs. TDEE estimate (adaptive if available, else formula) - tahmini
  const rlogs = repo.logsBetween(sv.db, from, today); const byDay = new Map<string, number>(); const missDay = new Set<string>();
  for (const e of rlogs) { const d = e.datetime.slice(0, 10); const k = sv.entryNutrients(e).energy_kcal?.value; if (k == null) missDay.add(d); byDay.set(d, (byDay.get(d) ?? 0) + (k ?? 0)); }
  const fullDays = [...byDay.entries()].filter(([d]) => !missDay.has(d) && d !== today);
  const avgIn = fullDays.length ? fullDays.reduce((s2, [, v]) => s2 + v, 0) / fullDays.length : null;
  const w0 = sv.currentWeight();
  const tdeeEst = ad.ok ? (ad as any).estimate as number : p && w0 != null ? sv.computeTargets(p, w0).tdee : null;
  const deficit = avgIn != null && tdeeEst != null ? avgIn - tdeeEst : null;
  const towards = toGo != null && tr.weekly != null && tr.weekly !== 0 && Math.sign(tr.weekly) === -Math.sign(toGo);
  const weeksEta = towards ? Math.abs(toGo! / tr.weekly!) : null;
  const etaDate = weeksEta != null && weeksEta < 520 ? addDays(today, Math.round(weeksEta * 7)) : null;
  const waist = repo.metrics(sv.db, 'waist_cm').filter(m => m.datetime.slice(0, 10) >= from);
  const waistD = waist.length >= 2 ? waist[waist.length - 1].value - waist[0].value : null;
  const d7 = addDays(today, -6); const l7 = repo.logsBetween(sv.db, d7, today); const days7 = new Set(l7.map(e => e.datetime.slice(0, 10)));
  const p7 = days7.size ? l7.reduce((a2, e) => a2 + (sv.entryNutrients(e).protein_g?.value ?? 0), 0) / days7.size : null;
  let w7 = 0; for (let i = 0; i < 7; i++) w7 += repo.waterOn(sv.db, addDays(today, -i));
  const tgt = repo.targetOn(sv.db, today); const wT = Number(repo.getSetting(sv.db, 'water_target_ml') ?? 0);
  const trendFirst = pts[0]?.trend ?? null; const trendLast = pts[pts.length - 1]?.trend ?? null;
  const status = tr.weekly == null ? 'Veri Bekleniyor' : Math.abs(tr.weekly) < 0.1 ? 'Trend Sabit' : tr.weekly < 0 ? 'Trend Düşüşte' : 'Trend Artışta';
  const recent = repo.metrics(sv.db, 'weight_kg').slice().reverse().slice(0, allW ? undefined : 4);
  const sign = (v: number, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
  const Analysis = <div className="card p24">
    <div className="row between nowrap" style={{ alignItems: 'flex-start' }}><div className="row nowrap" style={{ gap: 14, alignItems: 'flex-start' }}>
      <span className="icon-btn boxed" style={{ background: 'var(--accent)', color: 'var(--accent-ink)', width: 34, height: 34 }}><I.brain width={19} /></span>
      <div><h3 style={{ fontSize: 19 }}>Beslenme Zekâsı Analizi</h3><div className="tiny lime sb" style={{ marginTop: 2 }}>{status}</div></div></div>
      <span className="eyebrow d-only" style={{ fontSize: 10 }}>Kural tabanlı · {pts.length} tartı</span></div>
    <div className="m-analysis" style={{ fontSize: 15.5, lineHeight: 1.7, marginTop: 18, color: 'var(--ink-2)' }}>
      {pts.length >= 2 && trendFirst != null && trendLast != null ? <>Seçili aralıkta (son {range} gün) trend kilon <b style={{ color: 'var(--ink)' }}>{fmt(trendFirst, 1)} → {fmt(trendLast, 1)} kg</b> oldu
        ({sign(trendLast - trendFirst, 2)} kg). Son 7 gündeki trend değişimi <b className="lime">{tr.weekly == null ? '—' : sign(tr.weekly, 2) + ' kg/hafta'}</b>. Trend, günlük su ve glikojen dalgalanmalarını yumuşatır (α = 0,1).
        {ad.ok ? <> Uyarlanabilir TDEE tahmini <b style={{ color: 'var(--ink)' }}>{fmt((ad as any).estimate)} kcal/gün</b>.</> : null}</>
        : <>Analiz için seçili aralıkta en az 2 tartı gerekli. Tutarlı sonuç için sabah, tuvaletten sonra, yemeden önce tartıl.</>}
    </div>
    <div className="tile grid g2 keep2" style={{ marginTop: 18, padding: 16 }}>
      <div className="row nowrap" style={{ gap: 12, alignItems: 'flex-start' }}><span className="icon-btn boxed" style={{ color: 'var(--water)' }}><I.list width={18} /></span><div><div className="tiny sb">Kayıtlı gün (aralık)</div><b style={{ fontSize: 24 }}>{byDay.size}<span className="small muted"> / {range}</span></b><div className="tiny lime">{fullDays.length} gün eksiksiz</div></div></div>
      <div className="row nowrap" style={{ gap: 12, alignItems: 'flex-start' }}><span className="icon-btn boxed" style={{ color: 'var(--fat)' }}><I.ruler width={18} /></span><div><div className="tiny sb">Bel Çevresi Trendi</div><b style={{ fontSize: 24 }}>{waistD == null ? '—' : sign(waistD, 1) + ' cm'}</b><div className="tiny c-y">{waistD == null ? 'en az 2 bel ölçümü gerekli' : `${waist.length} ölçüm`}</div></div></div>
    </div>
  </div>;

  return (
    <div>
      <div className="ph d-only">
        <div><div className="row" style={{ gap: 10 }}><span className="badge-live"><i className="dot" />Kilo Takibi</span><span className="tiny muted">• Üstel ağırlıklı trend (α = 0,1)</span></div>
          <h1>Kilo &amp; Trend Analizi</h1><div className="sub">Günlük su ve glikojen dalgalanmalarından arındırılmış trend kilo ve hedef tahminleri.</div></div>
        <div className="rangeseg">{RANGES.map(([v, l]) => <button key={v} className={range === v ? 'on' : ''} onClick={() => setRange(v as any)} dangerouslySetInnerHTML={{ __html: l.replace(' ', '<br/>') }} />)}</div>
      </div>
      <div className="m-only"><div className="pills">{RANGES.map(([v, l]) => <button key={v} className={'pill' + (range === v ? ' on' : '')} onClick={() => setRange(v as any)}>{l}</button>)}</div></div>
      <div className="pstats">
        <div className="pstat"><div className="h"><span className="eyebrow">Trend Kilo</span><span className="ib" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><I.waves width={18} /></span></div>
          <div className="big num">{fmt(tr.trend, 1)}<small>kg</small></div>
          <div className="ft">{tr.weekly != null ? <span className="lime sb row nowrap" style={{ gap: 4 }}>{tr.weekly <= 0 ? <I.trendDown width={15} /> : <I.trendUp width={15} />}{sign(tr.weekly, 1)} kg bu hafta</span> : <span>Haftalık değişim için veri yok</span>}<span className="d-only muted">| Tartı: {fmt(tr.latest?.weight, 1)}</span></div></div>
        <div className="pstat"><div className="h"><span className="eyebrow">Hedefe Kalan</span><span className="ib" style={{ background: 'var(--water-soft)', color: 'var(--water)' }}><I.flag width={18} /></span></div>
          {goal != null ? <><div className="big num c-w">{fmt(toGo == null ? null : Math.abs(toGo), 1)}<small>kg</small></div>
            <div className="ft" style={{ justifyContent: 'space-between' }}><span>Hedef: {fmt(goal, 1)} kg</span>{pctDone != null && <span className="c-w sb">%{fmt(pctDone)} Tamamlandı</span>}</div>
            <div className="bar w" style={{ height: 6, marginTop: 8 }}><i style={{ width: (pctDone ?? 0) + '%' }} /></div></>
            : <><div className="big muted">—</div><div className="ft"><button className="link" onClick={() => go('settings')}>Hedef kilo belirle</button></div></>}</div>
        <div className="pstat d-only"><div className="h"><span className="eyebrow">Ortalama Kalori Farkı</span><span className="ib" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><I.flame width={18} /></span></div>
          <div className="big num lime">{deficit == null ? '—' : sign(deficit, 0)}<small>kcal/gün</small></div>
          <div className="ft"><Badge t="estimated" /><span>{fullDays.length} tam gün · TDEE {fmt(tdeeEst)} ({ad.ok ? 'uyarlanabilir' : 'formül'})</span></div></div>
        <div className="pstat d-only"><div className="h"><span className="eyebrow">Hedefe Ulaşma Tahmini</span><span className="ib" style={{ background: 'rgba(251,146,60,.14)', color: 'var(--orange)' }}><I.history width={18} /></span></div>
          <div className="big num" style={{ color: 'var(--fat)' }}>{weeksEta == null ? '—' : '~' + fmt(weeksEta, 0)}<small>{weeksEta == null ? '' : 'Hafta'}</small></div>
          <div className="ft">{etaDate ? <>Öngörülen: <span className="chip neutral">{new Date(etaDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</span> <Badge t="estimated" /></> : <span>{goal == null ? 'Hedef kilo yok' : 'Trend hedefe doğru ilerlemiyor'}</span>}</div></div>
      </div>
      <div className="m-only"><div className="card row between nowrap" style={{ marginTop: 14, padding: '14px 18px' }}>
        <span className="row nowrap small sb" style={{ gap: 10 }}><i className="dot" style={{ background: 'var(--fat)', width: 9, height: 9 }} />Ortalama Günlük Kalori Farkı</span><b className="c-y" style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{deficit == null ? '—' : sign(deficit, 0) + ' kcal/gün'}</b></div></div>
      <div className="card chartcard">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div><h2 style={{ fontSize: 23, fontWeight: 600 }}>Kilo &amp; Trend Analizi</h2><div className="small" style={{ color: 'var(--ink-2)', marginTop: 4 }}>Gürültüden arındırılmış trend eğilimi</div></div>
          <div className="legend"><span><i style={{ background: 'var(--fat)' }} />Günlük Tartı</span><span><i className="ln" style={{ background: 'var(--accent)' }} />Düzeltilmiş Trend</span>{goal != null && <span className="c-w"><i className="ln" style={{ background: 'var(--water)', height: 2 }} />Hedef ({fmt(goal, 1)} kg)</span>}</div>
        </div>
        <div className="d-only"><WeightChart pts={pts} goal={goal} /></div>
        <div className="m-only"><WeightChart pts={pts} goal={goal} phone /></div>
      </div>
      <div className="m-only" style={{ marginTop: 16 }}>{Analysis}
        <button className="btn primary glow block lg" style={{ marginTop: 16, height: 60 }} onClick={() => setEntry(true)}><I.plus width={20} /> Yeni Tartı Kaydet <span className="chip" style={{ background: 'rgba(0,0,0,.14)', color: 'inherit' }}>{dshort(today)}</span></button></div>
      <div className="pgrid d-only">
        <div className="col" style={{ gap: 24 }}>{Analysis}
          <div className="card p24">
            <div className="rc-head"><h3 style={{ fontSize: 19 }}>Öğün Tutarlılığı</h3><span className="tiny" style={{ color: 'var(--ink-2)' }}>Son 7 gün · {days7.size} kayıtlı gün</span></div>
            <div className="grid g3" style={{ marginTop: 18, gap: 14 }}>
              <div className="tile"><div className="tiny sb c-p">PROTEİN ORT.</div><b style={{ fontSize: 20 }}>{fmt(p7)}g</b> <span className="small muted">/ {fmt(tgt?.protein_g)}g</span><div className="bar p" style={{ height: 4, marginTop: 10 }}><i style={{ width: p7 && tgt ? Math.min(100, p7 / tgt.protein_g * 100) + '%' : 0 }} /></div></div>
              <div className="tile"><div className="tiny sb c-y">SU ORT.</div><b style={{ fontSize: 20 }}>{fmt(w7 / 7000, 1)} L</b> <span className="small muted">/ gün</span><div className="bar y" style={{ height: 4, marginTop: 10 }}><i style={{ width: wT ? Math.min(100, w7 / 7 / wT * 100) + '%' : 0 }} /></div></div>
              <div className="tile" style={{ opacity: .8 }}><div className="tiny sb lime">NEAT / ADIM</div><div style={{ marginTop: 6 }}><Soon /></div><div className="tiny muted" style={{ marginTop: 6 }}>Cihaz eşitlemesi yok</div></div>
            </div>
          </div>
        </div>
        <div className="col" style={{ gap: 24 }}><InlineWeigh />
          <div className="card p24"><div className="rc-head"><h3 style={{ fontSize: 19 }}>Son Ölçümler</h3><button className="link tiny" onClick={() => setAllW(!allW)}>{allW ? 'Daralt' : `Tümünü Gör (${repo.metrics(sv.db, 'weight_kg').length})`}</button></div>
            {recent.map(m => { const d = m.datetime.slice(0, 10); return <div className="measure" key={m.id}>
              <div><div className="d">{dshort(d)}{d === today ? ' (Bugün)' : ''}</div><div className="n">{m.note || m.datetime.slice(11, 16)}</div></div>
              <div className="row nowrap" style={{ gap: 6 }}><div className="w"><b className="num">{fmt(m.value, 1)}<small>kg</small></b><span>Trend: {fmt(trendOn(tr.series, d), 2)} kg</span></div>
                <button className="icon-btn" aria-label="Sil" onClick={() => { repo.deleteMetric(sv.db, m.id); changed('Tartı silindi'); }}><I.trash width={15} /></button></div></div>; })}
            {!recent.length && <div className="small muted" style={{ padding: '14px 0' }}>Henüz tartı yok.</div>}</div>
        </div>
      </div>
      <div className="grid g2" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-head"><h3>Uyarlanabilir TDEE</h3><Badge t="estimated" /></div>
          {ad.ok ? <div className="col">
            <div className="row" style={{ gap: 24 }}>
              <div className="stat"><div className="l">Tahmin</div><div className="v">{fmt((ad as any).estimate)}</div><div className="small muted">kcal/gün</div></div>
              <div className="stat"><div className="l">Gözlenen (ham)</div><div className="v">{fmt((ad as any).observed)}</div><div className="small muted">kcal/gün</div></div>
            </div>
            <div className="small muted">Girdiler: {(ad as any).windowDays} gün; {(ad as any).loggedDays} gün tam kayıt; {(ad as any).weighIns} tartı; ort. alım {fmt((ad as any).mean)} kcal; trend {fmt((ad as any).tStart, 2)} → {fmt((ad as any).tEnd, 2)} kg; E = 7700 kcal/kg. {(ad as any).clamped ? 'Haftada en fazla 150 kcal oynatıldı.' : ''}</div>
            <button className="btn soft" onClick={() => { const pr = repo.getProfile(sv.db)!; const est = (ad as any).estimate as number; const c = sv.computeTargets(pr, sv.currentWeight()!); const delta = c.kcal - c.tdee; repo.setSetting(sv.db, 'adaptive_tdee_prev', String(est)); sv.saveComputedTargets(pr, sv.currentWeight()!, 'adaptive', Math.max(c.bmr, est + delta)); changed('Hedef uyarlanabilir TDEE ile güncellendi'); }}>Hedefi buna göre güncelle</button>
            <div className="tiny muted">Varsayım: kayıtlar eksiksiz; eksik kayıt tahmini düşürür. Su/glikojen değişimleri (diyet türü, kreatin, döngü) sonucu etkiler.</div>
          </div> : <div className="small muted">{(ad as any).reason} Uyarlanabilir tahmin için ~3 hafta düzenli kayıt ve en az 8 tartı gerekir.</div>}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>BMI hakkında</h3>
          <div className="small">Sınırlar (WHO yetişkin): &lt;18,5 zayıf · 18,5–24,9 normal · 25–29,9 fazla kilolu · ≥30 obez.</div>
          <ul className="small muted" style={{ paddingLeft: 18 }}>{BMI_LIMITS_TR.map(l => <li key={l}>{l}</li>)}</ul>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Haftalık rapor</h3>
        <div className="scroll-x"><table className="t"><thead><tr><th>Hafta</th><th className="r">Kayıtlı gün</th><th className="r">Ort. kcal</th><th className="r">Hedef</th><th className="r">Fark</th><th className="r">Trend (hafta sonu)</th></tr></thead><tbody>
          {weeks.map(w => <tr key={w.start}><td>{w.start} – {w.end.slice(5)}</td><td className="r">{w.days}/7</td><td className="r num">{fmt(w.avg)}</td><td className="r num">{fmt(w.tgt)}</td><td className="r num">{w.avg != null && w.tgt ? (w.avg - w.tgt > 0 ? '+' : '') + fmt(w.avg - w.tgt) : '—'}</td><td className="r num">{fmt(w.trendEnd, 1)}</td></tr>)}
        </tbody></table></div>
      </div>
      <div style={{ marginTop: 16 }}>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Tokluk notları</h3>
          {sat.length ? <table className="t"><thead><tr><th>Öğün</th><th className="r">kcal</th><th className="r">Açlık→Tokluk</th><th className="r">Dk/100 kcal</th></tr></thead><tbody>
            {sat.slice(0, 10).map(s => <tr key={s.id}><td className="small">{s.meal_datetime.slice(0, 10)} {MEAL_TR[s.meal as Meal]}</td><td className="r num">{fmt(s.kcal)}</td><td className="r">{s.hunger_before}→{s.fullness_after}</td><td className="r num">{fmt(s.per100, 0)}</td></tr>)}
          </tbody></table> : <div className="small muted">Bugün ekranındaki “Tokluk” düğmesiyle öğün sonrası açlık/tokluk girin.</div>}
          {corrP != null && <div className="small" style={{ marginTop: 8 }}>Protein oranı ile tokluk süresi arasındaki ilişki (r): <b>{fmt(corrP, 2)}</b> <span className="muted">— {withMin.length} öğün; nedensellik göstermez.</span></div>}
        </div>
      </div>
      {entry && <WeightEntry onClose={() => setEntry(false)} />}
    </div>
  );
}
