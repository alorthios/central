import {
  BALANCE,
  type CallRequest,
  type PlugEnd,
  type ScheduledCall,
  type ServerMessage,
  Switchboard,
  generateCity,
  generateRequests,
  operatorView,
} from '@allo-central/shared';
import { GameClock } from './clock.ts';
import { DaySimulation } from './day.ts';

export interface SessionOptions {
  seed: number;
  dayIndex: number;
  send: (message: ServerMessage) => void;
  clock?: GameClock;
  tickMs?: number;
}

/** Fréquence d'envoi de la vue : assez pour un clignotement fluide côté client. */
const DEFAULT_TICK_MS = 200;

/**
 * Une journée jouée : la simulation fait arriver les appels, le standard gère leur
 * patience, et chaque tick envoie au standardiste la vue de son panneau.
 */
export class GameSession {
  readonly board = new Switchboard();
  private readonly day: DaySimulation;
  private readonly requests: CallRequest[];
  private readonly clock: GameClock;
  private readonly send: (message: ServerMessage) => void;
  private readonly tickMs: number;
  private readonly seed: number;
  private readonly dayIndex: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor({ seed, dayIndex, send, clock, tickMs }: SessionOptions) {
    const config = BALANCE.week[dayIndex];
    if (!config) throw new Error(`GameSession : journée ${dayIndex} inconnue`);
    this.seed = seed;
    this.dayIndex = dayIndex;
    this.send = send;
    this.clock = clock ?? new GameClock();
    this.tickMs = tickMs ?? DEFAULT_TICK_MS;

    this.day = new DaySimulation(seed, config, (event) => {
      if (event.type === 'callArrived') {
        this.board.receive(event.call, this.requests[event.call.id] as CallRequest);
      }
    });
    this.requests = generateRequests(seed, generateCity(seed), this.day.schedule, config);
  }

  get schedule(): readonly ScheduledCall[] {
    return this.day.schedule;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer) return;
    const name = BALANCE.week[this.dayIndex]?.name ?? '';
    this.send({ type: 'dayStarted', seed: this.seed, dayIndex: this.dayIndex, dayName: name });
    this.clock.start();
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  plug(pair: number, end: PlugEnd, line: number): void {
    if (!this.running) return;
    this.advance();
    const reason = this.board.plug(pair, end, line);
    if (reason) this.send({ type: 'plugRefused', pair, end, line, reason });
    this.sendView();
  }

  unplug(pair: number, end: PlugEnd): void {
    if (!this.running) return;
    this.advance();
    this.board.unplug(pair, end);
    this.sendView();
  }

  /** Amène le standard et la journée à l'instant présent, y compris entre deux ticks. */
  private advance(): void {
    const elapsed = this.clock.elapsed();
    // Le standard d'abord : un appel reçu maintenant part avec la patience exacte qu'il lui reste.
    this.board.advanceTo(elapsed);
    this.day.advanceTo(elapsed);
  }

  private sendView(): void {
    this.send({ type: 'operatorView', view: operatorView(this.board) });
  }

  private tick(): void {
    this.advance();
    this.sendView();
    if (this.day.ended) {
      this.send({ type: 'dayEnded' });
      this.stop();
    }
  }
}
