import type { ClientMessage, ServerMessage } from '@allo-central/shared';

type MessageOf<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

export interface Connection {
  send(message: ClientMessage): void;
  /** Abonne un écran aux messages du serveur ; renvoie de quoi le désabonner. */
  listen(handler: (message: ServerMessage) => void): () => void;
  /** Le dernier message reçu d'un type : un écran monté après coup y retrouve l'état courant. */
  last<T extends ServerMessage['type']>(type: T): MessageOf<T> | undefined;
  onClose(handler: () => void): void;
}

/** Connexion au serveur de jeu, sur le même hôte que la page, partagée par les écrans. */
export function connect(): Connection {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${location.host}/ws`);
  const handlers = new Set<(message: ServerMessage) => void>();
  const latest = new Map<string, ServerMessage>();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as ServerMessage;
    latest.set(message.type, message);
    for (const handler of [...handlers]) handler(message);
  });

  return {
    send(message) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    listen(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    last<T extends ServerMessage['type']>(type: T) {
      return latest.get(type) as MessageOf<T> | undefined;
    },
    onClose(handler) {
      socket.addEventListener('close', handler);
    },
  };
}
