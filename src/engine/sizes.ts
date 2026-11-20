import type { ValueType } from './types';
import type { Portion } from './measures';

/**
 * Size-based portions (spec M6 extension): turns USDA "small / medium / large ..." household portions into
 * a size picker. Data-driven only: every gram weight comes from a source portion, nothing is invented.
 */
export type SizeLevel = 'xs' | 's' | 'm' | 'l' | 'xl' | 'jumbo';
export const SIZE_ORDER: SizeLevel[] = ['xs', 's', 'm', 'l', 'xl', 'jumbo'];
export const SIZE_TR: Record<SizeLevel, string> = { xs: 'Çok küçük', s: 'Küçük', m: 'Orta', l: 'Büyük', xl: 'Çok büyük', jumbo: 'Jumbo' };

export interface SizeOption {
  level: SizeLevel;
  label_tr: string;        // "Orta" / "Orta (standart)"
  grams: number;           // grams of ONE item of this size
  portionLabel: string;    // original source label, e.g. 'medium (7" to 7-7/8" long)'
  source: string;
  value_type: ValueType;
  standard?: boolean;      // an unsized "whole fruit" portion used as the medium/standard size
}
export interface SizeGroup { key: string; label_tr: string; options: SizeOption[] }

const VOLUME_UNITS = new Set(['cup', 'tbsp', 'tsp', 'floz']);
// nouns that just mean "one whole item" — dropped from the group key so 'Potato large' and 'large' share a group
const WHOLE_NOUNS = new Set(['adet', 'whole', 'fruit', 'each', 'potato', 'melon', 'pepper', 'artichoke', 'pita', 'link', 'piece', 'item', 'egg', 'eggs', 'thick', 'thin', 'nlea']);
const GROUP_TR: Record<string, string> = {
  '': 'Adet (bütün)', kase: 'Kase', tabak: 'Tabak', head: 'Baş (bütün)', leaf: 'Yaprak', slice: 'Dilim', wedge: 'Kama dilim', stalk: 'Sap', spear: 'Filiz',
  pot: 'Demlik', ear: 'Koçan', strip: 'Çubuk', drink: 'İçecek', package: 'Paket', box: 'Kutu', sausage: 'Sosis', bunch: 'Demet', clove: 'Diş', floret: 'Çiçek',
};

/** Size level of a portion label (text in parentheses ignored, e.g. 'cup (4.86 large eggs)' has no size). */
/** Turkish size words used by the ready-made dishes ("orta kase") -> the English words below. */
const trSize = (label: string) => (' ' + label.toLowerCase() + ' ').replace(/ küçük /g, ' small ').replace(/ orta /g, ' medium ').replace(/ büyük /g, ' large ').trim();
export function parseSizeLevel(label: string): SizeLevel | null {
  const t = trSize(label).replace(/\([^)]*\)/g, ' ');
  if (/\bextra[\s-]*small\b/.test(t)) return 'xs';
  if (/\bextra[\s-]*large\b/.test(t)) return 'xl';
  if (/\bjumbo\b/.test(t)) return 'jumbo';
  if (/\bmedium\b/.test(t)) return 'm';
  if (/\bsmall\b/.test(t)) return 's';
  if (/\blarge\b/.test(t)) return 'l';
  return null;
}

/** Group key: the label without sizes, parentheses, punctuation and "whole item" nouns ('head, large' -> 'head'). */
export function sizeGroupKey(label: string): string {
  const t = trSize(label).replace(/\([^)]*\)/g, ' ').replace(/\b(extra[\s-]*small|extra[\s-]*large|small|medium|large|jumbo|yields|whole)\b/g, ' ')
    .replace(/[^a-zçğıöşü ]+/g, ' ');
  return t.split(/\s+/).filter(w => w && !WHOLE_NOUNS.has(w)).map(w => w.replace(/s$/, '')).join(' ');
}

/** All size groups of a food, in source order; options sorted small -> large. */
export function sizeGroups(portions: Portion[]): SizeGroup[] {
  const groups = new Map<string, SizeGroup>();
  const unsized: { key: string; p: Portion }[] = [];
  for (const p of portions) {
    if (!(p.gram_weight > 0) || VOLUME_UNITS.has(p.unit)) continue;
    const label = p.label ?? p.unit;
    const level = parseSizeLevel(label);
    const key = sizeGroupKey(label);
    if (!level) { unsized.push({ key, p }); continue; }
    if (!groups.has(key)) groups.set(key, { key, label_tr: GROUP_TR[key] ?? key, options: [] });
    const g = groups.get(key)!;
    if (g.options.some(o => o.level === level)) continue; // duplicate measurement: keep the first source row
    g.options.push({ level, label_tr: SIZE_TR[level], grams: p.gram_weight / (p.amount || 1), portionLabel: label, source: p.source ?? 'USDA', value_type: p.value_type ?? 'sourced' });
  }
  for (const g of groups.values()) {
    // a "whole fruit" portion (e.g. orange 'fruit (2-5/8" dia)') between small and large is the standard / medium size
    if (!g.options.some(o => o.level === 'm') && g.options.length >= 2) {
      const min = Math.min(...g.options.map(o => o.grams)), max = Math.max(...g.options.map(o => o.grams));
      const std = unsized.find(u => u.key === g.key && ['piece', 'other'].includes(u.p.unit) && u.p.gram_weight / (u.p.amount || 1) > min && u.p.gram_weight / (u.p.amount || 1) < max);
      if (std) g.options.push({ level: 'm', label_tr: 'Orta (standart)', grams: std.p.gram_weight / (std.p.amount || 1), portionLabel: std.p.label ?? std.p.unit, source: std.p.source ?? 'USDA', value_type: std.p.value_type ?? 'sourced', standard: true });
    }
    g.options.sort((a, b) => SIZE_ORDER.indexOf(a.level) - SIZE_ORDER.indexOf(b.level));
  }
  return [...groups.values()];
}

/** The group shown first: the whole-item group when there is one, else the one with most sizes. */
export function primarySizeGroup(groups: SizeGroup[]): SizeGroup | null {
  if (!groups.length) return null;
  return groups.find(g => g.key === '') ?? [...groups].sort((a, b) => b.options.length - a.options.length)[0];
}

/** Default size: the remembered one if still offered, else medium, else the size closest to medium (ties -> larger). */
export function defaultSizeOption(g: SizeGroup, remembered?: SizeLevel | null): SizeOption {
  if (remembered) { const r = g.options.find(o => o.level === remembered); if (r) return r; }
  const mi = SIZE_ORDER.indexOf('m');
  return [...g.options].sort((a, b) => {
    const da = Math.abs(SIZE_ORDER.indexOf(a.level) - mi), db = Math.abs(SIZE_ORDER.indexOf(b.level) - mi);
    return da - db || SIZE_ORDER.indexOf(b.level) - SIZE_ORDER.indexOf(a.level);
  })[0];
}

/** grams for n items of a size (n can be fractional, e.g. 0.5). */
export function sizeGrams(opt: { grams: number }, count: number): number {
  return count > 0 ? opt.grams * count : 0;
}
