import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TURN_TTL_S, iceConfigFromEnv, iceServers } from './ice.ts';

describe('serveurs ICE', () => {
  it('aucun par défaut', () => {
    expect(iceServers(iceConfigFromEnv({}))).toEqual([]);
  });

  it('lit les listes d’URL séparées par des virgules', () => {
    const config = iceConfigFromEnv({
      STUN_URLS: 'stun:jeu.example:3478, stun:autre.example',
      TURN_URLS: 'turn:jeu.example:3478?transport=udp,turn:jeu.example:3478?transport=tcp',
      TURN_SECRET: 's3cret',
    });
    expect(config.stunUrls).toEqual(['stun:jeu.example:3478', 'stun:autre.example']);
    expect(config.turnUrls).toHaveLength(2);
  });

  it('signe des identifiants TURN éphémères avec le secret de coturn', () => {
    const now = 1_700_000_000_000;
    const [stun, turn] = iceServers(
      { stunUrls: ['stun:jeu.example'], turnUrls: ['turn:jeu.example'], turnSecret: 's3cret' },
      now,
    );
    expect(stun).toEqual({ urls: ['stun:jeu.example'] });
    const expiry = now / 1000 + TURN_TTL_S;
    expect(turn).toEqual({
      urls: ['turn:jeu.example'],
      username: `${expiry}:allo-central`,
      credential: createHmac('sha1', 's3cret').update(`${expiry}:allo-central`).digest('base64'),
    });
  });

  it('pas de TURN sans secret', () => {
    expect(iceServers({ stunUrls: [], turnUrls: ['turn:jeu.example'], turnSecret: null })).toEqual(
      [],
    );
  });
});
