/**
 * Messages échangés sur le WebSocket entre le serveur (qui fait autorité) et les clients.
 * Chaque joueur ne reçoit que la vue de son rôle.
 */
import { BALANCE } from './balance.ts';
import type { KeyAction, PlugEnd, PlugRefusal } from './game/switchboard.ts';
import type { ArchivistDesk } from './game/desk.ts';
import type { DayReport } from './game/score.ts';
import type { ArchivistView, OperatorView } from './game/views.ts';

export const PROTOCOL_VERSION = 6;

/** Vitesse maximale du temps de jeu, pour tester une journée sans attendre 10 minutes. */
export const MAX_SPEED = 60;

/** Ce que le standardiste apprend d'un geste : tonalité d'occupation, personne, protestation. */
export type Notice = 'busy' | 'absent' | 'wrongNumber';

export type Role = 'operator' | 'archivist';
export const ROLES: readonly Role[] = ['operator', 'archivist'];

/** Le siège d'un rôle dans une salle : libre, occupé par un joueur connecté, ou en attente de son retour. */
export type Presence = 'empty' | 'connected' | 'away';

export type JoinRefusal = 'unknownRoom' | 'roomFull';

/** Code de salle : quatre lettres, sans I ni O pour éviter la confusion avec 1 et 0. */
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z]{4}$/;

export type ServerMessage =
  | { type: 'welcome'; protocolVersion: number }
  /** `token` permet de reprendre sa place après une déconnexion. */
  | { type: 'roomJoined'; code: string; role: Role; token: string }
  | { type: 'joinRefused'; reason: JoinRefusal }
  | {
      type: 'roomState';
      code: string;
      players: Record<Role, Presence>;
      /** Une journée est en cours ; en pause tant qu'un joueur manque. */
      playing: boolean;
      paused: boolean;
    }
  | { type: 'archivistView'; view: ArchivistView }
  /** Un message texte sur la ligne 100, relayé aux deux joueurs quand elle est ouverte (§8.5). */
  | { type: 'line100Message'; from: Role; text: string; at: number }
  /** La sonnette de l'étage retentit au rez-de-chaussée. */
  | { type: 'bell' }
  /** Les documents de l'archiviste, envoyés à lui seul en début de journée. */
  | { type: 'archivistDesk'; desk: ArchivistDesk }
  | { type: 'dayStarted'; seed: number; dayIndex: number; dayName: string }
  | { type: 'operatorView'; view: OperatorView }
  | { type: 'plugRefused'; pair: number; end: PlugEnd; line: number; reason: PlugRefusal }
  | { type: 'notice'; notice: Notice; line: number }
  | { type: 'dayEnded'; report: DayReport };

/**
 * On crée une salle en choisissant son rôle, ou on la rejoint avec son code (et son jeton
 * pour reprendre sa place). Dans une salle, `startDay` lance une journée ; les autres
 * messages sont des intentions que le serveur valide.
 */
export type ClientMessage =
  | { type: 'ping' }
  | { type: 'createRoom'; role: Role }
  | { type: 'joinRoom'; code: string; token: string | null }
  /** `seed` null : la ville de la salle (tirée au premier jour et gardée toute la semaine). */
  | { type: 'startDay'; seed: number | null; dayIndex: number; speed: number }
  | { type: 'plug'; pair: number; end: PlugEnd; line: number }
  | { type: 'unplug'; pair: number; end: PlugEnd }
  | { type: 'key'; pair: number; action: KeyAction }
  | { type: 'whichOne' }
  /** L'archiviste décroche ou raccroche son combiné. */
  | { type: 'handset'; offHook: boolean }
  /** Un message texte sur la ligne 100 : il ne passe que si la ligne est ouverte. */
  | { type: 'say'; text: string }
  /** Un coup de sonnette de l'archiviste (§8.4). */
  | { type: 'bell' };

/** Longueur maximale d'un message sur la ligne 100. */
export const MAX_SAY_LENGTH = 200;

const isEnd = (value: unknown): value is PlugEnd => value === 0 || value === 1;
const isKeyAction = (value: unknown): value is KeyAction =>
  value === 'talk' || value === 'rest' || value === 'ring';

/** Lit un message client ; tout ce qui n'est pas conforme est rejeté (null). */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Record<string, unknown>;

  switch (message.type) {
    case 'ping':
      return { type: 'ping' };
    case 'whichOne':
      return { type: 'whichOne' };
    case 'bell':
      return { type: 'bell' };
    case 'handset':
      return typeof message.offHook === 'boolean'
        ? { type: 'handset', offHook: message.offHook }
        : null;
    case 'say': {
      if (typeof message.text !== 'string') return null;
      const text = message.text.trim().slice(0, MAX_SAY_LENGTH);
      return text ? { type: 'say', text } : null;
    }
    case 'createRoom': {
      const { role } = message;
      return ROLES.includes(role as Role) ? { type: 'createRoom', role: role as Role } : null;
    }
    case 'joinRoom': {
      const { code, token } = message;
      if (typeof code !== 'string') return null;
      const normalized = code.trim().toUpperCase();
      if (!ROOM_CODE_PATTERN.test(normalized)) return null;
      if (token !== null && (typeof token !== 'string' || token.length > 64)) return null;
      return { type: 'joinRoom', code: normalized, token };
    }
    case 'startDay': {
      const { seed = null, dayIndex, speed = 1 } = message;
      if ((seed !== null && !Number.isSafeInteger(seed)) || !Number.isInteger(dayIndex))
        return null;
      if ((dayIndex as number) < 0 || (dayIndex as number) >= BALANCE.week.length) return null;
      if (!Number.isInteger(speed) || (speed as number) < 1 || (speed as number) > MAX_SPEED)
        return null;
      return {
        type: 'startDay',
        seed: seed as number | null,
        dayIndex: dayIndex as number,
        speed: speed as number,
      };
    }
    // Les bornes des paires et des lignes sont vérifiées par le standard lui-même.
    case 'plug': {
      const { pair, end, line } = message;
      if (!Number.isInteger(pair) || !isEnd(end) || !Number.isInteger(line)) return null;
      return { type: 'plug', pair: pair as number, end, line: line as number };
    }
    case 'unplug': {
      const { pair, end } = message;
      if (!Number.isInteger(pair) || !isEnd(end)) return null;
      return { type: 'unplug', pair: pair as number, end };
    }
    case 'key': {
      const { pair, action } = message;
      if (!Number.isInteger(pair) || !isKeyAction(action)) return null;
      return { type: 'key', pair: pair as number, action };
    }
    default:
      return null;
  }
}
