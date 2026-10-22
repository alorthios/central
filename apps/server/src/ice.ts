import { createHmac } from 'node:crypto';
import type { IceServer } from '@allo-central/shared';

/** Les serveurs ICE proposés aux clients pour la voix (§17) : STUN, et TURN si configuré. */
export interface IceConfig {
  stunUrls: string[];
  turnUrls: string[];
  /** Le secret partagé avec coturn (`static-auth-secret`) ; sans lui, pas de TURN. */
  turnSecret: string | null;
}

/** Durée de validité des identifiants TURN : une soirée de jeu, largement. */
export const TURN_TTL_S = 12 * 60 * 60;

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

export function iceConfigFromEnv(env: NodeJS.ProcessEnv): IceConfig {
  return {
    stunUrls: list(env.STUN_URLS),
    turnUrls: list(env.TURN_URLS),
    turnSecret: env.TURN_SECRET || null,
  };
}

/**
 * Les serveurs ICE d'un joueur. Les identifiants TURN suivent l'API REST de coturn
 * (`use-auth-secret`) : un nom qui porte sa date d'expiration, signé par le secret partagé.
 * Le secret ne quitte jamais le serveur, et un identifiant volé ne sert qu'un temps.
 */
export function iceServers(config: IceConfig, nowMs = Date.now()): IceServer[] {
  const servers: IceServer[] = [];
  if (config.stunUrls.length > 0) servers.push({ urls: config.stunUrls });
  if (config.turnUrls.length > 0 && config.turnSecret) {
    const username = `${Math.floor(nowMs / 1000) + TURN_TTL_S}:allo-central`;
    // HMAC-SHA1 est imposé par coturn, qui recalcule ce mot de passe à l'identique : on ne
    // peut pas en changer sans casser le TURN. Les collisions SHA-1 ne fragilisent pas un
    // HMAC, et l'identifiant expire au bout de 12 h.
    const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64');
    servers.push({ urls: config.turnUrls, username, credential });
  }
  return servers;
}
