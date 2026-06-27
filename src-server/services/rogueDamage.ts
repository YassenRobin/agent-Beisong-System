export type RogueDamageRules = {
  baseDamage: Record<number, number>;
  typeAdjustment: Record<string, number>;
  maxDamage: Record<number, number>;
};

export function createDamageRules(): RogueDamageRules {
  return {
    baseDamage: { 1: 0.5, 2: 0.75, 3: 1, 4: 1.25, 5: 1.5 },
    typeAdjustment: {
      punctuation: 0,
      format: 0,
      homophone: 0.25,
      similar_shape: 0.25,
      near_synonym: 0.25,
      keyword: 0.5,
      missing_kw: 0.5,
      other: 0.5,
      missing_line: 0.75,
      line_swap: 0.75,
      order: 1,
    },
    maxDamage: { 1: 0.5, 2: 1, 3: 1.5, 4: 2, 5: 2 },
  };
}

export function calculateRogueDamage(opts: {
  isCorrect: boolean;
  star: number;
  errorType?: string;
  rules?: Partial<RogueDamageRules>;
}): number {
  if (opts.isCorrect) return 0;
  const rules = mergeDamageRules(opts.rules);
  const star = Math.max(1, Math.min(5, Math.round(Number(opts.star) || 1)));
  const base = rules.baseDamage[star] ?? 1;
  const adjustment = rules.typeAdjustment[opts.errorType || 'other'] ?? rules.typeAdjustment.other ?? 0;
  const maxDamage = rules.maxDamage[star] ?? base + adjustment;
  return Math.max(0.5, Math.min(maxDamage, roundHalf(base + adjustment)));
}

function mergeDamageRules(input?: Partial<RogueDamageRules>): RogueDamageRules {
  const defaults = createDamageRules();
  return {
    baseDamage: { ...defaults.baseDamage, ...(input?.baseDamage || {}) },
    typeAdjustment: { ...defaults.typeAdjustment, ...(input?.typeAdjustment || {}) },
    maxDamage: { ...defaults.maxDamage, ...(input?.maxDamage || {}) },
  };
}

function roundHalf(value: number) {
  return Math.round(value * 2) / 2;
}
