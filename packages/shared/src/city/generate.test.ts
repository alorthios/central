import { describe, expect, it } from 'vitest';
import { LANDMARKS } from './data.ts';
import {
  ARCHIVIST_LINE,
  FIRST_SUBSCRIBER_LINE,
  SUBSCRIBER_COUNT,
  generateCity,
} from './generate.ts';
import type { City, Street } from './types.ts';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1953);
const cities = SEEDS.map(generateCity);

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function crosses(a: Street, b: Street): boolean {
  const [h, v] = a.from.y === a.to.y ? [a, b] : [b, a];
  if (h.from.y !== h.to.y || v.from.x !== v.to.x) return false;
  const [x1, x2] = [Math.min(h.from.x, h.to.x), Math.max(h.from.x, h.to.x)];
  const [y1, y2] = [Math.min(v.from.y, v.to.y), Math.max(v.from.y, v.to.y)];
  return v.from.x >= x1 && v.from.x <= x2 && h.from.y >= y1 && h.from.y <= y2;
}

function isConnected(city: City): boolean {
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length > 0) {
    const current = city.streets[queue.shift() as number] as Street;
    for (const other of city.streets) {
      if (!seen.has(other.id) && crosses(current, other)) {
        seen.add(other.id);
        queue.push(other.id);
      }
    }
  }
  return seen.size === city.streets.length;
}

describe('generateCity', () => {
  it('est déterministe : même graine, même ville', () => {
    expect(generateCity(1953)).toEqual(generateCity(1953));
  });

  it('produit des villes différentes pour des graines différentes', () => {
    expect(generateCity(1)).not.toEqual(generateCity(2));
  });

  it.each(cities.map((city) => [city.seed, city]))('graine %i : invariants', (_, city) => {
    // 79 abonnés sur les lignes 101 à 179, la 100 reste à l'archiviste.
    const lines = city.subscribers.map((s) => s.line);
    expect(lines).toHaveLength(SUBSCRIBER_COUNT);
    expect(new Set(lines).size).toBe(SUBSCRIBER_COUNT);
    expect(Math.min(...lines)).toBe(FIRST_SUBSCRIBER_LINE);
    expect(Math.max(...lines)).toBe(FIRST_SUBSCRIBER_LINE + SUBSCRIBER_COUNT - 1);
    expect(lines).not.toContain(ARCHIVIST_LINE);

    // 15 à 20 rues aux noms uniques, d'un seul tenant.
    expect(city.streets.length).toBeGreaterThanOrEqual(15);
    expect(city.streets.length).toBeLessThanOrEqual(20);
    expect(new Set(city.streets.map((s) => s.name)).size).toBe(city.streets.length);
    expect(isConnected(city)).toBe(true);

    // Chaque repère est dans la rue qui porte son nom.
    for (const spec of LANDMARKS) {
      const landmark = city.landmarks.find((l) => l.kind === spec.kind);
      expect(city.streets[landmark?.address.streetId ?? -1]?.name).toBe(spec.streetName);
    }

    // Adresses valides et toutes différentes, repères compris.
    const addresses = [...city.landmarks, ...city.subscribers].map((x) => x.address);
    for (const { streetId, houseNumber } of addresses) {
      const street = city.streets[streetId] as Street;
      expect(houseNumber).toBeGreaterThanOrEqual(1);
      expect(houseNumber).toBeLessThanOrEqual(street.houseCount);
    }
    expect(new Set(addresses.map((a) => `${a.streetId}:${a.houseNumber}`)).size).toBe(
      addresses.length,
    );

    // Homonymes (T2) : au moins trois familles de trois, prénoms et rues distincts.
    const families = [...countBy(city.subscribers, (s) => s.lastName)].filter(([, n]) => n > 1);
    expect(families.filter(([, n]) => n === 3)).toHaveLength(3);
    for (const [name] of families) {
      const members = city.subscribers.filter((s) => s.lastName === name);
      expect(new Set(members.map((s) => s.holder.firstName)).size).toBe(members.length);
      expect(new Set(members.map((s) => s.address.streetId)).size).toBe(members.length);
    }

    // Métiers partagés (T3) et notables.
    const professions = countBy(
      city.subscribers.filter((s) => s.profession),
      (s) => s.profession as string,
    );
    expect(professions.get('docteur')).toBe(2);
    expect(professions.get('boulanger')).toBe(2);
    expect(city.subscribers.filter((s) => s.notable).length).toBeGreaterThanOrEqual(5);

    // Les métiers liés à un repère vivent dans sa rue ; le curé n'a pas de conjoint.
    const church = city.landmarks.find((l) => l.kind === 'church');
    const priest = city.subscribers.find((s) => s.profession === 'curé');
    expect(priest?.address.streetId).toBe(church?.address.streetId);
    expect(priest?.spouse).toBeNull();
  });
});
