/** Rule-based meal-plan filler (Stage 6, L3): greedily picks candidate items to approach a kcal target with protein priority. */
export interface PlanCandidate { id: string; kcal: number; protein_g: number; label: string }
export interface PlanPick { id: string; label: string; servings: number; kcal: number; protein_g: number }

export function fillToTarget(candidates: PlanCandidate[], targetKcal: number, targetProtein: number, maxItems = 4): PlanPick[] {
  const picks: PlanPick[] = [];
  let kcal = 0, prot = 0;
  const pool = candidates.filter(c => c.kcal > 0);
  for (let n = 0; n < maxItems && kcal < targetKcal * 0.95; n++) {
    const remK = targetKcal - kcal, remP = Math.max(0, targetProtein - prot);
    let best: PlanCandidate | null = null; let bestScore = -Infinity;
    for (const c of pool) {
      if (picks.some(p => p.id === c.id)) continue;
      if (c.kcal > remK * 1.15) continue;
      const sc = (remP > 0 ? (c.protein_g / c.kcal) * 100 : 0) - Math.abs(remK - c.kcal) / Math.max(remK, 1);
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    if (!best) break;
    picks.push({ id: best.id, label: best.label, servings: 1, kcal: best.kcal, protein_g: best.protein_g });
    kcal += best.kcal; prot += best.protein_g;
  }
  return picks;
}

/** Aggregate grocery quantities (grams) by food id. */
export function aggregateGrocery(items: { foodId: string; label: string; grams: number }[]): { foodId: string; label: string; grams: number }[] {
  const m = new Map<string, { foodId: string; label: string; grams: number }>();
  for (const i of items) { const e = m.get(i.foodId); if (e) e.grams += i.grams; else m.set(i.foodId, { ...i }); }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, 'tr'));
}
