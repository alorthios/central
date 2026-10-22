import type { ClientMessage, ServerMessage } from '@allo-central/shared';

export interface Connection {
  send(message: ClientMessage): void;
}

/** Connexion au serveur de jeu, sur le même hôte que la page. */
export function connect(handlers: {
  onMessage: (message: ServerMessage) => void;
  onClose: () => void;
}): Connection {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${location.host}/ws`);
  socket.addEventListener('message', (event) => {
    handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
  });
  socket.addEventListener('close', handlers.onClose);
  return {
    send(message) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
  };
}
