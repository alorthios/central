import { describe, expect, it } from 'vitest';
import { createRng, pick, randomInt, shuffle } from './rng.ts';

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

describe('pick', () => {
  it('renvoie un élément de la liste', () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) expect(['a', 'b', 'c']).toContain(pick(rng, ['a', 'b', 'c']));
  });

  it('refuse une liste vide', () => {
    expect(() => pick(createRng(3), [])).toThrow();
  });
});

describe('shuffle', () => {
  it('garde les mêmes éléments sans modifier la liste source', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = shuffle(createRng(9), source);
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(source);
  });

  it('est déterministe pour une graine donnée', () => {
    const source = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(createRng(5), source)).toEqual(shuffle(createRng(5), source));
  });
});
