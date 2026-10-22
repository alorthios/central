import { createServer, type Server } from 'node:http';
import { PROTOCOL_VERSION, type ServerMessage, parseClientMessage } from '@allo-central/shared';
import sirv from 'sirv';
import { WebSocket, WebSocketServer } from 'ws';
import { GameSession } from './game/session.ts';

export interface AppOptions {
  /** Dossier du client compilé à servir ; absent en dev, où Vite sert le client. */
  clientDist?: string | undefined;
}

export function createApp({ clientDist }: AppOptions = {}): Server {
  const serveClient = clientDist ? sirv(clientDist, { single: true }) : undefined;

  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (serveClient) {
      serveClient(req, res);
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket) => {
    const send = (message: ServerMessage) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };
    // Une partie en solo par connexion, en attendant les salles à deux joueurs (#9).
    let session: GameSession | null = null;

    send({ type: 'welcome', protocolVersion: PROTOCOL_VERSION });
    socket.on('message', (data) => {
      const message = parseClientMessage(String(data));
      switch (message?.type) {
        case 'startDay':
          session?.stop();
          session = new GameSession({ seed: message.seed, dayIndex: message.dayIndex, send });
          session.start();
          break;
        case 'plug':
          session?.plug(message.pair, message.end, message.line);
          break;
        case 'unplug':
          session?.unplug(message.pair, message.end);
          break;
        case 'key':
          session?.key(message.pair, message.action);
          break;
      }
    });
    socket.on('close', () => session?.stop());
  });
  server.on('close', () => wss.close());

  return server;
}
