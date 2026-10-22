import { BALANCE } from '../balance.ts';
import type { CallRequest } from '../requests/generate.ts';
import type { ScheduledCall, ScheduledCallKind } from '../schedule.ts';

/** Pour l'instant un appel sonne puis, faute de réponse, le client raccroche. */
export type CallStatus = 'ringing' | 'lost';

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

export type SwitchboardEvent = { type: 'callLost'; call: LiveCall };

/**
 * L'état du standard pendant une journée : les appels en cours et leur patience. Comme la
 * simulation, il avance par `advanceTo(elapsedMs)` et reste déterministe.
 */
export class Switchboard {
  readonly calls: LiveCall[] = [];
  private elapsed = 0;
  private readonly onEvent: (event: SwitchboardEvent) => void;

  constructor(onEvent: (event: SwitchboardEvent) => void = () => {}) {
    this.onEvent = onEvent;
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
      if (call.status !== 'ringing') continue;
      call.remainingMs -= delta;
      if (call.remainingMs <= 0) {
        call.remainingMs = 0;
        call.status = 'lost';
        this.onEvent({ type: 'callLost', call });
      }
    }
  }

  /** L'appel qui occupe une ligne, s'il y en a un. */
  activeCallOn(line: number): LiveCall | undefined {
    return this.calls.find((c) => c.callerLine === line && c.status === 'ringing');
  }
}
