/**
 * Messages échangés sur le WebSocket entre le serveur (qui fait autorité) et les clients.
 * Chaque joueur ne reçoit que la vue de son rôle.
 */
export const PROTOCOL_VERSION = 1;

export type Role = 'operator' | 'archivist';

export type ServerMessage = { type: 'welcome'; protocolVersion: number };

export type ClientMessage = { type: 'ping' };
