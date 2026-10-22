import { ARCHIVIST_LINE, type LampView, type OperatorView } from '@allo-central/shared';
import { Container } from 'pixi.js';
import { type LampLevel, type LampSkin, skin } from './skin.ts';

const COLUMNS = 10;
const ROWS = 8;
const CELL_W = 64;
const CELL_H = 84;
const MARGIN = 36;
const LAMP_RADIUS = 14;

/** Clignotement : lent quand l'appel arrive, frénétique quand le client va raccrocher (§6.1). */
const SLOW_PERIOD_MS = 900;
const FAST_PERIOD_MS = 160;
/** Fin de conversation : clignotement lent, il faut retirer les fiches. */
const SLOW_BLINK_PERIOD_MS = 1_800;
/** La prise est sous l'ampoule ; une fiche lâchée à moins de ce rayon s'y enfonce. */
const JACK_OFFSET = 30;
const JACK_SNAP_RADIUS = 28;

interface Lamp {
  bulb: LampSkin;
  cross: Container;
}

/** Le panneau du standard, vu de face : 80 prises surmontées de leur ampoule. */
export class PanelView {
  readonly container = new Container();
  /** Les numéros des prises, posés au-dessus des cordons pour rester lisibles. */
  readonly labels = new Container();
  readonly width = COLUMNS * CELL_W + 2 * MARGIN;
  readonly height = ROWS * CELL_H + 2 * MARGIN;
  private readonly lamps = new Map<number, Lamp>();
  private lit = new Map<number, LampView>();

  constructor() {
    this.container.addChild(skin.panel(this.width, this.height, MARGIN));
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLUMNS; col++) {
        const line = ARCHIVIST_LINE + row * COLUMNS + col;
        this.addJack(line, MARGIN + col * CELL_W + CELL_W / 2, MARGIN + row * CELL_H + 22);
      }
    }
  }

  /** Centre de la prise d'une ligne, dans le repère du panneau. */
  jackPosition(line: number): { x: number; y: number } {
    const index = line - ARCHIVIST_LINE;
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    return { x: MARGIN + col * CELL_W + CELL_W / 2, y: MARGIN + row * CELL_H + 22 + JACK_OFFSET };
  }

  /** La prise la plus proche d'un point, si elle est assez près pour y enfoncer une fiche. */
  jackAt(x: number, y: number): number | null {
    let best: number | null = null;
    let bestDistance = JACK_SNAP_RADIUS;
    for (const line of this.lamps.keys()) {
      const jack = this.jackPosition(line);
      const distance = Math.hypot(jack.x - x, jack.y - y);
      if (distance < bestDistance) {
        best = line;
        bestDistance = distance;
      }
    }
    return best;
  }

  private addJack(line: number, x: number, y: number): void {
    const bulb = skin.lamp(LAMP_RADIUS);
    bulb.view.position.set(x, y);
    // Symbole gravé sur le capuchon rouge, pour ne pas dépendre de la couleur seule (§15).
    const cross = skin.cross();
    cross.position.set(x, y);
    cross.visible = false;
    const jack = skin.jack();
    jack.position.set(x, y + JACK_OFFSET);
    const label = skin.label(String(line), line === ARCHIVIST_LINE);
    label.position.set(x, y + JACK_OFFSET + 13);

    this.container.addChild(bulb.view, cross, jack);
    this.labels.addChild(label);
    this.lamps.set(line, { bulb, cross });
  }

  /** Nouvel état reçu du serveur : les ampoules absentes de la vue sont éteintes. */
  update(view: OperatorView): void {
    this.lit = new Map(view.lamps.map((lamp) => [lamp.line, lamp]));
  }

  /** Appelé à chaque image : anime les ampoules selon leur état (§6.1). */
  animate(nowMs: number): void {
    for (const [line, { bulb, cross }] of this.lamps) {
      const lamp = this.lit.get(line);
      const color = lamp?.cap === 'red' ? 'red' : 'white';
      cross.visible = color === 'red';
      // Un léger décalage par ligne : deux ampoules ne clignotent pas à l'unisson.
      const t = nowMs + line * 97;
      let level: LampLevel = 'off';
      switch (lamp?.state ?? 'off') {
        case 'steady':
          level = 'on';
          break;
        case 'ringing': {
          // De plus en plus vite à mesure que la patience du client baisse.
          const urgency = lamp?.urgency ?? 0;
          const period = SLOW_PERIOD_MS - (SLOW_PERIOD_MS - FAST_PERIOD_MS) * urgency;
          level = t % period < period / 2 ? 'on' : 'off';
          break;
        }
        case 'flicker':
          // Conversation en cours : la lumière tremble sans s'éteindre.
          level = Math.sin(t / 23) + Math.sin(t / 57) > -0.6 ? 'on' : 'dim';
          break;
        case 'slowBlink':
          level = t % SLOW_BLINK_PERIOD_MS < SLOW_BLINK_PERIOD_MS / 2 ? 'on' : 'off';
          break;
      }
      bulb.show(level, color);
    }
  }
}
