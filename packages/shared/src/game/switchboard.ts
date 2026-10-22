import { BALANCE } from '../balance.ts';
import { ARCHIVIST_LINE, FIRST_SUBSCRIBER_LINE, SUBSCRIBER_COUNT } from '../city/generate.ts';
import type { CallRequest } from '../requests/generate.ts';
import type { ScheduledCall, ScheduledCallKind } from '../schedule.ts';

/**
 * `ringing` : personne n'a répondu ; `held` : une fiche est branchée sur la ligne du
 * client, qui attend ; `lost` : le client a raccroché.
 */
export type CallStatus = 'ringing' | 'held' | 'lost';

export interface LiveCall {
  id: number;
  callerLine: number;
  kind: ScheduledCallKind;
  request: CallRequest;
  arrivedAt: number;
  patienceMs: number;
  remainingMs: number;
  status: CallStatus;
}

/** Une extrémité de paire : 0 ou 1. Les deux fiches d'une paire sont identiques (§6.3). */
export type PlugEnd = 0 | 1;

export interface CordPair {
  id: number;
  /** La ligne où chaque fiche est branchée ; null : la fiche est sur la tablette. */
  plugs: [number | null, number | null];
  /**
   * Voyant de supervision de chaque fiche (§6.3) : allumé quand l'abonné de ce côté a
   * raccroché alors que la fiche était branchée. Il s'éteint quand on retire la fiche.
   */
  supervision: [boolean, boolean];
}

export type PlugRefusal = 'unknownPair' | 'unknownLine' | 'jackBusy' | 'clientToArchivist';

export type SwitchboardEvent =
  | { type: 'callLost'; call: LiveCall; reason: 'patience' | 'cutOff' }
  | { type: 'callAnswered'; call: LiveCall };

const LAST_LINE = FIRST_SUBSCRIBER_LINE + SUBSCRIBER_COUNT - 1;

/**
 * L'état du standard pendant une journée : les appels, leur patience et les cordons.
 * Comme la simulation, il avance par `advanceTo(elapsedMs)` et reste déterministe.
 */
export class Switchboard {
  readonly calls: LiveCall[] = [];
  readonly pairs: CordPair[];
  private elapsed = 0;
  private readonly onEvent: (event: SwitchboardEvent) => void;

  constructor(
    onEvent: (event: SwitchboardEvent) => void = () => {},
    pairCount: number = BALANCE.cordPairs,
  ) {
    this.onEvent = onEvent;
    this.pairs = Array.from({ length: pairCount }, (_, id) => ({
      id,
      plugs: [null, null],
      supervision: [false, false],
    }));
  }

  get elapsedMs(): number {
    return this.elapsed;
  }

  receive(call: ScheduledCall, request: CallRequest): void {
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
    });
  }

  advanceTo(elapsedMs: number): void {
    const delta = elapsedMs - this.elapsed;
    if (delta <= 0) return;
    this.elapsed = elapsedMs;
    for (const call of this.calls) {
      if (call.status === 'lost') continue;
      // Un client à qui l'on a répondu s'impatiente moins vite (§6.5).
      call.remainingMs -= call.status === 'held' ? delta * BALANCE.onHoldPatienceRate : delta;
      if (call.remainingMs <= 0) this.lose(call, 'patience');
    }
  }

  /** L'appel en cours sur une ligne (qui sonne ou attend), s'il y en a un. */
  activeCallOn(line: number): LiveCall | undefined {
    return this.calls.find((c) => c.callerLine === line && c.status !== 'lost');
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
    const other = pair.plugs[end === 0 ? 1 : 0];
    if (other !== null && (line === ARCHIVIST_LINE) !== (other === ARCHIVIST_LINE)) {
      return 'clientToArchivist';
    }

    this.unplug(pairId, end);
    pair.plugs[end] = line;
    const call = this.activeCallOn(line);
    if (call?.status === 'ringing') {
      call.status = 'held';
      this.onEvent({ type: 'callAnswered', call });
    }
    return null;
  }

  /** Remet une fiche sur la tablette. Un client en attente est alors coupé. */
  unplug(pairId: number, end: PlugEnd): void {
    const pair = this.pairs[pairId];
    const line = pair?.plugs[end];
    if (!pair || line === null || line === undefined) return;
    pair.plugs[end] = null;
    pair.supervision[end] = false;
    const call = this.activeCallOn(line);
    if (call?.status === 'held') this.lose(call, 'cutOff');
  }

  private lose(call: LiveCall, reason: 'patience' | 'cutOff'): void {
    call.status = 'lost';
    call.remainingMs = Math.max(0, call.remainingMs);
    const plugged = this.plugIn(call.callerLine);
    if (plugged) plugged.pair.supervision[plugged.end] = true;
    this.onEvent({ type: 'callLost', call, reason });
  }
}
