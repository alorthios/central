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

  it('garde la même ville toute la semaine, qui que ce soit qui ouvre la journée', () => {
    const alice = player();
    const bob = player();
    rooms.handle(alice, { type: 'createRoom', role: 'operator' });
    rooms.handle(bob, { type: 'joinRoom', code: joined(alice).code, token: null });
    rooms.handle(alice, { type: 'startDay', seed: null, dayIndex: 0, speed: 1 });
    const first = alice.last('dayStarted');
    rooms.handle(bob, { type: 'startDay', seed: null, dayIndex: 1, speed: 1 });
    const second = alice.last('dayStarted');
    expect(first?.type === 'dayStarted' && second?.type === 'dayStarted').toBe(true);
    if (first?.type === 'dayStarted' && second?.type === 'dayStarted') {
      expect(second.seed).toBe(first.seed);
      expect(second.dayName).toBe('Mardi');
    }
    // Une graine explicite (?seed) change de ville.
    rooms.handle(alice, { type: 'startDay', seed: 1953, dayIndex: 0, speed: 1 });
    expect(alice.last('dayStarted')).toMatchObject({ seed: 1953 });
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

describe('RoomManager : mode développeur', () => {
  afterEach(() => vi.useRealTimers());

  it('ouvre la salle de test au premier venu, le second prend l’autre rôle', () => {
    vi.useFakeTimers();
    const rooms = new RoomManager({ devRooms: true });
    const alice = player();
    const bob = player();
    rooms.handle(alice, { type: 'devRoom', code: 'TEST', token: null, role: null });
    expect(joined(alice)).toMatchObject({ code: 'TEST', role: 'operator' });
    rooms.handle(bob, { type: 'devRoom', code: 'TEST', token: null, role: null });
    expect(joined(bob)).toMatchObject({ code: 'TEST', role: 'archivist' });
    expect(rooms.size).toBe(1);

    // Un onglet rechargé reprend sa place grâce à son jeton.
    rooms.leave(alice);
    const again = player();
    rooms.handle(again, { type: 'devRoom', code: 'TEST', token: joined(alice).token, role: null });
    expect(joined(again).role).toBe('operator');
    rooms.closeAll();
  });

  it('respecte le rôle demandé', () => {
    const rooms = new RoomManager({ devRooms: true });
    const alice = player();
    rooms.handle(alice, { type: 'devRoom', code: 'ABCD', token: null, role: 'archivist' });
    expect(joined(alice)).toMatchObject({ code: 'ABCD', role: 'archivist' });
    rooms.closeAll();
  });

  it('est refusé par un serveur de production', () => {
    const rooms = new RoomManager();
    const alice = player();
    rooms.handle(alice, { type: 'devRoom', code: 'TEST', token: null, role: null });
    expect(alice.last('joinRefused')).toEqual({ type: 'joinRefused', reason: 'devDisabled' });
    expect(rooms.size).toBe(0);
  });
});

describe('RoomManager : ligne 100', () => {
  it('relaie le texte seulement ligne ouverte, et seul l’archiviste a le combiné', () => {
    vi.useFakeTimers();
    const rooms = new RoomManager();
    const alice = player();
    const bob = player();
    rooms.handle(alice, { type: 'createRoom', role: 'operator' });
    rooms.handle(bob, { type: 'joinRoom', code: joined(alice).code, token: null });
    rooms.handle(alice, { type: 'startDay', seed: 1953, dayIndex: 0, speed: 1 });

    rooms.handle(alice, { type: 'say', text: 'Allô ?' });
    expect(bob.last('line100Message')).toBeUndefined();

    rooms.handle(alice, { type: 'handset', offHook: true });
    rooms.handle(alice, { type: 'plug', pair: 0, end: 0, line: 100 });
    rooms.handle(alice, { type: 'key', pair: 0, action: 'talk' });
    rooms.handle(alice, { type: 'say', text: 'Allô ?' });
    expect(bob.last('line100Message')).toBeUndefined();

    rooms.handle(bob, { type: 'handset', offHook: true });
    rooms.handle(alice, { type: 'say', text: 'Le docteur près de l’église ?' });
    rooms.handle(bob, { type: 'say', text: 'Morel, 134.' });
    expect(bob.received.filter((m) => m.type === 'line100Message')).toEqual([
      { type: 'line100Message', from: 'operator', text: 'Le docteur près de l’église ?', at: 0 },
      { type: 'line100Message', from: 'archivist', text: 'Morel, 134.', at: 0 },
    ]);
    rooms.closeAll();
    vi.useRealTimers();
  });
});

describe('RoomManager : sonnette', () => {
  it('un coup au plus toutes les 0,6 s, de l’étage vers le rez-de-chaussée seulement', () => {
    vi.useFakeTimers();
    const rooms = new RoomManager();
    const alice = player();
    const bob = player();
    rooms.handle(alice, { type: 'createRoom', role: 'operator' });
    rooms.handle(bob, { type: 'joinRoom', code: joined(alice).code, token: null });
    rooms.handle(alice, { type: 'startDay', seed: 1953, dayIndex: 0, speed: 1 });
    const bells = () => alice.received.filter((m) => m.type === 'bell').length;

    rooms.handle(bob, { type: 'bell' });
    rooms.handle(bob, { type: 'bell' });
    expect(bells()).toBe(1);
    vi.advanceTimersByTime(BALANCE.bell.minIntervalMs);
    rooms.handle(bob, { type: 'bell' });
    expect(bells()).toBe(2);

    rooms.handle(alice, { type: 'bell' });
    vi.advanceTimersByTime(BALANCE.bell.minIntervalMs);
    rooms.handle(alice, { type: 'bell' });
    expect(bells()).toBe(2);
    expect(bob.received.some((m) => m.type === 'bell')).toBe(false);

    vi.advanceTimersByTime(BALANCE.dayDurationMs);
    const ended = alice.last('dayEnded');
    expect(ended?.type === 'dayEnded' && ended.report.bellRings).toBe(2);
    rooms.closeAll();
    vi.useRealTimers();
  });
});
