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
    expect(events).toEqual([{ type: 'callLost', call: board.calls[0], reason: 'patience' }]);
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

  it('ne révèle au standardiste ni la cible ni la demande', () => {
    const board = new Switchboard();
    board.receive(call({ at: 0 }), request);
    const json = JSON.stringify(operatorView(board));
    expect(json).not.toContain('134');
    expect(json).not.toContain('Passez-moi');
  });
});

describe('Switchboard : cordons', () => {
  function ringing(at = 0) {
    const events: SwitchboardEvent[] = [];
    const board = new Switchboard((e) => events.push(e));
    board.receive(call({ at }), request);
    return { board, events };
  }

  it('a 8 paires, fiches sur la tablette', () => {
    const board = new Switchboard();
    expect(board.pairs).toHaveLength(BALANCE.cordPairs);
    expect(board.pairs.every((p) => p.plugs[0] === null && p.plugs[1] === null)).toBe(true);
  });

  it('répond à un appel en branchant une fiche : le client attend, l’ampoule est fixe', () => {
    const { board, events } = ringing();
    expect(board.plug(0, 0, 141)).toBeNull();
    expect(board.calls[0]?.status).toBe('held');
    expect(events.map((e) => e.type)).toEqual(['callAnswered']);
    expect(operatorView(board).lamps[0]?.state).toBe('steady');
    expect(operatorView(board).pairs[0]?.plugs[0]).toEqual({ line: 141, supervision: false });
  });

  it('en attente, la patience s’use deux fois moins vite', () => {
    const { board } = ringing();
    board.plug(0, 1, 141);
    board.advanceTo(10_000);
    expect(board.calls[0]?.remainingMs).toBe(
      BALANCE.patienceMs.normal - 10_000 * BALANCE.onHoldPatienceRate,
    );
  });

  it('les deux fiches d’une paire sont identiques et relient deux lignes', () => {
    const { board } = ringing();
    expect(board.plug(2, 1, 141)).toBeNull();
    expect(board.plug(2, 0, 134)).toBeNull();
    expect(board.pairs[2]?.plugs).toEqual([134, 141]);
    expect(board.plugIn(134)).toEqual({ pair: board.pairs[2], end: 0 });
  });

  it('refuse une prise déjà occupée', () => {
    const { board } = ringing();
    board.plug(0, 0, 141);
    expect(board.plug(1, 0, 141)).toBe('jackBusy');
    expect(board.plug(0, 1, 141)).toBe('jackBusy');
  });

  it('refuse de relier un client à la ligne 100, dans un sens comme dans l’autre', () => {
    const board = new Switchboard();
    board.plug(0, 0, 141);
    expect(board.plug(0, 1, 100)).toBe('clientToArchivist');
    board.plug(1, 0, 100);
    expect(board.plug(1, 1, 152)).toBe('clientToArchivist');
    expect(board.pairs[1]?.plugs).toEqual([100, null]);
  });

  it('refuse une paire ou une ligne inexistante', () => {
    const board = new Switchboard();
    expect(board.plug(8, 0, 141)).toBe('unknownPair');
    expect(board.plug(0, 0, 99)).toBe('unknownLine');
    expect(board.plug(0, 0, 180)).toBe('unknownLine');
  });

  it('déplace une fiche d’une prise à une autre', () => {
    const board = new Switchboard();
    board.plug(0, 0, 150);
    expect(board.plug(0, 0, 151)).toBeNull();
    expect(board.plugIn(150)).toBeUndefined();
    expect(board.pairs[0]?.plugs[0]).toBe(151);
  });

  it('débrancher un client en attente le coupe', () => {
    const { board, events } = ringing();
    board.plug(0, 0, 141);
    board.unplug(0, 0);
    expect(board.calls[0]?.status).toBe('lost');
    expect(events.at(-1)).toMatchObject({ type: 'callLost', reason: 'cutOff' });
    expect(board.pairs[0]?.supervision).toEqual([false, false]);
  });

  it('allume la supervision quand le client branché raccroche, l’éteint au débranchement', () => {
    const { board } = ringing();
    board.plug(0, 0, 141);
    board.advanceTo(BALANCE.patienceMs.normal / BALANCE.onHoldPatienceRate);
    expect(board.calls[0]?.status).toBe('lost');
    expect(operatorView(board).pairs[0]?.plugs[0]).toEqual({ line: 141, supervision: true });
    expect(operatorView(board).lamps).toEqual([]);

    board.unplug(0, 0);
    expect(operatorView(board).pairs[0]?.plugs[0]).toEqual({ line: null, supervision: false });
  });

  it('ne rallume pas la supervision en rebranchant plus tard sur la même ligne', () => {
    const { board } = ringing();
    board.advanceTo(BALANCE.patienceMs.normal);
    expect(board.calls[0]?.status).toBe('lost');
    board.plug(3, 0, 141);
    expect(board.pairs[3]?.supervision).toEqual([false, false]);
  });
});
