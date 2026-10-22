import { BALANCE, type DayConfig, type ScheduledCall, scheduleDay } from '@allo-central/shared';
import type { GameClock } from './clock.ts';

export type DayEvent = { type: 'callArrived'; call: ScheduledCall } | { type: 'dayEnded' };

/**
 * Une journée de jeu. Elle ne lit pas l'heure elle-même : on la fait avancer avec
 * `advanceTo(elapsedMs)`, ce qui la rend déterministe et testable sans attendre.
 */
export class DaySimulation {
  readonly schedule: readonly ScheduledCall[];
  private readonly onEvent: (event: DayEvent) => void;
  private nextCall = 0;
  private elapsed = 0;
  private finished = false;

  constructor(seed: number, day: DayConfig, onEvent: (event: DayEvent) => void) {
    this.schedule = scheduleDay(seed, day);
    this.onEvent = onEvent;
  }

  get ended(): boolean {
    return this.finished;
  }

  get elapsedMs(): number {
    return this.elapsed;
  }

  advanceTo(elapsedMs: number): void {
    if (this.finished || elapsedMs < this.elapsed) return;
    this.elapsed = Math.min(elapsedMs, BALANCE.dayDurationMs);

    let call = this.schedule[this.nextCall];
    while (call && call.at <= this.elapsed) {
      this.onEvent({ type: 'callArrived', call });
      call = this.schedule[++this.nextCall];
    }
    if (this.elapsed >= BALANCE.dayDurationMs) {
      this.finished = true;
      this.onEvent({ type: 'dayEnded' });
    }
  }
}

/**
 * Boucle de simulation : fait avancer la journée au rythme de l'horloge, et s'arrête
 * d'elle-même à 18 h. Renvoie une fonction pour l'arrêter plus tôt.
 */
export function runDay(day: DaySimulation, clock: GameClock, tickMs = 100): () => void {
  clock.start();
  const timer = setInterval(() => {
    day.advanceTo(clock.elapsed());
    if (day.ended) clearInterval(timer);
  }, tickMs);
  return () => clearInterval(timer);
}
