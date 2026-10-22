import { BALANCE, type DayConfig } from './balance.ts';
import { FIRST_SUBSCRIBER_LINE, SUBSCRIBER_COUNT } from './city/index.ts';
import { createRng, deriveSeed, shuffle } from './rng.ts';

export type ScheduledCallKind = 'normal' | 'urgent';

export interface ScheduledCall {
  id: number;
  /** Arrivée, en ms réelles depuis l'ouverture (9 h). */
  at: number;
  callerLine: number;
  kind: ScheduledCallKind;
}

const DAY_HOURS = BALANCE.dayEndHour - BALANCE.dayStartHour;

/** Convertit une heure de jeu (9 à 18, décimale) en ms réelles depuis l'ouverture. */
export function hourToElapsedMs(hour: number): number {
  return ((hour - BALANCE.dayStartHour) / DAY_HOURS) * BALANCE.dayDurationMs;
}

/** Minutes de jeu écoulées depuis 9 h. */
export function gameMinutes(elapsedMs: number): number {
  return Math.floor((elapsedMs / BALANCE.dayDurationMs) * DAY_HOURS * 60);
}

/** Heure de jeu affichable : « 9 h 05 », « 18 h 00 ». */
export function formatGameTime(elapsedMs: number): string {
  const total = BALANCE.dayStartHour * 60 + gameMinutes(elapsedMs);
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}`;
}

/**
 * Planning des appels d'une journée, déterministe pour une graine. Une part `peakShare`
 * des appels tombe dans les fenêtres de pic, le reste est réparti sur les heures creuses.
 * Chaque abonné appelle au plus une fois par journée.
 */
export function scheduleDay(seed: number, day: DayConfig): ScheduledCall[] {
  if (day.calls > SUBSCRIBER_COUNT) {
    throw new Error(`scheduleDay : ${day.calls} appels pour ${SUBSCRIBER_COUNT} abonnés`);
  }
  const rng = createRng(deriveSeed(seed, `schedule:${day.name}`));

  const peaks = BALANCE.peaks.map(({ startHour, endHour }) => [startHour, endHour] as const);
  const offPeak = complement(peaks, BALANCE.dayStartHour, BALANCE.dayEndHour);
  const peakCount = Math.round(day.calls * BALANCE.peakShare);

  const hours = Array.from({ length: day.calls }, (_, i) =>
    sampleHour(rng, i < peakCount ? peaks : offPeak),
  );
  const urgentCount = Math.round(day.calls * day.urgentShare);
  const kinds = shuffle(
    rng,
    Array.from({ length: day.calls }, (_, i): ScheduledCallKind =>
      i < urgentCount ? 'urgent' : 'normal',
    ),
  );
  const callers = shuffle(
    rng,
    Array.from({ length: SUBSCRIBER_COUNT }, (_, i) => FIRST_SUBSCRIBER_LINE + i),
  );

  return hours
    .map(hourToElapsedMs)
    .sort((a, b) => a - b)
    .map((at, id) => ({
      id,
      at,
      callerLine: callers[id] as number,
      kind: kinds[id] as ScheduledCallKind,
    }));
}

type Interval = readonly [number, number];

/** Tire une heure uniformément sur l'union des intervalles. */
function sampleHour(rng: () => number, intervals: readonly Interval[]): number {
  const total = intervals.reduce((sum, [a, b]) => sum + (b - a), 0);
  let offset = rng() * total;
  for (const [a, b] of intervals) {
    if (offset < b - a) return a + offset;
    offset -= b - a;
  }
  const last = intervals[intervals.length - 1] as Interval;
  return last[1] - Number.EPSILON;
}

/** Les heures creuses : [start, end] privé des fenêtres de pic (triées, disjointes). */
function complement(intervals: readonly Interval[], start: number, end: number): Interval[] {
  const result: Interval[] = [];
  let cursor = start;
  for (const [a, b] of intervals) {
    if (a > cursor) result.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < end) result.push([cursor, end]);
  return result;
}
