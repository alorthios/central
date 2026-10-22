import type { Point, Street } from './types.ts';

/** Écart des maisons par rapport à l'axe de la rue, en unités de grille. */
const SIDEWALK_OFFSET = 0.15;

/**
 * Position d'une maison sur le plan. Numérotation à la française : les impairs d'un côté,
 * les pairs en face, en partant du début de la rue.
 */
export function addressPoint(street: Street, houseNumber: number): Point {
  const housesPerSide = Math.ceil(street.houseCount / 2);
  const t = (Math.ceil(houseNumber / 2) - 0.5) / housesPerSide;
  const dx = street.to.x - street.from.x;
  const dy = street.to.y - street.from.y;
  const length = Math.hypot(dx, dy);
  const side = houseNumber % 2 === 1 ? 1 : -1;
  return {
    x: street.from.x + dx * t - (dy / length) * SIDEWALK_OFFSET * side,
    y: street.from.y + dy * t + (dx / length) * SIDEWALK_OFFSET * side,
  };
}
