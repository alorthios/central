import { createRng } from '@allo-central/shared';
import { BlurFilter, CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { photo } from './photo.ts';
import type { CordTone, LampColor, LampLevel, Skin } from './skin.ts';

/**
 * Le thème « vintage réaliste » (#53, GDD §16) : bois verni, bakélite, laiton, verre et
 * ivoire, sous une lampe de bureau. Tout est calculé : chaque texture est peinte une fois
 * sur un canevas, en double résolution pour rester nette quand le plateau est agrandi, et
 * à partir d'une graine fixe pour que le bois garde ses veines d'une partie à l'autre.
 */

const RESOLUTION = 2;
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const textures = new Map<string, Texture>();

function paint(key: string, w: number, h: number, draw: Draw, resolution = RESOLUTION): Texture {
  const cached = textures.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * resolution);
  canvas.height = Math.ceil(h * resolution);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(resolution, resolution);
  draw(ctx, w, h);
  // Avec ses mipmaps : réduit sur un petit écran, le dessin reste net au lieu de crénelé.
  const texture = new Texture({
    source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true }),
  });
  textures.set(key, texture);
  return texture;
}

/** Un sprite de taille logique `w`×`h`, centré par défaut. */
function sprite(texture: Texture, w: number, h: number, centered = true): Sprite {
  const s = new Sprite(texture);
  s.width = w;
  s.height = h;
  if (centered) s.anchor.set(0.5);
  return s;
}

function radial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  stops: [number, string][],
  fx = x,
  fy = y,
): CanvasGradient {
  const gradient = ctx.createRadialGradient(fx, fy, 0, x, y, r);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  return gradient;
}

/** Un grain fin, pour casser l'aplat (bois, bakélite, papier). */
function grain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number,
  seed: number,
) {
  const rng = createRng(seed);
  const image = ctx.getImageData(0, 0, w * RESOLUTION, h * RESOLUTION);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (rng() - 0.5) * strength;
    data[i] = (data[i] ?? 0) + n;
    data[i + 1] = (data[i + 1] ?? 0) + n;
    data[i + 2] = (data[i + 2] ?? 0) + n;
  }
  ctx.putImageData(image, 0, 0);
}

/** Du bois verni : veines ondulées, quelques nœuds, un reflet de vernis. */
function wood(tone: [string, string], seed: number): Draw {
  return (ctx, w, h) => {
    const image = photo('frameWood');
    if (image) photoFill(ctx, image, w, h, seed, 'rgba(40, 18, 6, 0.18)');
    else carveWood(ctx, w, h, tone, seed);
    varnish(ctx, w, h);
  };
}

/** Le bois dessiné : veines ondulées, quelques nœuds, un grain fin. */
function carveWood(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tone: [string, string],
  seed: number,
): void {
  const rng = createRng(seed);
  const base = ctx.createLinearGradient(0, 0, w * 0.3, h);
  base.addColorStop(0, tone[0]);
  base.addColorStop(1, tone[1]);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < h / 1.6; i++) {
    const y0 = rng() * h;
    const amplitude = 1.5 + rng() * 5;
    const frequency = 0.004 + rng() * 0.012;
    const phase = rng() * Math.PI * 2;
    const dark = rng() < 0.6;
    ctx.strokeStyle = dark
      ? `rgba(28, 12, 4, ${0.06 + rng() * 0.16})`
      : `rgba(196, 128, 70, ${0.04 + rng() * 0.09})`;
    ctx.lineWidth = 0.3 + rng() * 1.6;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 5) {
      const y =
        y0 +
        Math.sin(x * frequency + phase) * amplitude +
        Math.sin(x * frequency * 3.3 + phase) * amplitude * 0.25;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let k = 0; k < Math.max(1, Math.round((w * h) / 140_000)); k++) {
    const cx = rng() * w;
    const cy = rng() * h;
    for (let r = 2; r < 16; r += 2.2) {
      ctx.strokeStyle = `rgba(30, 12, 4, ${0.14 - r * 0.006})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 2.4, r * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  grain(ctx, w, h, 14, seed + 1);
}

/** Le reflet du vernis en haut, le bois qui fonce vers le bas. */
function varnish(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const gloss = ctx.createLinearGradient(0, 0, 0, h);
  gloss.addColorStop(0, 'rgba(255, 236, 200, 0.12)');
  gloss.addColorStop(0.4, 'rgba(255, 236, 200, 0)');
  gloss.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Une texture photographique en motif (thème `photo`), décalée selon la graine pour que deux
 * meubles n'aient pas les mêmes veines, et teintée pour s'accorder à la scène.
 */
function photoFill(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  w: number,
  h: number,
  seed: number,
  tint: string,
): void {
  const pattern = ctx.createPattern(image, 'repeat');
  if (!pattern) return;
  const offset = (seed * 137) % image.width;
  pattern.setTransform(new DOMMatrix().scale(PHOTO_SCALE).translate(-offset, -offset / 2));
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, w, h);
}

/** Une texture de 1 024 pixels couvre ainsi environ 600 unités du plateau. */
const PHOTO_SCALE = 0.6;

/**
 * La face du panneau : de la bakélite noire, légèrement grenue ; avec le thème `photo`, un
 * cuir sombre et patiné.
 */
const bakelite: Draw = (ctx, w, h) => {
  const leather = photo('leather');
  if (leather) {
    photoFill(ctx, leather, w, h, 3, 'rgba(14, 8, 4, 0.62)');
  } else {
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#231a13');
    base.addColorStop(1, '#0c0806');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 10, 7);
  }
  // L'ombre portée du cadre de bois sur la face, qui suit ses coins arrondis : on remplit
  // tout l'extérieur de la face, et seule son ombre, floue, déborde à l'intérieur.
  const k = ctx.getTransform().a;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, FACE_RADIUS);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(-40, -40, w + 80, h + 80);
  ctx.roundRect(0, 0, w, h, FACE_RADIUS);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 10 * k;
  ctx.shadowOffsetX = 1.5 * k;
  ctx.shadowOffsetY = 2.5 * k;
  ctx.fillStyle = '#000000';
  ctx.fill('evenodd');
  ctx.restore();
};

/** Le rayon des coins de la face du panneau, et celui du cadre de bois. */
const FACE_RADIUS = 6;
const FRAME_RADIUS = 10;

/** Un anneau de laiton poli, éclairé d'en haut à gauche. */
function brassRing(outer: number, inner: number): Draw {
  return (ctx) => {
    const c = outer + 2;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1.5;
    ctx.beginPath();
    ctx.arc(c, c, outer, 0, Math.PI * 2);
    ctx.fillStyle = radial(
      ctx,
      c,
      c,
      outer,
      [
        [0, '#fff3c4'],
        [0.35, '#e0bb5c'],
        [0.75, '#9c7a2c'],
        [1, '#5a4416'],
      ],
      c - outer * 0.45,
      c - outer * 0.5,
    );
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.arc(c, c, inner, 0, Math.PI * 2);
    ctx.fillStyle = radial(ctx, c, c, inner, [
      [0, '#000000'],
      [0.7, '#0b0806'],
      [1, '#2c2114'],
    ]);
    ctx.fill();
  };
}

const GLASS: Record<LampColor | 'off', [number, string][]> = {
  off: [
    [0, '#7a6a52'],
    [0.35, '#3a2f24'],
    [1, '#120d09'],
  ],
  white: [
    [0, '#fffdf2'],
    [0.4, '#ffe6a8'],
    [0.85, '#e8a842'],
    [1, '#9a5c18'],
  ],
  red: [
    [0, '#ffe2d6'],
    [0.4, '#ff7a5c'],
    [0.85, '#c8361e'],
    [1, '#6a170c'],
  ],
};

/** Le verre bombé d'une ampoule, avec son reflet. */
function glass(radius: number, stops: [number, string][]): Draw {
  return (ctx) => {
    const c = radius;
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.fillStyle = radial(ctx, c, c, radius, stops, c - radius * 0.3, c - radius * 0.35);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(
      c - radius * 0.35,
      c - radius * 0.42,
      radius * 0.38,
      radius * 0.22,
      -0.6,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
  };
}

/** Le halo d'une ampoule allumée, ajouté à la lumière de la scène. */
function glow(radius: number, color: string): Draw {
  return (ctx) => {
    ctx.fillStyle = radial(ctx, radius, radius, radius, [
      [0, color],
      [0.35, color.replace(/[\d.]+\)$/, '0.25)')],
      [1, 'rgba(0, 0, 0, 0)'],
    ]);
    ctx.fillRect(0, 0, radius * 2, radius * 2);
  };
}

/**
 * Les plaques se lisent de près : leur texture suit la densité de l'écran et l'agrandissement
 * maximal du plateau (1,4), pour que les chiffres restent nets.
 */
const PLATE_RESOLUTION = Math.min(4, Math.max(2, Math.ceil((window.devicePixelRatio || 1) * 1.4)));

/**
 * Une plaque d'ivoire gravée, comme les étiquettes des standards d'époque. Le numéro est
 * peint avec la plaque, centré sur le dessin des chiffres et non sur la boîte de la police,
 * et gravé : un liseré clair sous l'encre.
 */
function plate(text: string, width: number, fontSize: number, tint: string): Container {
  const height = fontSize + 6;
  const w = width + 4;
  const h = height + 4;
  const texture = paint(
    `plate:${text}:${width}:${fontSize}:${tint}`,
    w,
    h,
    (ctx) => {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 2 * PLATE_RESOLUTION;
      ctx.shadowOffsetY = PLATE_RESOLUTION;
      const fill = ctx.createLinearGradient(0, 2, 0, height + 2);
      fill.addColorStop(0, tint);
      fill.addColorStop(1, '#c9b78e');
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(2, 2, width, height, 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(90, 64, 30, 0.7)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.font = `bold ${fontSize}px Georgia, "Times New Roman", serif`;
      ctx.textAlign = 'center';
      const m = ctx.measureText(text);
      const y = 2 + height / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
      ctx.fillStyle = 'rgba(255, 250, 232, 0.5)';
      ctx.fillText(text, w / 2, y + 0.4);
      ctx.fillStyle = '#24160a';
      ctx.fillText(text, w / 2, y);
    },
    PLATE_RESOLUTION,
  );
  const background = sprite(texture, w, h, false);
  background.position.set(-w / 2, 0);
  return new Container({ children: [background] });
}

/** Une vis de laiton à tête fendue, noyée dans le bois ; chacune a sa fente orientée. */
function screw(angle: number): Sprite {
  const a = Math.round(angle * 8) / 8;
  return sprite(
    paint(`screw:${a}`, 16, 16, (ctx) => {
      const c = 8;
      // Le fraisage dans le bois, puis la tête bombée.
      ctx.beginPath();
      ctx.arc(c, c, 6.8, 0, Math.PI * 2);
      ctx.fillStyle = radial(ctx, c, c, 6.8, [
        [0.7, 'rgba(0, 0, 0, 0.6)'],
        [1, 'rgba(0, 0, 0, 0)'],
      ]);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(c, c, 5.4, 0, Math.PI * 2);
      ctx.fillStyle = radial(
        ctx,
        c,
        c,
        5.4,
        [
          [0, '#f5e3a8'],
          [0.6, '#a8873a'],
          [1, '#4d3a12'],
        ],
        c - 2,
        c - 2.5,
      );
      ctx.fill();
      const dx = Math.cos(a) * 4.4;
      const dy = Math.sin(a) * 4.4;
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.45)';
      ctx.beginPath();
      ctx.moveTo(c - dx, c - dy + 0.7);
      ctx.lineTo(c + dx, c + dy + 0.7);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(36, 24, 6, 0.9)';
      ctx.beginPath();
      ctx.moveTo(c - dx, c - dy);
      ctx.lineTo(c + dx, c + dy);
      ctx.stroke();
    }),
    16,
    16,
  );
}

/** Quatre vis, une par coin, à `inset` des bords ; les fentes tournées au hasard de la pose. */
function screws(width: number, height: number, inset: number, seed: number): Sprite[] {
  const rng = createRng(seed);
  const corners = [
    [inset, inset],
    [width - inset, inset],
    [inset, height - inset],
    [width - inset, height - inset],
  ] as const;
  return corners.map(([x, y]) => {
    const s = screw(rng() * Math.PI);
    s.position.set(x, y);
    return s;
  });
}

function woodFrame(
  key: string,
  width: number,
  height: number,
  tone: [string, string],
  seed: number,
) {
  const frame = new Container();
  // L'ombre du meuble sur le mur.
  const shadow = new Graphics()
    .roundRect(8, 14, width, height, FRAME_RADIUS)
    .fill({ color: 0x000000, alpha: 0.55 });
  shadow.filters = [new BlurFilter({ strength: 14 })];
  const body = sprite(paint(key, width, height, wood(tone, seed)), width, height, false);
  const mask = new Graphics().roundRect(0, 0, width, height, FRAME_RADIUS).fill(0xffffff);
  body.mask = mask;
  // Arête vernie : claire en haut à gauche, sombre en bas à droite.
  const bevel = new Graphics()
    .roundRect(1.5, 1.5, width - 3, height - 3, FRAME_RADIUS - 1)
    .stroke({ width: 3, color: 0xffe2b0, alpha: 0.18 })
    .roundRect(0, 0, width, height, FRAME_RADIUS)
    .stroke({ width: 2, color: 0x140904, alpha: 0.9 });
  frame.addChild(shadow, body, mask, bevel);
  return frame;
}

const SUPERVISION_RADIUS = 6;

/** Tresse de coton des cordons : bord, cœur, reflet. Beige clair à gauche, brun foncé à droite. */
const CORD_TONES: Record<CordTone, [number, number, number]> = {
  light: [0xb59e72, 0xdcc89e, 0xfff4d8],
  dark: [0x24150b, 0x3d2615, 0x9a6c45],
};

export const vintageSkin: Skin = {
  background: '#0d0907',

  backdrop(width, height) {
    // Un mur sombre tendu de papier peint rayé, éclairé par la lampe.
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const texture = Texture.from(
      (() => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const base = ctx.createLinearGradient(0, 0, 0, h);
        base.addColorStop(0, '#2a2017');
        base.addColorStop(1, '#100b08');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 18) {
          ctx.fillStyle = 'rgba(201, 164, 76, 0.035)';
          ctx.fillRect(x, 0, 6, h);
        }
        ctx.fillStyle = radial(ctx, w * 0.3, h * 0.05, Math.max(w, h) * 0.9, [
          [0, 'rgba(255, 210, 140, 0.12)'],
          [1, 'rgba(0, 0, 0, 0.5)'],
        ]);
        ctx.fillRect(0, 0, w, h);
        return canvas;
      })(),
    );
    return sprite(texture, w, h, false);
  },

  panel(width, height, margin) {
    const panel = woodFrame(
      `panel:${width}x${height}`,
      width,
      height,
      ['#6e3f1d', '#3a1f0e'],
      1953,
    );
    const face = sprite(
      paint(`face:${width}x${height}`, width - margin, height - margin, bakelite),
      width - margin,
      height - margin,
      false,
    );
    face.position.set(margin / 2, margin / 2);
    const faceMask = new Graphics()
      .roundRect(margin / 2, margin / 2, width - margin, height - margin, FACE_RADIUS)
      .fill(0xffffff);
    face.mask = faceMask;
    // Les vis au milieu de la bande de bois, dans l'axe de chaque coin.
    panel.addChild(face, faceMask, ...screws(width, height, margin / 4, 11));
    return panel;
  },

  lamp(radius) {
    const size = (radius + 4) * 2 + 4;
    const bezel = sprite(
      paint(`bezel:${radius}`, size, size, brassRing(radius + 4, radius + 1)),
      size,
      size,
    );
    const textures = {
      off: paint(`glass:off:${radius}`, radius * 2, radius * 2, glass(radius, GLASS.off)),
      white: paint(`glass:white:${radius}`, radius * 2, radius * 2, glass(radius, GLASS.white)),
      red: paint(`glass:red:${radius}`, radius * 2, radius * 2, glass(radius, GLASS.red)),
    };
    const halo = radius * 3.4;
    const glows = {
      white: paint(
        `glow:white:${radius}`,
        halo * 2,
        halo * 2,
        glow(halo, 'rgba(255, 206, 128, 0.55)'),
      ),
      red: paint(`glow:red:${radius}`, halo * 2, halo * 2, glow(halo, 'rgba(255, 96, 64, 0.5)')),
    };
    const bulb = sprite(textures.off, radius * 2, radius * 2);
    const light = sprite(glows.white, halo * 2, halo * 2);
    light.blendMode = 'add';
    light.visible = false;
    return {
      view: new Container({ children: [bezel, bulb, light] }),
      show(level: LampLevel, color: LampColor) {
        bulb.texture = level === 'off' ? textures.off : textures[color];
        bulb.alpha = level === 'dim' ? 0.82 : 1;
        light.visible = level !== 'off';
        light.texture = glows[color];
        light.alpha = level === 'dim' ? 0.35 : 0.85;
      },
    };
  },

  cross: () =>
    new Graphics()
      .rect(-1.5, -7, 3, 14)
      .rect(-7, -1.5, 14, 3)
      .fill({ color: 0x3a0c06, alpha: 0.85 }),

  jack() {
    return sprite(paint('jack', 26, 26, brassRing(10, 5)), 26, 26);
  },

  label(text, archivist) {
    return plate(text, 30, 11, archivist ? '#e6c46a' : '#f2e8cc');
  },

  shelf(width, height) {
    const shelf = woodFrame(
      `shelf:${width}x${height}`,
      width,
      height,
      ['#7a4622', '#43240f'],
      1954,
    );
    shelf.addChild(...screws(width, height, 13, 12));
    return shelf;
  },

  shelfHole(radius) {
    const size = (radius + 5) * 2 + 4;
    return sprite(
      paint(`hole:${radius}`, size, size, brassRing(radius + 5, radius + 1.5)),
      size,
      size,
    );
  },

  supervision() {
    const r = SUPERVISION_RADIUS;
    const off = paint('sup:off', r * 2, r * 2, glass(r, GLASS.off));
    const on = paint(
      'sup:on',
      r * 2,
      r * 2,
      glass(r, [
        [0, '#fff4d0'],
        [0.45, '#ffb347'],
        [1, '#8a4a08'],
      ]),
    );
    const bulb = sprite(off, r * 2, r * 2);
    const halo = sprite(paint('sup:glow', 40, 40, glow(20, 'rgba(255, 170, 70, 0.6)')), 40, 40);
    halo.blendMode = 'add';
    halo.visible = false;
    const size = (r + 3) * 2 + 4;
    const bezel = sprite(paint('sup:bezel', size, size, brassRing(r + 3, r)), size, size);
    return {
      view: new Container({ children: [bezel, bulb, halo] }),
      set(lit) {
        bulb.texture = lit ? on : off;
        halo.visible = lit;
      },
    };
  },

  plug(radius) {
    const size = radius * 2 + 10;
    return sprite(
      paint(`plug:${radius}`, size, size, (ctx) => {
        const c = size / 2;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2.5;
        ctx.beginPath();
        ctx.arc(c, c, radius, 0, Math.PI * 2);
        ctx.fillStyle = radial(
          ctx,
          c,
          c,
          radius,
          [
            [0, '#fff6cf'],
            [0.3, '#e4c26a'],
            [0.8, '#8e6d26'],
            [1, '#4a3710'],
          ],
          c - radius * 0.4,
          c - radius * 0.45,
        );
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.beginPath();
        ctx.arc(c, c, radius * 0.45, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(60, 42, 10, 0.8)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(c, c, radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff1b8';
        ctx.fill();
      }),
      size,
      size,
    );
  },

  keySlot(height) {
    const w = 22;
    return sprite(
      paint(`slot:${height}`, w, height, (ctx) => {
        const metal = ctx.createLinearGradient(0, 0, w, 0);
        metal.addColorStop(0, '#5c5852');
        metal.addColorStop(0.45, '#b9b4a8');
        metal.addColorStop(1, '#3c3934');
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.roundRect(0, 0, w, height, 10);
        ctx.fill();
        ctx.fillStyle = '#0a0705';
        ctx.beginPath();
        ctx.roundRect(w / 2 - 3.5, 7, 7, height - 14, 3.5);
        ctx.fill();
      }),
      w,
      height,
    );
  },

  keyKnob() {
    const w = 41;
    const h = 29;
    return sprite(
      paint('knob', w, h, (ctx) => {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2.5;
        const body = ctx.createLinearGradient(0, 3, 0, h - 3);
        body.addColorStop(0, '#4a3a2c');
        body.addColorStop(0.5, '#15100c');
        body.addColorStop(1, '#050302');
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.roundRect(3, 3, w - 6, h - 6, 7);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = 'rgba(255, 240, 210, 0.28)';
        ctx.beginPath();
        ctx.roundRect(7, 5.5, w - 14, 5, 2.5);
        ctx.fill();
        ctx.strokeStyle = '#b8953f';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(3, 3, w - 6, h - 6, 7);
        ctx.stroke();
      }),
      w,
      h,
    );
  },

  pairLabel(text) {
    return plate(text, 26, 13, '#f2e8cc');
  },

  drawCord(g, home, plug, sag, plugRadius, tone) {
    const [edge, braid, shine] = CORD_TONES[tone];
    const path = (dx: number, dy: number) =>
      g
        .moveTo(home.x + dx, home.y + dy)
        .bezierCurveTo(
          home.x + dx,
          home.y - 40 + dy,
          plug.x + dx,
          plug.y + sag + dy,
          plug.x + dx,
          plug.y + plugRadius + dy,
        );
    // L'ombre du cordon sur le panneau, puis la tresse de coton et son reflet.
    path(4, 7).stroke({ width: 8, color: 0x000000, alpha: 0.3, cap: 'round' });
    path(0, 0).stroke({ width: 7, color: edge, cap: 'round' });
    path(0, 0).stroke({ width: 4, color: braid, cap: 'round' });
    path(-1.2, -0.6).stroke({ width: 1.3, color: shine, alpha: 0.6, cap: 'round' });
  },

  drawTarget(g, x, y, radius) {
    g.circle(x, y, radius + 3)
      .stroke({ width: 9, color: 0xffd27a, alpha: 0.2 })
      .circle(x, y, radius)
      .stroke({ width: 3, color: 0xffe0a0, alpha: 0.95 });
  },

  lighting(width, height) {
    // La lampe de bureau, en haut à gauche, et le vignettage de la pièce.
    const lamp = sprite(
      paint(`light:${width}x${height}`, width, height, (ctx, w, h) => {
        ctx.fillStyle = radial(ctx, w * 0.22, -h * 0.08, Math.max(w, h) * 1.05, [
          [0, 'rgba(255, 214, 150, 0.16)'],
          [0.5, 'rgba(255, 200, 130, 0.05)'],
          [1, 'rgba(0, 0, 0, 0)'],
        ]);
        ctx.fillRect(0, 0, w, h);
      }),
      width,
      height,
      false,
    );
    lamp.blendMode = 'add';
    const vignette = sprite(
      paint(`vignette:${width}x${height}`, width, height, (ctx, w, h) => {
        ctx.fillStyle = radial(ctx, w * 0.45, h * 0.4, Math.max(w, h) * 0.8, [
          [0, 'rgba(0, 0, 0, 0)'],
          [0.7, 'rgba(0, 0, 0, 0.08)'],
          [1, 'rgba(0, 0, 0, 0.38)'],
        ]);
        ctx.fillRect(0, 0, w, h);
      }),
      width,
      height,
      false,
    );
    const lighting = new Container({ children: [vignette, lamp] });
    lighting.eventMode = 'none';
    return lighting;
  },
};
