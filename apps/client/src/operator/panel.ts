import { ARCHIVIST_LINE, type LampView, type OperatorView } from '@allo-central/shared';
import { Container, Graphics, Text } from 'pixi.js';

const COLUMNS = 10;
const ROWS = 8;
const CELL_W = 64;
const CELL_H = 84;
const MARGIN = 36;
const LAMP_RADIUS = 14;

const COLORS = {
  wood: 0x3a2414,
  woodEdge: 0x24160c,
  board: 0x0f0b08,
  glassOff: 0x4a423a,
  white: 0xfff1cf,
  red: 0xf0604c,
  brass: 0xc9a44c,
  hole: 0x0a0705,
  label: 0xbfaf92,
};

/** Clignotement : lent quand l'appel arrive, frénétique quand le client va raccrocher (§6.1). */
const SLOW_PERIOD_MS = 900;
const FAST_PERIOD_MS = 160;

interface Lamp {
  glass: Graphics;
  cross: Graphics;
}

/** Le panneau du standard, vu de face : 80 prises surmontées de leur ampoule. */
export class PanelView {
  readonly container = new Container();
  readonly width = COLUMNS * CELL_W + 2 * MARGIN;
  readonly height = ROWS * CELL_H + 2 * MARGIN;
  private readonly lamps = new Map<number, Lamp>();
  private lit = new Map<number, LampView>();

  constructor() {
    this.container.addChild(
      new Graphics()
        .roundRect(0, 0, this.width, this.height, 18)
        .fill(COLORS.wood)
        .stroke({ width: 6, color: COLORS.woodEdge }),
      new Graphics()
        .roundRect(MARGIN / 2, MARGIN / 2, this.width - MARGIN, this.height - MARGIN, 10)
        .fill(COLORS.board),
    );

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLUMNS; col++) {
        const line = ARCHIVIST_LINE + row * COLUMNS + col;
        this.addJack(line, MARGIN + col * CELL_W + CELL_W / 2, MARGIN + row * CELL_H + 22);
      }
    }
  }

  private addJack(line: number, x: number, y: number): void {
    const glass = new Graphics().circle(0, 0, LAMP_RADIUS).fill(0xffffff);
    glass.position.set(x, y);
    glass.tint = COLORS.glassOff;

    // Symbole gravé sur le capuchon rouge, pour ne pas dépendre de la couleur seule (§15).
    const cross = new Graphics().rect(-2, -8, 4, 16).rect(-8, -2, 16, 4).fill(COLORS.board);
    cross.position.set(x, y);
    cross.visible = false;

    const rim = new Graphics().circle(x, y, LAMP_RADIUS + 2).stroke({ width: 2, color: 0x2a211a });
    const jack = new Graphics()
      .circle(x, y + 30, 9)
      .fill(COLORS.brass)
      .circle(x, y + 30, 5)
      .fill(COLORS.hole);
    const label = new Text({
      text: String(line),
      style: {
        fill: line === ARCHIVIST_LINE ? COLORS.brass : COLORS.label,
        fontSize: 12,
        fontFamily: 'ui-monospace, monospace',
        fontWeight: line === ARCHIVIST_LINE ? '700' : '400',
      },
    });
    label.anchor.set(0.5, 0);
    label.position.set(x, y + 43);

    this.container.addChild(rim, glass, cross, jack, label);
    this.lamps.set(line, { glass, cross });
  }

  /** Nouvel état reçu du serveur : les ampoules absentes de la vue sont éteintes. */
  update(view: OperatorView): void {
    this.lit = new Map(view.lamps.map((lamp) => [lamp.line, lamp]));
  }

  /** Appelé à chaque image : fait clignoter les ampoules qui sonnent. */
  animate(nowMs: number): void {
    for (const [line, { glass, cross }] of this.lamps) {
      const lamp = this.lit.get(line);
      cross.visible = lamp?.cap === 'red';
      if (!lamp || lamp.state === 'off') {
        glass.tint = COLORS.glassOff;
        continue;
      }
      const on = lamp.cap === 'red' ? COLORS.red : COLORS.white;
      const period = SLOW_PERIOD_MS - (SLOW_PERIOD_MS - FAST_PERIOD_MS) * lamp.urgency;
      // Un léger décalage par ligne : deux ampoules ne clignotent pas à l'unisson.
      const phase = (nowMs + line * 97) % period;
      glass.tint = phase < period / 2 ? on : COLORS.glassOff;
    }
  }
}
