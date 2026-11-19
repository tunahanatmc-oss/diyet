/** Accent-insensitive, Turkish-aware normalisation (spec 4.2: i/ı/İ/I all map to "i"). */
export function normalize(s: string): string {
  return s
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

export interface Searchable { key: string; tr: string; en: string; boost?: number }

/** Score a candidate: all query tokens must appear; prefix/word-start and Turkish-name matches rank higher. */
export function score(query: string, c: Searchable): number {
  const q = normalize(query); if (!q) return 0;
  const toks = q.split(' ');
  let s = 0;
  for (const t of toks) {
    const i = c.key.indexOf(t);
    if (i < 0) return 0;
    s += 1;
    if (i === 0 || c.key[i - 1] === ' ') s += 2;
    if (c.tr && c.tr.includes(t)) s += 3;
    if (c.tr && c.tr.startsWith(t)) s += 3;
  }
  if (c.tr && c.tr === q) s += 10;
  s -= c.key.length / 200;
  return s + (c.boost ?? 0);
}
