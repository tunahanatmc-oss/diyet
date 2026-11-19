import React, { useCallback, useEffect, useRef, useState } from 'react';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { Ctx, type Route } from './store';
import { openDb, type DB } from './data/db';
import { loadReference, type Reference } from './data/reference';
import { Services } from './data/services';
import { kvGet, kvSet, requestPersistence } from './data/persist';
import * as repo from './data/repo';
import { exportBackup } from './data/backup';
import { writeToBackupFolder } from './data/files';
import { Toast } from './ui/kit';
import { I, type IconName } from './ui/icons';
import { Logo, fmt, initials } from './ui/kit';
import { todayIso } from './data/services';
import { Today } from './screens/Today';
import { Log } from './screens/Log';
import { Foods } from './screens/Foods';
import { Recipes } from './screens/Recipes';
import { Plan } from './screens/Plan';
import { Progress } from './screens/Progress';
import { Assistant } from './screens/Assistant';
import { Settings } from './screens/Settings';
import { Onboarding } from './screens/Onboarding';

const NAV: [Route, string, IconName][] = [
  ['today', 'Bugün', 'today'], ['foods', 'Besin Veritabanı', 'foods'], ['recipes', 'Mutfak & Tarifler', 'recipes'], ['progress', 'İlerleme & Trend', 'progress'], ['settings', 'Ayarlar / Profil', 'settings'],
];
const TOOLS: [Route, string, IconName][] = [['plan', 'Haftalık Plan', 'plan'], ['assistant', 'Asistan', 'assistant']];
const TABS: [Route, string, IconName][] = [['today', 'Bugün', 'today'], ['foods', 'Besinler', 'foods'], ['log', 'Ekle', 'plus'], ['recipes', 'Mutfak', 'recipes'], ['progress', 'İlerleme', 'trendUp']];
export const TITLE: Record<Route, string> = { today: 'Bugün', log: 'Hızlı Ekle', foods: 'Besin Veritabanı', recipes: 'Mutfak & Tarifler', plan: 'Haftalık Plan', progress: 'İlerleme & Trend', assistant: 'Asistan', settings: 'Ayarlar / Profil', more: 'Menü' };
const M_TITLE: Partial<Record<Route, string>> = { today: 'Beslenme Zekâsı', foods: 'Besinler', recipes: 'Mutfak', progress: 'İlerleme', settings: 'Profil & Ayarlar', log: 'Hızlı Ekle', plan: 'Plan', assistant: 'Asistan' };
const locate = () => wasmUrl;

export default function App() {
  const [sv, setSv] = useState<Services | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [route, setRoute] = useState<Route>(() => (location.hash.slice(1) as Route) || 'today');
  const [param, setParam] = useState<any>(null);
  const [toastMsg, setToast] = useState('');
  const [more, setMore] = useState(false);
  const [onb, setOnb] = useState(false);
  const [remind, setRemind] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const refRef = useRef<Reference | null>(null);

  const persist = useCallback((db: DB) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { kvSet('personal.sqlite', db.export()).catch(e => setToast('Kaydedilemedi: ' + e.message)); }, 50);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [ref, bytes] = await Promise.all([loadReference(), kvGet<Uint8Array>('personal.sqlite')]);
        refRef.current = ref;
        const db = await openDb(bytes ?? null, locate);
        const s = new Services(db, ref); setSv(s);
        if (!bytes) persist(db);
        requestPersistence();
        if (repo.getSetting(db, 'onboarded') !== '1') setOnb(true);
        // weekly automatic backup (spec M11) / reminder
        const last = repo.lastBackup(db);
        const due = !last || Date.now() - Date.parse(last.datetime) > 7 * 86400000;
        if (due && repo.getSetting(db, 'onboarded') === '1') {
          let done = false;
          if (repo.getSetting(db, 'auto_backup') === '1') {
            try { const b = await exportBackup(db, ref.meta.version); const name = `diyet-otomatik-${new Date().toISOString().slice(0, 10)}.diyetbackup`; done = await writeToBackupFolder(name, b.bytes, false); if (done) { repo.addBackupLog(db, name, b.bytes.length, b.checksum, 'auto'); persist(db); } } catch { /* permission */ }
          }
          if (!done && (repo.logsBetween(db, '0000-01-01', '9999-12-31').length > 0)) setRemind(true);
        }
      } catch (e) { setError((e as Error).message); }
    })();
  }, [persist]);

  useEffect(() => { const h = () => setRoute((location.hash.slice(1) as Route) || 'today'); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const go = useCallback((r: Route, p?: any) => { setParam(p ?? null); setMore(false); if (r === 'more') { setMore(true); return; } location.hash = r; setRoute(r); window.scrollTo(0, 0); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); const t = document.querySelector('.tsearch input') as HTMLInputElement | null; if (t && t.offsetParent) t.focus(); else { go('foods'); setTimeout(() => (document.querySelector('[data-search]') as HTMLInputElement | null)?.focus(), 50); } }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); go('log'); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [go]);

  const changed = useCallback((msg?: string) => { if (sv) persist(sv.db); setVersion(v => v + 1); if (msg) setToast(msg); }, [sv, persist]);
  const replaceDb = useCallback(async (bytes: Uint8Array | null) => {
    const db = await openDb(bytes, locate);
    const s = new Services(db, refRef.current!); setSv(s); await kvSet('personal.sqlite', db.export()); setVersion(v => v + 1);
    if (!bytes || repo.getSetting(db, 'onboarded') !== '1') setOnb(true);
    setToast(bytes ? 'Veriler geri yüklendi' : 'Tüm veriler silindi');
  }, []);

  if (error) return <div className="onb"><div className="card"><h2>Açılamadı</h2><p className="err">{error}</p><button className="btn" onClick={() => location.reload()}>Yeniden dene</button></div></div>;
  if (!sv) return <div className="onb"><div className="col" style={{ alignItems: 'center' }}><Logo /><div className="muted small">Besin veritabanı yükleniyor…</div></div></div>;

  const ctx = { sv, version, changed, go, route, param, toast: setToast, replaceDb };
  if (onb) return <Ctx.Provider value={ctx}><Onboarding onFinish={() => { setOnb(false); go('today'); }} /></Ctx.Provider>;
  const Screen = { today: Today, log: Log, foods: Foods, recipes: Recipes, plan: Plan, progress: Progress, assistant: Assistant, settings: Settings, more: Today }[route] ?? Today;
  const name = sv.userName();
  const tgt = repo.targetOn(sv.db, todayIso());
  const prof = repo.getProfile(sv.db);
  const goalTxt = prof ? (prof.goal === 'lose' ? 'Kilo verme hedefi' : prof.goal === 'gain' ? 'Kilo alma hedefi' : 'Koruma hedefi') : 'Profil eksik';
  const dateTxt = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  const searchGo = (q: string) => go('foods', { q });
  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="side">
          <Logo />
          <div className="nav-label">NAVİGASYON</div>
          {NAV.map(([r, l, ic]) => { const Ic = I[ic]; return <button key={r} className={'nav-item' + (route === r ? ' active' : '')} onClick={() => go(r)}><Ic />{l}</button>; })}
          <div className="nav-label sm">ARAÇLAR</div>
          {TOOLS.map(([r, l, ic]) => { const Ic = I[ic]; return <button key={r} className={'nav-item' + (route === r ? ' active' : '')} onClick={() => go(r)}><Ic />{l}</button>; })}
          <div className="spacer" />
          <div className="goal-card"><div><div className="eyebrow" style={{ fontSize: 11 }}>GÜNLÜK HEDEF</div><div className="v num">{tgt ? fmt(tgt.kcal) : '—'}<small>kcal</small></div></div><span className="z"><I.zap width={18} /></span></div>
        </aside>
        <div className="mainwrap">
          <header className="topbar">
            <div className="crumb"><span>Platform</span><I.right /><b>{TITLE[route]}</b></div>
            <form className="tsearch" onSubmit={e => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value; if (v.trim()) searchGo(v.trim()); }}>
              <I.search /><input name="q" placeholder="Besin veya barkod ara..." aria-label="Besin veya barkod ara" /><span className="kbd">⌘K</span></form>
            <div className="grow" />
            <button className="btn-quick" onClick={() => go('log')}><I.plus width={18} /> Hızlı Ekle</button>
            <button className="bellbtn" title={remind ? 'Yedek hatırlatması' : 'Bildirim yok'} onClick={() => remind ? go('settings') : setToast('Yeni bildirim yok')}><I.bell width={20} />{remind && <i />}</button>
            <button className="prof" onClick={() => go('settings')}><span className="avatar top">{initials(name)}<i /></span><span><div className="n">{name || 'Profil'}</div><div className="s">{goalTxt}</div></span></button>
          </header>
          <header className="mhead">
            <span className="logo"><span className="mark"><I.logo width={18} strokeWidth={2.2} /></span></span>
            <div className="tt"><b>{M_TITLE[route] ?? TITLE[route]}</b><span><i className="dot" />{route === 'today' ? 'Bugün, ' + dateTxt : 'Performans Takibi'}</span></div>
            {route !== 'today' && <button className="icon-btn boxed" aria-label="Ara" onClick={() => { go('foods'); setTimeout(() => (document.querySelector('[data-search]') as HTMLInputElement | null)?.focus(), 60); }}><I.search width={20} /></button>}
            <button className="prof" style={{ marginLeft: 4 }} onClick={() => setMore(true)} aria-label="Menü"><span className="avatar top">{initials(name)}<i /></span></button>
          </header>
          <main className="main">
            {remind && <div className="warn row between" style={{ marginBottom: 14 }}><span>Son yedeğinizin üzerinden 7 günden fazla geçti.</span><span className="row"><button className="btn sm" onClick={() => { setRemind(false); go('settings'); }}>Yedek al</button><button className="btn sm ghost" onClick={() => setRemind(false)}>Sonra</button></span></div>}
            <Screen key={route + JSON.stringify(param ?? '')} />
          </main>
        </div>
      </div>
      <nav className="tabbar">{TABS.map(([r, l, ic]) => { const Ic = I[ic]; if (r === 'log') return <button key={r} className="tab fabt" onClick={() => go('log')} aria-label="Ekle"><span className="fab"><I.plus /></span>{l}</button>;
        return <button key={r} className={'tab' + (route === r ? ' active' : '')} onClick={() => go(r)}><Ic />{l}</button>; })}</nav>
      {more && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setMore(false)}><div className="modal"><div className="list">
        {[...NAV.filter(([r]) => r === 'settings'), ...TOOLS].map(([r, l, ic]) => { const Ic = I[ic]; return <button key={r} className="li" onClick={() => go(r)}><Ic width={22} /><div className="grow t">{l}</div><I.right width={18} /></button>; })}
      </div></div></div>}
      {toastMsg && <Toast msg={toastMsg} onDone={() => setToast('')} />}
    </Ctx.Provider>
  );
}
