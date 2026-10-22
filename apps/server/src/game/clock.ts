/**
 * Temps de jeu écoulé, en ms réelles, hors pauses. La source de temps est injectable pour
 * que les tests avancent l'horloge sans attendre.
 */
export class GameClock {
  private readonly now: () => number;
  private readonly speed: number;
  private startedAt: number | null = null;
  private pausedAt: number | null = null;
  private pausedTotal = 0;

  /** `speed` accélère le temps de jeu : 10 joue une journée en une minute (tests, #27). */
  constructor(now: () => number = () => performance.now(), speed = 1) {
    this.now = now;
    this.speed = speed;
  }

  get running(): boolean {
    return this.startedAt !== null && this.pausedAt === null;
  }

  start(): void {
    if (this.startedAt !== null) return;
    this.startedAt = this.now();
  }

  pause(): void {
    if (this.running) this.pausedAt = this.now();
  }

  resume(): void {
    if (this.pausedAt === null) return;
    this.pausedTotal += this.now() - this.pausedAt;
    this.pausedAt = null;
  }

  elapsed(): number {
    if (this.startedAt === null) return 0;
    const end = this.pausedAt ?? this.now();
    return (end - this.startedAt - this.pausedTotal) * this.speed;
  }
}
