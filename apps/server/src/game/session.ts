import {
  BALANCE,
  type CallRequest,
  type City,
  type DayConfig,
  type KeyAction,
  type PlugEnd,
  type Role,
  type ScheduledCall,
  type ServerMessage,
  Switchboard,
  type SwitchboardEvent,
  generateCity,
  createRng,
  deriveSeed,
  generateRequests,
  dayReport,
  archivistDesk,
  archivistView,
  operatorView,
} from '@allo-central/shared';
import { GameClock } from './clock.ts';
import { DaySimulation } from './day.ts';
import { Journal } from './journal.ts';

export interface SessionOptions {
  seed: number;
  dayIndex: number;
  /** Envoie un message à un rôle, ou aux deux si `to` est absent. */
  send: (message: ServerMessage, to?: Role) => void;
  clock?: GameClock;
  /** Accélération du temps de jeu, quand aucune horloge n'est fournie. */
  speed?: number;
  tickMs?: number;
  /** Horloge réelle, pour la cadence de la sonnette (indépendante de l'accélération). */
  now?: () => number;
}

/** Fréquence d'envoi de la vue : assez pour un clignotement fluide côté client. */
const DEFAULT_TICK_MS = 200;

/**
 * Une journée jouée : la simulation fait arriver les appels, le standard gère leur
 * patience, et chaque tick envoie au standardiste la vue de son panneau.
 */
export class GameSession {
  readonly board: Switchboard;
  private readonly day: DaySimulation;
  private readonly requests: CallRequest[];
  private readonly city: City;
  private readonly clock: GameClock;
  private readonly send: (message: ServerMessage, to?: Role) => void;
  private readonly tickMs: number;
  private readonly seed: number;
  private readonly dayIndex: number;
  private readonly config: DayConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private lastBellAt = -Infinity;
  private readonly journal = new Journal();
  private line100WasOpen = false;
  /** Appels déjà examinés par `watch` : parmi les suivants, les rappels entrent au journal. */
  private knownCalls = 0;

  constructor({ seed, dayIndex, send, clock, speed, tickMs, now }: SessionOptions) {
    const config = BALANCE.week[dayIndex] as DayConfig | undefined;
    if (!config) throw new Error(`GameSession : journée ${dayIndex} inconnue`);
    this.seed = seed;
    this.config = config;
    this.board = new Switchboard(
      (event) => this.notify(event),
      createRng(deriveSeed(seed, `switchboard:${dayIndex}`)),
    );
    this.dayIndex = dayIndex;
    this.send = send;
    this.clock = clock ?? new GameClock(undefined, speed);
    this.tickMs = tickMs ?? DEFAULT_TICK_MS;
    this.now = now ?? Date.now;

    this.day = new DaySimulation(seed, config, (event) => {
      if (event.type === 'callArrived') {
        const request = this.requests[event.call.id] as CallRequest;
        this.board.receive(event.call, request);
        this.journal.add(event.call.at, 'appel_recu', {
          call: event.call.id,
          line: event.call.callerLine,
          detail: `${request.type} ${event.call.kind} vers ${request.targetLine}`,
        });
      }
    });
    this.city = generateCity(seed);
    this.requests = generateRequests(seed, this.city, this.day.schedule, config);
  }

  get schedule(): readonly ScheduledCall[] {
    return this.day.schedule;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer) return;
    this.send(this.dayStarted());
    this.send(this.desk(), 'archivist');
    this.clock.start();
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Un joueur revient en pleine journée : il retrouve l'annonce de la journée et sa vue. */
  rejoin(role: Role): void {
    this.send(this.dayStarted(), role);
    if (role === 'archivist') this.send(this.desk(), 'archivist');
    this.sendView();
  }

  private desk(): ServerMessage {
    return { type: 'archivistDesk', desk: archivistDesk(this.city, this.config) };
  }

  private dayStarted(): ServerMessage {
    return {
      type: 'dayStarted',
      seed: this.seed,
      dayIndex: this.dayIndex,
      dayName: this.config.name,
    };
  }

  /** Un joueur s'est déconnecté : le temps de jeu s'arrête jusqu'à son retour (§17). */
  pause(): void {
    this.clock.pause();
  }

  resume(): void {
    this.clock.resume();
  }

  get paused(): boolean {
    return this.running && !this.clock.running;
  }

  plug(pair: number, end: PlugEnd, line: number): void {
    if (!this.running) return;
    this.advance();
    const reason = this.board.plug(pair, end, line);
    if (reason) this.send({ type: 'plugRefused', pair, end, line, reason }, 'operator');
    this.sendView();
  }

  whichOne(): void {
    if (!this.running) return;
    this.advance();
    this.board.askWhichOne();
    this.sendView();
  }

  /**
   * Chaque événement du standard entre au journal ; certains s'entendent aussi au
   * rez-de-chaussée, au-delà de ce que montre le panneau.
   */
  private notify(event: SwitchboardEvent): void {
    const at = this.board.elapsedMs;
    if (event.type === 'upstairsRinging') {
      this.journal.add(at, 'etage_sonne', { line: 100 });
      return;
    }
    const { call } = event;
    const fields = { call: call.id, line: call.callerLine };
    switch (event.type) {
      case 'callAnswered':
        this.journal.add(at, 'reponse', fields);
        break;
      case 'whichOneAsked':
        this.journal.add(at, 'lequel', fields);
        break;
      case 'callConnected':
        this.journal.add(at, 'mise_en_relation', { ...fields, detail: `${call.connectedLine}` });
        break;
      case 'callCompleted':
        this.journal.add(at, 'fin_conversation', fields);
        break;
      case 'callInformed':
        this.journal.add(at, 'client_prevenu', { ...fields, detail: call.unreachable ?? '' });
        break;
      case 'callLost':
        this.journal.add(at, 'appel_perdu', { ...fields, detail: event.reason });
        break;
      case 'callUnreachable':
        this.journal.add(
          at,
          `correspondant_${event.reason === 'busy' ? 'occupe' : 'absent'}`,
          fields,
        );
        this.send({ type: 'notice', notice: event.reason, line: call.callerLine }, 'operator');
        break;
      case 'wrongConnection':
        this.journal.add(at, 'mauvais_correspondant', { ...fields, detail: `${event.line}` });
        this.send({ type: 'notice', notice: 'wrongNumber', line: event.line }, 'operator');
        break;
    }
  }

  handset(offHook: boolean): void {
    if (!this.running) return;
    this.advance();
    if (offHook !== this.board.handsetOffHook) {
      this.journal.add(this.board.elapsedMs, offHook ? 'combine_decroche' : 'combine_raccroche');
    }
    this.board.setHandset(offHook);
    this.sendView();
  }

  /** Un message sur la ligne 100 ne passe que si elle est ouverte, comme la voix (§8.5). */
  /**
   * La sonnette (§8.4) : seul canal gratuit, de l'étage vers le rez-de-chaussée. Un coup au
   * plus toutes les 0,6 s : les coups trop rapprochés se confondent et sont ignorés.
   */
  bell(): void {
    if (!this.running || this.paused) return;
    const now = this.now();
    if (now - this.lastBellAt < BALANCE.bell.minIntervalMs) return;
    this.lastBellAt = now;
    this.board.bellRings++;
    this.journal.add(this.clock.elapsed(), 'sonnette');
    this.send({ type: 'bell' }, 'operator');
  }

  say(from: Role, text: string): void {
    if (!this.running) return;
    this.advance();
    if (!this.board.line100Open()) return;
    this.journal.add(this.board.elapsedMs, 'message_ligne100', { detail: `${from}: ${text}` });
    this.send({ type: 'line100Message', from, text, at: Math.round(this.board.elapsedMs) });
  }

  key(pair: number, action: KeyAction): void {
    if (!this.running) return;
    this.advance();
    this.board.setKey(pair, action);
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

  /** Ce qui change sans événement propre : la ligne 100 qui s'ouvre ou se ferme, les rappels. */
  private watch(): void {
    const at = this.board.elapsedMs;
    const open = this.board.line100Open();
    if (open !== this.line100WasOpen) {
      this.line100WasOpen = open;
      this.journal.add(at, open ? 'ligne100_ouverte' : 'ligne100_fermee', { line: 100 });
    }
    for (const call of this.board.calls.slice(this.knownCalls)) {
      if (call.callbackOf === null) continue;
      this.journal.add(call.arrivedAt, 'rappel_recu', {
        call: call.id,
        line: call.callerLine,
        detail: `rappel de l'appel ${call.callbackOf}`,
      });
    }
    this.knownCalls = this.board.calls.length;
  }

  /** Chaque joueur ne reçoit que la vue de son rôle. */
  private sendView(): void {
    this.watch();
    this.send({ type: 'operatorView', view: operatorView(this.board) }, 'operator');
    this.send({ type: 'archivistView', view: archivistView(this.board) }, 'archivist');
  }

  private tick(): void {
    this.advance();
    this.sendView();
    if (this.day.ended) {
      const report = dayReport(this.board, this.config);
      this.journal.add(this.board.elapsedMs, 'fin_journee', {
        detail: `${Math.round(report.serviceRate * 100)} % servis, ${report.stars} étoile(s)`,
      });
      this.send({ type: 'dayEnded', report, journal: this.journal.toCsv() });
      this.stop();
    }
  }
}
