import { describe, expect, it } from 'vitest';
import { BALANCE, type DayConfig } from '../balance.ts';
import { generateCity } from '../city/generate.ts';
import { archivistDesk, streetLabel } from './desk.ts';

const city = generateCity(1953);
const [monday, tuesday, wednesday] = BALANCE.week as readonly DayConfig[];

describe('archivistDesk', () => {
  it('les documents arrivent au fil de la semaine (§7.1)', () => {
    const desk = (day: DayConfig | undefined) => archivistDesk(city, day as DayConfig);
    expect(desk(monday)).toMatchObject({ professions: null, map: null });
    expect(desk(monday).directory).not.toBeNull();
    expect(desk(tuesday).professions).not.toBeNull();
    expect(desk(tuesday).map).toBeNull();
    expect(desk(wednesday).map).not.toBeNull();
  });

  it('l’annuaire liste chaque foyer par ordre alphabétique, avec numéro et adresse', () => {
    const directory = archivistDesk(city, wednesday as DayConfig).directory ?? [];
    expect(directory).toHaveLength(city.subscribers.length);
    const names = directory.map((e) => e.lastName);
    expect(names).toEqual([...names].sort(new Intl.Collator('fr').compare));
    const holder = city.subscribers[0];
    const entry = directory.find((e) => e.line === holder?.line);
    expect(entry?.lastName).toBe(holder?.lastName);
    expect(entry?.address).toMatch(/^\d+, /);
    if (holder?.spouse) expect(entry?.household).toContain(' et ');
  });

  it('le fichier des professions donne noms et adresses, jamais de numéro', () => {
    const cards = archivistDesk(city, wednesday as DayConfig).professions ?? [];
    const doctors = cards.find((c) => c.profession === 'docteur');
    expect(doctors?.people).toHaveLength(2);
    expect(JSON.stringify(cards)).not.toMatch(/"line"/);
    const professions = city.subscribers.filter((s) => s.profession).length;
    expect(cards.reduce((n, c) => n + c.people.length, 0)).toBe(professions);
  });

  it('le plan montre rues, repères et numéros des maisons habitées, sans noms', () => {
    const map = archivistDesk(city, wednesday as DayConfig).map;
    expect(map?.streets).toHaveLength(city.streets.length);
    expect(map?.landmarks.map((l) => l.name)).toContain('Église');
    expect(map?.houses).toHaveLength(city.subscribers.length);
    // Une maison n'a qu'une position et un numéro : aucun nom d'habitant.
    for (const house of map?.houses ?? [])
      expect(Object.keys(house).sort()).toEqual(['at', 'number']);
  });
});

describe('streetLabel', () => {
  it.each([
    ['Rue Haute', 'rue Haute'],
    ['Place du Marché', 'place du Marché'],
    ['Grande Rue', 'Grande Rue'],
  ])('%s → %s', (name, label) => {
    expect(streetLabel(name)).toBe(label);
  });
});
