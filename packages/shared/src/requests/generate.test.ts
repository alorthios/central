import { describe, expect, it } from 'vitest';
import { BALANCE, type DayConfig } from '../balance.ts';
import { generateCity } from '../city/generate.ts';
import { scheduleDay } from '../schedule.ts';
import { generateRequests } from './generate.ts';
import { clueSource, resolveClues } from './resolve.ts';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 6_151 + 11);

const cases = BALANCE.week.flatMap((day: DayConfig) =>
  SEEDS.map((seed) => {
    const city = generateCity(seed);
    const calls = scheduleDay(seed, day);
    return { day, seed, city, calls, requests: generateRequests(seed, city, calls, day) };
  }),
);

describe('generateRequests', () => {
  it('est déterministe', () => {
    const day = BALANCE.week[4];
    const city = generateCity(1953);
    const calls = scheduleDay(1953, day);
    expect(generateRequests(1953, city, calls, day)).toEqual(
      generateRequests(1953, city, calls, day),
    );
  });

  it.each(cases.map((c) => [c.day.name, c.seed, c] as const))(
    '%s, graine %i : règle d’unicité',
    (_, __, { day, city, calls, requests }) => {
      expect(requests).toHaveLength(calls.length);

      for (const [i, request] of requests.entries()) {
        const caller = calls[i]?.callerLine;
        const allClues = [...request.clues, ...(request.extraClue ? [request.extraClue] : [])];

        // Un type prévu ce jour-là, et jamais le client lui-même.
        expect(day.requests[request.type]).toBeGreaterThan(0);
        expect(request.targetLine).not.toBe(caller);

        // Chaque indice est exploitable avec les sources du jour.
        for (const clue of allClues) {
          const source = clueSource(clue);
          if (source) expect(day.sources).toContain(source);
        }

        // Exactement un abonné, le bon, une fois la précision de « Lequel ? » obtenue.
        const found = resolveClues(city, allClues, day.sources);
        expect(found.map((s) => s.line)).toEqual([request.targetLine]);

        // La précision n'est gardée que si la demande seule est ambiguë.
        const before = resolveClues(city, request.clues, day.sources);
        expect(before.length > 1).toBe(request.extraClue !== null);
        expect(request.extraText === null).toBe(request.extraClue === null);

        expect(request.text).not.toMatch(/undefined|null|euh/);
      }
    },
  );

  it('produit tous les types prévus sur la semaine, avec et sans précision gardée', () => {
    const seen = new Set<string>();
    for (const { requests } of cases) {
      for (const r of requests) seen.add(`${r.type}${r.extraClue ? '+lequel' : ''}`);
    }
    const expected: string[] = ['T0', 'T1', 'T2', 'T2+lequel', 'T3', 'T3+lequel'];
    expect([...seen].sort()).toEqual(expect.arrayContaining(expected));
  });

  it('respecte à peu près la part de T0 de chaque journée', () => {
    for (const day of BALANCE.week) {
      const requests = cases.filter((c) => c.day === day).flatMap((c) => c.requests);
      const t0 = requests.filter((r) => r.type === 'T0').length;
      expect(t0 / requests.length).toBeCloseTo(day.requests.T0 ?? 0, 1);
    }
  });

  it('ne demande ni homonyme ni lieu avant le mercredi', () => {
    for (const { day, requests } of cases.filter((c) => !c.day.sources.includes('map'))) {
      for (const r of requests) {
        expect(r.type).not.toBe('T2');
        expect(r.extraClue).toBeNull();
        expect(r.clues).toHaveLength(1);
      }
      expect(day.sources).not.toContain('map');
    }
  });
});
