import { describe, expect, it } from 'vitest';
import { BALANCE, type DayConfig } from '../balance.ts';
import type { CallRequest } from '../requests/generate.ts';
import type { ScheduledCall } from '../schedule.ts';
import { dayReport, starsFor } from './score.ts';
import { Switchboard } from './switchboard.ts';

const MONDAY: DayConfig = BALANCE.week[0];
const EVE: DayConfig = BALANCE.week[6];

const request = (targetLine: number): CallRequest => ({
  type: 'T0',
  targetLine,
  clues: [{ kind: 'line', line: targetLine }],
  text: `Passez-moi le ${targetLine}, s'il vous plaît.`,
  extraClue: null,
  extraText: null,
});

const call = (id: number, callerLine: number, kind: ScheduledCall['kind'] = 'normal') => ({
  id,
  at: 0,
  callerLine,
  kind,
});

/** Sert l'appel du client branché sur la paire : le correspondant décroche toujours. */
function serve(board: Switchboard, pair: number, caller: number, target: number) {
  board.plug(pair, 0, caller);
  board.plug(pair, 1, target);
  board.setKey(pair, 'ring');
}

describe('starsFor', () => {
  it.each([
    [0.59, 0],
    [0.6, 1],
    [0.75, 2],
    [0.9, 3],
    [1, 3],
  ])('taux %f : %i étoile(s)', (rate, stars) => {
    expect(starsFor(rate, 0, MONDAY)).toBe(stars);
  });

  it('retire une étoile par urgence perdue, sans descendre sous zéro', () => {
    expect(starsFor(0.95, 1, MONDAY)).toBe(2);
    expect(starsFor(0.95, 2, MONDAY)).toBe(1);
    expect(starsFor(0.65, 3, MONDAY)).toBe(0);
  });

  it('note le réveillon avec ses propres seuils', () => {
    expect(starsFor(0.4, 0, EVE)).toBe(1);
    expect(starsFor(0.55, 0, EVE)).toBe(2);
    expect(starsFor(0.7, 0, EVE)).toBe(3);
  });
});

describe('dayReport', () => {
  it('compte servis, prévenus, perdus et le temps moyen', () => {
    let roll = 0;
    // Le premier tirage rend absent le correspondant du premier appel ; ensuite tout le monde répond.
    const board = new Switchboard(
      () => {},
      () => (roll++ === 0 ? 0 : 0.5),
    );
    board.receive(call(0, 141), request(134));
    board.receive(call(1, 142), request(135));
    board.receive(call(2, 143, 'urgent'), request(136));

    serve(board, 0, 141, 134);
    board.advanceTo(BALANCE.ringsBeforeAbsent * BALANCE.ringIntervalMs);
    board.setKey(0, 'talk'); // absent : on prévient le client.

    serve(board, 1, 142, 135);
    board.advanceTo(board.elapsedMs + BALANCE.ringsBeforeAbsent * BALANCE.ringIntervalMs);
    board.advanceTo(BALANCE.dayDurationMs); // l'urgence de la 143 n'est jamais servie.

    const report = dayReport(board, MONDAY);
    expect(report).toMatchObject({
      dayName: 'Lundi',
      // Le client prévenu rappelle 90 s plus tard ; personne ne lui répond.
      received: 4,
      served: 2,
      informed: 1,
      lost: 2,
      urgentLost: 1,
      wrongConnections: 0,
      whichOneAsked: 0,
    });
    expect(report.serviceRate).toBe(0.5);
    // 50 % : aucune étoile, journée à rejouer.
    expect(report.stars).toBe(0);
    expect(report.replay).toBe(true);
    expect(report.averageHandlingMs).toBeGreaterThan(0);
  });

  it('une journée sans appel est parfaite', () => {
    expect(dayReport(new Switchboard(), MONDAY)).toMatchObject({
      received: 0,
      serviceRate: 1,
      stars: 3,
      averageHandlingMs: null,
    });
  });
});
