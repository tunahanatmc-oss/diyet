import React from 'react';
import type { FoodView } from '../data/reference';
import { fmt } from './kit';

/** Ingredients, servings and assumptions of a ready-made dish (system recipe). */
export function DishInfo({ f, open }: { f: FoodView; open?: boolean }) {
  if (!f.dish) return null;
  const { def, result } = f.dish;
  return (
    <details className="tile" open={open} style={{ marginTop: 10 }} data-dish>
      <summary className="small sb" style={{ cursor: 'pointer' }}>Tarif: {def.servings} porsiyon{def.pieces ? ` · ${def.pieces} adet` : ''} · toplam ≈{fmt(result.totalG)} g · 1 porsiyon ≈{fmt(result.servingG)} g</summary>
      <table className="t" style={{ marginTop: 8 }}><tbody>
        {result.ingredients.map((x, n) => <tr key={n}><td className="small">{x.name_tr}{x.note ? <div className="tiny muted">{x.note}</div> : null}</td>
          <td className="r num small">{fmt(x.grams)} g{x.cookedAs ? <div className="tiny muted">pişmiş ≈{fmt(x.massG)} g</div> : null}</td></tr>)}
      </tbody></table>
      <div className="tiny muted" style={{ marginTop: 6, lineHeight: 1.5 }}>{def.method_tr}</div>
      <div className="tiny muted" style={{ marginTop: 6, lineHeight: 1.5 }}>Tahmini: standart ev tarifi, değerler USDA malzemelerinden uygulamanın tarif motoruyla hesaplandı. {[...(def.notes ?? []), ...result.warnings].join(' ')} Kendi tarifini Mutfak’ta tartarak daha kesin yapabilirsin.</div>
    </details>
  );
}
