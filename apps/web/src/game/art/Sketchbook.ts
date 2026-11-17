import { type ArenaMap, PICKUPS, PLAYER, type SabotageId } from '@lag-switch/core';
import { Container, type Graphics, Rectangle, type Renderer, type Texture } from 'pixi.js';
import { PALETTE } from '../palette';
import { drawRough, gen, INK, seedFor } from './rough';

/** Every shape exists in this many variants; the renderer cycles them (~8 fps). */
export const VARIANTS = 3;

export type Variants = Texture[];

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Bakes every hand-drawn shape of the game into textures, once, when the
 * canvas starts. Each shape gets VARIANTS slightly different drawings (same
 * shape, different Rough.js seed); swapping between them a few times a
 * second gives the "boiling line" look of hand-drawn animation for the
 * price of changing a sprite's texture.
 */
export class Sketchbook {
  readonly arena: Variants;
  readonly body: { you: Variants; rival: Variants };
  readonly gun: Variants;
  readonly pickup: Record<SabotageId, Variants>;
  readonly splat: Record<'you' | 'rival' | 'ink', Variants>;
  readonly muzzle: Variants;
  readonly controller: Variants;

  constructor(
    private readonly renderer: Renderer,
    map: ArenaMap,
  ) {
    this.arena = this.variants(1, (seed) => arenaDrawing(map, seed), arenaFrame(map), 1);
    const r = PLAYER.radius + 4;
    const bodyFrame = new Rectangle(-r, -r, r * 2, r * 2);
    this.body = {
      you: this.variants(2, (seed) => bodyDrawing(PALETTE.you, seed), bodyFrame),
      rival: this.variants(3, (seed) => bodyDrawing(PALETTE.rival, seed), bodyFrame),
    };
    this.gun = this.variants(4, gunDrawing, new Rectangle(-4, -6, PLAYER.radius + 20, 12));
    const p = PICKUPS.radius + 6;
    const pickupFrame = new Rectangle(-p, -p, p * 2, p * 2);
    this.pickup = {
      lagSpike: this.variants(10, (s) => pickupDrawing('lagSpike', s), pickupFrame),
      packetLoss: this.variants(11, (s) => pickupDrawing('packetLoss', s), pickupFrame),
      wifiReset: this.variants(12, (s) => pickupDrawing('wifiReset', s), pickupFrame),
      deadBattery: this.variants(13, (s) => pickupDrawing('deadBattery', s), pickupFrame),
    };
    const splatFrame = new Rectangle(-14, -14, 28, 28);
    this.splat = {
      you: this.variants(20, (s) => splatDrawing(PALETTE.you, s), splatFrame, 2, 4),
      rival: this.variants(21, (s) => splatDrawing(PALETTE.rival, s), splatFrame, 2, 4),
      ink: this.variants(22, (s) => splatDrawing(PALETTE.ink, s), splatFrame, 2, 4),
    };
    this.muzzle = this.variants(30, muzzleDrawing, new Rectangle(-2, -12, 26, 24));
    this.controller = this.variants(40, controllerDrawing, new Rectangle(-18, -12, 36, 24));
  }

  private variants(
    base: number,
    draw: (seed: number) => Container,
    frame: Rectangle,
    resolution = 2,
    count = VARIANTS,
  ): Variants {
    return Array.from({ length: count }, (_, i) => {
      const g = draw(seedFor(base, i));
      const texture = this.renderer.generateTexture({
        target: g,
        frame,
        resolution,
        antialias: true,
      });
      g.destroy({ children: true });
      return texture;
    });
  }
}

// ------------------------------------------------------------------ drawings

const arenaFrame = (map: ArenaMap) => new Rectangle(-12, -12, map.size.x + 24, map.size.y + 24);

function arenaDrawing(map: ArenaMap, seed: number): Graphics {
  const { size, walls } = map;
  const drawables = [
    gen.rectangle(0, 0, size.x, size.y, { ...INK, seed, strokeWidth: 3, roughness: 0.8 }),
  ];
  walls.forEach((w, i) => {
    // The outer walls sit outside the arena; the frame above stands in for them.
    if (w.max.x <= 0 || w.max.y <= 0 || w.min.x >= size.x || w.min.y >= size.y) return;
    drawables.push(
      gen.rectangle(w.min.x, w.min.y, w.max.x - w.min.x, w.max.y - w.min.y, {
        ...INK,
        seed: seed + i,
        fill: css(PALETTE.wall),
        fillStyle: 'solid',
      }),
      // pencil shading inside the wall
      gen.rectangle(w.min.x + 4, w.min.y + 4, w.max.x - w.min.x - 8, w.max.y - w.min.y - 8, {
        seed: seed + i + 100,
        stroke: 'none',
        strokeWidth: 0,
        fill: css(PALETTE.shadow),
        fillStyle: 'hachure',
        hachureAngle: -41,
        hachureGap: 9,
        fillWeight: 1,
        roughness: 1.4,
      }),
    );
  });
  return drawRough(drawables);
}

function bodyDrawing(color: number, seed: number): Graphics {
  return drawRough([
    gen.circle(0, 0, PLAYER.radius * 2, {
      ...INK,
      seed,
      strokeWidth: 2.5,
      fill: css(color),
      fillStyle: 'solid',
      roughness: 0.9,
    }),
  ]);
}

function gunDrawing(seed: number): Graphics {
  return drawRough([
    gen.line(PLAYER.radius - 4, 0, PLAYER.radius + 14, 0, {
      ...INK,
      seed,
      strokeWidth: 5,
      roughness: 0.6,
    }),
  ]);
}

/** The sabotage glyphs from the menu, redrawn with a pencil and centred on 0,0. */
const ICONS: Record<SabotageId, { d: string[]; w: number; h: number }> = {
  lagSpike: {
    w: 28,
    h: 28,
    d: ['M8 4h12M8 24h12', 'M9 4c0 7 10 7 10 10s-10 3-10 10', 'M19 4c0 7-10 7-10 10s10 3 10 10'],
  },
  wifiReset: {
    w: 64,
    h: 56,
    d: ['M10 30 h44 v18 h-44 Z', 'M20 30 L15 10 M44 30 L49 10', 'M24 22 q8 -8 16 0'],
  },
  deadBattery: { w: 40, h: 28, d: ['M3 6 h30 v16 h-30 Z', 'M33 11 h4 v6 h-4', 'M8 11 v6'] },
  packetLoss: {
    w: 40,
    h: 40,
    d: ['M4 26 q8 -12 16 0 t16 0', 'M8 12 h4', 'M24 10 l6 6 M30 10 l-6 6'],
  },
};

function pickupDrawing(kind: SabotageId, seed: number): Container {
  const icon = ICONS[kind];
  const scale = 30 / Math.max(icon.w, icon.h);
  const ring = drawRough([
    gen.circle(0, 0, PICKUPS.radius * 2, {
      seed,
      stroke: css(PALETTE.highlight),
      strokeWidth: 1.5,
      roughness: 1.6,
      bowing: 2,
    }),
  ]);
  const glyph = drawRough(
    icon.d.map((d, i) =>
      gen.path(d, { ...INK, seed: seed + i, strokeWidth: 2.4 / scale, roughness: 0.7 }),
    ),
  );
  glyph.scale.set(scale);
  glyph.position.set((-icon.w * scale) / 2, (-icon.h * scale) / 2);
  const c = new Container();
  c.addChild(ring, glyph);
  return c;
}

function splatDrawing(color: number, seed: number): Graphics {
  // An irregular blob plus a couple of droplets.
  const pts: [number, number][] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 5 + rnd() * 5;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return drawRough([
    gen.polygon(pts, { seed, stroke: 'none', fill: css(color), fillStyle: 'solid', roughness: 2 }),
    gen.circle(8 + rnd() * 3, -6, 3, {
      seed: seed + 1,
      stroke: 'none',
      fill: css(color),
      fillStyle: 'solid',
    }),
    gen.circle(-9, 7 + rnd() * 2, 2.4, {
      seed: seed + 2,
      stroke: 'none',
      fill: css(color),
      fillStyle: 'solid',
    }),
  ]);
}

function muzzleDrawing(seed: number): Graphics {
  // A quick zig-zag scribble at the barrel.
  return drawRough([
    gen.linearPath(
      [
        [0, 0],
        [8, -8],
        [10, 4],
        [17, -6],
        [18, 6],
        [24, 0],
      ],
      { seed, stroke: css(PALETTE.highlight), strokeWidth: 2.4, roughness: 1.5 },
    ),
  ]);
}

function controllerDrawing(seed: number): Graphics {
  return drawRough([
    gen.rectangle(-14, -8, 28, 16, {
      ...INK,
      seed,
      strokeWidth: 2,
      fill: css(PALETTE.panel),
      fillStyle: 'solid',
    }),
    gen.line(-9, 0, -3, 0, { ...INK, seed: seed + 1 }),
    gen.line(-6, -3, -6, 3, { ...INK, seed: seed + 2 }),
    gen.circle(6, -2, 3, { ...INK, seed: seed + 3, stroke: css(PALETTE.danger) }),
    gen.circle(9, 3, 3, { ...INK, seed: seed + 4, stroke: css(PALETTE.danger) }),
  ]);
}
