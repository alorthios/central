import { BALANCE, type PairView, type PlugEnd } from '@allo-central/shared';
import { Container, type FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import type { PanelView } from './panel.ts';

const SHELF_GAP = 16;
const SHELF_HEIGHT = 150;
const SHELF_MARGIN = 36;
const PLUG_SPREAD = 18;
const PLUG_RADIUS = 10;

const COLORS = {
  wood: 0x3a2414,
  woodEdge: 0x24160c,
  hole: 0x0a0705,
  brass: 0xc9a44c,
  brassDark: 0x8a6d2a,
  cord: 0x1b130d,
  cordShine: 0x4a3626,
  supervisionOn: 0xffb347,
  supervisionOff: 0x3a2f26,
  target: 0xfff1cf,
  label: 0xbfaf92,
};

export interface CordActions {
  plug(pair: number, end: PlugEnd, line: number): void;
  unplug(pair: number, end: PlugEnd): void;
}

interface Plug {
  pair: number;
  end: PlugEnd;
  /** Le trou de la tablette d'où sort le cordon. */
  home: { x: number; y: number };
  sprite: Container;
  supervision: Graphics;
}

/**
 * La tablette et ses paires de cordons (§6.3). On saisit une fiche, on la lâche sur une
 * prise pour la brancher, ailleurs pour la ramener sur la tablette. Le serveur décide :
 * la vue ne fait qu'afficher son état, sauf pendant le geste.
 */
export class CordsView {
  readonly container = new Container();
  readonly height: number;
  private readonly panel: PanelView;
  private readonly actions: CordActions;
  private readonly cords = new Graphics();
  private readonly target = new Graphics();
  private readonly plugs: Plug[] = [];
  private pairs: PairView[] = [];
  private dragging: Plug | null = null;

  constructor(panel: PanelView, actions: CordActions) {
    this.panel = panel;
    this.actions = actions;
    const top = panel.height + SHELF_GAP;
    this.height = top + SHELF_HEIGHT;

    const shelf = new Graphics()
      .roundRect(0, top, panel.width, SHELF_HEIGHT, 18)
      .fill(COLORS.wood)
      .stroke({ width: 6, color: COLORS.woodEdge });
    const sprites = new Container();
    this.container.addChild(shelf, this.cords, this.target, sprites);

    const pairCount = BALANCE.cordPairs;
    const slot = (panel.width - 2 * SHELF_MARGIN) / pairCount;
    for (let pair = 0; pair < pairCount; pair++) {
      const cx = SHELF_MARGIN + slot * (pair + 0.5);
      for (const end of [0, 1] as const) {
        const home = { x: cx + (end === 0 ? -PLUG_SPREAD : PLUG_SPREAD), y: top + 70 };
        const supervision = new Graphics().circle(home.x, top + 32, 6).fill(0xffffff);
        supervision.tint = COLORS.supervisionOff;
        shelf.circle(home.x, home.y, PLUG_RADIUS + 3).fill(COLORS.hole);

        const sprite = new Container();
        sprite.addChild(
          new Graphics()
            .circle(0, 0, PLUG_RADIUS)
            .fill(COLORS.brass)
            .circle(0, 0, PLUG_RADIUS - 5)
            .fill(COLORS.brassDark),
        );
        sprite.position.set(home.x, home.y);
        sprite.eventMode = 'static';
        sprite.cursor = 'grab';
        const plug: Plug = { pair, end, home, sprite, supervision };
        sprite.on('pointerdown', (event) => this.startDrag(plug, event));

        sprites.addChild(sprite);
        this.container.addChild(supervision);
        this.plugs.push(plug);
      }
      const label = new Text({
        text: String(pair + 1),
        style: { fill: COLORS.label, fontSize: 14, fontFamily: 'ui-monospace, monospace' },
      });
      label.anchor.set(0.5, 0);
      label.position.set(cx, top + 100);
      this.container.addChild(label);
    }

    // Le geste se suit partout et se termine où qu'on lâche la fiche.
    this.container.eventMode = 'static';
    this.container.on('globalpointermove', (event) => this.moveDrag(event));
    this.container.on('pointerup', (event) => this.endDrag(event));
    this.container.on('pointerupoutside', (event) => this.endDrag(event));
  }

  update(pairs: PairView[]): void {
    this.pairs = pairs;
    for (const plug of this.plugs) {
      const view = this.plugView(plug);
      plug.supervision.tint = view?.supervision ? COLORS.supervisionOn : COLORS.supervisionOff;
      if (plug !== this.dragging) this.place(plug, view?.line ?? null);
    }
    this.drawCords();
  }

  private plugView(plug: Plug) {
    return this.pairs[plug.pair]?.plugs[plug.end];
  }

  private place(plug: Plug, line: number | null): void {
    const at = line === null ? plug.home : this.panel.jackPosition(line);
    plug.sprite.position.set(at.x, at.y);
  }

  private startDrag(plug: Plug, event: FederatedPointerEvent): void {
    this.dragging = plug;
    plug.sprite.cursor = 'grabbing';
    // La fiche saisie passe au-dessus des autres.
    plug.sprite.parent?.addChild(plug.sprite);
    this.moveDrag(event);
  }

  private moveDrag(event: FederatedPointerEvent): void {
    if (!this.dragging) return;
    const p = this.container.toLocal(event.global);
    this.dragging.sprite.position.set(p.x, p.y);
    const line = this.panel.jackAt(p.x, p.y);
    this.target.clear();
    if (line !== null) {
      const jack = this.panel.jackPosition(line);
      this.target
        .circle(jack.x, jack.y, PLUG_RADIUS + 6)
        .stroke({ width: 3, color: COLORS.target });
    }
    this.drawCords();
  }

  private endDrag(event: FederatedPointerEvent): void {
    const plug = this.dragging;
    if (!plug) return;
    this.dragging = null;
    plug.sprite.cursor = 'grab';
    this.target.clear();

    const p = this.container.toLocal(event.global);
    const line = this.panel.jackAt(p.x, p.y);
    const current = this.plugView(plug)?.line ?? null;
    if (line !== null && line !== current) {
      this.actions.plug(plug.pair, plug.end, line);
      // Affichage immédiat ; la vue du serveur confirme ou annule dans la foulée.
      this.place(plug, line);
    } else if (line === null && current !== null) {
      this.actions.unplug(plug.pair, plug.end);
      this.place(plug, null);
    } else {
      this.place(plug, current);
    }
    this.drawCords();
  }

  /** Un cordon sort de la tablette et pend jusqu'à sa fiche. */
  private drawCords(): void {
    this.cords.clear();
    for (const plug of this.plugs) {
      const { x, y } = plug.sprite.position;
      const { home } = plug;
      if (Math.hypot(x - home.x, y - home.y) < 1) continue;
      const sag = Math.min(160, 60 + Math.abs(x - home.x) * 0.25);
      this.cords
        .moveTo(home.x, home.y)
        .bezierCurveTo(home.x, home.y - 40, x, y + sag, x, y + PLUG_RADIUS)
        .stroke({ width: 6, color: COLORS.cord, cap: 'round' })
        .moveTo(home.x, home.y)
        .bezierCurveTo(home.x, home.y - 40, x, y + sag, x, y + PLUG_RADIUS)
        .stroke({ width: 1.5, color: COLORS.cordShine, cap: 'round' });
    }
  }
}
