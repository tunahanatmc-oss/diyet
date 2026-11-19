import { describe, it, expect } from 'vitest';
import {
  nutrientAmount, nutrientsFor, sumProfiles, weakest, yieldRatio, cookedToRaw, rawToCooked, per100Cooked,
  addedFatNutrients, edibleGrams, resolveVolume, EngineError, scaleRecipe, scaleFactor, bmrMifflin, tdee,
  macroTargets, bmi, bmiCategory, trendStep, alphaEff, adaptiveTdee, tdeeObserved, normalize, goalTarget,
  cookBatch, trendSeries, weeklyChange, per100Of,
} from './index';

const close = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const rice = { energy_kcal: { value: 360, type: 'sourced' as const }, fat_g: { value: 1, type: 'sourced' as const } };
const oil = { energy_kcal: { value: 900, type: 'sourced' as const }, fat_g: { value: 100, type: 'sourced' as const } };

describe('spec 7.1 engine tests (synthetic fixtures)', () => {
  it('T1 nutrients', () => close(nutrientAmount(360, 180)!, 648));
  it('T2 cook per100', () => close(per100Cooked(648, 520), 124.62));
  it('T3 yield', () => close(yieldRatio(180, 520), 2.889, 0.001));
  it('T4 cooked->raw', () => {
    const raw = cookedToRaw(250, 2.889); close(raw, 86.54); close(nutrientAmount(360, raw)!, 311.5, 0.05);
  });
  it('T5 added fat', () => close(addedFatNutrients(oil, 10, 50).energy_kcal.value!, 45));
  it('T6 refuse', () => close(edibleGrams(300, 25), 225));
  it('T7 volume density', () => {
    const r = resolveVolume({ n: 1, measureMl: 200, densityGPerMl: 0.8 }); close(r.value, 160); expect(r.value_type).toBe('estimated');
  });
  it('T8 calibration beats density', () => {
    const r = resolveVolume({ n: 1, measureMl: 200, densityGPerMl: 0.8, calibrationG: 150 }); close(r.value, 150); expect(r.value_type).toBe('measured');
  });
  it('T9 no data -> NO_WEIGHT_DATA', () => {
    try { resolveVolume({ n: 1, measureMl: 200 }); throw new Error('should throw'); }
    catch (e) { expect(e).toBeInstanceOf(EngineError); expect((e as EngineError).code).toBe('NO_WEIGHT_DATA'); }
  });
  it('T10 custom measure 250 ml', () => close(resolveVolume({ n: 1, measureMl: 250, densityGPerMl: 0.8 }).value, 200));
  it('T11 portion scaling', () => close(resolveVolume({ n: 1, measureMl: 200, portions: [{ unit: 'cup', amount: 1, gram_weight: 185 }] }).value, 156.38));
  it('T12 recipe scaling', () => {
    const ings = [{ grams: 200 }, { grams: 60 }];
    const k = scaleFactor(6, 3); const s = scaleRecipe(ings, k, 1200, 'measured');
    expect(s.ingredients.map(i => i.grams)).toEqual([100, 30]);
    const a = cookBatch({ ingredients: [{ per100: rice, grams: 200 }], cookedG: 1200 });
    const b = cookBatch({ ingredients: [{ per100: rice, grams: 100 }], cookedG: s.cookedG! });
    close(a.per100!.energy_kcal.value!, b.per100!.energy_kcal.value!);
    expect(s.cookedType).toBe('estimated');
  });
  it('T13 BMR man', () => close(bmrMifflin(80, 180, 30, 'male'), 1780));
  it('T14 BMR woman', () => close(bmrMifflin(60, 165, 30, 'female'), 1320.25));
  it('T15 TDEE', () => close(tdee(1780, 'moderate'), 2759));
  it('T16 macros', () => {
    const m = macroTargets(2259, 80, 1.6, 0.3); close(m.protein_g, 128); close(m.fat_g, 75.3); close(m.carb_g, 267.33);
  });
  it('T17 BMI', () => { close(bmi(80, 180), 24.69); expect(bmiCategory(bmi(80, 180))).toBe('normal'); });
  it('T18 BMI boundary', () => expect(bmiCategory(25.0)).toBe('overweight'));
  it('T19 trend', () => close(trendStep(80, 81, 1, 0.1), 80.1));
  it('T20 trend gap', () => { close(alphaEff(3, 0.1), 0.271, 0.001); close(trendStep(80, 79, 3, 0.1), 79.729); });
  it('T21 adaptive TDEE', () => close(tdeeObserved(2200, 80, 79.4, 21, 7700), 2420));
  it('T22 missing propagation', () => {
    const a = { fat_g: { value: 10, type: 'sourced' as const } };
    const b = { fat_g: { value: null, type: 'missing' as const } };
    const t = sumProfiles([a, b]);
    expect(t.fat_g.incomplete).toBe(true); expect(t.fat_g.value).toBeNull(); expect(t.fat_g.known).toBe(10);
  });
  it('T23 value_type sum', () => expect(weakest('measured', 'estimated')).toBe('estimated'));
  it('T24 search normalisation', () => {
    expect(normalize('ISPANAK')).toBe('ispanak'); expect(normalize('ıspanak')).toBe('ispanak'); expect(normalize('İSPANAK')).toBe('ispanak');
    expect(normalize('pirinç')).toBe(normalize('pirinc'));
  });
  it('T25 goal floor', () => {
    const r = goalTarget(1500, 1400, 'lose', 1); expect(r.warnings.length).toBeGreaterThan(0); expect(r.value).toBe(1400);
  });
});

describe('property tests', () => {
  it('nutrients are linear in grams', () => {
    for (let g = 1; g < 500; g += 37) close(nutrientAmount(360, 2 * g)!, 2 * nutrientAmount(360, g)!, 1e-9);
  });
  it('per-100 g of a recipe is independent of scaling', () => {
    for (const k of [0.25, 0.5, 2, 3.7]) {
      const base = cookBatch({ ingredients: [{ per100: rice, grams: 180 }, { per100: {}, grams: 400, massOnly: true }], addedFat: { per100: oil, grams: 10, absorptionPct: 100 }, cookedG: 520 });
      const sc = cookBatch({ ingredients: [{ per100: rice, grams: 180 * k }, { per100: {}, grams: 400 * k, massOnly: true }], addedFat: { per100: oil, grams: 10 * k, absorptionPct: 100 }, cookedG: 520 * k });
      close(base.per100!.energy_kcal.value!, sc.per100!.energy_kcal.value!, 1e-9);
    }
  });
  it('raw -> cooked -> raw round trip within 0.01 g', () => {
    for (const r of [1, 70, 180, 333.3]) close(cookedToRaw(rawToCooked(r, 2.889), 2.889), r);
  });
});

describe('extra engine behaviour', () => {
  it('rice journey: water adds mass not energy; per100 measured', () => {
    const b = cookBatch({ ingredients: [{ per100: rice, grams: 180 }, { per100: {}, grams: 360, massOnly: true }], cookedG: 520, servings: 2, codes: ['energy_kcal', 'fat_g'] });
    close(b.total.energy_kcal.value!, 648); close(b.per100!.energy_kcal.value!, 124.62); close(b.perServing!.energy_kcal.value!, 324);
  });
  it('recipe without cooked weight -> estimated warning', () => {
    const b = cookBatch({ ingredients: [{ per100: rice, grams: 100 }] });
    expect(b.warnings.join(' ')).toMatch(/Pişmiş ağırlık/); expect(b.per100!.energy_kcal.type).toBe('estimated');
  });
  it('nutrientsFor propagates estimated grams', () => {
    expect(nutrientsFor(rice, 100, 'estimated').energy_kcal.type).toBe('estimated');
  });
  it('trend series uses earliest weigh-in per day and weekly change', () => {
    const s = trendSeries([
      { datetime: '2026-11-01T07:00', value: 80 }, { datetime: '2026-11-01T20:00', value: 82 },
      { datetime: '2026-11-08T07:00', value: 79 },
    ]);
    expect(s.length).toBe(2); expect(s[0].weight).toBe(80);
    close(weeklyChange(s, '2026-11-08')!, s[1].trend - 80);
  });
  it('adaptive requires enough data and clamps 150 kcal/week', () => {
    expect(adaptiveTdee({ loggedDays: 10, weighIns: 10, meanIntakeKcal: 2000, trendStart: 80, trendEnd: 79, tdeePrev: 2500 }).ok).toBe(false);
    const r = adaptiveTdee({ loggedDays: 21, weighIns: 12, meanIntakeKcal: 1500, trendStart: 80, trendEnd: 80, tdeePrev: 2500 });
    expect(r.ok).toBe(true); expect(r.clamped).toBe(true); close(r.estimate!, 2350);
  });
  it('per100Of keeps missing as missing', () => {
    expect(per100Of({ x: { value: null, type: 'missing' } }, 200).x.value).toBeNull();
  });
});
