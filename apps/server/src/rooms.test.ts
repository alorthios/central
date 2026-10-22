import { BALANCE, ROOM_CODE_PATTERN, type ServerMessage } from '@allo-central/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Player, RoomManager } from './rooms.ts';

/** Un joueur factice qui garde ce qu'il reçoit. */
function player() {
  const received: ServerMessage[] = [];
  const p: Player & {
    received: ServerMessage[];
    last: (type: string) => ServerMessage | undefined;
  } = {
    received,
    send: (m) => received.push(m),
    last: (type) => received.findLast((m) => m.type === type),
  };
  return p;
}

function joined(p: ReturnType<typeof player>) {
  const message = p.last('roomJoined');
  if (message?.type !== 'roomJoined') throw new Error('pas dans une salle');
  return message;
}

describe('RoomManager', () => {
  let rooms: RoomManager;
  beforeEach(() => {
    vi.useFakeTimers();
    rooms = new RoomManager();
  });
  afterEach(() => {
    rooms.closeAll();
    vi.useRealTimers();
  });

  it('crée une salle avec un code de quatre lettres et le rôle choisi', () => {
    const alice = player();
    rooms.handle(alice, { type: 'createRoom', role: 'archivist' });
    const { code, role, token } = joined(alice);
    expect(code).toMatch(ROOM_CODE_PATTERN);
    expect(role).toBe('archivist');
    expect(token).toBeTruthy();
    expect(alice.last('roomState')).toMatchObject({
      players: { operator: 'empty', archivist: 'connected' },
      playing: false,
    });
  });

  it('le second joueur prend le rôle restant, le troisième est refusé', () => {
    const alice = player();
    const bob = player();
    const carol = player();
    rooms.handle(alice, { type: 'createRoom', role: 'operator' });
    const { code } = joined(alice);

    rooms.handle(bob, { type: 'joinRoom', code, token: null });
    expect(joined(bob).role).toBe('archivist');
    expect(alice.last('roomState')).toMatchObject({
      players: { operator: 'connected', archivist: 'connected' },
    });

    rooms.handle(carol, { type: 'joinRoom', code, token: null });
    expect(carol.last('joinRefused')).toEqual({ type: 'joinRefused', reason: 'roomFull' });
  });

  it('refuse un code inconnu', () => {
    const alice = player();
    rooms.handle(alice, { type: 'joinRoom', code: 'ZZZZ', token: null });
    expect(alice.last('joinRefused')).toEqual({ type: 'joinRefused', reason: 'unknownRoom' });
  });

  it('chaque joueur ne reçoit que la vue de son rôle', () => {
    const alice = player();
    const bob = player();
    rooms.handle(alice, { type: 'createRoom', role: 'operator' });
    rooms.handle(bob, { type: 'joinRoom', code: joined(alice).code, token: null });
    rooms.handle(bob, { type: 'startDay', seed: 1953, dayIndex: 0, speed: 1 });
    vi.advanceTimersByTime(1_000);

    const types = (p: ReturnType<typeof player>) => new Set(p.received.map((m) => m.type));
    expect(types(alice)).toContain('operatorView');
    expect(types(alice)).not.toContain('archivistView');
    expect(types(bob)).toContain('archivistView');
    expect(types(bob)).not.toContain('operatorView');
    expect(types(bob)).toContain('dayStarted');
    // Les documents de l'archiviste ne descendent jamais au rez-de-chaussée.
    expect(types(bob)).toContain('archivistDesk');
    expect(types(alice)).not.toContain('archivistDesk');
  });

  it('seul le standardiste touche au panneau', () => {
    const alice = player();
    const bob = player();
    rooms.handle(alice, { type: 'createRoom', role: 'operator' });
    rooms.handle(bob, { type: 'joinRoom', code: joined(alice).code, token: null });
    rooms.handle(alice, { type: 'startDay', seed: 1953, dayIndex: 0, speed: 1 });

    rooms.handle(bob, { type: 'plug', pair: 0, end: 0, line: 141 });
    const view = alice.last('operatorView');
    expect(view?.type === 'operatorView' && view.view.pairs[0]?.plugs[0]?.line).toBeNull();

    rooms.handle(alice, { type: 'plug', pair: 0, end: 0, line: 141 });
    const after = alice.last('operatorView');
    expect(after?.type === 'operatorView' && after.view.pairs[0]?.plugs[0]?.line).toBe(141);
  });

  it('met la journée en pause quand un joueur part, la reprend à son retour', () => {
    const alice = player();
    const bob = player();
    rooms.handle(alice, { type: 'createRoom', role: 'operator' });
    const { code } = joined(alice);
    rooms.handle(bob, { type: 'joinRoom', code, token: null });
    const { token } = joined(bob);
    rooms.handle(alice, { type: 'startDay', seed: 1953, dayIndex: 0, speed: 1 });
    vi.advanceTimersByTime(10_000);

    rooms.leave(bob);
    expect(alice.last('roomState')).toMatchObject({
      players: { archivist: 'away' },
      playing: true,
      paused: true,
    });
    const elapsed = () => {
      const view = alice.last('operatorView');
      return view?.type === 'operatorView' ? view.view.elapsedMs : -1;
    };
    const frozen = elapsed();
    vi.advanceTimersByTime(60_000);
    expect(elapsed()).toBe(frozen);

    // Il revient avec son jeton : même rôle, la journée repart et il retrouve son écran.
    const bobAgain = player();
    rooms.handle(bobAgain, { type: 'joinRoom', code, token });
    expect(joined(bobAgain).role).toBe('archivist');
    expect(bobAgain.last('dayStarted')).toMatchObject({ dayName: 'Lundi' });
    expect(alice.last('roomState')).toMatchObject({ paused: false });
    vi.advanceTimersByTime(1_000);
    expect(elapsed()).toBeGreaterThan(frozen);
  });

  it('un joueur sans jeton reprend la place d’un joueur parti', () => {
    const alice = player();
    const bob = player();
    rooms.handle(alice, { type: 'createRoom', role: 'operator' });
    const { code } = joined(alice);
    rooms.handle(bob, { type: 'joinRoom', code, token: null });
    rooms.handle(alice, { type: 'startDay', seed: 1953, dayIndex: 0, speed: 1 });
    rooms.leave(bob);

    const bobNewTab = player();
    rooms.handle(bobNewTab, { type: 'joinRoom', code, token: null });
    expect(joined(bobNewTab).role).toBe('archivist');
    expect(alice.last('roomState')).toMatchObject({ paused: false });

    // L'ancien jeton ne donne plus rien : la place est reprise.
    const carol = player();
    rooms.handle(carol, { type: 'joinRoom', code, token: joined(bob).token });
    expect(carol.last('joinRefused')).toEqual({ type: 'joinRefused', reason: 'roomFull' });
  });

  it('une partie en solo n’est jamais en pause', () => {
    const alice = player();
    rooms.handle(alice, { type: 'createRoom', role: 'operator' });
    rooms.handle(alice, { type: 'startDay', seed: 1953, dayIndex: 0, speed: 1 });
    expect(alice.last('roomState')).toMatchObject({ playing: true, paused: false });
  });

  it('oublie une salle restée vide', () => {
    const alice = player();
    rooms.handle(alice, { type: 'createRoom', role: 'operator' });
    rooms.handle(alice, { type: 'startDay', seed: 1953, dayIndex: 0, speed: 1 });
    rooms.leave(alice);
    expect(rooms.size).toBe(1);
    vi.advanceTimersByTime(BALANCE.dayDurationMs);
    expect(rooms.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
