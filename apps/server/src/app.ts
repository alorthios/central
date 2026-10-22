import { createServer, type Server } from 'node:http';
import { PROTOCOL_VERSION, type ServerMessage } from '@allo-central/shared';
import sirv from 'sirv';
import { WebSocketServer } from 'ws';

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
    const welcome: ServerMessage = { type: 'welcome', protocolVersion: PROTOCOL_VERSION };
    socket.send(JSON.stringify(welcome));
  });
  server.on('close', () => wss.close());

  return server;
}
