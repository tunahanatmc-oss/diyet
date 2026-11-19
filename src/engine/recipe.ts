import type { ValueType } from './types';

export interface ScalableIngredient { grams: number }
export interface ScaleResult<T> { ingredients: T[]; cookedG: number | null; cookedType: ValueType | null; factor: number; warnings: string[] }

/** k = target_servings / servings (spec 5.5). Per-100 g values are unchanged by construction. */
export function scaleFactor(servings: number, targetServings: number): number {
  if (!(servings > 0) || !(targetServings > 0)) throw new Error('Porsiyon sayısı pozitif olmalı');
  return targetServings / servings;
}

export function scaleRecipe<T extends ScalableIngredient>(ingredients: T[], k: number, cookedG: number | null, cookedType: ValueType | null): ScaleResult<T> {
  const warnings: string[] = [];
  let ct = cookedType;
  if (cookedG && cookedType === 'measured' && k !== 1) {
    ct = 'estimated';
    warnings.push('Ölçeklenen tencerede buharlaşma farklı olur; pişmiş ağırlık tahmini. Mümkünse yeniden tartın.');
  }
  return { ingredients: ingredients.map(i => ({ ...i, grams: i.grams * k })), cookedG: cookedG ? cookedG * k : null, cookedType: ct, factor: k, warnings };
}
