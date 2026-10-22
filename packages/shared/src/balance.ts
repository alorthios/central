/**
 * Paramètres d'équilibrage (GDD §10.1). Toutes les valeurs de réglage du jeu vivent ici
 * et seulement ici, pour pouvoir les ajuster après les tests.
 */
export const BALANCE = {
  dayDurationMs: 10 * 60_000,
  dayStartHour: 9,
  dayEndHour: 18,
  cordPairs: 8,
  conversationMs: { min: 30_000, max: 90_000 },
  whichOnePenaltyMs: 10_000,
  onHoldPatienceRate: 0.5,
  ringsBeforeAbsent: 3,
  ringIntervalMs: 2_000,
  longDistanceSetupMs: { min: 20_000, max: 40_000 },
  bell: { minIntervalMs: 600, resonanceMs: 1_500 },
  peakShare: 0.6,
  /** Pics d'activité : ouverture, midi, fin d'après-midi (§5.2). Heures de jeu. */
  peaks: [
    { startHour: 9, endHour: 10 },
    { startHour: 12, endHour: 13 },
    { startHour: 17, endHour: 18 },
  ],
  /**
   * Volume d'appels par journée (§10.2). La part d'urgences est une hypothèse de départ :
   * le GDD fait arriver les appels rouges le mardi sans fixer leur proportion.
   */
  week: [
    { name: 'Lundi', calls: 12, urgentShare: 0 },
    { name: 'Mardi', calls: 16, urgentShare: 0.15 },
    { name: 'Mercredi', calls: 20, urgentShare: 0.15 },
    { name: 'Jeudi', calls: 23, urgentShare: 0.15 },
    { name: 'Vendredi', calls: 26, urgentShare: 0.15 },
    { name: 'Samedi', calls: 28, urgentShare: 0.15 },
    { name: 'Réveillon', calls: 36, urgentShare: 0.15 },
  ],
  patienceMs: {
    normal: 45_000,
    urgent: 25_000,
    longDistance: 60_000,
    notable: 75_000,
  },
  stars: { one: 0.6, two: 0.75, three: 0.9 },
  complaintPenalty: 0.05,
} as const;

export type CallKind = keyof typeof BALANCE.patienceMs;

export interface DayConfig {
  name: string;
  calls: number;
  /** Part des appels urgents (capuchon rouge), entre 0 et 1. */
  urgentShare: number;
}
