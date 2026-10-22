import { describe, expect, it } from 'vitest';
import { createRng, randomInt } from './rng.ts';

describe('createRng', () => {
  it('produit la même suite pour la même graine', () => {
    const a = createRng(1953);
    const b = createRng(1953);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });

  it('produit des suites différentes pour des graines différentes', () => {
    expect(createRng(1)()).not.toEqual(createRng(2)());
  });

  it('reste dans [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1_000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('randomInt', () => {
  it('reste dans les bornes incluses', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1_000; i++) {
      const n = randomInt(rng, 100, 179);
      expect(n).toBeGreaterThanOrEqual(100);
      expect(n).toBeLessThanOrEqual(179);
    }
  });
});
