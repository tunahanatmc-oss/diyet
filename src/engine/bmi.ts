export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obesity';
export const BMI_TR: Record<BmiCategory, string> = { underweight: 'Zayıf', normal: 'Normal', overweight: 'Fazla kilolu', obesity: 'Obez' };

export function bmi(weightKg: number, heightCm: number): number { return weightKg / (heightCm / 100) ** 2; }

/** WHO adult cut-offs (spec 5.10). Boundaries: >= 25 overweight, >= 30 obesity. */
export function bmiCategory(v: number): BmiCategory {
  if (v < 18.5) return 'underweight';
  if (v < 25) return 'normal';
  if (v < 30) return 'overweight';
  return 'obesity';
}

export const BMI_LIMITS_TR = [
  'Kas ile yağı ayırt etmez; yağın vücuttaki dağılımını göstermez.',
  'Çocuk ve ergenlerde geçerli değildir (yaşa özel eğriler gerekir); gebelikte kullanılmaz.',
  'Aynı BMI değerinde etnik kökene göre risk farklı olabilir.',
  'Yaşlılar ve sporcular yanlış sınıflanabilir.',
];
