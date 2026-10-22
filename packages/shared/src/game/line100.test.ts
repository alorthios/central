import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance.ts';
import type { CallRequest } from '../requests/generate.ts';
import { Switchboard } from './switchboard.ts';
import { operatorView } from './views.ts';

const lamp100 = (board: Switchboard) =>
  operatorView(board).lamps.find((l) => l.line === 100)?.state ?? 'off';

describe('Switchboard : ligne 100 (§8)', () => {
  it('ne s’ouvre qu’avec une paire sur la 100, le combiné décroché et la clé levée', () => {
    const board = new Switchboard();
    board.plug(0, 0, 100);
    board.setKey(0, 'talk');
    expect(board.line100Open()).toBe(false);
    board.setHandset(true);
    expect(board.line100Open()).toBe(true);
    expect(board.headset().hearing).toEqual({ kind: 'archivist' });
    board.setKey(0, 'rest');
    expect(board.line100Open()).toBe(false);
  });

  it('sonner l’étage fait sonner le téléphone de l’archiviste quelques instants', () => {
    const events: string[] = [];
    const board = new Switchboard((e) => events.push(e.type));
    board.plug(0, 0, 100);
    board.setKey(0, 'ring');
    expect(board.upstairsRinging).toBe(true);
    expect(events).toEqual(['upstairsRinging']);
    board.setKey(0, 'talk');
    expect(board.headset().hearing).toEqual({ kind: 'ringback' });

    board.advanceTo(BALANCE.ringsBeforeAbsent * BALANCE.ringIntervalMs);
    expect(board.upstairsRinging).toBe(false);
  });

  it('l’étage appelle : l’ampoule 100 clignote, fixe une fois branchée, scintille en ligne', () => {
    const board = new Switchboard();
    board.setHandset(true);
    expect(lamp100(board)).toBe('ringing');
    board.plug(0, 0, 100);
    expect(lamp100(board)).toBe('steady');
    board.setKey(0, 'talk');
    expect(lamp100(board)).toBe('flicker');
    expect(operatorView(board).line100Open).toBe(true);
  });

  it('quand l’archiviste raccroche, le voyant de la fiche sur la 100 s’allume', () => {
    const board = new Switchboard();
    board.plug(0, 1, 100);
    board.setHandset(true);
    board.setKey(0, 'talk');
    board.setHandset(false);
    expect(board.pairs[0]?.supervision).toEqual([false, true]);
    expect(lamp100(board)).toBe('off');
    expect(board.headset().hearing).toEqual({ kind: 'silence' });
  });

  it('en ligne avec l’étage, on n’entend aucun client', () => {
    const request: CallRequest = {
      type: 'T0',
      targetLine: 134,
      clues: [{ kind: 'line', line: 134 }],
      text: "Passez-moi le 134, s'il vous plaît.",
      extraClue: null,
      extraText: null,
    };
    const board = new Switchboard();
    board.receive({ id: 0, at: 0, callerLine: 141, kind: 'normal' }, request);
    board.plug(0, 0, 141);
    board.plug(1, 0, 100);
    board.setHandset(true);
    board.setKey(1, 'talk');
    expect(board.headset()).toEqual({ pair: 1, hearing: { kind: 'archivist' } });
    expect(board.pairs[0]?.key).toBe('rest');
  });

  it('compte le temps passé ligne ouverte', () => {
    const board = new Switchboard();
    board.plug(0, 0, 100);
    board.setHandset(true);
    board.setKey(0, 'talk');
    board.advanceTo(12_000);
    board.setKey(0, 'rest');
    board.advanceTo(20_000);
    expect(board.line100Ms).toBe(12_000);
  });
});
