import { describe, expect, it } from 'vitest';
import { addressPoint } from './geometry.ts';
import type { Street } from './types.ts';

const street: Street = {
  id: 0,
  name: 'Rue Haute',
  from: { x: 0, y: 2 },
  to: { x: 4, y: 2 },
  houseCount: 16,
};

describe('addressPoint', () => {
  it('place les impairs et les pairs de part et d’autre de la rue', () => {
    const one = addressPoint(street, 1);
    const two = addressPoint(street, 2);
    expect(one.x).toBeCloseTo(two.x);
    expect(Math.sign(one.y - 2)).toBe(-Math.sign(two.y - 2));
  });

  it('avance le long de la rue avec le numéro', () => {
    const xs = [1, 3, 5, 7, 9, 11, 13, 15].map((n) => addressPoint(street, n).x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[0]).toBeGreaterThan(0);
    expect(xs.at(-1)).toBeLessThan(4);
  });

  it('fonctionne pour une rue verticale', () => {
    const vertical: Street = { ...street, from: { x: 3, y: 0 }, to: { x: 3, y: 5 } };
    const p = addressPoint(vertical, 4);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(5);
    expect(p.x).not.toBe(3);
  });
});
