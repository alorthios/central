import { ARCHIVIST_LINE } from '../city/generate.ts';
import type { Hearing, KeyPosition, LiveCall, Switchboard } from './switchboard.ts';

/** États d'ampoule du GDD §6.1. */
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
  key: KeyPosition;
}

/**
 * Ce que voit et entend le standardiste : des ampoules, ses cordons, ses clés, et le casque.
 * La demande d'un client n'apparaît que dans le casque, clé levée sur sa paire.
 * Seules les ampoules allumées sont envoyées.
 */
export interface OperatorView {
  elapsedMs: number;
  lamps: LampView[];
  pairs: PairView[];
  headset: { pair: number | null; hearing: Hearing };
  /** La ligne 100 est ouverte : la zone de texte apparaît (§8.5). */
  line100Open: boolean;
}

/** Le téléphone de l'étage : au repos, qui sonne, ou combiné décroché. */
export type PhoneState = 'idle' | 'ringing' | 'offHook';

/**
 * Ce que voit l'archiviste du déroulé de la journée : l'heure et son téléphone, rien du
 * panneau (§4). Ses documents lui arrivent à part, une fois par journée.
 */
export interface ArchivistView {
  elapsedMs: number;
  phone: PhoneState;
  line100Open: boolean;
}

export function archivistView(board: Switchboard): ArchivistView {
  return {
    elapsedMs: Math.round(board.elapsedMs),
    phone: board.handsetOffHook ? 'offHook' : board.upstairsRinging ? 'ringing' : 'idle',
    line100Open: board.line100Open(),
  };
}

/**
 * L'ampoule de la 100 : elle clignote quand l'étage appelle sans que personne ne lui ait
 * répondu (§8.2), reste fixe une fois branchée, scintille quand on se parle.
 */
function archivistLamp(board: Switchboard): LampView | null {
  if (!board.handsetOffHook) return null;
  const state: LampState = !board.plugIn(ARCHIVIST_LINE)
    ? 'ringing'
    : board.line100Open()
      ? 'flicker'
      : 'steady';
  return { line: ARCHIVIST_LINE, state, cap: 'white', urgency: 0 };
}

export function operatorView(board: Switchboard): OperatorView {
  const lamps = new Map<number, LampView>();
  const light = (line: number | null, state: LampState, call: LiveCall, caller: boolean) => {
    if (line === null) return;
    lamps.set(line, {
      line,
      state,
      cap: caller && call.kind === 'urgent' ? 'red' : 'white',
      urgency: caller ? Math.round((1 - call.remainingMs / call.patienceMs) * 100) / 100 : 0,
    });
  };

  for (const call of board.calls) {
    switch (call.status) {
      case 'ringing':
        light(call.callerLine, 'ringing', call, true);
        break;
      case 'held':
      case 'connecting':
      case 'unreachable':
        light(call.callerLine, 'steady', call, true);
        break;
      case 'talking':
        light(call.callerLine, 'flicker', call, true);
        light(call.connectedLine, 'flicker', call, false);
        break;
      case 'done':
        // Fin de conversation : l'ampoule clignote lentement tant que la fiche est en place.
        if (board.plugIn(call.callerLine)) light(call.callerLine, 'slowBlink', call, true);
        if (call.connectedLine !== null && board.plugIn(call.connectedLine)) {
          light(call.connectedLine, 'slowBlink', call, false);
        }
        break;
      case 'lost':
        break;
    }
  }

  const pairs: PairView[] = board.pairs.map((pair) => ({
    id: pair.id,
    plugs: [
      { line: pair.plugs[0], supervision: pair.supervision[0] },
      { line: pair.plugs[1], supervision: pair.supervision[1] },
    ],
    key: pair.key,
  }));

  const upstairs = archivistLamp(board);
  if (upstairs) lamps.set(ARCHIVIST_LINE, upstairs);

  return {
    elapsedMs: Math.round(board.elapsedMs),
    lamps: [...lamps.values()],
    pairs,
    headset: board.headset(),
    line100Open: board.line100Open(),
  };
}
