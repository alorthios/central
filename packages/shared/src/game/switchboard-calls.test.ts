import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance.ts';
import type { CallRequest } from '../requests/generate.ts';
import { createRng } from '../rng.ts';
import type { ScheduledCall } from '../schedule.ts';
import { Switchboard, type SwitchboardEvent } from './switchboard.ts';
import { operatorView } from './views.ts';

/** Le client de la 141 demande le 134. */
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
  at: 0,
  callerLine: 141,
  kind: 'normal',
  ...over,
});

/** Un hasard qui ne rend jamais le correspondant absent (il décroche en deux sonneries). */
const present = () => 0.5;
/** Un hasard qui le rend toujours absent. */
const away = () => 0;

/** Le client de la 141, déjà branché sur la fiche 0 de la paire 0. */
function answered(random: () => number = present) {
  const events: SwitchboardEvent[] = [];
  const board = new Switchboard((e) => events.push(e), random);
  board.receive(call(), request);
  board.plug(0, 0, 141);
  return { board, events };
}

/** Avance jusqu'à ce que le correspondant décroche, ou soit déclaré absent. */
const afterRings = (board: Switchboard) =>
  board.advanceTo(board.elapsedMs + BALANCE.ringsBeforeAbsent * BALANCE.ringIntervalMs);

const lamps = (board: Switchboard) =>
  Object.fromEntries(operatorView(board).lamps.map((l) => [l.line, l.state]));

const firstLine = (board: Switchboard) => {
  const { hearing } = board.headset();
  return hearing.kind === 'client' ? hearing.lines[0] : undefined;
};

describe('Switchboard : clés (§6.4)', () => {
  it('clé levée : on entend la demande du client, et elle seule', () => {
    const { board } = answered();
    expect(board.headset()).toEqual({ pair: null, hearing: { kind: 'silence' } });
    board.setKey(0, 'talk');
    expect(board.headset()).toEqual({
      pair: 0,
      hearing: {
        kind: 'client',
        lines: ["Passez-moi le 134, s'il vous plaît."],
        askedWhichOne: false,
        voice: 141,
      },
    });
    expect(operatorView(board).pairs[0]?.key).toBe('talk');
  });

  it('une seule écoute : lever une clé fait retomber la précédente', () => {
    const { board } = answered();
    board.setKey(0, 'talk');
    board.setKey(3, 'talk');
    expect(board.pairs.filter((p) => p.key === 'talk')).toHaveLength(1);
    expect(board.headset().pair).toBe(3);
  });

  it('sonner ramène la clé au milieu', () => {
    const { board } = answered();
    board.setKey(0, 'talk');
    board.plug(0, 1, 134);
    board.setKey(0, 'ring');
    expect(board.pairs[0]?.key).toBe('rest');
  });

  it('sonner sans correspondant branché ne fait rien', () => {
    const { board } = answered();
    board.setKey(0, 'ring');
    expect(board.calls[0]?.status).toBe('held');
  });
});

describe('Switchboard : déroulé d’un appel (§5.1)', () => {
  it('sonnerie, conversation, fin, fiches retirées', () => {
    const { board, events } = answered();
    board.plug(0, 1, 134);
    board.setKey(0, 'ring');
    expect(board.calls[0]?.status).toBe('connecting');
    board.setKey(0, 'talk');
    expect(board.headset().hearing).toEqual({ kind: 'ringback' });

    afterRings(board);
    expect(board.calls[0]?.status).toBe('talking');
    expect(board.headset().hearing).toEqual({ kind: 'conversation' });
    expect(lamps(board)).toEqual({ 141: 'flicker', 134: 'flicker' });

    board.advanceTo(board.elapsedMs + BALANCE.conversationMs.max);
    expect(board.calls[0]).toMatchObject({ status: 'done', outcome: 'served' });
    expect(events.at(-1)?.type).toBe('callCompleted');
    expect(lamps(board)).toEqual({ 141: 'slowBlink', 134: 'slowBlink' });
    expect(board.pairs[0]?.supervision).toEqual([true, true]);

    board.unplug(0, 0);
    expect(lamps(board)).toEqual({ 134: 'slowBlink' });
    board.unplug(0, 1);
    expect(lamps(board)).toEqual({});
  });

  it('pendant la conversation, la patience ne s’use plus', () => {
    const { board } = answered();
    board.plug(0, 1, 134);
    board.setKey(0, 'ring');
    afterRings(board);
    const remaining = board.calls[0]?.remainingMs;
    board.advanceTo(board.elapsedMs + 20_000);
    expect(board.calls[0]?.remainingMs).toBe(remaining);
  });

  it('retirer la fiche du correspondant pendant qu’il sonne : le client attend de nouveau', () => {
    const { board } = answered();
    board.plug(0, 1, 134);
    board.setKey(0, 'ring');
    board.unplug(0, 1);
    expect(board.calls[0]).toMatchObject({ status: 'held', connectedLine: null });
  });

  it('couper une conversation perd l’appel et allume la supervision de l’autre côté', () => {
    const { board, events } = answered();
    board.plug(0, 1, 134);
    board.setKey(0, 'ring');
    afterRings(board);
    board.unplug(0, 1);
    expect(board.calls[0]?.status).toBe('lost');
    expect(events.at(-1)).toMatchObject({ type: 'callLost', reason: 'cutOff' });
    expect(board.pairs[0]?.supervision[0]).toBe(true);
  });

  it('le client peut raccrocher pendant que le correspondant sonne', () => {
    const board = new Switchboard(() => {}, present);
    board.receive(call(), request);
    board.advanceTo(BALANCE.patienceMs.normal - 500);
    board.plug(0, 0, 141);
    board.plug(0, 1, 134);
    board.setKey(0, 'ring');
    board.advanceTo(board.elapsedMs + 1_000);
    expect(board.calls[0]?.status).toBe('lost');
  });

  it('est déterministe pour un même générateur', () => {
    const results = [1, 2].map(() => {
      const { board } = answered(createRng(42));
      board.plug(0, 1, 134);
      board.setKey(0, 'ring');
      afterRings(board);
      return [board.calls[0]?.status, board.calls[0]?.nextAt];
    });
    expect(results[0]).toEqual(results[1]);
  });
});

describe('Switchboard : situations (§6.5)', () => {
  it('occupé : la ligne demandée sonne déjà, la tonalité répond aussitôt', () => {
    const { board, events } = answered();
    board.receive(call({ id: 1, callerLine: 134 }), request);
    // La seconde fiche d'une paire qui tient un client ne répond pas à une ligne qui sonne.
    board.plug(0, 1, 134);
    expect(board.activeCallOn(134)?.status).toBe('ringing');

    board.setKey(0, 'ring');
    expect(board.calls[0]).toMatchObject({ status: 'unreachable', unreachable: 'busy' });
    expect(events.at(-1)).toMatchObject({ type: 'callUnreachable', reason: 'busy' });
    expect(lamps(board)[141]).toBe('steady');
  });

  it('absent : personne ne décroche après trois sonneries', () => {
    const { board, events } = answered(away);
    board.plug(0, 1, 134);
    board.setKey(0, 'ring');
    board.advanceTo(board.elapsedMs + (BALANCE.ringsBeforeAbsent - 1) * BALANCE.ringIntervalMs);
    expect(board.calls[0]?.status).toBe('connecting');
    afterRings(board);
    expect(board.calls[0]).toMatchObject({ status: 'unreachable', unreachable: 'absent' });
    expect(events.at(-1)).toMatchObject({ type: 'callUnreachable', reason: 'absent' });
  });

  it('lever la clé prévient le client : servi, il rappellera plus tard', () => {
    const { board, events } = answered(away);
    board.plug(0, 1, 134);
    board.setKey(0, 'ring');
    afterRings(board);

    board.setKey(0, 'talk');
    expect(board.calls[0]).toMatchObject({ status: 'done', outcome: 'informed' });
    expect(events.at(-1)?.type).toBe('callInformed');
    expect(board.headset().hearing).toEqual({ kind: 'informed', reason: 'absent' });
    expect(board.pairs[0]?.supervision).toEqual([true, true]);
    expect(lamps(board)[141]).toBe('slowBlink');

    board.unplug(0, 0);
    board.unplug(0, 1);
    board.advanceTo(board.elapsedMs + BALANCE.callbackDelayMs);
    expect(board.activeCallOn(141)).toMatchObject({ status: 'ringing', callbackOf: 0, request });

    board.plug(2, 0, 141);
    board.setKey(2, 'talk');
    expect(firstLine(board)).toBe("C'est encore moi.");
  });

  it('clé levée pendant la sonnerie : le client entend que personne ne répond, il est prévenu', () => {
    const { board } = answered(away);
    board.plug(0, 1, 134);
    board.setKey(0, 'ring');
    board.setKey(0, 'talk');
    afterRings(board);
    expect(board.calls[0]?.outcome).toBe('informed');
  });

  it('on peut aussi rappeler un absent plutôt que prévenir le client', () => {
    let roll = 0;
    const { board } = answered(() => (roll++ === 0 ? 0 : 0.5));
    board.plug(0, 1, 134);
    board.setKey(0, 'ring');
    afterRings(board);
    expect(board.calls[0]?.status).toBe('unreachable');
    board.setKey(0, 'ring');
    afterRings(board);
    expect(board.calls[0]?.status).toBe('talking');
  });

  it('mauvais correspondant : le client proteste et perd patience, on peut rebrancher', () => {
    const { board, events } = answered();
    board.plug(0, 1, 152);
    board.setKey(0, 'ring');
    afterRings(board);

    expect(board.calls[0]).toMatchObject({ status: 'held', protesting: true, wrongConnections: 1 });
    expect(events.at(-1)).toMatchObject({ type: 'wrongConnection', line: 152 });
    board.setKey(0, 'talk');
    expect(firstLine(board)).toBe("Mais ce n'est pas la bonne personne !");

    board.plug(0, 1, 134);
    board.setKey(0, 'ring');
    afterRings(board);
    expect(board.calls[0]?.status).toBe('talking');
  });

  it('« Lequel ? » : une précision contre de la patience, une seule fois', () => {
    const ambiguous: CallRequest = {
      ...request,
      type: 'T2',
      text: "M. Henry, s'il vous plaît.",
      extraText: "Celui qui s'appelle Léon.",
    };
    const board = new Switchboard(() => {}, present);
    board.receive(call(), ambiguous);
    board.plug(0, 0, 141);
    board.askWhichOne();
    expect(board.calls[0]?.askedWhichOne).toBe(false);

    board.setKey(0, 'talk');
    const before = board.calls[0]?.remainingMs as number;
    board.askWhichOne();
    board.askWhichOne();
    expect(board.calls[0]?.remainingMs).toBe(before - BALANCE.whichOnePenaltyMs);
    expect(board.headset().hearing).toEqual({
      kind: 'client',
      lines: ["M. Henry, s'il vous plaît.", "Celui qui s'appelle Léon."],
      askedWhichOne: true,
      voice: 141,
    });
  });
});
