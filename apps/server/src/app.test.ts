import type { AddressInfo } from 'node:net';
import { PROTOCOL_VERSION, type ServerMessage } from '@allo-central/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createApp } from './app.ts';

describe('serveur', () => {
  let server: ReturnType<typeof createApp>;
  let base: string;

  beforeEach(async () => {
    server = createApp();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('répond au healthcheck', async () => {
    const res = await fetch(`http://${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('accueille un client WebSocket avec la version du protocole', async () => {
    const socket = new WebSocket(`ws://${base}/ws`);
    const message = await new Promise<string>((resolve, reject) => {
      socket.once('message', (data) => resolve(String(data)));
      socket.once('error', reject);
    });
    socket.close();
    expect(JSON.parse(message)).toEqual({ type: 'welcome', protocolVersion: PROTOCOL_VERSION });
  });

  it('lance une journée en solo et envoie la vue du standardiste', async () => {
    const socket = new WebSocket(`ws://${base}/ws`);
    const received: ServerMessage[] = [];
    await new Promise<void>((resolve, reject) => {
      socket.on('message', (data) => {
        const message = JSON.parse(String(data)) as ServerMessage;
        received.push(message);
        if (message.type === 'welcome') {
          socket.send(JSON.stringify({ type: 'startDay', seed: 1953, dayIndex: 0 }));
        }
        if (message.type === 'operatorView') resolve();
      });
      socket.once('error', reject);
    });
    socket.close();

    expect(received.map((m) => m.type).slice(0, 3)).toEqual([
      'welcome',
      'dayStarted',
      'operatorView',
    ]);
  });

  it('ignore les messages invalides sans couper la connexion', async () => {
    const socket = new WebSocket(`ws://${base}/ws`);
    await new Promise((resolve) => socket.once('message', resolve));
    socket.send('{"type":"startDay","seed":"oops"}');
    socket.send('pas du json');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });
});
