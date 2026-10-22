/**
 * Messages échangés sur le WebSocket entre le serveur (qui fait autorité) et les clients.
 * Chaque joueur ne reçoit que la vue de son rôle.
 */
import { BALANCE } from './balance.ts';
import type { OperatorView } from './game/views.ts';

export const PROTOCOL_VERSION = 2;

export type Role = 'operator' | 'archivist';

export type ServerMessage =
  | { type: 'welcome'; protocolVersion: number }
  | { type: 'dayStarted'; seed: number; dayIndex: number; dayName: string }
  | { type: 'operatorView'; view: OperatorView }
  | { type: 'dayEnded' };

/**
 * `startDay` lance une journée en solo, rôle standardiste : c'est provisoire, en attendant
 * les salles de jeu à deux (#9).
 */
export type ClientMessage = { type: 'ping' } | { type: 'startDay'; seed: number; dayIndex: number };

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
    default:
      return null;
  }
}
