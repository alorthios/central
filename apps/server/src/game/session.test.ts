import { BALANCE, type ServerMessage } from '@allo-central/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameClock } from './clock.ts';
import { GameSession } from './session.ts';

function start(dayIndex = 1) {
  const messages: ServerMessage[] = [];
  const session = new GameSession({
    seed: 1953,
    dayIndex,
    send: (m) => messages.push(m),
    clock: new GameClock(() => Date.now()),
  });
  session.start();
  const views = () => messages.flatMap((m) => (m.type === 'operatorView' ? [m.view] : []));
  return { session, messages, views };
}

describe('GameSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('annonce la journée et envoie la vue du panneau', () => {
    const { messages, views } = start();
    expect(messages[0]).toEqual({ type: 'dayStarted', seed: 1953, dayIndex: 1, dayName: 'Mardi' });
    vi.advanceTimersByTime(1_000);
    expect(views().length).toBeGreaterThan(1);
  });

  it('fait sonner chaque appel à son heure puis le laisse raccrocher', () => {
    const { session, views } = start();
    expect(session.board.calls).toEqual([]);

    const call = session.schedule[0];
    if (!call) throw new Error('planning vide');

    vi.advanceTimersByTime(call.at + 200);
    expect(
      views()
        .at(-1)
        ?.lamps.map((l) => l.line),
    ).toContain(call.callerLine);

    vi.advanceTimersByTime(BALANCE.patienceMs.normal);
    expect(session.board.calls[0]?.status).toBe('lost');
  });

  it('termine la journée à 18 h et s’arrête', () => {
    const { session, messages } = start(0);
    vi.advanceTimersByTime(BALANCE.dayDurationMs + 200);
    expect(messages.at(-1)).toEqual({ type: 'dayEnded' });
    expect(session.running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('applique les branchements et renvoie la vue aussitôt', () => {
    const { session, messages, views } = start();
    const call = session.schedule[0];
    if (!call) throw new Error('planning vide');
    vi.advanceTimersByTime(call.at + 100);

    const before = messages.length;
    session.plug(0, 0, call.callerLine);
    expect(messages.length).toBe(before + 1);
    expect(views().at(-1)?.pairs[0]?.plugs[0]?.line).toBe(call.callerLine);
    expect(
      views()
        .at(-1)
        ?.lamps.find((l) => l.line === call.callerLine)?.state,
    ).toBe('steady');

    session.unplug(0, 0);
    expect(views().at(-1)?.pairs[0]?.plugs[0]?.line).toBeNull();
    expect(session.board.calls[0]?.status).toBe('lost');
  });

  it('signale un branchement refusé', () => {
    const { session, messages } = start();
    session.plug(0, 0, 141);
    session.plug(0, 1, 100);
    expect(messages).toContainEqual({
      type: 'plugRefused',
      pair: 0,
      end: 1,
      line: 100,
      reason: 'clientToArchivist',
    });
  });

  it('ignore les gestes avant le début ou après la fin de journée', () => {
    const messages: ServerMessage[] = [];
    const session = new GameSession({ seed: 1, dayIndex: 0, send: (m) => messages.push(m) });
    session.plug(0, 0, 141);
    expect(messages).toEqual([]);
  });

  it('refuse une journée inconnue', () => {
    expect(() => new GameSession({ seed: 1, dayIndex: 99, send: () => {} })).toThrow();
  });
});
