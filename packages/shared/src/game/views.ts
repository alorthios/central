import type { Switchboard } from './switchboard.ts';

/** États d'ampoule du GDD §6.1. Les autres que `off` et `ringing` arrivent avec #13 et #14. */
export type LampState = 'off' | 'ringing' | 'steady' | 'flicker' | 'slowBlink';

/** Couleur du capuchon de l'ampoule (§6.2) ; le MVP n'a que le blanc et le rouge. */
export type CapColor = 'white' | 'red';

export interface LampView {
  line: number;
  state: LampState;
  cap: CapColor;
  /** Part de la patience déjà écoulée (0 à 1) : l'ampoule clignote de plus en plus vite. */
  urgency: number;
}

/**
 * Ce que voit le standardiste : des ampoules. Ni le nom de l'appelant, ni sa demande,
 * qu'il n'entendra qu'en levant la clé. Seules les ampoules allumées sont envoyées.
 */
export interface OperatorView {
  elapsedMs: number;
  lamps: LampView[];
}

export function operatorView(board: Switchboard): OperatorView {
  const lamps: LampView[] = board.calls
    .filter((call) => call.status === 'ringing')
    .map((call) => ({
      line: call.callerLine,
      state: 'ringing',
      cap: call.kind === 'urgent' ? 'red' : 'white',
      urgency: Math.round((1 - call.remainingMs / call.patienceMs) * 100) / 100,
    }));
  return { elapsedMs: Math.round(board.elapsedMs), lamps };
}
