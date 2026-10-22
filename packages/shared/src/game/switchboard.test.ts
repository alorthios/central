import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance.ts';
import type { CallRequest } from '../requests/generate.ts';
import type { ScheduledCall } from '../schedule.ts';
import { Switchboard, type SwitchboardEvent } from './switchboard.ts';
import { operatorView } from './views.ts';

const request: CallRequest = {
  type: 'T0',
  targetLine: 134,
  clues: [{ kind: 'line', line: 134 }],
  text: "Passez-moi le 134, s'il vous plaît.",
  extraClue: null,
  extraText: null,
};

const call = (over: Partial<ScheduledCall> = {}): ScheduledCall => ({
  id: 0,
  at: 1_000,
  callerLine: 141,
  kind: 'normal',
  ...over,
});

describe('Switchboard', () => {
  it('fait sonner la ligne de l’appelant', () => {
    const board = new Switchboard();
    board.advanceTo(1_000);
    board.receive(call(), request);
    expect(board.activeCallOn(141)?.status).toBe('ringing');
    expect(operatorView(board).lamps).toEqual([
      { line: 141, state: 'ringing', cap: 'white', urgency: 0 },
    ]);
  });

  it('use la patience puis le client raccroche', () => {
    const events: SwitchboardEvent[] = [];
    const board = new Switchboard((e) => events.push(e));
    board.advanceTo(1_000);
    board.receive(call(), request);

    board.advanceTo(1_000 + BALANCE.patienceMs.normal / 2);
    expect(operatorView(board).lamps[0]?.urgency).toBe(0.5);

    board.advanceTo(1_000 + BALANCE.patienceMs.normal);
    expect(events).toEqual([{ type: 'callLost', call: board.calls[0] }]);
    expect(board.activeCallOn(141)).toBeUndefined();
    expect(operatorView(board).lamps).toEqual([]);
  });

  it('donne moins de patience à une urgence, sous capuchon rouge', () => {
    const board = new Switchboard();
    board.receive(call({ kind: 'urgent', at: 0 }), request);
    expect(operatorView(board).lamps[0]?.cap).toBe('red');
    board.advanceTo(BALANCE.patienceMs.urgent);
    expect(board.calls[0]?.status).toBe('lost');
  });

  it('compte le retard si l’appel est reçu après son heure', () => {
    const board = new Switchboard();
    board.advanceTo(5_000);
    board.receive(call({ at: 1_000 }), request);
    expect(board.calls[0]?.remainingMs).toBe(BALANCE.patienceMs.normal - 4_000);
  });

  it('ne fait rien si le temps recule', () => {
    const board = new Switchboard();
    board.receive(call({ at: 0 }), request);
    board.advanceTo(10_000);
    board.advanceTo(5_000);
    expect(board.calls[0]?.remainingMs).toBe(BALANCE.patienceMs.normal - 10_000);
  });

  it('ne révèle au standardiste ni l’appelant ni sa demande', () => {
    const board = new Switchboard();
    board.receive(call({ at: 0 }), request);
    const json = JSON.stringify(operatorView(board));
    expect(json).not.toContain('134');
    expect(json).not.toContain('Passez-moi');
  });
});
