import type { Switchboard } from './switchboard.ts';

/** États d'ampoule du GDD §6.1. `flicker` et `slowBlink` arrivent avec les clés (#14). */
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

export interface PlugView {
  /** La prise où la fiche est branchée ; null : sur la tablette. */
  line: number | null;
  /** Voyant de supervision : l'abonné de ce côté a raccroché, il faut retirer la fiche. */
  supervision: boolean;
}

export interface PairView {
  id: number;
  plugs: [PlugView, PlugView];
}

/**
 * Ce que voit le standardiste : des ampoules et ses cordons. Ni le nom de l'appelant, ni
 * sa demande, qu'il n'entendra qu'en levant la clé. Seules les ampoules allumées sont
 * envoyées.
 */
export interface OperatorView {
  elapsedMs: number;
  lamps: LampView[];
  pairs: PairView[];
}

export function operatorView(board: Switchboard): OperatorView {
  const lamps: LampView[] = board.calls
    .filter((call) => call.status !== 'lost')
    .map((call) => ({
      line: call.callerLine,
      // Un client à qui l'on a répondu attend : son ampoule cesse de clignoter.
      state: call.status === 'held' ? 'steady' : 'ringing',
      cap: call.kind === 'urgent' ? 'red' : 'white',
      urgency: Math.round((1 - call.remainingMs / call.patienceMs) * 100) / 100,
    }));
  const pairs: PairView[] = board.pairs.map((pair) => ({
    id: pair.id,
    plugs: [
      { line: pair.plugs[0], supervision: pair.supervision[0] },
      { line: pair.plugs[1], supervision: pair.supervision[1] },
    ],
  }));
  return { elapsedMs: Math.round(board.elapsedMs), lamps, pairs };
}
