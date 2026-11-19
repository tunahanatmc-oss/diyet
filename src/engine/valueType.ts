import type { ValueType } from './types';

const RANK: Record<ValueType, number> = { measured: 0, sourced: 1, estimated: 2, missing: 3 };

/** value_type of a combination = the weakest component (missing > estimated > sourced > measured). */
export function weakest(...types: ValueType[]): ValueType {
  let w: ValueType = 'measured';
  for (const t of types) if (RANK[t] > RANK[w]) w = t;
  return w;
}

export function round(x: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
