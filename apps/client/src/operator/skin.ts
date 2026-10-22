import { Container, Graphics, Text } from 'pixi.js';
import { theme } from '../theme.ts';
import { vintageSkin } from './skin-vintage.ts';

export type Point = { x: number; y: number };

/** Ce que montre une ampoule à un instant donné : éteinte, allumée, ou en demi-teinte. */
export type LampLevel = 'off' | 'on' | 'dim';
export type LampColor = 'white' | 'red';
/** Les deux fils d'une paire : beige clair pour la fiche de gauche, brun foncé pour celle de droite. */
export type CordTone = 'light' | 'dark';

export interface LampSkin {
  /** Centrée sur l'ampoule. */
  view: Container;
  show(level: LampLevel, color: LampColor): void;
}

export interface Toggle {
  view: Container;
  set(on: boolean): void;
}

/**
 * L'habillage du standard : tout ce qui se dessine sur le panneau et la tablette. La logique
 * (positions, gestes, états) ne change pas d'un thème à l'autre. Chaque élément est centré sur
 * l'origine, sauf mention contraire ; c'est l'appelant qui le place.
 */
export interface Skin {
  /** Couleur de fond de la scène, derrière le plateau. */
  background: string;
  /** Le décor derrière le plateau, aux dimensions de l'écran ; null : la couleur de fond suffit. */
  backdrop(width: number, height: number): Container | null;
  /** Le panneau entier, coin haut gauche à l'origine. */
  panel(width: number, height: number, margin: number): Container;
  lamp(radius: number): LampSkin;
  /** Le symbole gravé du capuchon rouge (§15). */
  cross(): Container;
  jack(): Container;
  /** Le numéro d'une prise, ancré en haut au centre. */
  label(text: string, archivist: boolean): Container;
  /** La tablette, coin haut gauche à l'origine. */
  shelf(width: number, height: number): Container;
  shelfHole(radius: number): Container;
  supervision(): Toggle;
  plug(radius: number): Container;
  keySlot(height: number): Container;
  keyKnob(): Container;
  /** Le numéro d'une paire sur la tablette, ancré en haut au centre. */
  pairLabel(text: string): Container;
  /** Un cordon qui sort de la tablette et pend jusqu'à sa fiche. */
  drawCord(
    g: Graphics,
    home: Point,
    plug: Point,
    sag: number,
    plugRadius: number,
    tone: CordTone,
  ): void;
  /** Le cercle qui désigne la prise visée pendant un geste. */
  drawTarget(g: Graphics, x: number, y: number, radius: number): void;
  /** La lumière posée sur le plateau (lampe de bureau, vignettage) ; null : aucune. */
  lighting(width: number, height: number): Container | null;
}

const FLAT = {
  wood: 0x3a2414,
  woodEdge: 0x24160c,
  board: 0x0f0b08,
  glassOff: 0x4a423a,
  flickerDim: 0xc9b98f,
  white: 0xfff1cf,
  red: 0xf0604c,
  brass: 0xc9a44c,
  brassDark: 0x8a6d2a,
  hole: 0x0a0705,
  label: 0xbfaf92,
  cordLight: 0xd8c49a,
  cordLightShine: 0xf6ead0,
  cord: 0x2a170c,
  cordShine: 0x5a3a22,
  supervisionOn: 0xffb347,
  supervisionOff: 0x3a2f26,
  target: 0xfff1cf,
  bakelite: 0x1b130d,
};

const monospace = (fill: number, fontSize: number, bold = false) =>
  new Text({
    style: {
      fill,
      fontSize,
      fontFamily: 'ui-monospace, monospace',
      fontWeight: bold ? '700' : '400',
    },
  });

/** Le rendu d'origine : aplats de couleur, sans texture. */
export const flatSkin: Skin = {
  background: '#17110d',
  backdrop: () => null,
  panel(width, height, margin) {
    return new Container({
      children: [
        new Graphics()
          .roundRect(0, 0, width, height, 18)
          .fill(FLAT.wood)
          .stroke({ width: 6, color: FLAT.woodEdge }),
        new Graphics()
          .roundRect(margin / 2, margin / 2, width - margin, height - margin, 10)
          .fill(FLAT.board),
      ],
    });
  },
  lamp(radius) {
    const rim = new Graphics().circle(0, 0, radius + 2).stroke({ width: 2, color: 0x2a211a });
    const glass = new Graphics().circle(0, 0, radius).fill(0xffffff);
    glass.tint = FLAT.glassOff;
    return {
      view: new Container({ children: [rim, glass] }),
      show(level, color) {
        const on = color === 'red' ? FLAT.red : FLAT.white;
        glass.tint = level === 'on' ? on : level === 'dim' ? FLAT.flickerDim : FLAT.glassOff;
      },
    };
  },
  cross: () => new Graphics().rect(-2, -8, 4, 16).rect(-8, -2, 16, 4).fill(FLAT.board),
  jack: () => new Graphics().circle(0, 0, 9).fill(FLAT.brass).circle(0, 0, 5).fill(FLAT.hole),
  label(text, archivist) {
    const label = monospace(archivist ? FLAT.brass : FLAT.label, 12, archivist);
    label.text = text;
    label.anchor.set(0.5, 0);
    return label;
  },
  shelf(width, height) {
    return new Graphics()
      .roundRect(0, 0, width, height, 18)
      .fill(FLAT.wood)
      .stroke({ width: 6, color: FLAT.woodEdge });
  },
  shelfHole: (radius) => new Graphics().circle(0, 0, radius + 3).fill(FLAT.hole),
  supervision() {
    const light = new Graphics().circle(0, 0, 6).fill(0xffffff);
    light.tint = FLAT.supervisionOff;
    return {
      view: light,
      set: (on) => (light.tint = on ? FLAT.supervisionOn : FLAT.supervisionOff),
    };
  },
  plug: (radius) =>
    new Graphics()
      .circle(0, 0, radius)
      .fill(FLAT.brass)
      .circle(0, 0, radius - 5)
      .fill(FLAT.brassDark),
  keySlot: (height) => new Graphics().roundRect(-7, -height / 2, 14, height, 7).fill(FLAT.hole),
  keyKnob: () =>
    new Graphics()
      .roundRect(-14, -9, 28, 18, 6)
      .fill(FLAT.bakelite)
      .stroke({ width: 2, color: FLAT.brass }),
  pairLabel(text) {
    const label = monospace(FLAT.label, 14);
    label.text = text;
    label.anchor.set(0.5, 0);
    return label;
  },
  drawCord(g, home, plug, sag, plugRadius, tone) {
    for (const [width, color] of [
      [6, tone === 'light' ? FLAT.cordLight : FLAT.cord],
      [1.5, tone === 'light' ? FLAT.cordLightShine : FLAT.cordShine],
    ] as const) {
      g.moveTo(home.x, home.y)
        .bezierCurveTo(home.x, home.y - 40, plug.x, plug.y + sag, plug.x, plug.y + plugRadius)
        .stroke({ width, color, cap: 'round' });
    }
  },
  drawTarget(g, x, y, radius) {
    g.circle(x, y, radius).stroke({ width: 3, color: FLAT.target });
  },
  lighting: () => null,
};

/** L'habillage du thème choisi. */
export const skin: Skin = theme === 'vintage' ? vintageSkin : flatSkin;
