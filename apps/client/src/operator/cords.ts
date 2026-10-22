import {
  BALANCE,
  type KeyAction,
  type KeyPosition,
  type PairView,
  type PlugEnd,
} from '@allo-central/shared';
import { Container, type FederatedPointerEvent, Graphics, Rectangle } from 'pixi.js';
import type { PanelView } from './panel.ts';
import { type Toggle, skin } from './skin.ts';

const SHELF_GAP = 16;
const SHELF_HEIGHT = 210;
const SHELF_MARGIN = 36;
const PLUG_SPREAD = 18;
const PLUG_RADIUS = 10;
const KEY_TRAVEL = 18;
const RING_KNOB_MS = 350;

export interface CordActions {
  plug(pair: number, end: PlugEnd, line: number): void;
  unplug(pair: number, end: PlugEnd): void;
  key(pair: number, action: KeyAction): void;
}

interface Plug {
  pair: number;
  end: PlugEnd;
  /** Le trou de la tablette d'où sort le cordon. */
  home: { x: number; y: number };
  sprite: Container;
  supervision: Toggle;
}

interface Key {
  knob: Container;
  /** Axe du levier : position de repos. */
  y: number;
  /** Pendant le geste « sonner », le levier reste en bas avant de remonter. */
  ringingUntil: number;
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
  private readonly keys: Key[] = [];
  private pairs: PairView[] = [];
  private dragging: Plug | null = null;

  constructor(panel: PanelView, actions: CordActions) {
    this.panel = panel;
    this.actions = actions;
    const top = panel.height + SHELF_GAP;
    this.height = top + SHELF_HEIGHT;

    const shelf = skin.shelf(panel.width, SHELF_HEIGHT);
    shelf.position.set(0, top);
    const holes = new Container();
    const sprites = new Container();
    this.container.addChild(shelf, holes, this.cords, this.target, sprites);

    const pairCount = BALANCE.cordPairs;
    const slot = (panel.width - 2 * SHELF_MARGIN) / pairCount;
    for (let pair = 0; pair < pairCount; pair++) {
      const cx = SHELF_MARGIN + slot * (pair + 0.5);
      for (const end of [0, 1] as const) {
        const home = { x: cx + (end === 0 ? -PLUG_SPREAD : PLUG_SPREAD), y: top + 70 };
        const supervision = skin.supervision();
        supervision.view.position.set(home.x, top + 32);
        const hole = skin.shelfHole(PLUG_RADIUS);
        hole.position.set(home.x, home.y);
        holes.addChild(hole);

        const sprite = new Container();
        sprite.addChild(skin.plug(PLUG_RADIUS));
        sprite.position.set(home.x, home.y);
        sprite.eventMode = 'static';
        sprite.cursor = 'grab';
        const plug: Plug = { pair, end, home, sprite, supervision };
        sprite.on('pointerdown', (event) => this.startDrag(plug, event));

        sprites.addChild(sprite);
        this.container.addChild(supervision.view);
        this.plugs.push(plug);
      }
      const label = skin.pairLabel(String(pair + 1));
      label.position.set(cx, top + 178);
      this.addKey(pair, cx, top + 128);
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
      plug.supervision.set(view?.supervision ?? false);
      if (plug !== this.dragging) this.place(plug, view?.line ?? null);
    }
    for (const [pair, key] of this.keys.entries()) {
      if (performance.now() < key.ringingUntil) continue;
      this.placeKnob(key, this.pairs[pair]?.key === 'talk' ? 'talk' : 'rest');
    }
    this.drawCords();
  }

  /**
   * La clé d'une paire (§6.4) : un levier à trois positions. Cliquer au-dessus de son axe
   * lève ou rabaisse la clé (parler) ; en dessous, on l'abaisse pour sonner et elle revient
   * seule au milieu.
   */
  private addKey(pair: number, x: number, y: number): void {
    const slot = skin.keySlot(2 * KEY_TRAVEL + 24);
    slot.position.set(x, y);
    const knob = skin.keyKnob();
    knob.position.set(x, y);

    const hit = new Container();
    hit.hitArea = new Rectangle(x - 24, y - KEY_TRAVEL - 18, 48, 2 * KEY_TRAVEL + 36);
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    const key: Key = { knob, y, ringingUntil: 0 };
    hit.on('pointerdown', (event) => {
      const local = this.container.toLocal(event.global);
      // L'état local des clés suit le geste sans attendre la vue du serveur : un second
      // clic rapide doit partir de la position qu'on vient de donner, pas de l'ancienne.
      if (local.y < y) {
        const action = this.pairs[pair]?.key === 'talk' ? 'rest' : 'talk';
        if (action === 'talk') for (const other of this.pairs) other.key = 'rest';
        this.setLocalKey(pair, action);
        this.placeKnob(key, action);
        this.actions.key(pair, action);
      } else {
        // La clé abaissée pour sonner revient seule au milieu (§6.4).
        this.setLocalKey(pair, 'rest');
        key.ringingUntil = performance.now() + RING_KNOB_MS;
        this.placeKnob(key, 'ring');
        this.actions.key(pair, 'ring');
        setTimeout(() => this.placeKnob(key, this.pairs[pair]?.key ?? 'rest'), RING_KNOB_MS);
      }
    });

    this.container.addChild(slot, knob, hit);
    this.keys.push(key);
  }

  private setLocalKey(pair: number, position: KeyPosition): void {
    const view = this.pairs[pair];
    if (view) view.key = position;
  }

  private placeKnob(key: Key, position: KeyAction): void {
    const offset = position === 'talk' ? -KEY_TRAVEL : position === 'ring' ? KEY_TRAVEL : 0;
    key.knob.position.y = key.y + offset;
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
      skin.drawTarget(this.target, jack.x, jack.y, PLUG_RADIUS + 6);
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
      skin.drawCord(this.cords, home, { x, y }, sag, PLUG_RADIUS);
    }
  }
}
