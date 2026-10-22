import { createServer, type Server } from 'node:http';
import { PROTOCOL_VERSION, type ServerMessage, parseClientMessage } from '@allo-central/shared';
import sirv from 'sirv';
import { WebSocket, WebSocketServer } from 'ws';
import { type IceConfig, iceServers } from './ice.ts';
import { type Player, RoomManager } from './rooms.ts';

export interface AppOptions {
  /** Dossier du client compilé à servir ; absent en dev, où Vite sert le client. */
  clientDist?: string | undefined;
  /** Ouvre les salles de test du mode développeur (`?dev`). */
  devRooms?: boolean;
  /** Les serveurs STUN et TURN proposés pour la voix. */
  ice?: IceConfig;
}

const NO_ICE: IceConfig = { stunUrls: [], turnUrls: [], turnSecret: null };

export function createApp({ clientDist, devRooms = false, ice = NO_ICE }: AppOptions = {}): Server {
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

  const rooms = new RoomManager({ devRooms });
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket) => {
    const player: Player = {
      send(message: ServerMessage) {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
      },
    };
    player.send({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      iceServers: iceServers(ice),
    });
    socket.on('message', (data) => {
      const message = parseClientMessage(String(data));
      if (message) rooms.handle(player, message);
    });
    socket.on('close', () => rooms.leave(player));
  });
  server.on('close', () => {
    rooms.closeAll();
    wss.close();
  });

  return server;
}
