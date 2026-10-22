import { BALANCE } from '../balance.ts';
import { ARCHIVIST_LINE, FIRST_SUBSCRIBER_LINE, SUBSCRIBER_COUNT } from '../city/generate.ts';
import type { CallRequest } from '../requests/generate.ts';
import { createRng, randomInt } from '../rng.ts';
import type { ScheduledCall, ScheduledCallKind } from '../schedule.ts';

/**
 * Le déroulé d'un appel (§5.1, §6.5) :
 * - `ringing` : l'ampoule clignote, personne n'a répondu ;
 * - `held` : une fiche est branchée sur la ligne du client, qui attend ;
 * - `connecting` : le standardiste fait sonner le correspondant ;
 * - `talking` : le correspondant a décroché, ils se parlent ;
 * - `unreachable` : le correspondant est occupé ou absent, il faut prévenir le client ;
 * - `done` : l'appel est terminé (servi ou client prévenu), il reste à retirer les fiches ;
 * - `lost` : le client a raccroché avant d'être servi, ou a été coupé.
 */
export type CallStatus =
  'ringing' | 'held' | 'connecting' | 'talking' | 'unreachable' | 'done' | 'lost';

export type Unreachable = 'busy' | 'absent';

/** Un appel compte comme servi s'il a abouti, ou si le client a été prévenu (§11). */
export type CallOutcome = 'served' | 'informed';

export interface LiveCall {
  id: number;
  callerLine: number;
  kind: ScheduledCallKind;
  request: CallRequest;
  arrivedAt: number;
  patienceMs: number;
  remainingMs: number;
  status: CallStatus;
  /** La ligne que le standardiste fait sonner ou a reliée ; null sinon. */
  connectedLine: number | null;
  /** `connecting` : quand on saura si le correspondant décroche ; `talking` : fin de la conversation. */
  nextAt: number;
  /** `connecting` : le correspondant est-il là ? */
  willAnswer: boolean;
  unreachable: Unreachable | null;
  askedWhichOne: boolean;
  /** Le dernier correspondant n'était pas le bon : le client proteste. */
  protesting: boolean;
  wrongConnections: number;
  outcome: CallOutcome | null;
  /** Un rappel : l'appel d'origine, dont le client avait été prévenu. */
  callbackOf: number | null;
  /** Quand le client a été mis en relation ou prévenu : sert au temps moyen par appel (§11). */
  resolvedAt: number | null;
}

/** Une extrémité de paire : 0 ou 1. Les deux fiches d'une paire sont identiques (§6.3). */
export type PlugEnd = 0 | 1;

/**
 * Position de la clé d'une paire (§6.4) : en haut, le casque du standardiste rejoint la
 * paire ; au milieu, repos. La position basse (sonner) est un geste : la clé revient seule.
 */
export type KeyPosition = 'talk' | 'rest';
export type KeyAction = KeyPosition | 'ring';

export interface CordPair {
  id: number;
  /** La ligne où chaque fiche est branchée ; null : la fiche est sur la tablette. */
  plugs: [number | null, number | null];
  /**
   * Voyant de supervision de chaque fiche (§6.3) : allumé quand l'abonné de ce côté a
   * raccroché alors que la fiche était branchée. Il s'éteint quand on retire la fiche.
   */
  supervision: [boolean, boolean];
  key: KeyPosition;
}

/** Ce qu'on entend dans le casque, clé levée. */
export type Hearing =
  | { kind: 'silence' }
  | { kind: 'client'; lines: string[]; askedWhichOne: boolean }
  | { kind: 'ringback' }
  | { kind: 'conversation' }
  | { kind: 'informed'; reason: Unreachable };

export type PlugRefusal = 'unknownPair' | 'unknownLine' | 'jackBusy' | 'clientToArchivist';

export type SwitchboardEvent =
  | { type: 'callLost'; call: LiveCall; reason: 'patience' | 'cutOff' }
  | { type: 'callAnswered'; call: LiveCall }
  | { type: 'callConnected'; call: LiveCall }
  | { type: 'callCompleted'; call: LiveCall }
  | { type: 'callUnreachable'; call: LiveCall; reason: Unreachable }
  | { type: 'wrongConnection'; call: LiveCall; line: number }
  | { type: 'callInformed'; call: LiveCall }
  | { type: 'whichOneAsked'; call: LiveCall };

const LAST_LINE = FIRST_SUBSCRIBER_LINE + SUBSCRIBER_COUNT - 1;
const ACTIVE: readonly CallStatus[] = ['ringing', 'held', 'connecting', 'talking', 'unreachable'];
const CALLBACK_ID_BASE = 100_000;

/** Vitesse à laquelle la patience s'use : un client à qui l'on a répondu patiente mieux (§6.5). */
function patienceRate(status: CallStatus): number {
  if (status === 'ringing') return 1;
  if (status === 'held' || status === 'connecting' || status === 'unreachable') {
    return BALANCE.onHoldPatienceRate;
  }
  return 0;
}

/**
 * L'état du standard pendant une journée : les appels, les cordons et les clés. Comme la
 * simulation, il avance par `advanceTo(elapsedMs)` ; son hasard (qui décroche quand, qui est
 * absent, combien dure une conversation) vient d'un générateur fourni, ce qui le garde
 * déterministe.
 */
export class Switchboard {
  readonly calls: LiveCall[] = [];
  readonly pairs: CordPair[];
  private elapsed = 0;
  private readonly onEvent: (event: SwitchboardEvent) => void;
  private readonly random: () => number;
  private readonly callbacks: { at: number; of: LiveCall }[] = [];
  private nextCallbackId = CALLBACK_ID_BASE;

  constructor(
    onEvent: (event: SwitchboardEvent) => void = () => {},
    random: () => number = createRng(0),
  ) {
    this.onEvent = onEvent;
    this.random = random;
    this.pairs = Array.from({ length: BALANCE.cordPairs }, (_, id) => ({
      id,
      plugs: [null, null],
      supervision: [false, false],
      key: 'rest',
    }));
  }

  get elapsedMs(): number {
    return this.elapsed;
  }

  receive(call: ScheduledCall, request: CallRequest, callbackOf: number | null = null): void {
    const patienceMs = BALANCE.patienceMs[call.kind];
    this.calls.push({
      id: call.id,
      callerLine: call.callerLine,
      kind: call.kind,
      request,
      arrivedAt: call.at,
      patienceMs,
      remainingMs: patienceMs - Math.max(0, this.elapsed - call.at),
      status: 'ringing',
      connectedLine: null,
      nextAt: 0,
      willAnswer: true,
      unreachable: null,
      askedWhichOne: false,
      protesting: false,
      wrongConnections: 0,
      outcome: null,
      callbackOf,
      resolvedAt: null,
    });
  }

  advanceTo(elapsedMs: number): void {
    const from = this.elapsed;
    if (elapsedMs <= from) return;
    this.elapsed = elapsedMs;
    for (const call of [...this.calls]) this.step(call, from, elapsedMs);

    // Les clients prévenus rappellent, avec la même demande.
    for (const callback of this.callbacks.filter((c) => c.at <= elapsedMs)) {
      this.callbacks.splice(this.callbacks.indexOf(callback), 1);
      const { of } = callback;
      this.receive(
        { id: this.nextCallbackId++, at: callback.at, callerLine: of.callerLine, kind: of.kind },
        of.request,
        of.id,
      );
    }
  }

  /** L'appel en cours dont le client est sur cette ligne (qui sonne, attend ou parle). */
  activeCallOn(line: number): LiveCall | undefined {
    return this.calls.find((c) => c.callerLine === line && ACTIVE.includes(c.status));
  }

  /** La paire et la fiche branchées sur une prise, s'il y en a une. */
  plugIn(line: number): { pair: CordPair; end: PlugEnd } | undefined {
    for (const pair of this.pairs) {
      const end = pair.plugs.indexOf(line);
      if (end !== -1) return { pair, end: end as PlugEnd };
    }
    return undefined;
  }

  /**
   * Branche une fiche. Déplacer une fiche déjà branchée revient à la débrancher puis la
   * rebrancher ailleurs. Renvoie la raison d'un refus, ou null.
   */
  plug(pairId: number, end: PlugEnd, line: number): PlugRefusal | null {
    const pair = this.pairs[pairId];
    if (!pair) return 'unknownPair';
    if (line < ARCHIVIST_LINE || line > LAST_LINE) return 'unknownLine';
    if (pair.plugs[end] === line) return null;
    if (this.plugIn(line)) return 'jackBusy';

    // Un client ne peut jamais être relié à la ligne 100 (§8.3).
    const other = pair.plugs[end === 0 ? 1 : 0] ?? null;
    if (other !== null && (line === ARCHIVIST_LINE) !== (other === ARCHIVIST_LINE)) {
      return 'clientToArchivist';
    }

    this.unplug(pairId, end);
    pair.plugs[end] = line;
    // On répond à un client avec une paire libre. La seconde fiche d'une paire qui tient
    // déjà un client sert à appeler : brancher sur une ligne qui sonne ne lui répond pas.
    const holdsClient = other !== null && this.activeCallOn(other) !== undefined;
    const call = this.activeCallOn(line);
    if (call?.status === 'ringing' && !holdsClient) {
      call.status = 'held';
      this.onEvent({ type: 'callAnswered', call });
    }
    return null;
  }

  /**
   * Remet une fiche sur la tablette. Côté client, l'appel en cours est coupé ; côté
   * correspondant, la sonnerie s'arrête (le client attend de nouveau) ou la conversation
   * est coupée.
   */
  unplug(pairId: number, end: PlugEnd): void {
    const pair = this.pairs[pairId];
    const line = pair?.plugs[end];
    if (!pair || line === null || line === undefined) return;
    pair.plugs[end] = null;
    pair.supervision[end] = false;

    const call = this.calls.find(
      (c) =>
        c.status !== 'ringing' &&
        ACTIVE.includes(c.status) &&
        (c.callerLine === line || c.connectedLine === line),
    );
    if (!call) return;
    if (line === call.callerLine) {
      this.lose(call, 'cutOff');
    } else if (call.status === 'connecting') {
      call.status = 'held';
      call.connectedLine = null;
    } else if (call.status === 'talking') {
      this.lose(call, 'cutOff');
    }
  }

  /**
   * Manœuvre la clé d'une paire. Une seule écoute (§6.4) : lever une clé fait retomber
   * celle qui était levée. Lever la clé sur un client dont le correspondant est occupé ou
   * absent, c'est le prévenir.
   */
  setKey(pairId: number, action: KeyAction): void {
    const pair = this.pairs[pairId];
    if (!pair) return;
    if (action === 'ring') {
      this.ring(pair);
      return;
    }
    if (action === 'talk') {
      for (const other of this.pairs) other.key = 'rest';
    }
    pair.key = action;
    const call = this.callOnPair(pair);
    if (action === 'talk' && call?.status === 'unreachable') this.inform(call);
  }

  /**
   * « Lequel ? » (§6.5) : le client donne une précision, mais perd patience. On ne le
   * demande qu'à un client qu'on écoute.
   */
  askWhichOne(): void {
    const pair = this.pairs.find((p) => p.key === 'talk');
    const call = pair && this.callOnPair(pair);
    if (call?.status !== 'held' || call.askedWhichOne) return;
    call.askedWhichOne = true;
    call.remainingMs -= BALANCE.whichOnePenaltyMs;
    this.onEvent({ type: 'whichOneAsked', call });
    if (call.remainingMs <= 0) this.lose(call, 'patience');
  }

  /** La paire dont la clé est levée, et ce qu'on y entend. */
  headset(): { pair: number | null; hearing: Hearing } {
    const pair = this.pairs.find((p) => p.key === 'talk');
    if (!pair) return { pair: null, hearing: { kind: 'silence' } };
    const call = this.callOnPair(pair);
    if (!call) return { pair: pair.id, hearing: { kind: 'silence' } };
    switch (call.status) {
      case 'held': {
        const lines: string[] = [];
        if (call.protesting) lines.push("Mais ce n'est pas la bonne personne !");
        else if (call.callbackOf !== null) lines.push("C'est encore moi.");
        lines.push(call.request.text);
        if (call.askedWhichOne) {
          lines.push(call.request.extraText ?? "Je vous l'ai déjà dit, voyons !");
        }
        return {
          pair: pair.id,
          hearing: { kind: 'client', lines, askedWhichOne: call.askedWhichOne },
        };
      }
      case 'connecting':
        return { pair: pair.id, hearing: { kind: 'ringback' } };
      case 'talking':
        return { pair: pair.id, hearing: { kind: 'conversation' } };
      case 'done':
        return call.outcome === 'informed' && call.unreachable
          ? { pair: pair.id, hearing: { kind: 'informed', reason: call.unreachable } }
          : { pair: pair.id, hearing: { kind: 'silence' } };
      default:
        return { pair: pair.id, hearing: { kind: 'silence' } };
    }
  }

  /**
   * L'appel dont le client est branché sur cette paire : celui en cours d'abord (un client
   * prévenu rappelle sur la même ligne), sinon le dernier terminé encore en place.
   */
  callOnPair(pair: CordPair): LiveCall | undefined {
    const onPair = (c: LiveCall) => pair.plugs.includes(c.callerLine);
    return (
      this.calls.find((c) => onPair(c) && ACTIVE.includes(c.status)) ??
      this.calls.findLast((c) => onPair(c) && c.status === 'done')
    );
  }

  /** Une ligne est occupée si un autre appel en cours la concerne : son ampoule est allumée. */
  private isBusy(line: number, call: LiveCall): boolean {
    return this.calls.some(
      (c) =>
        c !== call &&
        ACTIVE.includes(c.status) &&
        (c.callerLine === line || c.connectedLine === line),
    );
  }

  private ring(pair: CordPair): void {
    // La clé abaissée pour sonner revient seule au milieu.
    pair.key = 'rest';
    const call = this.callOnPair(pair);
    if (call?.status !== 'held' && call?.status !== 'unreachable') return;
    const target = pair.plugs.find((line) => line !== null && line !== call.callerLine);
    // Faire sonner l'étage passe par la ligne 100 (#17) ; une fiche seule ne sonne rien.
    if (target === undefined || target === null || target === ARCHIVIST_LINE) return;

    call.protesting = false;
    if (this.isBusy(target, call)) {
      this.makeUnreachable(call, 'busy');
      return;
    }
    call.status = 'connecting';
    call.connectedLine = target;
    call.unreachable = null;
    call.willAnswer = this.random() >= BALANCE.absentShare;
    const rings = call.willAnswer
      ? randomInt(this.random, BALANCE.answerRings.min, BALANCE.answerRings.max)
      : BALANCE.ringsBeforeAbsent;
    call.nextAt = this.elapsed + rings * BALANCE.ringIntervalMs;
  }

  /** Fait vivre un appel entre deux instants, en passant les étapes qui tombent entre les deux. */
  private step(call: LiveCall, from: number, to: number): void {
    let now = from;
    if (call.status === 'connecting' && call.nextAt <= to) {
      this.wait(call, call.nextAt - now);
      if (call.status !== 'connecting') return;
      now = call.nextAt;
      this.pickUp(call, now);
    }
    if (call.status === 'talking') {
      if (call.nextAt <= to) this.complete(call);
      return;
    }
    this.wait(call, to - now);
  }

  /** Le correspondant décroche, ou ne décroche pas. */
  private pickUp(call: LiveCall, now: number): void {
    if (!call.willAnswer) {
      this.makeUnreachable(call, 'absent');
      // Clé levée pendant la sonnerie, le client entend que personne ne répond.
      const pair = this.pairOf(call);
      if (pair?.key === 'talk') this.inform(call);
      return;
    }
    const line = call.connectedLine as number;
    if (line !== call.request.targetLine) {
      call.status = 'held';
      call.connectedLine = null;
      call.protesting = true;
      call.wrongConnections++;
      call.remainingMs -= BALANCE.wrongNumberPenaltyMs;
      this.onEvent({ type: 'wrongConnection', call, line });
      if (call.remainingMs <= 0) this.lose(call, 'patience');
      return;
    }
    const { min, max } = BALANCE.conversationMs;
    call.status = 'talking';
    call.resolvedAt = now;
    call.nextAt = now + min + Math.floor(this.random() * (max - min));
    this.onEvent({ type: 'callConnected', call });
  }

  private makeUnreachable(call: LiveCall, reason: Unreachable): void {
    call.status = 'unreachable';
    call.unreachable = reason;
    call.connectedLine = null;
    this.onEvent({ type: 'callUnreachable', call, reason });
  }

  /** Le client est prévenu : il raccroche satisfait et rappellera plus tard. */
  private inform(call: LiveCall): void {
    call.status = 'done';
    call.outcome = 'informed';
    call.resolvedAt = this.elapsed;
    // Le client raccroche : toutes les fiches de sa paire sont à retirer, y compris celle
    // restée sur le correspondant absent.
    const pair = this.pairOf(call);
    pair?.plugs.forEach((line, end) => {
      if (line !== null) pair.supervision[end] = true;
    });
    this.onEvent({ type: 'callInformed', call });
    const at = this.elapsed + BALANCE.callbackDelayMs;
    if (at < BALANCE.dayDurationMs) this.callbacks.push({ at, of: call });
  }

  private pairOf(call: LiveCall): CordPair | undefined {
    return this.plugIn(call.callerLine)?.pair;
  }

  private wait(call: LiveCall, duration: number): void {
    const rate = patienceRate(call.status);
    if (rate === 0 || duration <= 0) return;
    call.remainingMs -= duration * rate;
    if (call.remainingMs <= 0) this.lose(call, 'patience');
  }

  private complete(call: LiveCall): void {
    call.status = 'done';
    call.outcome = 'served';
    this.lightSupervision(call);
    this.onEvent({ type: 'callCompleted', call });
  }

  private lose(call: LiveCall, reason: 'patience' | 'cutOff'): void {
    call.status = 'lost';
    call.remainingMs = Math.max(0, call.remainingMs);
    this.lightSupervision(call);
    this.onEvent({ type: 'callLost', call, reason });
  }

  /** Les abonnés ont raccroché : les voyants des fiches encore branchées s'allument. */
  private lightSupervision(call: LiveCall): void {
    for (const line of [call.callerLine, call.connectedLine]) {
      if (line === null) continue;
      const plugged = this.plugIn(line);
      if (plugged) plugged.pair.supervision[plugged.end] = true;
    }
  }
}
