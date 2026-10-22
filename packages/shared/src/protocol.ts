/**
 * Messages échangés sur le WebSocket entre le serveur (qui fait autorité) et les clients.
 * Chaque joueur ne reçoit que la vue de son rôle.
 */
import { BALANCE } from './balance.ts';
import type { KeyAction, PlugEnd, PlugRefusal } from './game/switchboard.ts';
import type { OperatorView } from './game/views.ts';

export const PROTOCOL_VERSION = 4;

export type Role = 'operator' | 'archivist';

export type ServerMessage =
  | { type: 'welcome'; protocolVersion: number }
  | { type: 'dayStarted'; seed: number; dayIndex: number; dayName: string }
  | { type: 'operatorView'; view: OperatorView }
  | { type: 'plugRefused'; pair: number; end: PlugEnd; line: number; reason: PlugRefusal }
  | { type: 'dayEnded' };

/**
 * `startDay` lance une journée en solo, rôle standardiste : c'est provisoire, en attendant
 * les salles de jeu à deux (#9). Les autres messages sont des intentions que le serveur
 * valide.
 */
export type ClientMessage =
  | { type: 'ping' }
  | { type: 'startDay'; seed: number; dayIndex: number }
  | { type: 'plug'; pair: number; end: PlugEnd; line: number }
  | { type: 'unplug'; pair: number; end: PlugEnd }
  | { type: 'key'; pair: number; action: KeyAction };

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
    case 'startDay': {
      const { seed, dayIndex } = message;
      if (!Number.isSafeInteger(seed) || !Number.isInteger(dayIndex)) return null;
      if ((dayIndex as number) < 0 || (dayIndex as number) >= BALANCE.week.length) return null;
      return { type: 'startDay', seed: seed as number, dayIndex: dayIndex as number };
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
