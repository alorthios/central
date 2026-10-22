import { randomInt, randomUUID } from 'node:crypto';
import {
  type ClientMessage,
  type JoinRefusal,
  type Presence,
  ROLES,
  type Role,
  type ServerMessage,
} from '@allo-central/shared';
import { GameSession } from './game/session.ts';

/** Un joueur connecté, vu du serveur : on peut seulement lui envoyer des messages. */
export interface Player {
  send(message: ServerMessage): void;
}

interface Seat {
  /** Permet au joueur de reprendre sa place après une déconnexion. */
  token: string;
  player: Player | null;
}

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** Une salle vide est gardée un moment, le temps que les joueurs reviennent. */
const EMPTY_ROOM_TTL_MS = 10 * 60_000;

/**
 * Une salle : deux sièges (standardiste, archiviste) et la journée en cours. Chaque joueur
 * ne reçoit que la vue de son rôle ; si l'un d'eux se déconnecte, la journée se met en pause
 * jusqu'à son retour (§17).
 */
export class Room {
  readonly code: string;
  private readonly seats = new Map<Role, Seat>();
  private session: GameSession | null = null;
  /** La ville de la salle : la même toute la semaine (§5.3), tirée au premier jour. */
  private seed: number | null = null;

  constructor(code: string) {
    this.code = code;
  }

  /** Plus aucun joueur connecté. */
  get empty(): boolean {
    return [...this.seats.values()].every((seat) => seat.player === null);
  }

  roleOf(player: Player): Role | undefined {
    for (const [role, seat] of this.seats) if (seat.player === player) return role;
    return undefined;
  }

  /**
   * Assied un joueur : à sa place s'il a un jeton, sinon au rôle demandé ou au rôle libre.
   * Faute de siège libre, il reprend celui d'un joueur parti (onglet fermé, jeton perdu) :
   * une partie ne doit pas rester bloquée en pause.
   */
  join(player: Player, token: string | null, wanted?: Role): Role | JoinRefusal {
    let role = [...this.seats].find(([, seat]) => token !== null && seat.token === token)?.[0];
    if (role === undefined) {
      role =
        wanted ??
        ROLES.find((r) => !this.seats.has(r)) ??
        ROLES.find((r) => this.seats.get(r)?.player === null);
      if (role === undefined || this.seats.get(role)?.player) return 'roomFull';
      this.seats.set(role, { token: randomUUID(), player: null });
    }
    const seat = this.seats.get(role) as Seat;
    seat.player = player;
    player.send({ type: 'roomJoined', code: this.code, role, token: seat.token });

    // Un joueur qui revient en pleine journée retrouve son écran.
    if (this.session?.running) this.session.rejoin(role);
    this.updatePause();
    this.broadcastState();
    return role;
  }

  leave(player: Player): void {
    const role = this.roleOf(player);
    if (!role) return;
    (this.seats.get(role) as Seat).player = null;
    this.updatePause();
    this.broadcastState();
  }

  handle(player: Player, message: ClientMessage): void {
    const role = this.roleOf(player);
    if (!role) return;
    if (message.type === 'startDay') {
      this.seed = message.seed ?? this.seed ?? randomInt(1_000_000);
      this.session?.stop();
      this.session = new GameSession({
        seed: this.seed,
        dayIndex: message.dayIndex,
        speed: message.speed,
        send: (m, to) => this.send(m, to),
      });
      this.session.start();
      this.updatePause();
      this.broadcastState();
      return;
    }
    if (!this.session) return;
    if (message.type === 'say') {
      this.session.say(role, message.text);
      return;
    }
    // Le combiné est à l'étage ; le panneau, au rez-de-chaussée.
    if (message.type === 'bell') {
      if (role === 'archivist') this.session.bell();
      return;
    }
    if (message.type === 'handset') {
      if (role === 'archivist') this.session.handset(message.offHook);
      return;
    }
    if (role !== 'operator') return;
    switch (message.type) {
      case 'plug':
        this.session.plug(message.pair, message.end, message.line);
        break;
      case 'unplug':
        this.session.unplug(message.pair, message.end);
        break;
      case 'key':
        this.session.key(message.pair, message.action);
        break;
      case 'whichOne':
        this.session.whichOne();
        break;
    }
  }

  close(): void {
    this.session?.stop();
  }

  private send(message: ServerMessage, to?: Role): void {
    for (const [role, seat] of this.seats) {
      if (to === undefined || to === role) seat.player?.send(message);
    }
  }

  /** Il manque un joueur qui avait pris place : la journée attend son retour. */
  private updatePause(): void {
    if (!this.session?.running) return;
    const missing = [...this.seats.values()].some((seat) => seat.player === null);
    if (missing) this.session.pause();
    else this.session.resume();
  }

  private broadcastState(): void {
    const presence = (role: Role): Presence => {
      const seat = this.seats.get(role);
      if (!seat) return 'empty';
      return seat.player ? 'connected' : 'away';
    };
    this.send({
      type: 'roomState',
      code: this.code,
      players: { operator: presence('operator'), archivist: presence('archivist') },
      playing: this.session?.running ?? false,
      paused: this.session?.paused ?? false,
    });
  }
}

/** Les salles en cours, et la salle de chaque joueur connecté. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly roomOf = new Map<Player, Room>();
  private readonly cleanups = new Map<Room, ReturnType<typeof setTimeout>>();

  get size(): number {
    return this.rooms.size;
  }

  handle(player: Player, message: ClientMessage): void {
    switch (message.type) {
      case 'createRoom': {
        this.leave(player);
        const room = new Room(this.newCode());
        this.rooms.set(room.code, room);
        this.enter(player, room, null, message.role);
        break;
      }
      case 'joinRoom': {
        const room = this.rooms.get(message.code);
        if (!room) {
          player.send({ type: 'joinRefused', reason: 'unknownRoom' });
          return;
        }
        if (this.roomOf.get(player) !== room) this.leave(player);
        this.enter(player, room, message.token);
        break;
      }
      default:
        this.roomOf.get(player)?.handle(player, message);
    }
  }

  leave(player: Player): void {
    const room = this.roomOf.get(player);
    if (!room) return;
    this.roomOf.delete(player);
    room.leave(player);
    if (room.empty) {
      const timer = setTimeout(() => this.remove(room), EMPTY_ROOM_TTL_MS);
      timer.unref?.();
      this.cleanups.set(room, timer);
    }
  }

  closeAll(): void {
    for (const room of this.rooms.values()) this.remove(room);
  }

  private enter(player: Player, room: Room, token: string | null, role?: Role): void {
    const result = room.join(player, token, role);
    if (result === 'roomFull' || result === 'unknownRoom') {
      player.send({ type: 'joinRefused', reason: result });
      if (room.empty) this.remove(room);
      return;
    }
    this.roomOf.set(player, room);
    clearTimeout(this.cleanups.get(room));
    this.cleanups.delete(room);
  }

  private remove(room: Room): void {
    clearTimeout(this.cleanups.get(room));
    this.cleanups.delete(room);
    room.close();
    this.rooms.delete(room.code);
  }

  private newCode(): string {
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }
}
