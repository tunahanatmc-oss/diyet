import { describe, it, expect } from 'vitest';
import {
  parseSizeLevel, sizeGroupKey, sizeGroups, primarySizeGroup, defaultSizeOption, sizeGrams,
  eggClassGrams, eggPrepFactor, isWholeHenEgg, eggPrepFor, EU_EGG_CLASSES, type Portion,
} from './index';

const P = (label: string, g: number, unit = 'piece'): Portion => ({ label, amount: 1, unit, gram_weight: g, source: 'USDA SR Legacy', value_type: 'sourced' });
// real USDA SR Legacy rows
const banana = [P('extra small (less than 6" long)', 81, 'other'), P('small (6" to 6-7/8" long)', 101), P('medium (7" to 7-7/8" long)', 118), P('large (8" to 8-7/8" long)', 136), P('extra large (9" or longer)', 152), P('cup, mashed', 225, 'cup')];
const orange = [P('cup, sections', 180, 'cup'), P('large (3-1/16" dia)', 184), P('small (2-3/8" dia)', 96), P('fruit (2-5/8" dia)', 131, 'other')];
const lettuce = [P('head, large', 755, 'other'), P('head, medium (6" dia)', 539, 'other'), P('head, small', 324, 'other'), P('leaf, large', 15, 'other'), P('leaf, medium', 8, 'other'), P('leaf, small', 5, 'other')];
const rawEgg = [P('large', 50), P('extra large', 56), P('jumbo', 63), P('cup (4.86 large eggs)', 243, 'cup'), P('medium', 44), P('small', 38)];

describe('size portions', () => {
  it('parses size words, ignoring parentheses', () => {
    expect(parseSizeLevel('extra large (9" or longer)')).toBe('xl');
    expect(parseSizeLevel('extra small (2-1/2" dia)')).toBe('xs');
    expect(parseSizeLevel('Potato medium (2-1/4" to 3-1/4" dia)')).toBe('m');
    expect(parseSizeLevel('cup (4.86 large eggs)')).toBeNull();
    expect(parseSizeLevel('jumbo')).toBe('jumbo');
  });
  it('group keys', () => {
    expect(sizeGroupKey('head, medium (6" dia)')).toBe('head');
    expect(sizeGroupKey('Potato large (3" to 4-1/4" dia)')).toBe('');
    expect(sizeGroupKey('large whole (3" dia)')).toBe('');
    expect(sizeGroupKey('slice, thick/large (1/2" thick)')).toBe('slice');
  });
  it('banana: 5 sizes, default medium 118 g, volume rows ignored', () => {
    const g = primarySizeGroup(sizeGroups(banana))!;
    expect(g.options.map(o => o.level)).toEqual(['xs', 's', 'm', 'l', 'xl']);
    const d = defaultSizeOption(g); expect(d.level).toBe('m'); expect(d.grams).toBe(118); expect(d.value_type).toBe('sourced');
    expect(sizeGrams(d, 2)).toBe(236);
  });
  it('orange: unsized whole fruit becomes the standard medium', () => {
    const g = primarySizeGroup(sizeGroups(orange))!;
    expect(g.options.map(o => [o.level, o.grams])).toEqual([['s', 96], ['m', 131], ['l', 184]]);
    expect(defaultSizeOption(g).standard).toBe(true);
  });
  it('lettuce: head and leaf groups', () => {
    const gs = sizeGroups(lettuce);
    expect(gs.map(g => g.key)).toEqual(['head', 'leaf']);
    expect(defaultSizeOption(gs[1]).grams).toBe(8);
  });
  it('remembered size wins; missing medium -> closest, ties larger', () => {
    const g = primarySizeGroup(sizeGroups(rawEgg))!;
    expect(defaultSizeOption(g, 'xl').grams).toBe(56);
    expect(defaultSizeOption(g, 'xs').level).toBe('m'); // not offered -> medium
    const sl = primarySizeGroup(sizeGroups([P('small', 10), P('large', 20)]))!;
    expect(defaultSizeOption(sl).level).toBe('l');
    expect(primarySizeGroup(sizeGroups([P('cup', 200, 'cup'), P('serving', 30, 'serving')]))).toBeNull();
  });
});

describe('eggs (EU classes)', () => {
  it('class grams = shell weight × (1 − 12 % shell)', () => {
    expect(EU_EGG_CLASSES.map(c => c.shellG)).toEqual([48, 58, 68, 76]);
    expect(eggClassGrams('S', 12).value).toBe(42.2);
    expect(eggClassGrams('M', 12).value).toBe(51);
    expect(eggClassGrams('L', 12).value).toBe(59.8);
    expect(eggClassGrams('XL', 12).value).toBe(66.9);
    expect(eggClassGrams('M', 12).value_type).toBe('estimated');
    expect(eggClassGrams('M', 12).warnings[0]).toMatch(/kabuk düşüldü/);
  });
  it('prep factor from USDA large portions', () => {
    expect(eggPrepFactor(50, 50)).toBe(1);
    expect(eggPrepFactor(46, 50)).toBeCloseTo(0.92);
    expect(eggClassGrams('M', 12, eggPrepFactor(46, 50)).value).toBe(47);
    expect(eggPrepFactor(null, 50)).toBe(1);
  });
  it('rejects bad input', () => {
    expect(() => eggClassGrams('M', 120)).toThrow();
    expect(() => eggClassGrams('Q' as any, 12)).toThrow();
  });
  it('detects whole hen eggs and their prep', () => {
    expect(isWholeHenEgg('Egg, whole, cooked, hard-boiled')).toBe(true);
    expect(isWholeHenEgg('Egg, whole, raw, fresh')).toBe(true);
    expect(isWholeHenEgg('Eggs, Grade A, Large, egg whole')).toBe(true);
    expect(isWholeHenEgg('Egg, white, raw, fresh')).toBe(false);
    expect(isWholeHenEgg('Egg, whole, dried')).toBe(false);
    expect(isWholeHenEgg('Egg, duck, whole, fresh, raw')).toBe(false);
    expect(eggPrepFor('Egg, whole, cooked, fried')?.code).toBe('fried');
  });
});
