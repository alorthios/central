import type { AddressInfo } from 'node:net';
import { PROTOCOL_VERSION } from '@allo-central/shared';
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
});
