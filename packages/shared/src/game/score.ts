import { BALANCE, type DayConfig, type StarThresholds } from '../balance.ts';
import type { LiveCall, Switchboard } from './switchboard.ts';

export type Stars = 0 | 1 | 2 | 3;

/**
 * Le bilan d'une journée (§11). Les compteurs de la ligne 100 et de la sonnette restent à
 * zéro tant que ces canaux n'existent pas (#17, #20).
 */
export interface DayReport {
  dayName: string;
  /** Appels reçus, rappels des clients prévenus compris. */
  received: number;
  served: number;
  /** Clients prévenus d'un occupé ou d'un absent : comptés parmi les servis. */
  informed: number;
  lost: number;
  urgentLost: number;
  /** Servis / reçus, entre 0 et 1. */
  serviceRate: number;
  stars: Stars;
  /** Les seuils d'étoiles de cette journée. */
  thresholds: StarThresholds;
  /** Une journée sans étoile se rejoue (§11). */
  replay: boolean;
  /** Temps moyen entre l'arrivée d'un appel et sa mise en relation (ou le client prévenu). */
  averageHandlingMs: number | null;
  wrongConnections: number;
  whichOneAsked: number;
  line100Ms: number;
  bellRings: number;
}

/** Servi : mis en relation (même si la conversation dure encore à 18 h) ou prévenu. */
function isServed(call: LiveCall): boolean {
  return call.outcome !== null || call.status === 'talking';
}

export function starsFor(serviceRate: number, urgentLost: number, day: DayConfig): Stars {
  const thresholds = day.stars ?? BALANCE.stars;
  const earned =
    serviceRate >= thresholds.three
      ? 3
      : serviceRate >= thresholds.two
        ? 2
        : serviceRate >= thresholds.one
          ? 1
          : 0;
  // Chaque urgence perdue retire une étoile (§11).
  return Math.max(0, earned - urgentLost) as Stars;
}

export function dayReport(board: Switchboard, day: DayConfig): DayReport {
  const calls = board.calls;
  const served = calls.filter(isServed);
  const urgentLost = calls.filter((c) => c.kind === 'urgent' && !isServed(c)).length;
  const serviceRate = calls.length === 0 ? 1 : served.length / calls.length;
  const stars = starsFor(serviceRate, urgentLost, day);
  const handled = served.filter((c) => c.resolvedAt !== null);
  const totalHandling = handled.reduce((sum, c) => sum + ((c.resolvedAt ?? 0) - c.arrivedAt), 0);

  return {
    dayName: day.name,
    received: calls.length,
    served: served.length,
    informed: calls.filter((c) => c.outcome === 'informed').length,
    lost: calls.length - served.length,
    urgentLost,
    serviceRate,
    stars,
    thresholds: day.stars ?? BALANCE.stars,
    replay: stars === 0,
    averageHandlingMs: handled.length > 0 ? Math.round(totalHandling / handled.length) : null,
    wrongConnections: calls.reduce((sum, c) => sum + c.wrongConnections, 0),
    whichOneAsked: calls.filter((c) => c.askedWhichOne).length,
    line100Ms: Math.round(board.line100Ms),
    bellRings: board.bellRings,
  };
}
