import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance.ts';
import { FIRST_SUBSCRIBER_LINE, SUBSCRIBER_COUNT } from './city/index.ts';
import { formatGameTime, hourToElapsedMs, scheduleDay } from './schedule.ts';

const inPeak = (at: number) =>
  BALANCE.peaks.some(({ startHour, endHour }) => {
    return at >= hourToElapsedMs(startHour) && at < hourToElapsedMs(endHour);
  });

describe('formatGameTime', () => {
  it('affiche l’heure de jeu', () => {
    expect(formatGameTime(0)).toBe('9 h 00');
    expect(formatGameTime(BALANCE.dayDurationMs / 2)).toBe('13 h 30');
    expect(formatGameTime(BALANCE.dayDurationMs)).toBe('18 h 00');
  });

  it('fait correspondre 10 minutes réelles à la journée de 9 h à 18 h', () => {
    expect(hourToElapsedMs(9)).toBe(0);
    expect(hourToElapsedMs(18)).toBe(BALANCE.dayDurationMs);
  });
});

describe('scheduleDay', () => {
  it('est déterministe et dépend de la graine', () => {
    const day = BALANCE.week[3];
    expect(scheduleDay(1953, day)).toEqual(scheduleDay(1953, day));
    expect(scheduleDay(1953, day)).not.toEqual(scheduleDay(1954, day));
  });

  it('refuse plus d’appels que d’abonnés', () => {
    expect(() => scheduleDay(1, { name: 'test', calls: 80, urgentShare: 0 })).toThrow();
  });

  const cases = BALANCE.week.flatMap((day) =>
    Array.from({ length: 50 }, (_, i) => [day.name, i * 104_729 + 7, day] as const),
  );

  it.each(cases)('%s, graine %i : invariants', (_, seed, day) => {
    const calls = scheduleDay(seed, day);

    expect(calls).toHaveLength(day.calls);
    expect(calls.map((c) => c.id)).toEqual(calls.map((_, i) => i));

    // Pendant la journée, dans l'ordre chronologique.
    for (const [i, call] of calls.entries()) {
      expect(call.at).toBeGreaterThanOrEqual(0);
      expect(call.at).toBeLessThan(BALANCE.dayDurationMs);
      if (i > 0) expect(call.at).toBeGreaterThanOrEqual(calls[i - 1]?.at ?? 0);
    }

    // Environ 60 % dans les pics : exactement l'arrondi, le reste en heures creuses.
    expect(calls.filter((c) => inPeak(c.at))).toHaveLength(
      Math.round(day.calls * BALANCE.peakShare),
    );

    // Des abonnés existants, chacun au plus une fois.
    const callers = calls.map((c) => c.callerLine);
    expect(new Set(callers).size).toBe(callers.length);
    for (const line of callers) {
      expect(line).toBeGreaterThanOrEqual(FIRST_SUBSCRIBER_LINE);
      expect(line).toBeLessThan(FIRST_SUBSCRIBER_LINE + SUBSCRIBER_COUNT);
    }

    expect(calls.filter((c) => c.kind === 'urgent')).toHaveLength(
      Math.round(day.calls * day.urgentShare),
    );
  });

  it('remplit chacun des trois pics sur une journée chargée', () => {
    const calls = scheduleDay(1953, BALANCE.week[6]);
    for (const { startHour, endHour } of BALANCE.peaks) {
      const inWindow = calls.filter(
        (c) => c.at >= hourToElapsedMs(startHour) && c.at < hourToElapsedMs(endHour),
      );
      expect(inWindow.length).toBeGreaterThan(0);
    }
  });
});
