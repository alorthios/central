import { BALANCE, type DayConfig } from '@allo-central/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameClock } from './clock.ts';
import { type DayEvent, DaySimulation, runDay } from './day.ts';

const MONDAY = BALANCE.week[0];
const SATURDAY = BALANCE.week[5];

function record(seed = 1953, day: DayConfig = SATURDAY) {
  const events: DayEvent[] = [];
  const sim = new DaySimulation(seed, day, (e) => events.push(e));
  return { sim, events };
}

describe('DaySimulation', () => {
  it('ne déclenche un appel qu’à son heure', () => {
    const { sim, events } = record();
    const first = sim.schedule[0];
    if (!first) throw new Error('planning vide');

    sim.advanceTo(first.at - 1);
    expect(events).toEqual([]);
    sim.advanceTo(first.at);
    expect(events).toEqual([{ type: 'callArrived', call: first }]);
  });

  it('déclenche tous les appels dans l’ordre puis la fin de journée à 18 h', () => {
    const { sim, events } = record();
    for (let t = 0; t <= BALANCE.dayDurationMs; t += 1_000) sim.advanceTo(t);

    const calls = events.filter((e) => e.type === 'callArrived').map((e) => e.call);
    expect(calls).toEqual(sim.schedule);
    expect(events.at(-1)).toEqual({ type: 'dayEnded' });
    expect(sim.ended).toBe(true);
  });

  it('rattrape les appels en retard si l’horloge saute', () => {
    const { sim, events } = record();
    sim.advanceTo(BALANCE.dayDurationMs * 10);
    expect(events).toHaveLength(SATURDAY.calls + 1);
    expect(sim.elapsedMs).toBe(BALANCE.dayDurationMs);
  });

  it('ne rejoue rien après la fin ni en remontant le temps', () => {
    const { sim, events } = record();
    sim.advanceTo(BALANCE.dayDurationMs);
    const count = events.length;
    sim.advanceTo(BALANCE.dayDurationMs + 1);
    sim.advanceTo(0);
    expect(events).toHaveLength(count);
  });

  it('suit la configuration de la journée', () => {
    const { sim } = record(1953, MONDAY);
    expect(sim.schedule).toHaveLength(MONDAY.calls);
    expect(sim.schedule.every((c) => c.kind === 'normal')).toBe(true);
  });
});

describe('runDay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('joue une journée complète en 10 minutes puis s’arrête', () => {
    vi.useFakeTimers();
    const { sim, events } = record();
    runDay(sim, new GameClock(() => Date.now()));

    vi.advanceTimersByTime(BALANCE.dayDurationMs - 1_000);
    expect(sim.ended).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(sim.ended).toBe(true);
    expect(events).toHaveLength(SATURDAY.calls + 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('se fige pendant une pause', () => {
    vi.useFakeTimers();
    const { sim } = record();
    const clock = new GameClock(() => Date.now());
    const stop = runDay(sim, clock);

    vi.advanceTimersByTime(60_000);
    clock.pause();
    vi.advanceTimersByTime(5 * 60_000);
    expect(sim.elapsedMs).toBe(60_000);
    clock.resume();
    vi.advanceTimersByTime(1_000);
    expect(sim.elapsedMs).toBe(61_000);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
