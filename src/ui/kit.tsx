import React, { useEffect } from 'react';
import type { ValueType } from '../engine';
import { I } from './icons';

export const VT_TR: Record<ValueType, string> = { measured: 'ölçülmüş', sourced: 'kaynaklı', estimated: 'tahmini', missing: 'eksik' };
export const VT_HELP: Record<ValueType, string> = {
  measured: 'Laboratuvar analizi veya sizin tartımınız',
  sourced: 'Kaynakta hesaplanmış/türetilmiş değer (ör. USDA SR Legacy)',
  estimated: 'Uygulamanın varsayımlarla hesapladığı değer (yoğunluk, porsiyon ölçekleme, verim)',
  missing: 'Kaynakta değer yok — sıfır sayılmaz',
};
const cap = (x: string) => x.charAt(0).toLocaleUpperCase('tr') + x.slice(1);
export function Badge({ t, label, icon = true }: { t: ValueType; label?: string; icon?: boolean }) {
  const Ic = t === 'missing' ? I.alert : t === 'estimated' ? null : I.checkCircle;
  return <span className={'chip vt-' + t} title={VT_HELP[t]}>{icon && (Ic ? <Ic /> : <i className="dot" style={{ background: 'currentColor', width: 6, height: 6 }} />)}{label ?? cap(VT_TR[t])}</span>;
}
/** Visible-but-disabled marker for features that do not exist yet (no fake numbers). */
export function Soon({ label = 'Yakında' }: { label?: string }) { return <span className="chip soon" title="Bu özellik henüz yok; değer gösterilmez veya tahmin edilmez.">{label}</span>; }
export function Logo({ compact }: { compact?: boolean }) {
  return <div className="logo"><span className="mark"><I.logo width={20} strokeWidth={2.2} /></span>{!compact && <div><div className="t1">Beslenme</div><div className="t2">ZEKÂSI</div></div>}</div>;
}
export function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toLocaleUpperCase('tr')).join('') || '•'; }

const nf = (d: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export function fmt(v: number | null | undefined, d = 0): string { return v == null || Number.isNaN(v) ? '—' : nf(d).format(v); }
export function fmtN(code: string, v: number | null | undefined): string {
  if (v == null) return '—';
  if (code === 'energy_kcal') return fmt(v, 0);
  if (code.endsWith('_mg') || code.endsWith('_ug')) return fmt(v, v < 10 ? 1 : 0);
  return fmt(v, 1);
}
export function parseNum(s: string): number { return Number(String(s).replace(',', '.')); }

export function Modal({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
        <div className="card-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Kapat"><I.close width={20} /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)} type="button">{l}</button>)}</div>;
}

/** Progress ring. `p` = fraction shown as arc (remaining budget in the design: arc = remaining / target). */
export function Ring({ value, max, size = 150, stroke = 12, label, sub, children }: { value: number; max: number; size?: number; stroke?: number; label?: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  const r = size / 2 - stroke / 2 - 1; const c = 2 * Math.PI * r; const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0; const over = max > 0 && value > max;
  return (
    <div className="ringwrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--track)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={over ? 'var(--orange)' : 'var(--accent)'} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .5s' }} />
      </svg>
      <div className="c">{children ?? <div><div className="ring-big">{label}</div><div className="ring-sub">{sub}</div></div>}</div>
    </div>
  );
}

export function MacroBar({ name, value, target, unit = 'g', incomplete }: { name: string; value: number; target?: number | null; unit?: string; incomplete?: boolean }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="macro">
      <div className="row"><span>{name} {incomplete && <span className="chip vt-missing">eksik veri</span>}</span><span className="num muted">{fmt(value, 0)}{target ? ` / ${fmt(target, 0)}` : ''} {unit}</span></div>
      <div className={'bar' + (target && value > target ? ' over' : '')}><i style={{ width: pct + '%' }} /></div>
    </div>
  );
}

export function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [msg, onDone]);
  return <div className="toast" role="status">{msg}</div>;
}

export function NumberInput({ value, onChange, ...p }: { value: number | ''; onChange: (v: number | '') => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [s, setS] = React.useState(value === '' ? '' : String(value).replace('.', ','));
  React.useEffect(() => { const cur = s === '' ? '' : parseNum(s); if (cur !== value) setS(value === '' ? '' : String(value).replace('.', ',')); /* eslint-disable-next-line */ }, [value]);
  return <input className="input num" inputMode="decimal" value={s} onChange={e => { setS(e.target.value); const n = parseNum(e.target.value); onChange(e.target.value === '' || Number.isNaN(n) ? '' : n); }} {...p} />;
}
