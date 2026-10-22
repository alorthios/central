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
  /** Un correspondant présent décroche au bout d'une ou deux sonneries. */
  answerRings: { min: 1, max: 2 },
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
   * Journées de la semaine (§7.1, §9.2, §10.2) : volume d'appels, sources de l'archiviste,
   * poids des types de demandes. Le GDD fixe la part de T0 ; la répartition du reste et la
   * part d'urgences sont des hypothèses de départ.
   */
  week: [
    {
      name: 'Lundi',
      calls: 12,
      urgentShare: 0,
      sources: ['directory'],
      requests: { T0: 0.6, T1: 0.4 },
    },
    {
      name: 'Mardi',
      calls: 16,
      urgentShare: 0.15,
      sources: ['directory', 'professions'],
      requests: { T0: 0.5, T1: 0.25, T3: 0.25 },
    },
    {
      name: 'Mercredi',
      calls: 20,
      urgentShare: 0.15,
      sources: ['directory', 'professions', 'map'],
      requests: { T0: 0.4, T1: 0.2, T2: 0.2, T3: 0.2 },
    },
    {
      name: 'Jeudi',
      calls: 23,
      urgentShare: 0.15,
      sources: ['directory', 'professions', 'map'],
      requests: { T0: 0.35, T1: 0.2, T2: 0.2, T3: 0.25 },
    },
    {
      name: 'Vendredi',
      calls: 26,
      urgentShare: 0.15,
      sources: ['directory', 'professions', 'map'],
      requests: { T0: 0.3, T1: 0.2, T2: 0.25, T3: 0.25 },
    },
    {
      name: 'Samedi',
      calls: 28,
      urgentShare: 0.15,
      sources: ['directory', 'professions', 'map'],
      requests: { T0: 0.3, T1: 0.2, T2: 0.25, T3: 0.25 },
    },
    {
      name: 'Réveillon',
      calls: 36,
      urgentShare: 0.15,
      sources: ['directory', 'professions', 'map'],
      requests: { T0: 0.25, T1: 0.25, T2: 0.25, T3: 0.25 },
    },
  ],
  /** Demande ambiguë : part des cas où le client garde l'indice pour « Lequel ? » (§9.3). */
  reservedHintShare: 0.5,
  /** « Près de » un repère : distance maximale sur le plan, en pâtés de maisons. */
  nearDistance: 1.25,
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

/** Les documents de l'archiviste (§7.1). Le MVP s'arrête au plan. */
export type Source = 'directory' | 'professions' | 'map';

/** Types de demandes du MVP (§9.2) : numéro, nom exact, homonyme, métier (et lieu). */
export type RequestType = 'T0' | 'T1' | 'T2' | 'T3';

export interface DayConfig {
  name: string;
  calls: number;
  /** Part des appels urgents (capuchon rouge), entre 0 et 1. */
  urgentShare: number;
  sources: readonly Source[];
  /** Poids relatifs des types de demandes ; un type absent n'apparaît pas ce jour-là. */
  requests: Partial<Record<RequestType, number>>;
}
