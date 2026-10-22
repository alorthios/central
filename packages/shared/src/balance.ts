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
